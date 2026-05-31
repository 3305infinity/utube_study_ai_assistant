import type { SemanticChunk } from '@/types/ai';

export type PromptBuilderOptions = {
  mode: 'interview' | 'student' | 'default';
  includeTimestamps: boolean;
  maxContextChars: number;
  antiHallucination: boolean;
};

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatChunk(chunk: SemanticChunk, includeTimestamps: boolean): string {
  if (!includeTimestamps) return chunk.text.trim();
  return `[${formatTime(chunk.startTime)}–${formatTime(chunk.endTime)}] ${chunk.text.trim()}`;
}

export function buildEducationalPrompt(params: {
  userQuery: string;
  relevantChunks: SemanticChunk[];
  videoTitle?: string;
  promptOptions: PromptBuilderOptions;
}): { system: string; user: string; contextChunks: SemanticChunk[] } {
  const { userQuery, relevantChunks, videoTitle, promptOptions } = params;
  const contextChunks = relevantChunks.filter((c) => c.text.trim());

  let context = '';
  for (const c of contextChunks) {
    const line = formatChunk(c, promptOptions.includeTimestamps);
    const next = context ? `${context}\n\n${line}` : line;
    if (next.length > promptOptions.maxContextChars) break;
    context = next;
  }

  const modeLine =
    promptOptions.mode === 'interview'
      ? 'Interview mode: connect concepts to likely interview questions. Be precise.'
      : promptOptions.mode === 'student'
        ? 'Student mode: explain step-by-step with minimal fluff.'
        : 'Explain clearly using only the retrieved lecture context.';

  const guard = promptOptions.antiHallucination
    ? 'Use ONLY the retrieved context. If missing, say you cannot find it in the transcript.'
    : '';

  return {
    system: [
      'You are an AI learning assistant on YouTube StudyFlow.',
      'Help the student understand the lecture using retrieved transcript segments.',
      guard,
    ]
      .filter(Boolean)
      .join('\n'),
    user: [
      videoTitle ? `Video: ${videoTitle}` : '',
      modeLine,
      `Question: ${userQuery.trim()}`,
      '',
      'Retrieved context:',
      context || '(none)',
      '',
      'Answer with educational clarity. Reference timestamps when useful.',
    ]
      .filter(Boolean)
      .join('\n'),
    contextChunks,
  };
}

export function buildNotesPrompt(params: {
  mode: string;
  videoTitle?: string;
  context: string;
  includeTimestamps: boolean;
}): { system: string; user: string } {
  return {
    system:
      'You generate study notes from lecture transcripts. Return valid JSON only: {"title":string,"content":string,"tags":string[]}. No markdown fences.',
    user: [
      `Video: ${params.videoTitle ?? 'Unknown'}`,
      `Note type: ${params.mode}`,
      `Include timestamps: ${params.includeTimestamps}`,
      '',
      'Transcript context:',
      params.context,
    ].join('\n'),
  };
}

export function buildChaptersPrompt(params: {
  videoTitle?: string;
  maxChapters: number;
  context: string;
}): { system: string; user: string } {
  return {
    system:
      'Generate semantic video chapters. Return JSON only: {"chapters":[{"id":string,"title":string,"startTime":number,"endTime":number,"summary":string,"keyPoints":string[]}]}. Times in seconds.',
    user: [
      `Video: ${params.videoTitle ?? 'Unknown'}`,
      `Max chapters: ${params.maxChapters}`,
      '',
      params.context,
    ].join('\n'),
  };
}

export function buildFlashcardsPrompt(params: {
  videoTitle?: string;
  maxCards: number;
  context: string;
}): { system: string; user: string } {
  return {
    system: [
      'Generate study flashcards from lecture content.',
      'Focus on concepts, definitions, processes, and facts the student must remember.',
      'Do NOT reference video timestamps or ask "what happens at X minutes".',
      'Return JSON only: {"flashcards":[{"id":string,"front":string,"back":string,"difficulty":"easy"|"medium"|"hard"}]}.',
    ].join(' '),
    user: [
      `Topic: ${params.videoTitle ?? 'Lecture'}`,
      `Max cards: ${params.maxCards}`,
      '',
      'Lecture content:',
      params.context,
    ].join('\n'),
  };
}

export function buildQuizPrompt(params: {
  videoTitle?: string;
  maxQuestions: number;
  context: string;
}): { system: string; user: string } {
  return {
    system: [
      'Generate multiple-choice quiz questions that test understanding of the lecture material.',
      'Questions must assess concepts and knowledge — NOT timestamps, video structure, or "what is said at X minutes".',
      'Write plausible distractors related to the topic.',
      'Return JSON only: {"questions":[{"id":string,"question":string,"options":string[4],"correctAnswerIndex":number,"explanation":string,"difficulty":"easy"|"medium"|"hard"}]}.',
    ].join(' '),
    user: [
      `Topic: ${params.videoTitle ?? 'Lecture'}`,
      `Max questions: ${params.maxQuestions}`,
      '',
      'Lecture content:',
      params.context,
    ].join('\n'),
  };
}

function parseJson<T>(text: string): T | null {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export { parseJson };
