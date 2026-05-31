import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { listNotes } from '@/features/notes/notes.service';
import { loadChapters } from '@/features/chapters/chapterGenerator';
import { listFlashcards } from '@/features/revision/flashcards';
import { loadLatestQuiz } from '@/features/revision/quiz';
import {
  downloadTextFile,
  exportChaptersMarkdown,
  exportFlashcardsMarkdown,
  exportNotesMarkdown,
  exportQuizMarkdown,
} from './markdownExport';
import { useVideoStore } from '@/store/video.store';

export function ExportPanel({ videoId }: { videoId: string }) {
  const title = useVideoStore((s) => s.title) ?? videoId;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const exportAll = async () => {
    const [notes, chapters, flashcards, quiz] = await Promise.all([
      listNotes(videoId),
      loadChapters(videoId),
      listFlashcards(videoId),
      loadLatestQuiz(videoId),
    ]);

    if (notes.length) {
      downloadTextFile(`${videoId}-notes.md`, exportNotesMarkdown(notes, title));
    }
    if (chapters.length) {
      downloadTextFile(`${videoId}-chapters.md`, exportChaptersMarkdown(chapters, title));
    }
    if (flashcards.length) {
      downloadTextFile(`${videoId}-flashcards.md`, exportFlashcardsMarkdown(flashcards, title));
    }
    if (quiz.length) {
      downloadTextFile(`${videoId}-quiz.md`, exportQuizMarkdown(quiz, title));
    }
  };

  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-white/60">Export your study materials as Markdown files.</p>
      <button
        type="button"
        disabled={!ready}
        onClick={exportAll}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent/25 py-3 text-sm text-white disabled:opacity-40"
      >
        <Download className="h-4 w-4" />
        Export All (.md)
      </button>
      <p className="text-xs text-white/40">
        Exports notes, chapters, flashcards, and quiz if they exist for this video.
      </p>
    </div>
  );
}
