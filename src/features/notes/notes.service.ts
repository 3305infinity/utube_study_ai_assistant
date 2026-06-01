import { GEMINI, VECTOR_SEARCH } from '@lib/constants';
import { DbIds, ensureDbReady, getDb, nowMs } from '@lib/db';
import type { Note, NoteType } from '@/types/notes';
import type { SemanticChunk } from '@/types/ai';
import { canUseGeminiApi } from '@lib/storage';
import { createGeminiService } from '@/features/ai/gemini.service';
import { buildNotesPrompt, parseJson } from '@/features/ai/promptBuilder';
import { localNotes } from '@/features/ai/localGeneration';
import { retrieveRelevantChunks } from '@/features/ai/ragPipeline.service';

function formatContext(chunks: SemanticChunk[], includeTimestamps: boolean): string {
  return chunks
    .slice(0, 40)
    .map((c) =>
      includeTimestamps
        ? `[${Math.floor(c.startTime)}s] ${c.text}`
        : c.text
    )
    .join('\n\n');
}

export async function generateNote(params: {
  videoId: string;
  type: NoteType;
  semanticChunks: SemanticChunk[];
  videoTitle?: string;
  includeTimestamps?: boolean;
}): Promise<Note> {
  const includeTimestamps = params.includeTimestamps ?? true;
  const relevant = await retrieveRelevantChunks(
    `${params.type} study notes key concepts walkthrough ${params.videoTitle ?? ''}`,
    params.semanticChunks,
    VECTOR_SEARCH.CHAT_TOP_K,
    0,
    []
  );

  const contextChunks = relevant.length ? relevant : params.semanticChunks;
  let title = `${params.type} notes`;
  let content = contextChunks.map((c) => `- ${c.text}`).join('\n');
  let tags: string[] = [params.type];

  if (!(await canUseGeminiApi())) {
    const local = localNotes(params.type, contextChunks, params.videoTitle);
    title = local.title;
    content = local.content;
  } else {
  try {
    const gemini = await createGeminiService();
    const context = formatContext(contextChunks, includeTimestamps);
    const { system, user } = buildNotesPrompt({
      mode: params.type,
      videoTitle: params.videoTitle,
      context,
      includeTimestamps,
    });

    const resp = await gemini.generateText({
      model: GEMINI.GENERATION_MODEL,
      prompt: { system, user },
      config: { temperature: 0.4, maxOutputTokens: params.type === 'interview' ? 2000 : 1800 },
    });

    const parsed = parseJson<{ title: string; content: string; tags: string[] }>(resp.content);
    if (parsed?.title) title = parsed.title.trim();
    if (parsed?.content) content = parsed.content.trim();
    if (parsed?.tags) tags = parsed.tags;
  } catch (e) {
    console.warn('[YT StudyFlow] Gemini notes failed — using local', e);
    const local = localNotes(params.type, contextChunks, params.videoTitle);
    title = local.title;
    content = local.content;
  }
  }

  const ts = nowMs();
  const id = DbIds.note(params.videoId, `note_${params.type}_${ts}`);

  const note: Note = {
    id,
    videoId: params.videoId,
    type: params.type,
    title,
    content,
    format: 'markdown',
    tags,
    isPinned: false,
    createdAt: ts,
    updatedAt: ts,
    timestampAnchors: includeTimestamps
      ? contextChunks.slice(0, 15).map((c) => ({ startTime: c.startTime, endTime: c.endTime }))
      : undefined,
  };

  await ensureDbReady();
  await getDb().notes.put({
    ...note,
    schemaVersion: 1,
  });

  return note;
}

export async function listNotes(videoId: string): Promise<Note[]> {
  await ensureDbReady();
  const rows = await getDb().notes.where('videoId').equals(videoId).toArray();
  return rows.map((r) => ({
    id: r.id,
    videoId: r.videoId,
    type: r.type,
    title: r.title,
    content: r.content,
    format: r.format,
    tags: r.tags,
    isPinned: r.isPinned,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    timestampAnchors: r.timestampAnchors,
  }));
}

export async function deleteNote(id: string): Promise<void> {
  await ensureDbReady();
  await getDb().notes.delete(id);
}
