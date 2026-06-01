import type { SemanticChunk, StudyLevel } from '@/types/ai';
import type { ResponseIntent } from './responseIntent';
import { intentInstructions } from './responseIntent';

export const ENGLISH_OUTPUT_RULE = `LANGUAGE (mandatory):
- Write the entire response in English only.
- The transcript may be Hindi, Hinglish, or mixed — translate and explain in clear English.
- Do NOT output Devanagari or Hindi script in titles, bullets, notes, or chapter names.
- Proper nouns (e.g. LeetCode, Google) may stay as in the video.`;

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
  const src = chunk.videoTitle
    ? `[Video: ${chunk.videoTitle}]`
    : chunk.videoId
      ? `[Video ${chunk.videoId}]`
      : '';
  if (!includeTimestamps) return `[${index}] ${src} ${body}`.trim();
  return `[${index}] ${src} (${formatTime(chunk.startTime)}–${formatTime(chunk.endTime)}) ${body}`.trim();
}

const HYBRID_TUTOR_SYSTEM = `You are YT StudyFlow — an expert tutor for ONE YouTube lecture.

Use TWO knowledge sources together:
1) VIDEO TRANSCRIPT (below) — what the instructor actually said. Cite with [segment #] or (m:ss).
2) GENERAL WORLD KNOWLEDGE — standard definitions, algorithms, intuition, comparisons. Prefix with "Background:" when it is NOT from the video.

Rules:
- Follow the FORMAT block exactly (summary bullets vs interview Q&A vs explanation).
- Answer the student's exact question first — match their requested shape (e.g. "5 bullets" means exactly 5 bullets).
- Do NOT default to interview Q&A unless the FORMAT says interview.
- Do NOT invent quotes or pretend the instructor said something that is not in the transcript.
- Be concrete and useful — no vague essays.
- Use markdown: short headings, bullets, bold for key terms.`;

export function buildEducationalPrompt(params: {
  userQuery: string;
  relevantChunks: SemanticChunk[];
  videoTitle?: string;
  promptOptions: PromptBuilderOptions;
  conversationSummary?: string;
  responseIntent: ResponseIntent;
}): { system: string; user: string; contextChunks: SemanticChunk[] } {
  const { userQuery, relevantChunks, videoTitle, conversationSummary, responseIntent, promptOptions } =
    params;
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

  const formatBlock = intentInstructions(responseIntent, userQuery);

  return {
    system: [HYBRID_TUTOR_SYSTEM, ENGLISH_OUTPUT_RULE, formatBlock].join('\n\n'),
    user: [
      videoTitle ? `Video: ${videoTitle}` : '',
      conversationSummary ? `Recent conversation (continue in same thread):\n${conversationSummary}` : '',
      formatBlock,
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
    case 'implementation':
      return [
        'Type: IMPLEMENTATION NOTES',
        'content: markdown with ## API/operations, ## Pseudocode, ## C++ or Python skeleton, ## Complexity, ## Edge cases.',
        'Focus on code the student can type — not theory essays.',
      ].join(' ');
    case 'contest':
      return [
        'Type: CONTEST NOTES',
        'content: markdown — problem patterns, when to use this technique, 3–5 named problems (LeetCode/Codeforces style), tricks, time limits.',
      ].join(' ');
    case 'concise':
    default:
      return [
        'Type: CONCISE NOTES',
        'content: markdown bullet list of 6–10 specific facts/steps from the lecture only. ~2 minute read.',
      ].join(' ');
  }
}

export function buildStudyPathPrompt(params: {
  topic: string;
  level: StudyLevel;
  videoTitle?: string;
  evidence: string;
}): { system: string; user: string } {
  const levelGuide = {
    beginner:
      'Assume no prior knowledge. Full intuition first, slow pace, define every term. Include all foundational segments.',
    intermediate:
      'Balanced path: intuition + practice. Skip only redundant repetition.',
    advanced:
      'Skip basic motivation. Jump to optimizations, proofs, complexity, interview traps. Fewer but deeper segments.',
  }[params.level];

  return {
    system: [
      ENGLISH_OUTPUT_RULE,
      'You are an expert DSA/course tutor building a personalized learning path from REAL lecture transcript evidence.',
      'CRITICAL: segment startTime/endTime MUST come from the evidence timestamps — do not invent times.',
      'Use evidence text for titles and descriptions. Add general CS knowledge only for prerequisites, interview questions, and next topics.',
      'Return valid JSON only (no markdown fences):',
      '{"estimatedMinutes":number,"prerequisites":string[],"segments":[{"title":string,"description":string,"startTime":number,"endTime":number,"videoId":string}],"keyConcepts":string[],"interviewQuestions":string[],"conceptMap":[{"id":string,"label":string,"children":[{"id":string,"label":string}]}],"nextTopics":string[],"notesPreview":string,"quickQuiz":[{"id":string,"question":string,"options":string[4],"correctAnswer":number,"explanation":string}]}',
      'segments: 4–8 ordered lessons from the evidence. Merge adjacent evidence if same subtopic.',
      'notesPreview: 3–5 line markdown preview of what notes would cover.',
      'quickQuiz: exactly 3 MCQs testing the topic from the evidence.',
    ].join(' '),
    user: [
      `Topic to teach: ${params.topic}`,
      `Student level: ${params.level} — ${levelGuide}`,
      `Course: ${params.videoTitle ?? 'YouTube playlist'}`,
      '',
      'Retrieved transcript evidence (use these timestamps):',
      params.evidence,
    ].join('\n'),
  };
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
      ENGLISH_OUTPUT_RULE,
      'Return valid JSON only: {"title":string,"content":string,"tags":string[]}.',
      'content must be polished markdown: ## headings, bullet lists, **bold** terms, code blocks if needed.',
      'Never paste raw transcript Hindi/Hinglish — translate to English.',
      'No JSON fences.',
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
    system: [
      'Generate semantic video chapters with short English titles (e.g. "Graph representations", not raw transcript).',
      ENGLISH_OUTPUT_RULE,
      'Return JSON only: {"chapters":[{"id":string,"title":string,"startTime":number,"endTime":number,"summary":string,"keyPoints":string[]}]}.',
      'Times in seconds. summary and keyPoints in English.',
    ].join(' '),
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
