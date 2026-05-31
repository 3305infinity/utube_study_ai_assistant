import { GEMINI, VECTOR_SEARCH } from '@lib/constants';
import { DbIds, ensureDbReady, getDb, nowMs } from '@lib/db';
import type { QuizQuestion, SemanticChunk } from '@/types/ai';
import { canUseGeminiApi } from '@lib/storage';
import { createGeminiService } from '@/features/ai/gemini.service';
import { buildQuizPrompt, parseJson } from '@/features/ai/promptBuilder';
import { localQuiz } from '@/features/ai/localGeneration';
import { retrieveRelevantChunks } from '@/features/ai/ragPipeline.service';

export async function clearQuizzesForVideo(videoId: string): Promise<void> {
  await ensureDbReady();
  await getDb().quizzes.where('videoId').equals(videoId).delete();
}

export async function generateQuizForVideo(params: {
  videoId: string;
  semanticChunks: SemanticChunk[];
  videoTitle?: string;
  maxQuestions?: number;
}): Promise<QuizQuestion[]> {
  const maxQuestions = params.maxQuestions ?? 8;

  await clearQuizzesForVideo(params.videoId);

  const relevant = await retrieveRelevantChunks(
    'quiz multiple choice test',
    params.semanticChunks,
    VECTOR_SEARCH.TOP_K + 2,
    0
  );
  const context = (relevant.length ? relevant : params.semanticChunks)
    .map((c) => c.text.trim())
    .join('\n\n');

  let raw: Array<{
    id: string;
    question: string;
    options: string[];
    correctAnswerIndex: number;
    explanation: string;
    difficulty: 'easy' | 'medium' | 'hard';
    timestamp?: number;
  }> = [];

  if (!(await canUseGeminiApi())) {
    const questions = localQuiz(params.semanticChunks, params.videoId, maxQuestions);
    return saveQuizQuestions(params.videoId, questions);
  }

  try {
    const gemini = await createGeminiService();
    const { system, user } = buildQuizPrompt({
      videoTitle: params.videoTitle,
      maxQuestions,
      context,
    });

    const resp = await gemini.generateText({
      model: GEMINI.GENERATION_MODEL,
      prompt: { system, user },
      config: { temperature: 0.3, maxOutputTokens: 1600 },
    });

    const parsed = parseJson<{
      questions: Array<{
        id: string;
        question: string;
        options: string[];
        correctAnswerIndex: number;
        explanation: string;
        difficulty: 'easy' | 'medium' | 'hard';
        timestamp?: number;
      }>;
    }>(resp.content);

    raw = parsed?.questions?.length
      ? parsed.questions
      : params.semanticChunks.slice(0, maxQuestions).map((c, i) => ({
          id: `q_${i}`,
          question: `What is discussed around ${Math.floor(c.startTime)}s?`,
          options: [c.text.slice(0, 60), 'Unrelated topic A', 'Unrelated topic B', 'None'],
          correctAnswerIndex: 0,
          explanation: 'From transcript.',
          difficulty: 'medium' as const,
          timestamp: c.startTime,
        }));
  } catch (e) {
    console.warn('[YT StudyFlow] Gemini quiz failed — using local', e);
    const questions = localQuiz(params.semanticChunks, params.videoId, maxQuestions);
    return saveQuizQuestions(params.videoId, questions);
  }

  const questions: QuizQuestion[] = raw.slice(0, maxQuestions).map((q, i) => ({
    id: q.id || `q_${i}`,
    videoId: params.videoId,
    question: q.question,
    options: (q.options ?? []).slice(0, 4),
    correctAnswer: Number(q.correctAnswerIndex) || 0,
    explanation: q.explanation ?? '',
    difficulty: q.difficulty ?? 'medium',
    timestamp: q.timestamp,
  }));

  return saveQuizQuestions(params.videoId, questions);
}

async function saveQuizQuestions(
  videoId: string,
  questions: QuizQuestion[]
): Promise<QuizQuestion[]> {
  const ts = nowMs();
  const quizId = `quiz_${ts}`;

  await ensureDbReady();
  await getDb().quizzes.put({
    id: DbIds.quiz(videoId, quizId),
    videoId,
    quizId,
    mode: 'revision',
    title: 'Generated Quiz',
    questions: questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      correctAnswerIndex: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty,
      timestamp: q.timestamp,
    })),
    createdAt: ts,
    updatedAt: ts,
    schemaVersion: 1,
  });

  return questions;
}

export async function loadLatestQuiz(videoId: string): Promise<QuizQuestion[]> {
  await ensureDbReady();
  const rows = await getDb().quizzes.where('videoId').equals(videoId).toArray();
  const latest = rows.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!latest) return [];
  return latest.questions.map((q) => ({
    id: q.id,
    videoId,
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswerIndex,
    explanation: q.explanation,
    difficulty: q.difficulty,
    timestamp: q.timestamp,
  }));
}
