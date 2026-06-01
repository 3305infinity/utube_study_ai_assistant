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

function formatChunk(chunk: SemanticChunk, includeTimestamps: boolean, index: number): string {
  const body = chunk.text.trim();
  if (!includeTimestamps) return `[${index}] ${body}`;
  return `[${index}] (${formatTime(chunk.startTime)}–${formatTime(chunk.endTime)}) ${body}`;
}

export function buildEducationalPrompt(params: {
  userQuery: string;
  relevantChunks: SemanticChunk[];
  videoTitle?: string;
  promptOptions: PromptBuilderOptions;
  conversationSummary?: string;
}): { system: string; user: string; contextChunks: SemanticChunk[] } {
  const { userQuery, relevantChunks, videoTitle, promptOptions, conversationSummary } = params;
  const contextChunks = relevantChunks.filter((c) => c.text.trim());

  let context = '';
  const used: SemanticChunk[] = [];
  for (let i = 0; i < contextChunks.length; i++) {
    const c = contextChunks[i]!;
    const line = formatChunk(c, promptOptions.includeTimestamps, i + 1);
    const next = context ? `${context}\n\n${line}` : line;
    if (next.length > promptOptions.maxContextChars) break;
    context = next;
    used.push(c);
  }

  const modeLine =
    promptOptions.mode === 'interview'
      ? 'Interview mode: test understanding with clear, transcript-grounded answers.'
      : promptOptions.mode === 'student'
        ? 'Deep mode: explain clearly with structure (short headings or bullets). Stay grounded.'
        : 'Answer the student directly using only the transcript segments below.';

  const strictRules = promptOptions.antiHallucination
    ? [
        'STRICT RULES:',
        '1. Use ONLY facts from the numbered "Transcript segments" below — no outside knowledge.',
        '2. If the answer is not in those segments, reply exactly: "I could not find that in this video\'s transcript."',
        '3. Do NOT invent companies, job postings, salaries, programs, or details not spoken in the segments.',
        '4. For "which companies" questions, list ONLY names that appear verbatim in the segments.',
        '5. Cite evidence as [segment #] or the timestamp shown, e.g. [2] or (1:55), after each key claim.',
        '6. Be specific and concise — no generic recruitment templates or filler.',
        '7. Do not repeat the same timestamp citation many times; cite the best 2–4 moments.',
      ].join('\n')
    : '';

  return {
    system: [
      'You are YT StudyFlow, an AI tutor for a single YouTube lecture.',
      strictRules,
    ]
      .filter(Boolean)
      .join('\n\n'),
    user: [
      videoTitle ? `Video title: ${videoTitle}` : '',
      conversationSummary ? `Recent chat context: ${conversationSummary}` : '',
      modeLine,
      `Student question: ${userQuery.trim()}`,
      '',
      'Transcript segments (only source of truth):',
      context || '(no segments retrieved)',
      '',
      'Write your answer now.',
    ]
      .filter(Boolean)
      .join('\n'),
    contextChunks: used,
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
