import { useEffect, useState } from 'react';
import { BookOpen, ListTree, Play, Sparkles } from 'lucide-react';
import { generateChaptersForVideo, loadChapters } from './chapterGenerator';
import { useRagStore } from '@/store/rag.store';
import { useVideoStore } from '@/store/video.store';
import type { Chapter } from '@/types/ai';
import { formatTime } from '@lib/youtube';
import { Loader } from '@/components/Loader';
import { FeatureGate } from '@/components/FeatureGate';
import { useAiReadiness } from '@/hooks/useAiReadiness';

export function ChaptersPanel({
  videoId,
  onJumpToTime,
}: {
  videoId: string;
  onJumpToTime: (seconds: number) => void;
}) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chunks = useRagStore((s) => s.chunks);
  const title = useVideoStore((s) => s.title);
  const readiness = useAiReadiness();

  useEffect(() => {
    void loadChapters(videoId).then(setChapters);
  }, [videoId]);

  const generate = async () => {
    if (!chunks.length) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateChaptersForVideo({
        videoId,
        semanticChunks: chunks,
        videoTitle: title ?? undefined,
      });
      setChapters(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (readiness.state !== 'ready') {
    return <FeatureGate>{null}</FeatureGate>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <ListTree className="h-4 w-4 text-indigo-300" />
          <div>
            <p className="text-sm font-medium text-white">Chapters</p>
            <p className="text-[11px] text-white/45">AI-generated lecture structure</p>
          </div>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={generate}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-500/25 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500/35 disabled:opacity-40"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {chapters.length ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      {loading && (
        <div className="border-b border-white/8 p-4">
          <Loader label="Analyzing lecture structure…" />
        </div>
      )}
      {error && <p className="border-b border-white/8 px-4 py-2 text-xs text-red-300">{error}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {chapters.length > 0 ? (
          <div className="relative space-y-0">
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gradient-to-b from-indigo-400/50 via-white/10 to-transparent" />

            {chapters.map((ch, i) => (
              <div key={ch.id} className="relative pl-8 pb-5">
                <div className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-indigo-400/40 bg-surface text-[10px] font-semibold text-indigo-200">
                  {i + 1}
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3.5 transition-colors hover:border-indigo-400/20 hover:bg-indigo-500/[0.04]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-white">{ch.title}</h4>
                      <p className="mt-1 font-mono text-[10px] text-indigo-200/70">
                        {formatTime(ch.startTime)} – {formatTime(ch.endTime)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onJumpToTime(ch.startTime)}
                      className="shrink-0 rounded-lg bg-indigo-500/20 p-2 text-indigo-100 hover:bg-indigo-500/30"
                      title="Jump to chapter"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <p className="mt-2.5 text-[13px] leading-6 text-white/72">{ch.summary}</p>

                  {ch.keyPoints.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {ch.keyPoints.slice(0, 5).map((p) => (
                        <li key={p} className="flex gap-2 text-xs text-white/55">
                          <BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-indigo-300/60" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ListTree className="h-10 w-10 text-indigo-300/50" />
              <p className="mt-3 text-sm font-medium text-white/70">No chapters yet</p>
              <p className="mt-1 max-w-[220px] text-xs text-white/40">
                Generate semantic chapters to navigate this lecture by topic.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
