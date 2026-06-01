import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  MessageCircle,
  Play,
  Send,
  Sparkles,
  Target,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { usePlaylistStore } from '@/store/playlist.store';
import { useRagStore } from '@/store/rag.store';
import { useVideoStore } from '@/store/video.store';
import { useUiStore } from '@/store/ui.store';
import { useNotesStore } from '@/features/notes/notes.store';
import {
  runStudyAgent,
  loadLatestStudyPlan,
  markSegmentWatched,
  refreshPlanMastery,
  askStudyTutor,
} from './studyAgent.service';
import type { StudyLevel, StudyPlan, StudyConceptNode } from '@/types/ai';
import type { NoteType } from '@/types/notes';
import { formatTime } from '@lib/youtube';
import { MarkdownView } from '@/components/MarkdownView';

const LEVELS: Array<{ id: StudyLevel; label: string; hint: string }> = [
  { id: 'beginner', label: 'Beginner', hint: 'Full intuition from scratch' },
  { id: 'intermediate', label: 'Intermediate', hint: 'Balanced theory + practice' },
  { id: 'advanced', label: 'Advanced', hint: 'Skip basics, depth + complexity' },
];

const NOTE_ACTIONS: Array<{ type: NoteType; label: string }> = [
  { type: 'concise', label: 'Concise notes (~2 min)' },
  { type: 'interview', label: 'Interview notes' },
  { type: 'implementation', label: 'Implementation notes' },
  { type: 'contest', label: 'Contest notes' },
];

function ConceptTree({ nodes, depth = 0 }: { nodes: StudyConceptNode[]; depth?: number }) {
  return (
    <ul className={clsx('space-y-1', depth > 0 && 'ml-3 border-l border-white/10 pl-3')}>
      {nodes.map((n) => (
        <li key={n.id}>
          <span className="text-xs text-white/80">{n.label}</span>
          {n.children?.length ? <ConceptTree nodes={n.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function StudyPanel({
  videoId,
  onJumpToTime,
}: {
  videoId: string;
  onJumpToTime: (seconds: number, citeVideoId?: string) => void;
}) {
  const playlist = usePlaylistStore((s) => s.playlist);
  const playlistChunks = usePlaylistStore((s) => s.playlistChunks);
  const indexedVideoCount = usePlaylistStore((s) => s.indexedVideoCount);
  const refreshPlaylistChunks = usePlaylistStore((s) => s.refreshPlaylistChunks);
  const videoChunks = useRagStore((s) => s.chunks);
  const videoTitle = useVideoStore((s) => s.title);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const generateNote = useNotesStore((s) => s.generate);

  const scopeId = playlist?.playlistId ?? `video:${videoId}`;
  const corpus =
    playlistChunks.length > 0 ? playlistChunks : videoChunks.length ? videoChunks : [];

  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState<StudyLevel>('intermediate');
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [tutorInput, setTutorInput] = useState('');
  const [tutorMessages, setTutorMessages] = useState<
    Array<{ id: string; role: 'user' | 'assistant'; content: string }>
  >([]);
  const [tutorLoading, setTutorLoading] = useState(false);
  const tutorEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshPlaylistChunks();
    void loadLatestStudyPlan(scopeId).then((p) => {
      if (p) setPlan(p);
    });
  }, [scopeId, refreshPlaylistChunks]);

  useEffect(() => {
    tutorEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tutorMessages, tutorLoading]);

  const buildPath = async () => {
    if (!corpus.length) {
      setError('Wait for transcript index on this video (or watch more playlist lectures).');
      return;
    }
    setLoading(true);
    setError(null);
    setQuizAnswers({});
    setTutorMessages([]);
    try {
      const p = await runStudyAgent({
        topic,
        level,
        playlistId: scopeId,
        chunks: corpus,
        videoTitle: playlist?.title ?? videoTitle ?? undefined,
      });
      setPlan(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const jumpSegment = async (segmentId: string, start: number, vid: string) => {
    onJumpToTime(start, vid !== videoId ? vid : undefined);
    if (!plan) return;
    const updated = await markSegmentWatched(plan.id, segmentId);
    if (updated) setPlan(updated);
  };

  const handleNote = (type: NoteType) => {
    void generateNote({
      videoId,
      type,
      chunks: corpus,
      videoTitle: videoTitle ?? undefined,
      topicQuery: plan?.topic,
    });
    setActiveTab('notes');
  };

  const askTutor = async () => {
    const q = tutorInput.trim();
    if (!q || !plan || tutorLoading) return;
    const userId = `tu_${Date.now()}`;
    setTutorMessages((prev) => [...prev, { id: userId, role: 'user', content: q }]);
    setTutorLoading(true);
    setTutorInput('');
    const history = [...tutorMessages, { id: userId, role: 'user' as const, content: q }]
      .filter((m) => m.content.trim())
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content.slice(0, 400)}`)
      .join('\n');
    try {
      const answer = await askStudyTutor({
        question: q,
        plan,
        chunks: corpus,
        videoTitle: playlist?.title ?? videoTitle ?? undefined,
        conversationSummary: history.length > 1 ? history : undefined,
      });
      setTutorMessages((prev) => [
        ...prev,
        { id: `ta_${Date.now()}`, role: 'assistant', content: answer },
      ]);
      const refreshed = await refreshPlanMastery(plan.id);
      if (refreshed) setPlan(refreshed);
    } catch (e) {
      setTutorMessages((prev) => [
        ...prev,
        {
          id: `te_${Date.now()}`,
          role: 'assistant',
          content: e instanceof Error ? e.message : String(e),
        },
      ]);
    } finally {
      setTutorLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/10 bg-gradient-to-r from-violet-500/15 to-indigo-500/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-violet-300" />
          <h2 className="text-sm font-semibold text-white">Study tutor</h2>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-white/50">
          Retrieval-backed paths · real timestamps · adaptive level
        </p>
        {playlist ? (
          <p className="mt-2 text-xs text-indigo-200/90">
            {playlist.title} · {indexedVideoCount} indexed / {playlist.videoIds.length} in playlist
          </p>
        ) : (
          <p className="mt-2 text-xs text-white/45">Single-video mode · add ?list= for playlist RAG</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {!plan && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
            <label className="text-xs font-medium text-white/55">Topic</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Teach me DSU"
              className="w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
            />
            <p className="text-[11px] text-white/40">Your level</p>
            <div className="flex gap-1 rounded-xl border border-white/10 bg-black/20 p-0.5">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  title={l.hint}
                  onClick={() => setLevel(l.id)}
                  className={twMerge(
                    clsx(
                      'flex-1 rounded-lg py-2 text-[10px] font-medium',
                      level === l.id ? 'bg-violet-500/40 text-white' : 'text-white/45'
                    )
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={loading || !topic.trim()}
              onClick={() => void buildPath()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Build learning path
            </button>
            {error && <p className="text-xs text-red-300">{error}</p>}
          </div>
        )}

        {plan && (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-white">{plan.topic}</h3>
                <p className="mt-0.5 text-[11px] capitalize text-violet-200/80">{plan.level}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPlan(null);
                  setTopic(plan.topic);
                }}
                className="text-[10px] text-white/40 hover:text-white/70"
              >
                New topic
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/8 px-2 py-1 text-white/70">
                <Clock className="h-3 w-3" /> ~{plan.estimatedMinutes} min
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/8 px-2 py-1 text-white/70">
                <Target className="h-3 w-3" /> {plan.mastery.percent}% mastery
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/55 space-y-0.5">
              <p>
                Quiz: {plan.mastery.quizCorrect}/{plan.mastery.quizTotal || '—'}
              </p>
              <p>
                Flashcards reviewed: {plan.mastery.flashcardsReviewed}/{plan.mastery.flashcardsTotal || '—'}
              </p>
              <p>
                Segments watched: {plan.mastery.segmentsWatched}/{plan.mastery.segmentsTotal}
              </p>
              <p>Revision sessions: {plan.mastery.revisionSessions}</p>
            </div>

            {plan.prerequisites.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/45">Prerequisites</h4>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {plan.prerequisites.map((p) => (
                    <li key={p} className="rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-100/90">
                      {p}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-white/45">Best segments</h4>
              <ul className="mt-2 space-y-2">
                {plan.segments.map((seg, i) => (
                  <li key={seg.id}>
                    <button
                      type="button"
                      onClick={() => void jumpSegment(seg.id, seg.startTime, seg.videoId)}
                      className={twMerge(
                        clsx(
                          'flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
                          seg.watched || plan.watchedSegmentIds.includes(seg.id)
                            ? 'border-emerald-500/25 bg-emerald-500/8'
                            : 'border-white/10 bg-white/[0.03] hover:bg-violet-500/10 hover:border-violet-400/30'
                        )
                      )}
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-500/25 text-[10px] font-bold text-violet-100">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium text-white">{seg.title}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-indigo-200/90">
                          {formatTime(seg.startTime)} – {formatTime(seg.endTime)}
                          {seg.videoTitle ? ` · ${seg.videoTitle}` : ''}
                        </span>
                        {seg.description && (
                          <span className="mt-1 block text-[10px] leading-4 text-white/45 line-clamp-2">
                            {seg.description}
                          </span>
                        )}
                      </span>
                      <Play className="mt-1 h-3.5 w-3.5 shrink-0 text-white/35" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {plan.keyConcepts.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/45">Key concepts</h4>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {plan.keyConcepts.map((c) => (
                    <li key={c} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/75">
                      {c}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {plan.conceptMap.length > 0 && (
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/45">Concept map</h4>
                <div className="mt-2">
                  <ConceptTree nodes={plan.conceptMap} />
                </div>
              </section>
            )}

            {plan.interviewQuestions.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/45">
                  Common interview questions
                </h4>
                <ul className="mt-2 space-y-1">
                  {plan.interviewQuestions.map((q) => (
                    <li key={q} className="flex items-start gap-1.5 text-xs text-white/75">
                      <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-violet-400" />
                      {q}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {plan.retrievalEvidence.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/45">Retrieved from</h4>
                <ul className="mt-2 space-y-1.5">
                  {plan.retrievalEvidence.slice(0, 8).map((e) => (
                    <li key={e.chunkId}>
                      <button
                        type="button"
                        onClick={() => onJumpToTime(e.startTime, e.videoId !== videoId ? e.videoId : undefined)}
                        className="w-full rounded-lg border border-white/8 bg-black/15 px-2.5 py-2 text-left hover:border-indigo-400/30"
                      >
                        <span className="text-[10px] font-medium text-indigo-200/90">
                          {e.videoTitle ?? 'Lecture'} · {formatTime(e.startTime)} – {formatTime(e.endTime)}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-white/45 line-clamp-2">{e.excerpt}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {plan.notesPreview && (
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/45">Notes preview</h4>
                <div className="mt-2 text-xs text-white/70">
                  <MarkdownView content={plan.notesPreview} />
                </div>
              </section>
            )}

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-white/45">Generate notes</h4>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {NOTE_ACTIONS.map((a) => (
                  <button
                    key={a.type}
                    type="button"
                    onClick={() => handleNote(a.type)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-[10px] text-white/75 hover:bg-violet-500/15"
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    {a.label}
                  </button>
                ))}
              </div>
            </section>

            {plan.quickQuiz.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/45">Quick quiz</h4>
                <div className="mt-2 space-y-3">
                  {plan.quickQuiz.map((q) => {
                    const picked = quizAnswers[q.id];
                    const done = picked !== undefined;
                    return (
                      <div key={q.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-xs font-medium text-white/90">{q.question}</p>
                        <div className="mt-2 space-y-1">
                          {q.options.map((opt, idx) => (
                            <button
                              key={idx}
                              type="button"
                              disabled={done}
                              onClick={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                              className={twMerge(
                                clsx(
                                  'block w-full rounded-lg border px-2 py-1.5 text-left text-[11px]',
                                  !done && 'border-white/10 hover:bg-white/8',
                                  done &&
                                    idx === q.correctAnswer &&
                                    'border-emerald-500/40 bg-emerald-500/15 text-emerald-100',
                                  done &&
                                    picked === idx &&
                                    idx !== q.correctAnswer &&
                                    'border-red-500/40 bg-red-500/15',
                                  done && picked !== idx && idx !== q.correctAnswer && 'opacity-50'
                                )
                              )}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                        {done && (
                          <p className="mt-2 text-[10px] text-white/50">{q.explanation}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {plan.nextTopics.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-white/45">Learn next</h4>
                <ul className="mt-2 space-y-1">
                  {plan.nextTopics.map((t) => (
                    <li key={t} className="text-xs text-violet-200/90">
                      → {t}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-2xl border border-violet-500/25 bg-violet-500/10 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <MessageCircle className="h-3.5 w-3.5 text-violet-300" />
                Ask the tutor
              </div>
              {(tutorMessages.length > 0 || tutorLoading) && (
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-lg bg-black/25 p-2">
                  {tutorMessages.map((m) => (
                    <div
                      key={m.id}
                      className={clsx(
                        'rounded-lg px-2 py-1.5 text-xs',
                        m.role === 'user'
                          ? 'ml-4 bg-indigo-500/20 text-indigo-50'
                          : 'mr-2 bg-white/5 text-white/85'
                      )}
                    >
                      {m.role === 'assistant' ? (
                        <MarkdownView content={m.content} />
                      ) : (
                        <p className="leading-relaxed">{m.content}</p>
                      )}
                    </div>
                  ))}
                  {tutorLoading && (
                    <p className="text-[10px] text-white/40">Thinking…</p>
                  )}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  value={tutorInput}
                  onChange={(e) => setTutorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void askTutor();
                    }
                  }}
                  placeholder={`Ask about ${plan.topic}…`}
                  className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/30 px-2.5 py-2 text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-violet-400/40"
                />
                <button
                  type="button"
                  disabled={tutorLoading || !tutorInput.trim()}
                  onClick={() => void askTutor()}
                  className="rounded-lg bg-violet-600 px-2.5 text-white disabled:opacity-40"
                >
                  {tutorLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div ref={tutorEndRef} />
            </section>
          </>
        )}

        {!plan && (
          <p className="text-[11px] leading-5 text-white/40">
            Paths are built from indexed transcript chunks. With a playlist, watch more lectures to expand
            retrieval across the series.
          </p>
        )}
      </div>
    </div>
  );
}
