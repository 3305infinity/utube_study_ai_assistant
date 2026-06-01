/**
 * Transcript-based generation when Gemini is unavailable (quota, bad key, offline).
 */

import type { Chapter, Flashcard, QuizQuestion, SemanticChunk } from '@/types/ai';
import type { NoteType } from '@/types/notes';
import { formatTime } from '@lib/youtube';
import { DbIds, nowMs } from '@lib/db';
import { defaultSm2State } from '@/features/revision/sm2';

const LOCAL_FOOTER =
  '\n\n---\n*Transcript fallback — Gemini quota may be exceeded. Wait a few minutes and ask again.*';

export function isQuotaOrAuthError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('invalid api key') ||
    msg.includes('api key not valid') ||
    msg.includes('api key format') ||
    msg.includes('must start with aiza') ||
    msg.includes('gemini error')
  );
}

function pickSpreadChunks(chunks: SemanticChunk[], count: number): SemanticChunk[] {
  if (chunks.length <= count) return chunks;
  const out: SemanticChunk[] = [];
  const step = (chunks.length - 1) / Math.max(count - 1, 1);
  for (let i = 0; i < count; i++) {
    out.push(chunks[Math.round(i * step)]!);
  }
  return out;
}

function firstSentence(text: string, maxLen = 200): string {
  const sent = text.split(/[.!?؟。]+/).map((s) => s.trim()).find((s) => s.length > 15);
  const base = sent ?? text.trim();
  return base.length > maxLen ? `${base.slice(0, maxLen).trim()}…` : base;
}

export function localChatAnswer(
  question: string,
  chunks: SemanticChunk[],
  videoTitle?: string
): { content: string; chunks: SemanticChunk[] } {
  const q = question.toLowerCase();
  const terms = q.split(/\W+/).filter((t) => t.length > 2);

  let relevant = chunks
    .map((c) => ({
      chunk: c,
      score: terms.reduce((n, t) => n + (c.text.toLowerCase().includes(t) ? 1 : 0), 0),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((r) => r.chunk);

  if (!relevant.length) {
    const entityTerms = terms.filter((t) => t.length >= 4);
    if (entityTerms.length) {
      return {
        content: `I could not find "${entityTerms.join(', ')}" in this video's transcript.${LOCAL_FOOTER}`,
        chunks: [],
      };
    }
    relevant = pickSpreadChunks(chunks, 5);
  }

  if (q.includes('summarize') || q.includes('summary') || q.includes('bullet')) {
    const bullets = pickSpreadChunks(relevant.length ? relevant : chunks, 3);
    const lines = bullets.map(
      (c) => `- **${formatTime(c.startTime)}** — ${firstSentence(c.text)}`
    );
    const title = videoTitle ? `**${videoTitle}**\n\n` : '';
    return {
      content: `${title}${lines.join('\n')}${LOCAL_FOOTER}`,
      chunks: bullets,
    };
  }

  const body = relevant
    .map((c) => `**[${formatTime(c.startTime)}]** ${firstSentence(c.text, 280)}`)
    .join('\n\n');

  return {
    content: `Based on the transcript:\n\n${body}${LOCAL_FOOTER}`,
    chunks: relevant,
  };
}

export function localNotes(
  type: NoteType,
  chunks: SemanticChunk[],
  videoTitle?: string
): { title: string; content: string } {
  const spread = pickSpreadChunks(chunks, type === 'detailed' ? 12 : 6);
  const title = videoTitle ? `${type} notes — ${videoTitle}` : `${type} notes`;

  const sections = spread.map((c) => {
    const heading = `### ${formatTime(c.startTime)}`;
    const body = c.text.length > 400 ? `${c.text.slice(0, 400).trim()}…` : c.text;
    return `${heading}\n${body}`;
  });

  const intro =
    type === 'concise'
      ? '# Key points\n'
      : type === 'detailed'
        ? '# Detailed notes\n'
        : type === 'interview'
          ? '# Interview prep\n'
          : '# Revision sheet\n';

  return {
    title,
    content: `${intro}${sections.join('\n\n')}${LOCAL_FOOTER}`,
  };
}

export function localChapters(chunks: SemanticChunk[], maxChapters = 8): Chapter[] {
  if (!chunks.length) return [];
  const step = Math.max(1, Math.ceil(chunks.length / maxChapters));
  const chapters: Chapter[] = [];

  for (let i = 0; i < maxChapters; i++) {
    const group = chunks.slice(i * step, (i + 1) * step);
    if (!group.length) break;
    const summary = group.map((g) => g.text).join(' ').slice(0, 200);
    chapters.push({
      id: `ch_local_${i}`,
      title: `Part ${i + 1}: ${firstSentence(group[0]!.text, 48)}`,
      startTime: group[0]!.startTime,
      endTime: group[group.length - 1]!.endTime,
      summary,
      keyPoints: group.slice(0, 3).map((g) => firstSentence(g.text, 80)),
    });
  }

  return chapters;
}

export function localFlashcards(
  videoId: string,
  chunks: SemanticChunk[],
  maxCards = 10
): Flashcard[] {
  const ts = nowMs();
  const sm2 = defaultSm2State();
  const picked = pickSpreadChunks(chunks, Math.min(maxCards, chunks.length));

  return picked.map((c, i) => {
    const concept = firstSentence(c.text, 80);
    return {
      id: DbIds.flashcard(videoId, `local_${ts}_${i}`),
      videoId,
      front: `What is "${concept}"?`,
      back: firstSentence(c.text, 300),
      difficulty: 'medium' as const,
      nextReviewDate: sm2.nextReviewDate,
      interval: sm2.intervalDays,
      repetitions: sm2.repetitions,
      easeFactor: sm2.easeFactor,
      createdAt: ts,
    };
  });
}

export function localQuiz(chunks: SemanticChunk[], videoId: string, maxQ = 5): QuizQuestion[] {
  const picked = pickSpreadChunks(chunks, Math.min(maxQ, chunks.length));

  return picked.map((c, i) => {
    const concept = firstSentence(c.text, 60);
    const correct = firstSentence(c.text, 120);
    const words = c.text.split(/\s+/).filter((w) => w.length > 4);
    const distractor =
      words.length > 3
        ? `${words[0]} ${words[Math.floor(words.length / 2)]} unrelated mechanism`
        : 'An unrelated technical concept';
    return {
      id: `q_local_${i}`,
      videoId,
      question: `Which statement best describes: ${concept}?`,
      options: [correct, distractor, 'None of the above', 'Not covered in this lecture'],
      correctAnswer: 0,
      explanation: correct,
      difficulty: 'medium' as const,
    };
  });
}
