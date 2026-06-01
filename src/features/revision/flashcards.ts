import { GEMINI, VECTOR_SEARCH } from '@lib/constants';
import { DbIds, ensureDbReady, getDb, nowMs } from '@lib/db';
import type { Flashcard, SemanticChunk } from '@/types/ai';
import { canUseGeminiApi } from '@lib/storage';
import { createGeminiService } from '@/features/ai/gemini.service';
import { buildFlashcardsPrompt, parseJson } from '@/features/ai/promptBuilder';
import { localFlashcards } from '@/features/ai/localGeneration';
import { retrieveRelevantChunks } from '@/features/ai/ragPipeline.service';
import { defaultSm2State } from './sm2';

export async function clearFlashcardsForVideo(videoId: string): Promise<void> {
  await ensureDbReady();
  await getDb().flashcards.where('videoId').equals(videoId).delete();
}

export async function listFlashcardsByPlaylist(playlistId: string): Promise<Flashcard[]> {
  await ensureDbReady();
  const rows = await getDb().flashcards.where('playlistId').equals(playlistId).toArray();
  return rows.map((r) => ({
    id: r.id,
    videoId: r.videoId,
    front: r.front,
    back: r.back,
    difficulty: r.difficulty,
    nextReviewDate: r.nextReviewDate,
    interval: r.intervalDays,
    repetitions: r.repetitions,
    easeFactor: r.easeFactor,
    createdAt: r.createdAt,
    lastReviewed: r.lastReviewedAt,
  }));
}

export async function generateFlashcardsForPlaylist(params: {
  playlistId: string;
  semanticChunks: SemanticChunk[];
  videoTitle?: string;
  maxCards?: number;
}): Promise<Flashcard[]> {
  const maxCards = params.maxCards ?? 24;
  const relevant = await retrieveRelevantChunks(
    'key concepts definitions algorithms',
    params.semanticChunks,
    VECTOR_SEARCH.CHAT_TOP_K + 4,
    0
  );
  const context = (relevant.length ? relevant : params.semanticChunks)
    .map((c) => `[${c.videoTitle ?? c.videoId}] ${c.text.trim()}`)
    .join('\n\n');

  if (!(await canUseGeminiApi())) {
    return [];
  }

  const gemini = await createGeminiService();
  const { system, user } = buildFlashcardsPrompt({
    videoTitle: params.videoTitle ?? 'Playlist course',
    maxCards,
    context,
  });
  const resp = await gemini.generateText({
    model: GEMINI.CHAT_MODEL,
    prompt: { system, user },
    config: { temperature: 0.35, maxOutputTokens: 2000 },
  });
  const parsed = parseJson<{
    flashcards: Array<{
      id: string;
      front: string;
      back: string;
      difficulty: 'easy' | 'medium' | 'hard';
    }>;
  }>(resp.content);
  const raw = parsed?.flashcards ?? [];
  const ts = nowMs();
  const sm2 = defaultSm2State();
  const cards: Flashcard[] = [];
  const db = getDb();

  for (const c of raw.slice(0, maxCards)) {
    const flashcardId = c.id || `fc_pl_${ts}_${cards.length}`;
    const videoId = params.semanticChunks[0]?.videoId ?? 'playlist';
    const card: Flashcard = {
      id: DbIds.flashcard(videoId, flashcardId),
      videoId,
      front: c.front,
      back: c.back,
      difficulty: c.difficulty ?? 'medium',
      nextReviewDate: sm2.nextReviewDate,
      interval: sm2.intervalDays,
      repetitions: sm2.repetitions,
      easeFactor: sm2.easeFactor,
      createdAt: ts,
    };
    cards.push(card);
    await db.flashcards.put({
      id: card.id,
      videoId,
      playlistId: params.playlistId,
      flashcardId,
      front: card.front,
      back: card.back,
      difficulty: card.difficulty,
      nextReviewDate: card.nextReviewDate,
      intervalDays: card.interval,
      repetitions: card.repetitions,
      easeFactor: card.easeFactor,
      createdAt: ts,
      updatedAt: ts,
      schemaVersion: 2,
    });
  }
  return cards;
}

export async function generateFlashcardsForVideo(params: {
  videoId: string;
  semanticChunks: SemanticChunk[];
  videoTitle?: string;
  maxCards?: number;
  playlistId?: string;
}): Promise<Flashcard[]> {
  const maxCards = params.maxCards ?? 12;

  await clearFlashcardsForVideo(params.videoId);

  const relevant = await retrieveRelevantChunks(
    'key concepts definitions facts',
    params.semanticChunks,
    VECTOR_SEARCH.TOP_K + 2,
    0
  );
  const context = (relevant.length ? relevant : params.semanticChunks)
    .map((c) => c.text.trim())
    .join('\n\n');

  let raw: Array<{
    id: string;
    front: string;
    back: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }> = [];

  if (!(await canUseGeminiApi())) {
    const local = localFlashcards(params.videoId, params.semanticChunks, maxCards);
    await ensureDbReady();
    const db = getDb();
    for (const card of local) {
      await db.flashcards.put({
        id: card.id,
        videoId: params.videoId,
        flashcardId: card.id.split('|').pop() ?? card.id,
        front: card.front,
        back: card.back,
        difficulty: card.difficulty,
        nextReviewDate: card.nextReviewDate,
        intervalDays: card.interval,
        repetitions: card.repetitions,
        easeFactor: card.easeFactor,
        createdAt: card.createdAt,
        updatedAt: card.createdAt,
        schemaVersion: 1,
      });
    }
    return local;
  }

  try {
    const gemini = await createGeminiService();
    const { system, user } = buildFlashcardsPrompt({
      videoTitle: params.videoTitle,
      maxCards,
      context,
    });

    const resp = await gemini.generateText({
      model: GEMINI.CHAT_MODEL,
      prompt: { system, user },
      config: { temperature: 0.35, maxOutputTokens: 1200 },
    });

    const parsed = parseJson<{
      flashcards: Array<{
        id: string;
        front: string;
        back: string;
        difficulty: 'easy' | 'medium' | 'hard';
      }>;
    }>(resp.content);

    raw = parsed?.flashcards?.length
      ? parsed.flashcards
      : params.semanticChunks.slice(0, maxCards).map((c, i) => ({
          id: `fc_${i}`,
          front: `Key idea at ${Math.floor(c.startTime)}s?`,
          back: c.text.slice(0, 200),
          difficulty: 'medium' as const,
        }));
  } catch (e) {
    console.warn('[YT StudyFlow] Gemini flashcards failed — using local', e);
    const local = localFlashcards(params.videoId, params.semanticChunks, maxCards);
    await ensureDbReady();
    const db = getDb();
    for (const card of local) {
      await db.flashcards.put({
        id: card.id,
        videoId: params.videoId,
        flashcardId: card.id.split('|').pop() ?? card.id,
        front: card.front,
        back: card.back,
        difficulty: card.difficulty,
        nextReviewDate: card.nextReviewDate,
        intervalDays: card.interval,
        repetitions: card.repetitions,
        easeFactor: card.easeFactor,
        createdAt: card.createdAt,
        updatedAt: card.createdAt,
        schemaVersion: 1,
      });
    }
    return local;
  }

  const ts = nowMs();
  const sm2 = defaultSm2State();
  const cards: Flashcard[] = [];

  await ensureDbReady();
  const db = getDb();

  for (const c of raw.slice(0, maxCards)) {
    const flashcardId = c.id || `fc_${ts}_${cards.length}`;
    const card: Flashcard = {
      id: DbIds.flashcard(params.videoId, flashcardId),
      videoId: params.videoId,
      front: c.front,
      back: c.back,
      difficulty: c.difficulty ?? 'medium',
      nextReviewDate: sm2.nextReviewDate,
      interval: sm2.intervalDays,
      repetitions: sm2.repetitions,
      easeFactor: sm2.easeFactor,
      createdAt: ts,
    };
    cards.push(card);
    await db.flashcards.put({
      id: card.id,
      videoId: params.videoId,
      playlistId: params.playlistId,
      flashcardId,
      front: card.front,
      back: card.back,
      difficulty: card.difficulty,
      nextReviewDate: card.nextReviewDate,
      intervalDays: card.interval,
      repetitions: card.repetitions,
      easeFactor: card.easeFactor,
      createdAt: ts,
      updatedAt: ts,
      schemaVersion: 1,
    });
  }

  return cards;
}

export async function listFlashcards(videoId: string): Promise<Flashcard[]> {
  await ensureDbReady();
  const rows = await getDb().flashcards.where('videoId').equals(videoId).toArray();
  return rows.map((r) => ({
    id: r.id,
    videoId: r.videoId,
    front: r.front,
    back: r.back,
    difficulty: r.difficulty,
    nextReviewDate: r.nextReviewDate,
    interval: r.intervalDays,
    repetitions: r.repetitions,
    easeFactor: r.easeFactor,
    createdAt: r.createdAt,
    lastReviewed: r.lastReviewedAt,
  }));
}

export async function gradeFlashcard(
  cardId: string,
  grade: import('./sm2').SM2Grade
): Promise<void> {
  await ensureDbReady();
  const db = getDb();
  const row = await db.flashcards.get(cardId);
  if (!row) return;

  const { sm2Update } = await import('./sm2');
  const next = sm2Update(
    {
      easeFactor: row.easeFactor,
      intervalDays: row.intervalDays,
      repetitions: row.repetitions,
      nextReviewDate: row.nextReviewDate,
      lastReviewedAt: row.lastReviewedAt,
    },
    grade
  );

  await db.flashcards.put({
    ...row,
    easeFactor: next.easeFactor,
    intervalDays: next.intervalDays,
    repetitions: next.repetitions,
    nextReviewDate: next.nextReviewDate,
    lastReviewedAt: next.lastReviewedAt,
    updatedAt: Date.now(),
  });
}
