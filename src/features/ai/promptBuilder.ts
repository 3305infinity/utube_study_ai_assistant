import type { SemanticChunk } from '@/types/ai';

export type PromptBuilderOptions = {
  mode: 'interview' | 'student' | 'default';
  includeTimestamps: boolean;
  maxContextChars: number;
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

const HYBRID_TUTOR_SYSTEM = `You are YT StudyFlow — an expert tutor for ONE YouTube lecture.

Use TWO knowledge sources together:
1) VIDEO TRANSCRIPT (below) — what the instructor actually said. Cite with [segment #] or (m:ss).
2) GENERAL WORLD KNOWLEDGE — standard definitions, algorithms, intuition, interview angles, comparisons. Prefix with "Background:" when it is NOT from the video.

Rules:
- Answer the student's exact question first (1–3 direct sentences).
- Tie explanations to what happens in the video, then enrich with general knowledge where it helps.
- For coding/DSA topics: state conditions clearly, walk through the instructor's approach, mention complexity/edge cases if relevant.
- Do NOT invent quotes or pretend the instructor said something that is not in the transcript.
- If the video never mentions a name/topic, say so, then optionally add brief general context.
- Avoid vague essay summaries. Be concrete, structured, and useful.
- Use markdown: short headings, bullets, bold for key terms.`;

function modeInstructions(mode: PromptBuilderOptions['mode']): string {
  switch (mode) {
    case 'interview':
      return [
        'FORMAT — Interview prep (not a summary):',
        '- Give 4–6 items as **Q:** / **A:** pairs.',
        '- Questions should sound like a real interviewer (definitions, "why", edge cases, trade-offs).',
        '- Answers blend transcript facts + general CS/domain knowledge.',
        '- End with 2 "Follow-up questions they might ask next".',
      ].join('\n');
    case 'student':
      return [
        'FORMAT — Deep explanation:',
        '- Structure: Direct answer → Step-by-step walkthrough → Key insight → Common mistake.',
        '- Use the instructor\'s example from the video when available.',
        '- Add Background notes for standard definitions the video assumes.',
      ].join('\n');
    default:
      return [
        'FORMAT — Concise tutor reply:',
        '- Max ~8–12 lines unless the question needs more.',
        '- Bullets OK. No filler like "In this video the speaker discusses..."',
        '- End with one actionable tip or check-your-understanding question.',
      ].join('\n');
  }
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

  return {
    system: [HYBRID_TUTOR_SYSTEM, modeInstructions(promptOptions.mode)].join('\n\n'),
    user: [
      videoTitle ? `Video: ${videoTitle}` : '',
      conversationSummary ? `Recent chat:\n${conversationSummary}` : '',
      modeInstructions(promptOptions.mode),
      '',
      `Student question: ${userQuery.trim()}`,
      '',
      '--- VIDEO TRANSCRIPT SEGMENTS ---',
      context || '(no segments retrieved — use general knowledge and say transcript was thin)',
      '',
      'Write your answer now.',
    ]
      .filter(Boolean)
      .join('\n'),
    contextChunks: used,
  };
}

function notesModeSpec(mode: string): string {
  switch (mode) {
    case 'interview':
      return [
        'Type: INTERVIEW PREP',
        'content must be markdown with 8–12 **Q:** / **A:** pairs.',
        'Mix questions an interviewer would ask + answers from video + brief Background where needed.',
        'NO generic summary paragraphs.',
      ].join(' ');
    case 'detailed':
      return [
        'Type: DETAILED NOTES',
        'content: structured markdown with ## sections: Problem/Topic, Approach, Steps, Key formulas/rules, Pitfalls, Takeaways.',
        'Extract the actual solution walkthrough from the video, not vague themes.',
      ].join(' ');
    case 'revision':
      return [
        'Type: REVISION CHEATSHEET',
        'content: compact markdown — definitions, conditions, 5–8 bullet facts, 3 exam-style reminders.',
      ].join(' ');
    case 'concise':
    default:
      return [
        'Type: CONCISE NOTES',
        'content: markdown bullet list of 6–10 specific facts/steps from the lecture only.',
      ].join(' ');
  }
}

export function buildNotesPrompt(params: {
  mode: string;
  videoTitle?: string;
  context: string;
  includeTimestamps: boolean;
}): { system: string; user: string } {
  return {
    system: [
      'You generate high-quality study notes from a lecture transcript.',
      'Use transcript facts + general subject knowledge to clarify jargon.',
      'Return valid JSON only: {"title":string,"content":string,"tags":string[]}.',
      'content is markdown. No JSON fences.',
      notesModeSpec(params.mode),
    ].join(' '),
    user: [
      `Video: ${params.videoTitle ?? 'Unknown'}`,
      notesModeSpec(params.mode),
      `Timestamps in notes: ${params.includeTimestamps}`,
      '',
      'Transcript:',
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
      'Generate semantic video chapters with specific titles (not "Part 1"). Return JSON only: {"chapters":[{"id":string,"title":string,"startTime":number,"endTime":number,"summary":string,"keyPoints":string[]}]}. Times in seconds.',
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
