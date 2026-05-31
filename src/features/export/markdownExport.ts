import type { Note } from '@/types/notes';
import type { Chapter, Flashcard, QuizQuestion } from '@/types/ai';

export function exportNotesMarkdown(notes: Note[], videoTitle: string): string {
  const lines = [`# ${videoTitle} — Study Notes`, ''];
  for (const n of notes) {
    lines.push(`## ${n.title}`, `*Type: ${n.type}*`, '', n.content, '');
  }
  return lines.join('\n');
}

export function exportFlashcardsMarkdown(cards: Flashcard[], videoTitle: string): string {
  const lines = [`# ${videoTitle} — Flashcards`, ''];
  cards.forEach((c, i) => {
    lines.push(`### Card ${i + 1}`, `**Q:** ${c.front}`, '', `**A:** ${c.back}`, '');
  });
  return lines.join('\n');
}

export function exportQuizMarkdown(questions: QuizQuestion[], videoTitle: string): string {
  const lines = [`# ${videoTitle} — Quiz`, ''];
  questions.forEach((q, i) => {
    lines.push(`## Q${i + 1}. ${q.question}`, '');
    q.options.forEach((o, j) => {
      const mark = j === q.correctAnswer ? ' ✓' : '';
      lines.push(`${String.fromCharCode(65 + j)}. ${o}${mark}`);
    });
    lines.push('', `*Explanation:* ${q.explanation}`, '');
  });
  return lines.join('\n');
}

export function exportChaptersMarkdown(chapters: Chapter[], videoTitle: string): string {
  const lines = [`# ${videoTitle} — Chapters`, ''];
  for (const ch of chapters) {
    const start = Math.floor(ch.startTime / 60);
    lines.push(`## ${ch.title} (${start} min)`, ch.summary, '', '**Key points:**');
    ch.keyPoints.forEach((p) => lines.push(`- ${p}`));
    lines.push('');
  }
  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
