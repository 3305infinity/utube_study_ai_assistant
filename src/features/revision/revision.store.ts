import { create } from 'zustand';
import type { Flashcard, QuizQuestion, SemanticChunk } from '@/types/ai';
import {
  generateFlashcardsForVideo,
  listFlashcards,
  gradeFlashcard,
} from './flashcards';
import { generateQuizForVideo, loadLatestQuiz } from './quiz';

interface RevisionState {
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  loading: boolean;
  error: string | null;
  flipped: boolean;
  currentCardIndex: number;
  quizAnswers: Record<string, number>;
  load: (videoId: string) => Promise<void>;
  generateFlashcards: (p: {
    videoId: string;
    chunks: SemanticChunk[];
    videoTitle?: string;
  }) => Promise<void>;
  generateQuiz: (p: {
    videoId: string;
    chunks: SemanticChunk[];
    videoTitle?: string;
  }) => Promise<void>;
  grade: (cardId: string, grade: 'again' | 'hard' | 'good' | 'easy') => Promise<void>;
  setFlipped: (v: boolean) => void;
  nextCard: () => void;
  prevCard: () => void;
  setQuizAnswer: (questionId: string, optionIndex: number) => void;
}

export const useRevisionStore = create<RevisionState>((set, get) => ({
  flashcards: [],
  quiz: [],
  loading: false,
  error: null,
  flipped: false,
  currentCardIndex: 0,
  quizAnswers: {},

  load: async (videoId) => {
    set({ loading: true });
    try {
      const [flashcards, quiz] = await Promise.all([
        listFlashcards(videoId),
        loadLatestQuiz(videoId),
      ]);
      set({ flashcards, quiz, loading: false, currentCardIndex: 0 });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  generateFlashcards: async ({ videoId, chunks, videoTitle }) => {
    set({ loading: true, error: null });
    try {
      const flashcards = await generateFlashcardsForVideo({
        videoId,
        semanticChunks: chunks,
        videoTitle,
      });
      set({ flashcards, loading: false, currentCardIndex: 0 });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  generateQuiz: async ({ videoId, chunks, videoTitle }) => {
    set({ loading: true, error: null });
    try {
      const quiz = await generateQuizForVideo({
        videoId,
        semanticChunks: chunks,
        videoTitle,
      });
      set({ quiz, loading: false, quizAnswers: {} });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  grade: async (cardId, grade) => {
    await gradeFlashcard(cardId, grade);
    const videoId = get().flashcards[0]?.videoId;
    if (videoId) {
      const flashcards = await listFlashcards(videoId);
      set({ flashcards, flipped: false });
    }
  },

  setFlipped: (flipped) => set({ flipped }),
  nextCard: () =>
    set((s) => ({
      currentCardIndex: Math.min(s.currentCardIndex + 1, s.flashcards.length - 1),
      flipped: false,
    })),
  prevCard: () =>
    set((s) => ({
      currentCardIndex: Math.max(s.currentCardIndex - 1, 0),
      flipped: false,
    })),
  setQuizAnswer: (questionId, optionIndex) =>
    set((s) => ({ quizAnswers: { ...s.quizAnswers, [questionId]: optionIndex } })),
}));
