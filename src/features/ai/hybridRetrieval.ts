import { GEMINI, VECTOR_SEARCH } from '@lib/constants';
import type { SemanticChunk } from '@/types/ai';
import { createGeminiService } from './gemini.service';
import { retrieveRelevantChunksScored, type ScoredChunk } from './transcriptRetrieval';
import { embedSemanticChunks } from './vectorSearch';
import { vectorSearchTopK } from './vectorSearch';
import { canUseGeminiApi } from '@lib/storage';

function mergeScored(keyword: ScoredChunk[], vector: ScoredChunk[], topK: number): ScoredChunk[] {
  const map = new Map<string, ScoredChunk>();

  for (const s of keyword) {
    map.set(`${s.chunk.videoId ?? ''}|${s.chunk.id}`, { ...s, score: s.score * 1.0 });
  }
  for (const s of vector) {
    const key = `${s.chunk.videoId ?? ''}|${s.chunk.id}`;
    const prev = map.get(key);
    const blended = (prev?.score ?? 0) + s.score * 2.5;
    map.set(key, { chunk: s.chunk, score: blended });
  }

  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

export async function retrieveHybrid(
  question: string,
  chunks: SemanticChunk[],
  topK: number = VECTOR_SEARCH.CHAT_TOP_K,
  recentUserMessages: string[] = []
): Promise<ScoredChunk[]> {
  const keyword = retrieveRelevantChunksScored(question, chunks, topK, recentUserMessages);

  const hasEmbeddings = chunks.some((c) => c.embedding?.length);
  if (!GEMINI.EMBEDDINGS_ENABLED || !hasEmbeddings || !(await canUseGeminiApi())) {
    return keyword;
  }

  try {
    const gemini = await createGeminiService();
    const qResp = await gemini.embedTexts({
      model: GEMINI.EMBEDDING_MODEL,
      input: [question],
      taskType: 'RETRIEVAL_QUERY',
    });
    const queryVec = qResp.embeddings[0];
    if (!queryVec?.length) return keyword;

    const vectorHits = vectorSearchTopK({
      queryEmbedding: queryVec,
      chunks,
      topK,
      threshold: VECTOR_SEARCH.SIMILARITY_THRESHOLD,
    });

    const vectorScored: ScoredChunk[] = vectorHits.map((h) => ({
      chunk: h.chunk,
      score: h.similarity,
    }));

    return mergeScored(keyword, vectorScored, topK);
  } catch (e) {
    console.warn('[YT StudyFlow] Vector retrieval failed, using keyword', e);
    return keyword;
  }
}

export async function embedChunksForIndex(
  chunks: SemanticChunk[],
  onProgress?: (msg: string) => void
): Promise<SemanticChunk[]> {
  if (!GEMINI.EMBEDDINGS_ENABLED || !chunks.length) return chunks;
  if (!(await canUseGeminiApi())) return chunks;

  const cap = GEMINI.MAX_EMBED_CHUNKS > 0 ? GEMINI.MAX_EMBED_CHUNKS : chunks.length;
  const target = chunks.slice(0, cap);
  onProgress?.(`Embedding ${target.length} chunks (vector RAG)…`);

  try {
    const gemini = await createGeminiService();
    const embedded = await embedSemanticChunks(target, gemini, GEMINI.EMBEDDING_MODEL);
    const byId = new Map(embedded.map((c) => [c.id, c]));
    return chunks.map((c) => byId.get(c.id) ?? c);
  } catch (e) {
    console.warn('[YT StudyFlow] Embedding failed', e);
    return chunks;
  }
}
