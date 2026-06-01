import { GEMINI, VECTOR_SEARCH } from '@lib/constants';
import { DbIds, ensureDbReady, getDb, nowMs } from '@lib/db';
import type { Chapter, SemanticChunk } from '@/types/ai';
import { canUseGeminiApi } from '@lib/storage';
import { createGeminiService } from '@/features/ai/gemini.service';
import { buildChaptersPrompt, parseJson } from '@/features/ai/promptBuilder';
import { localChapters } from '@/features/ai/localGeneration';
import { retrieveRelevantChunks } from '@/features/ai/ragPipeline.service';

function hasDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

function englishifyChapters(chapters: Chapter[]): Chapter[] {
  return chapters.map((ch, i) => ({
    ...ch,
    title: hasDevanagari(ch.title) ? `Section ${i + 1}` : ch.title,
    summary: hasDevanagari(ch.summary)
      ? 'Topic covered in this segment (see English summary in Chat or Notes).'
      : ch.summary,
    keyPoints: ch.keyPoints.map((kp) =>
      hasDevanagari(kp) ? 'Key idea from this segment' : kp
    ),
  }));
}

export async function generateChaptersForVideo(params: {
  videoId: string;
  semanticChunks: SemanticChunk[];
  videoTitle?: string;
  maxChapters?: number;
}): Promise<Chapter[]> {
  const maxChapters = params.maxChapters ?? 8;
  const relevant = await retrieveRelevantChunks(
    'chapter structure topics sections',
    params.semanticChunks,
    VECTOR_SEARCH.TOP_K + 4,
    0
  );
  const context = (relevant.length ? relevant : params.semanticChunks)
    .map((c) => `[${Math.floor(c.startTime)}s-${Math.floor(c.endTime)}s] ${c.text}`)
    .join('\n\n');

  let chapters: Chapter[] = [];

  if (!(await canUseGeminiApi())) {
    chapters = localChapters(params.semanticChunks, maxChapters);
  } else {
  try {
    const gemini = await createGeminiService();
    const { system, user } = buildChaptersPrompt({
      videoTitle: params.videoTitle,
      maxChapters,
      context,
    });

    const resp = await gemini.generateText({
      model: GEMINI.CHAT_MODEL,
      prompt: { system, user },
      config: { temperature: 0.3, maxOutputTokens: 1200 },
    });

    const parsed = parseJson<{ chapters: Chapter[] }>(resp.content);
    chapters = englishifyChapters(parsed?.chapters ?? []);
  } catch (e) {
    console.warn('[YT StudyFlow] Gemini chapters failed — using local', e);
    chapters = localChapters(params.semanticChunks, maxChapters);
  }
  }

  if (!chapters.length && params.semanticChunks.length) {
    chapters = localChapters(params.semanticChunks, maxChapters);
  }

  chapters = chapters
    .slice(0, maxChapters)
    .map((c, i) => ({
      id: c.id || `ch_${i}`,
      title: c.title || `Chapter ${i + 1}`,
      startTime: Number(c.startTime) || 0,
      endTime: Number(c.endTime) || 0,
      summary: c.summary || '',
      keyPoints: Array.isArray(c.keyPoints) ? c.keyPoints : [],
    }))
    .sort((a, b) => a.startTime - b.startTime);

  const ts = nowMs();
  await ensureDbReady();
  await getDb().chapters.put({
    id: DbIds.chapters(params.videoId),
    videoId: params.videoId,
    title: params.videoTitle ?? 'Chapters',
    chapters,
    createdAt: ts,
    updatedAt: ts,
    schemaVersion: 1,
  });

  return chapters;
}

export async function loadChapters(videoId: string): Promise<Chapter[]> {
  await ensureDbReady();
  const row = await getDb().chapters.get(DbIds.chapters(videoId));
  return row?.chapters ?? [];
}
