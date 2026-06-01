import { ensureDbReady, getDb } from '@lib/db';
import type { StudyMasteryBreakdown, StudyPlan } from '@/types/ai';

export async function computeMasteryBreakdown(
  playlistId: string,
  plan: Pick<StudyPlan, 'segments' | 'watchedSegmentIds'>
): Promise<StudyMasteryBreakdown> {
  await ensureDbReady();
  const db = getDb();

  const playlistVideos = await db.semanticChunks
    .where('playlistId')
    .equals(playlistId)
    .toArray();
  const videoIds = [...new Set(playlistVideos.map((r) => r.videoId))];

  let quizCorrect = 0;
  let quizTotal = 0;
  for (const vid of videoIds) {
    const quizzes = await db.quizzes.where('videoId').equals(vid).toArray();
    for (const q of quizzes) {
      for (const question of q.questions) {
        quizTotal += 1;
        const answered = (question as { userAnswerIndex?: number }).userAnswerIndex;
        if (answered === question.correctAnswerIndex) quizCorrect += 1;
      }
    }
  }

  const flashRows = await db.flashcards.where('playlistId').equals(playlistId).toArray();
  const flashcardsTotal = flashRows.length;
  const flashcardsReviewed = flashRows.filter(
    (f) => (f.repetitions ?? 0) > 0 || f.lastReviewedAt != null
  ).length;

  const analytics = await db.analytics
    .filter((a) => videoIds.includes(a.videoId) && a.kind === 'learning_event')
    .toArray();
  const revisionSessions = Math.min(
    3,
    analytics.filter((a) => {
      const p = a.payload as { type?: string };
      return p.type === 'revision' || p.type === 'flashcard_review';
    }).length
  );

  const segmentsTotal = plan.segments.length || 1;
  const segmentsWatched = plan.watchedSegmentIds.length;

  let percent = 0;
  if (segmentsTotal > 0) {
    percent += (segmentsWatched / segmentsTotal) * 40;
  }
  if (quizTotal > 0) {
    percent += (quizCorrect / quizTotal) * 30;
  }
  if (flashcardsTotal > 0) {
    percent += (flashcardsReviewed / flashcardsTotal) * 20;
  } else if (segmentsWatched > 0) {
    percent += 10;
  }
  percent += (revisionSessions / 3) * 10;

  return {
    percent: Math.min(100, Math.round(percent)),
    quizCorrect,
    quizTotal,
    flashcardsReviewed,
    flashcardsTotal,
    segmentsWatched,
    segmentsTotal,
    revisionSessions,
  };
}
