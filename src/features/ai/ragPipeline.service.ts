import { CHUNKING, GEMINI } from '@lib/constants';
import { getPlaylistIdFromUrl } from '@lib/playlist';
import {
  DbIds,
  ensureDbReady,
  getDb,
  nowMs,
  type EmbeddingRow,
  type SemanticChunkRow,
} from '@lib/db';
import type { SemanticChunk } from '@/types/ai';
import type { EnhancedTranscriptChunk } from '@/types/transcript';
import { chunkTranscriptSemantically } from './chunking';
import { embedChunksForIndex, retrieveHybrid } from './hybridRetrieval';
import { geminiFetch } from './geminiRateLimit';

export async function loadSemanticChunksFromDb(
  videoId: string,
  model: string
): Promise<SemanticChunk[] | null> {
  await ensureDbReady();
  const db = getDb();
  const rows = await db.semanticChunks.where('videoId').equals(videoId).toArray();
  if (!rows.length) return null;

  const embeddings = await db.embeddings.where('videoId').equals(videoId).toArray();
  const byChunk = new Map<string, number[]>();
  for (const e of embeddings) {
    if (e.model === model) byChunk.set(e.semanticChunkId, e.vector);
  }

  return rows.map((r) => ({
    id: r.semanticChunkId,
    text: r.text,
    startTime: r.startTime,
    endTime: r.endTime,
    transcriptChunkIds: r.transcriptChunkIds,
    embedding: byChunk.get(r.semanticChunkId) ?? null,
    videoId: r.videoId,
    videoTitle: r.videoTitle,
    playlistId: r.playlistId,
  }));
}

async function persistSemanticIndex(
  videoId: string,
  chunks: SemanticChunk[],
  model: string,
  meta?: { playlistId?: string; videoTitle?: string }
): Promise<void> {
  const db = getDb();
  const ts = nowMs();

  await db.transaction('rw', db.semanticChunks, db.embeddings, async () => {
    await db.semanticChunks.where('videoId').equals(videoId).delete();
    await db.embeddings.where('videoId').equals(videoId).delete();

    for (const chunk of chunks) {
      const row: SemanticChunkRow = {
        id: DbIds.semanticChunk(videoId, chunk.id),
        videoId,
        semanticChunkId: chunk.id,
        playlistId: meta?.playlistId ?? chunk.playlistId,
        videoTitle: meta?.videoTitle ?? chunk.videoTitle,
        text: chunk.text,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        transcriptChunkIds: chunk.transcriptChunkIds,
        createdAt: ts,
        updatedAt: ts,
        schemaVersion: 2,
      };
      await db.semanticChunks.put(row);

      if (chunk.embedding?.length) {
        const emb: EmbeddingRow = {
          id: DbIds.embedding(videoId, chunk.id, model),
          videoId,
          semanticChunkId: chunk.id,
          model,
          vector: chunk.embedding,
          createdAt: ts,
          updatedAt: ts,
          schemaVersion: 2,
        };
        await db.embeddings.put(emb);
      }
    }
  });
}

function chunkEnhanced(
  videoId: string,
  enhancedChunks: EnhancedTranscriptChunk[],
  meta?: { playlistId?: string; videoTitle?: string }
): SemanticChunk[] {
  const raw = chunkTranscriptSemantically(videoId, enhancedChunks, {
    maxChunkSize: CHUNKING.MAX_CHUNK_SIZE,
    minChunkSize: CHUNKING.MIN_CHUNK_SIZE,
    overlapSize: CHUNKING.OVERLAP_SIZE,
    respectSentences: true,
    respectParagraphs: true,
  });
  return raw.map((c) => ({
    ...c,
    videoId,
    videoTitle: meta?.videoTitle,
    playlistId: meta?.playlistId,
  }));
}

export async function buildKeywordOnlyIndex(
  videoId: string,
  enhancedChunks: EnhancedTranscriptChunk[],
  onProgress?: (stage: string) => void,
  meta?: { playlistId?: string; videoTitle?: string }
): Promise<SemanticChunk[]> {
  onProgress?.('Building local transcript index…');
  const rawChunks = chunkEnhanced(videoId, enhancedChunks, meta);
  await persistSemanticIndex(videoId, rawChunks, 'keyword-only', meta);
  return rawChunks;
}

export async function buildSemanticIndex(
  videoId: string,
  enhancedChunks: EnhancedTranscriptChunk[],
  onProgress?: (stage: string) => void,
  meta?: { playlistId?: string; videoTitle?: string }
): Promise<SemanticChunk[]> {
  onProgress?.('Checking cache…');
  const cached = await loadSemanticChunksFromDb(videoId, GEMINI.EMBEDDING_MODEL);
  if (cached?.length && cached.some((c) => c.embedding?.length)) {
    return cached;
  }

  onProgress?.('Chunking transcript…');
  let rawChunks = chunkEnhanced(videoId, enhancedChunks, meta);
  if (!rawChunks.length) return [];

  if (GEMINI.EMBEDDINGS_ENABLED) {
    rawChunks = await embedChunksForIndex(rawChunks, onProgress);
    await persistSemanticIndex(videoId, rawChunks, GEMINI.EMBEDDING_MODEL, meta);
    return rawChunks;
  }

  await persistSemanticIndex(videoId, rawChunks, 'keyword-only', meta);
  return rawChunks;
}

export async function retrieveRelevantChunks(
  question: string,
  chunks: SemanticChunk[],
  topK: number,
  _threshold: number,
  recentUserMessages: string[] = []
): Promise<SemanticChunk[]> {
  const scored = await retrieveHybrid(question, chunks, topK, recentUserMessages);
  return scored.map((r) => r.chunk);
}

export async function retrieveRelevantChunksWithScores(
  question: string,
  chunks: SemanticChunk[],
  topK: number,
  recentUserMessages: string[] = []
) {
  return retrieveHybrid(question, chunks, topK, recentUserMessages);
}

export function indexMetaFromPage(videoTitle?: string) {
  const playlistId = getPlaylistIdFromUrl() ?? undefined;
  return { playlistId, videoTitle };
}

/** Quick connectivity check */
export async function testGeminiConnection(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const key = apiKey.trim();
  if (!key) return { ok: false, error: 'Key is empty' };

  const model = GEMINI.CHAT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const r = await geminiFetch(
      url,
      {
        method: 'POST',
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: ok' }] }],
          generationConfig: { maxOutputTokens: 8, temperature: 0 },
        }),
      },
      key
    );
    if (r.ok) return { ok: true };
    const body = await r.text().catch(() => '');
    try {
      const j = JSON.parse(body) as { error?: { message?: string } };
      if (j.error?.message) return { ok: false, error: j.error.message };
    } catch {
      // ignore
    }
    if (r.status === 429) {
      return { ok: false, error: `Rate limit (429). Wait 30 seconds, then test again.` };
    }
    if (r.status === 401 || r.status === 403) {
      return { ok: false, error: 'Invalid API key' };
    }
    return { ok: false, error: `Gemini error ${r.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
