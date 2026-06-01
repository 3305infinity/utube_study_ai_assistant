import type {
  SemanticChunk,
  StudyConceptNode,
  StudyLevel,
  StudyPlan,
  StudyQuickQuestion,
  StudyRetrievalEvidence,
  StudySegment,
} from '@/types/ai';
import type { ScoredChunk } from '@/features/ai/transcriptRetrieval';
import { formatTime } from '@lib/youtube';

function titleFromText(text: string, topic: string): string {
  const line = text.split(/[.!?\n]/).find((s) => s.trim().length > 12)?.trim();
  if (!line) return `${topic} — segment`;
  const words = line.split(/\s+/).slice(0, 8).join(' ');
  return words.length > 48 ? `${words.slice(0, 45)}…` : words;
}

export function buildRetrievalEvidence(scored: ScoredChunk[]): StudyRetrievalEvidence[] {
  return scored.slice(0, 12).map((s) => ({
    chunkId: s.chunk.id,
    videoId: s.chunk.videoId ?? 'unknown',
    videoTitle: s.chunk.videoTitle,
    startTime: s.chunk.startTime,
    endTime: s.chunk.endTime,
    excerpt: s.chunk.text.trim().slice(0, 160),
    score: Math.round(s.score * 100) / 100,
  }));
}

export function formatEvidenceForPrompt(evidence: StudyRetrievalEvidence[]): string {
  return evidence
    .map(
      (e, i) =>
        `[${i + 1}] videoId=${e.videoId} title="${e.videoTitle ?? 'Lecture'}" ${formatTime(e.startTime)}–${formatTime(e.endTime)} score=${e.score}\n${e.excerpt}`
    )
    .join('\n\n');
}

/** Merge retrieved chunks into ordered lecture segments with real timestamps */
export function segmentsFromRetrieval(
  scored: ScoredChunk[],
  topic: string,
  level: StudyLevel
): StudySegment[] {
  const sorted = [...scored].sort((a, b) => {
    const va = a.chunk.videoId ?? '';
    const vb = b.chunk.videoId ?? '';
    if (va !== vb) return va.localeCompare(vb);
    return a.chunk.startTime - b.chunk.startTime;
  });

  const merged: Array<{ chunk: SemanticChunk; score: number }> = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.chunk.videoId === s.chunk.videoId &&
      s.chunk.startTime - last.chunk.endTime < 45
    ) {
      last.chunk = {
        ...last.chunk,
        endTime: Math.max(last.chunk.endTime, s.chunk.endTime),
        text: `${last.chunk.text} ${s.chunk.text}`.slice(0, 1200),
      };
      last.score = Math.max(last.score, s.score);
    } else {
      merged.push({ chunk: { ...s.chunk }, score: s.score });
    }
  }

  let list = merged;
  if (level === 'advanced' && list.length > 5) {
    list = list.slice(-5);
  } else if (level === 'intermediate' && list.length > 7) {
    list = list.slice(0, 7);
  } else if (list.length > 8) {
    list = list.slice(0, 8);
  }

  return list.map((m, i) => ({
    id: `seg_${i}`,
    title: titleFromText(m.chunk.text, topic),
    description: m.chunk.text.trim().slice(0, 220),
    startTime: m.chunk.startTime,
    endTime: m.chunk.endTime,
    videoId: m.chunk.videoId ?? 'unknown',
    videoTitle: m.chunk.videoTitle,
    watched: false,
  }));
}

function extractConcepts(text: string, topic: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const topicWords = topic.toLowerCase().split(/\s+/);
  const concepts = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .filter((w) => !topicWords.some((t) => w.includes(t)))
    .slice(0, 6)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return concepts.length ? concepts : [topic, 'Core idea', 'Practice'];
}

export function defaultConceptMap(topic: string, concepts: string[]): StudyConceptNode[] {
  const root: StudyConceptNode = {
    id: 'root',
    label: topic,
    children: concepts.slice(0, 5).map((c, i) => ({ id: `c${i}`, label: c })),
  };
  return [root];
}

export function localStudyPath(params: {
  topic: string;
  level: StudyLevel;
  playlistId: string;
  planId: string;
  scored: ScoredChunk[];
  videoTitle?: string;
}): Omit<StudyPlan, 'createdAt' | 'updatedAt' | 'mastery' | 'watchedSegmentIds'> {
  const evidence = buildRetrievalEvidence(params.scored);
  const segments = segmentsFromRetrieval(params.scored, params.topic, params.level);
  const corpus = params.scored.map((s) => s.chunk.text).join(' ');
  const keyConcepts = extractConcepts(corpus, params.topic);

  const durationMin = segments.reduce(
    (acc, s) => acc + Math.max(0, s.endTime - s.startTime) / 60,
    0
  );

  const quickQuiz: StudyQuickQuestion[] = [
    {
      id: 'q1',
      question: `What is the main idea of ${params.topic} in this lecture?`,
      options: [
        keyConcepts[0] ?? 'Core structure',
        'Unrelated sorting',
        'Only UI design',
        'Database indexing only',
      ],
      correctAnswer: 0,
      explanation: 'Based on retrieved lecture segments.',
    },
    {
      id: 'q2',
      question: `Which topic appears in the indexed content for "${params.topic}"?`,
      options: [params.topic, 'Cooking recipes', 'Stock trading', 'Music theory'],
      correctAnswer: 0,
      explanation: 'Matches your study topic and transcript retrieval.',
    },
    {
      id: 'q3',
      question: 'Where should you look in the playlist for more on this topic?',
      options: [
        'Earlier indexed lectures in the same playlist',
        'Comments section only',
        'Video thumbnail',
        'End credits',
      ],
      correctAnswer: 0,
      explanation: 'Playlist RAG grows as you watch more lectures.',
    },
  ];

  return {
    id: params.planId,
    playlistId: params.playlistId,
    topic: params.topic,
    level: params.level,
    estimatedMinutes: Math.max(8, Math.round(durationMin) || segments.length * 4),
    prerequisites:
      params.level === 'beginner'
        ? ['Basic programming', 'Big-O notation']
        : params.level === 'advanced'
          ? ['Comfort with graphs/trees', 'Prior exposure to similar structures']
          : ['Familiarity with arrays and loops'],
    segments,
    keyConcepts,
    interviewQuestions: [
      `Explain ${params.topic} in an interview`,
      `When would you use ${params.topic}?`,
      `Common ${params.topic} pitfalls`,
    ],
    conceptMap: defaultConceptMap(params.topic, keyConcepts),
    retrievalEvidence: evidence,
    nextTopics: ['Related patterns in this playlist', 'Practice problems', 'Next lecture in series'],
    notesPreview: `**${params.topic}** — ${segments.length} segments from ${params.videoTitle ?? 'your course'}. Open notes below for concise, interview, or implementation variants.`,
    quickQuiz,
  };
}
