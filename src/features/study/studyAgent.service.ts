import { DbIds, ensureDbReady, getDb, nowMs } from '@lib/db';
import type {
  StudyLevel,
  StudyPlan,
  StudyQuickQuestion,
  StudySegment,
  SemanticChunk,
} from '@/types/ai';
import { retrieveRelevantChunksWithScores } from '@/features/ai/ragPipeline.service';
import { VECTOR_SEARCH, GEMINI } from '@lib/constants';
import { createGeminiService } from '@/features/ai/gemini.service';
import { buildStudyPathPrompt, parseJson } from '@/features/ai/promptBuilder';
import { canUseGeminiApi } from '@lib/storage';
import { buildEducationalPrompt } from '@/features/ai/promptBuilder';
import { detectResponseIntent } from '@/features/ai/responseIntent';
import type { ScoredChunk } from '@/features/ai/transcriptRetrieval';
import {
  buildRetrievalEvidence,
  formatEvidenceForPrompt,
  localStudyPath,
} from './studyPathLocal';
import { computeMasteryBreakdown } from './mastery.service';
import type { StudyPlanRow } from '@lib/db';

function slug(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

function levelQuerySuffix(level: StudyLevel): string {
  if (level === 'beginner') return 'intuition basics introduction explain from scratch';
  if (level === 'advanced') return 'optimization complexity proof advanced edge cases';
  return 'walkthrough example practice';
}

async function retrieveForTopic(
  topic: string,
  level: StudyLevel,
  chunks: SemanticChunk[]
): Promise<ScoredChunk[]> {
  const q1 = await retrieveRelevantChunksWithScores(
    topic,
    chunks,
    VECTOR_SEARCH.CHAT_TOP_K + 4,
    []
  );
  const q2 = await retrieveRelevantChunksWithScores(
    `${topic} ${levelQuerySuffix(level)}`,
    chunks,
    VECTOR_SEARCH.CHAT_TOP_K,
    []
  );
  const byId = new Map<string, ScoredChunk>();
  for (const s of [...q1, ...q2]) {
    const prev = byId.get(s.chunk.id);
    if (!prev || s.score > prev.score) byId.set(s.chunk.id, s);
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

function rowToPlan(row: StudyPlanRow): StudyPlan {
  return {
    id: row.id,
    playlistId: row.playlistId,
    topic: row.topic,
    level: row.level,
    estimatedMinutes: row.estimatedMinutes,
    prerequisites: row.prerequisites,
    segments: row.segments,
    keyConcepts: row.keyConcepts,
    interviewQuestions: row.interviewQuestions,
    conceptMap: row.conceptMap as StudyPlan['conceptMap'],
    retrievalEvidence: row.retrievalEvidence,
    nextTopics: row.nextTopics,
    notesPreview: row.notesPreview,
    quickQuiz: row.quickQuiz,
    mastery: row.mastery,
    watchedSegmentIds: row.watchedSegmentIds ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function planToRow(plan: StudyPlan): StudyPlanRow {
  return {
    ...plan,
    schemaVersion: 3,
  };
}

function applyGeminiPath(
  base: Omit<StudyPlan, 'createdAt' | 'updatedAt' | 'mastery' | 'watchedSegmentIds'>,
  parsed: {
    estimatedMinutes?: number;
    prerequisites?: string[];
    segments?: Array<{
      title: string;
      description?: string;
      startTime: number;
      endTime: number;
      videoId: string;
    }>;
    keyConcepts?: string[];
    interviewQuestions?: string[];
    conceptMap?: StudyPlan['conceptMap'];
    nextTopics?: string[];
    notesPreview?: string;
    quickQuiz?: StudyQuickQuestion[];
  },
  evidenceSegments: StudySegment[]
): Omit<StudyPlan, 'createdAt' | 'updatedAt' | 'mastery' | 'watchedSegmentIds'> {
  const segments: StudySegment[] =
    parsed.segments?.length && parsed.segments.every((s) => s.videoId && s.endTime >= s.startTime)
      ? parsed.segments.map((s, i) => ({
          id: `seg_${i}`,
          title: s.title,
          description: s.description ?? '',
          startTime: s.startTime,
          endTime: s.endTime,
          videoId: s.videoId,
          videoTitle: evidenceSegments.find((e) => e.videoId === s.videoId)?.videoTitle,
          watched: false,
        }))
      : base.segments;

  return {
    ...base,
    estimatedMinutes: parsed.estimatedMinutes ?? base.estimatedMinutes,
    prerequisites: parsed.prerequisites?.length ? parsed.prerequisites : base.prerequisites,
    segments,
    keyConcepts: parsed.keyConcepts?.length ? parsed.keyConcepts : base.keyConcepts,
    interviewQuestions: parsed.interviewQuestions?.length
      ? parsed.interviewQuestions
      : base.interviewQuestions,
    conceptMap: parsed.conceptMap?.length ? parsed.conceptMap : base.conceptMap,
    nextTopics: parsed.nextTopics?.length ? parsed.nextTopics : base.nextTopics,
    notesPreview: parsed.notesPreview?.trim() || base.notesPreview,
    quickQuiz:
      parsed.quickQuiz?.length === 3
        ? parsed.quickQuiz.map((q, i) => ({
            id: q.id || `q${i}`,
            question: q.question,
            options: q.options?.slice(0, 4) ?? [],
            correctAnswer: q.correctAnswer ?? 0,
            explanation: q.explanation ?? '',
          }))
        : base.quickQuiz,
  };
}

export async function runStudyAgent(params: {
  topic: string;
  level: StudyLevel;
  playlistId: string;
  chunks: SemanticChunk[];
  videoTitle?: string;
}): Promise<StudyPlan> {
  const topic = params.topic.trim();
  if (!topic) throw new Error('Enter a topic to study');
  if (!params.chunks.length) {
    throw new Error('No indexed transcript yet. Wait for the index to build or watch this video briefly.');
  }

  const scored = await retrieveForTopic(topic, params.level, params.chunks);
  if (!scored.length) {
    throw new Error('Could not find content about this topic in indexed lectures.');
  }

  const planId = DbIds.studyPlan(params.playlistId, slug(topic));
  const localBase = localStudyPath({
    topic,
    level: params.level,
    playlistId: params.playlistId,
    planId,
    scored,
    videoTitle: params.videoTitle,
  });

  let pathData = localBase;

  if (await canUseGeminiApi()) {
    try {
      const gemini = await createGeminiService();
      const evidence = buildRetrievalEvidence(scored);
      const resp = await gemini.generateText({
        model: GEMINI.CHAT_MODEL,
        prompt: buildStudyPathPrompt({
          topic,
          level: params.level,
          videoTitle: params.videoTitle,
          evidence: formatEvidenceForPrompt(evidence),
        }),
        config: { temperature: 0.35, maxOutputTokens: 2800 },
      });
      const parsed = parseJson<Parameters<typeof applyGeminiPath>[1]>(resp.content);
      if (parsed) {
        pathData = applyGeminiPath(localBase, parsed, localBase.segments);
      }
    } catch (e) {
      console.warn('[StudyFlow] Gemini path failed, using retrieval-only path', e);
    }
  }

  const ts = nowMs();
  const draft: StudyPlan = {
    ...pathData,
    watchedSegmentIds: [],
    createdAt: ts,
    updatedAt: ts,
    mastery: {
      percent: 0,
      quizCorrect: 0,
      quizTotal: 0,
      flashcardsReviewed: 0,
      flashcardsTotal: 0,
      segmentsWatched: 0,
      segmentsTotal: pathData.segments.length,
      revisionSessions: 0,
    },
  };

  draft.mastery = await computeMasteryBreakdown(params.playlistId, draft);
  await ensureDbReady();
  await getDb().studyPlans.put(planToRow(draft));
  return draft;
}

export async function loadLatestStudyPlan(playlistId: string): Promise<StudyPlan | null> {
  await ensureDbReady();
  const rows = await getDb().studyPlans.where('playlistId').equals(playlistId).toArray();
  const valid = rows.filter((r) => r.schemaVersion >= 3 && r.segments?.length);
  if (!valid.length) return null;
  valid.sort((a, b) => b.updatedAt - a.updatedAt);
  const plan = rowToPlan(valid[0]!);
  plan.mastery = await computeMasteryBreakdown(playlistId, plan);
  return plan;
}

export async function markSegmentWatched(planId: string, segmentId: string): Promise<StudyPlan | null> {
  await ensureDbReady();
  const row = await getDb().studyPlans.get(planId);
  if (!row) return null;

  const watched = new Set(row.watchedSegmentIds ?? []);
  watched.add(segmentId);
  const segments = row.segments.map((s) =>
    s.id === segmentId ? { ...s, watched: true } : s
  );

  const draft = rowToPlan({
    ...row,
    segments,
    watchedSegmentIds: [...watched],
    updatedAt: nowMs(),
  });
  draft.mastery = await computeMasteryBreakdown(row.playlistId, draft);
  await getDb().studyPlans.put(planToRow(draft));
  return draft;
}

export async function refreshPlanMastery(planId: string): Promise<StudyPlan | null> {
  await ensureDbReady();
  const row = await getDb().studyPlans.get(planId);
  if (!row) return null;
  const plan = rowToPlan(row);
  plan.mastery = await computeMasteryBreakdown(row.playlistId, plan);
  plan.updatedAt = nowMs();
  await getDb().studyPlans.put(planToRow(plan));
  return plan;
}

export async function askStudyTutor(params: {
  question: string;
  plan: StudyPlan;
  chunks: SemanticChunk[];
  videoTitle?: string;
  conversationSummary?: string;
}): Promise<string> {
  const scored = await retrieveRelevantChunksWithScores(
    `${params.plan.topic} ${params.question}`,
    params.chunks,
    VECTOR_SEARCH.CHAT_TOP_K,
    []
  );
  const relevant = scored.map((s) => s.chunk);

  if (!(await canUseGeminiApi())) {
    const seg = params.plan.segments[0];
    return relevant.length
      ? `From the lecture (${seg?.title ?? 'indexed content'}): ${relevant[0]!.text.slice(0, 400)}…`
      : 'Add an API key in Settings for full tutor answers.';
  }

  const gemini = await createGeminiService();
  const intent = detectResponseIntent(params.question, 'deep');
  const { system, user } = buildEducationalPrompt({
    userQuery: `[Study topic: ${params.plan.topic}, level: ${params.plan.level}] ${params.question}`,
    relevantChunks: relevant,
    videoTitle: params.videoTitle,
    conversationSummary: params.conversationSummary,
    responseIntent: intent,
    promptOptions: { mode: 'student', includeTimestamps: true, maxContextChars: 12000 },
  });

  const resp = await gemini.generateText({
    model: GEMINI.CHAT_MODEL,
    prompt: { system, user },
    config: { temperature: 0.38, maxOutputTokens: 1100 },
  });
  return resp.content.trim() || 'No answer generated.';
}
