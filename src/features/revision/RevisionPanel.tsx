import { useEffect, useState } from 'react';
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Layers,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { useRevisionStore } from './revision.store';
import { useRagStore } from '@/store/rag.store';
import { useVideoStore } from '@/store/video.store';
import { Loader } from '@/components/Loader';
import { FeatureGate } from '@/components/FeatureGate';
import { useAiReadiness } from '@/hooks/useAiReadiness';

type RevisionTab = 'flashcards' | 'quiz';

export function RevisionPanel({ videoId }: { videoId: string }) {
  const [tab, setTab] = useState<RevisionTab>('flashcards');
  const {
    flashcards,
    quiz,
    loading,
    error,
    flipped,
    currentCardIndex,
    quizAnswers,
    load,
    generateFlashcards,
    generateQuiz,
    grade,
    setFlipped,
    nextCard,
    prevCard,
    setQuizAnswer,
  } = useRevisionStore();
  const chunks = useRagStore((s) => s.chunks);
  const title = useVideoStore((s) => s.title);
  const readiness = useAiReadiness();

  useEffect(() => {
    void load(videoId);
  }, [videoId, load]);

  const card = flashcards[currentCardIndex];

  if (readiness.state !== 'ready') {
    return <FeatureGate>{null}</FeatureGate>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/8 p-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-indigo-300" />
          <p className="text-sm font-medium text-white">Revision</p>
        </div>

        <div className="mt-3 flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
          {(['flashcards', 'quiz'] as RevisionTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={twMerge(
                clsx(
                  'flex-1 rounded-lg py-1.5 text-xs capitalize transition-colors',
                  tab === t ? 'bg-indigo-500/25 text-white' : 'text-white/45 hover:text-white'
                )
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-2 flex gap-2">
          {tab === 'flashcards' ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => generateFlashcards({ videoId, chunks, videoTitle: title ?? undefined })}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-500/20 py-2 text-xs text-white hover:bg-indigo-500/30 disabled:opacity-40"
            >
              <Layers className="h-3.5 w-3.5" />
              {flashcards.length ? 'Regenerate cards' : 'Generate flashcards'}
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() => generateQuiz({ videoId, chunks, videoTitle: title ?? undefined })}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-500/20 py-2 text-xs text-white hover:bg-indigo-500/30 disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {quiz.length ? 'Regenerate quiz' : 'Generate quiz'}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="border-b border-white/8 p-4">
          <Loader label="Generating revision content…" />
        </div>
      )}
      {error && <p className="border-b border-white/8 px-4 py-2 text-xs text-red-300">{error}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'flashcards' && (
          <>
            {card ? (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-white/45">
                    Card {currentCardIndex + 1} of {flashcards.length}
                  </p>
                  <div className="flex gap-1">
                    <button type="button" onClick={prevCard} disabled={currentCardIndex <= 0} className="rounded-lg p-1.5 text-white/50 hover:bg-white/8 disabled:opacity-30">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={nextCard} disabled={currentCardIndex >= flashcards.length - 1} className="rounded-lg p-1.5 text-white/50 hover:bg-white/8 disabled:opacity-30">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setFlipped(!flipped)}
                  className={twMerge(
                    clsx(
                      'relative w-full min-h-[180px] rounded-2xl border p-6 text-left transition-all duration-300',
                      flipped
                        ? 'border-emerald-400/30 bg-emerald-500/[0.06]'
                        : 'border-indigo-400/25 bg-indigo-500/[0.06] hover:border-indigo-400/40'
                    )
                  )}
                >
                  <p className="text-[10px] uppercase tracking-wider text-white/40">
                    {flipped ? 'Answer' : 'Question'}
                  </p>
                  <p className="mt-3 text-base leading-7 text-white">{flipped ? card.back : card.front}</p>
                  <p className="absolute bottom-4 right-4 text-[10px] text-white/35">Tap to flip</p>
                </button>

                {flipped && (
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {([
                      ['again', 'Again', 'bg-red-500/15 text-red-100'],
                      ['hard', 'Hard', 'bg-orange-500/15 text-orange-100'],
                      ['good', 'Good', 'bg-emerald-500/15 text-emerald-100'],
                      ['easy', 'Easy', 'bg-sky-500/15 text-sky-100'],
                    ] as const).map(([g, label, style]) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => grade(card.id, g)}
                        className={twMerge('rounded-xl py-2.5 text-[11px] font-medium', style)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              !loading && (
                <div className="flex flex-col items-center py-16 text-center">
                  <Layers className="h-10 w-10 text-indigo-300/50" />
                  <p className="mt-3 text-sm text-white/60">Generate flashcards to start reviewing</p>
                </div>
              )
            )}
          </>
        )}

        {tab === 'quiz' && (
          <>
            {quiz.length > 0 ? (
              <section className="space-y-4">
                <p className="text-xs font-medium text-white/50">{quiz.length} questions</p>
                {quiz.map((q, qi) => {
                  const picked = quizAnswers[q.id];
                  const correct = picked === q.correctAnswer;
                  return (
                    <div key={q.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <p className="text-[10px] font-medium text-indigo-200/60">Question {qi + 1}</p>
                      <p className="mt-1 text-sm font-medium text-white">{q.question}</p>
                      <div className="mt-3 space-y-1.5">
                        {q.options.map((opt, i) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setQuizAnswer(q.id, i)}
                            className={twMerge(
                              clsx(
                                'block w-full rounded-xl px-3 py-2 text-left text-xs transition-colors',
                                picked === i
                                  ? correct
                                    ? 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/30'
                                    : 'bg-red-500/20 text-red-100 ring-1 ring-red-400/30'
                                  : 'bg-white/[0.04] text-white/75 hover:bg-white/[0.07]'
                              )
                            )}
                          >
                            <span className="font-mono text-white/40">{String.fromCharCode(65 + i)}.</span>{' '}
                            {opt}
                          </button>
                        ))}
                      </div>
                      {picked != null && (
                        <p className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs leading-5 text-white/55">
                          {q.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </section>
            ) : (
              !loading && (
                <div className="flex flex-col items-center py-16 text-center">
                  <RotateCcw className="h-10 w-10 text-indigo-300/50" />
                  <p className="mt-3 text-sm text-white/60">Generate a quiz to test your knowledge</p>
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
