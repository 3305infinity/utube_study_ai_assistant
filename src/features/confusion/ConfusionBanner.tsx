import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Pause,
  Rewind,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { STUDYFLOW_EVENTS } from '@lib/constants';
import type { ConfusionZone, HeatmapBucket } from '@/types/ai';
import { formatTime } from '@lib/youtube';
import {
  computeSessionStats,
  type LearningEvent,
} from '@/features/heatmap/density';
import { getTrackerEvents } from './confusionTracker';

export function AnalyticsPanel({
  videoId,
  duration,
  onJumpToTime,
}: {
  videoId: string;
  duration: number;
  onJumpToTime: (seconds: number) => void;
}) {
  const [zones, setZones] = useState<ConfusionZone[]>([]);
  const [buckets, setBuckets] = useState<HeatmapBucket[]>([]);
  const [events, setEvents] = useState<LearningEvent[]>([]);

  useEffect(() => {
    const onHeatmap = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        videoId: string;
        buckets: HeatmapBucket[];
        zones: ConfusionZone[];
      };
      if (d.videoId !== videoId) return;
      setBuckets(d.buckets);
      setZones(d.zones);
    };
    const onConfusion = (e: Event) => {
      const d = (e as CustomEvent).detail as { videoId: string; events: LearningEvent[] };
      if (d.videoId !== videoId) return;
      setEvents(d.events ?? []);
    };

    setEvents(getTrackerEvents());
    window.addEventListener(STUDYFLOW_EVENTS.HEATMAP_UPDATE, onHeatmap);
    window.addEventListener(STUDYFLOW_EVENTS.CONFUSION_UPDATE, onConfusion);
    return () => {
      window.removeEventListener(STUDYFLOW_EVENTS.HEATMAP_UPDATE, onHeatmap);
      window.removeEventListener(STUDYFLOW_EVENTS.CONFUSION_UPDATE, onConfusion);
    };
  }, [videoId]);

  const stats = useMemo(
    () => computeSessionStats(events, duration),
    [events, duration]
  );

  const insight = useMemo(() => {
    if (!events.length) {
      return 'Watch the video — we track rewinds, long pauses, and seeks to find tricky moments.';
    }
    if (stats.rewinds >= 3) {
      return 'You rewind often — review the highlighted sections and ask Chat to explain those steps.';
    }
    if (stats.longPauses >= 2) {
      return 'Long pauses suggest dense material. Try Deep mode in Chat or generate Detailed notes.';
    }
    if (stats.seeks >= 4) {
      return 'Frequent skipping — use Chapters to map the video, then revisit confusion zones.';
    }
    return 'Steady pace so far. Use Chat for anything that felt unclear.';
  }, [events.length, stats]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/10 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-300" />
          <p className="text-sm font-semibold text-white">Study analytics</p>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-white/50">
          Red bars on the YouTube progress bar = moments you replayed or paused on.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        <section className="rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-200" />
            <p className="text-sm leading-relaxed text-white/85">{insight}</p>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2">
          <StatCard icon={Rewind} label="Rewinds" value={stats.rewinds} hint="Went backward ≥8s" />
          <StatCard icon={Pause} label="Long pauses" value={stats.longPauses} hint="Paused ≥4s" />
          <StatCard icon={TrendingUp} label="Seeks" value={stats.seeks} hint="Jumped in timeline" />
          <StatCard
            icon={BarChart3}
            label="Events"
            value={stats.totalEvents}
            hint="This session"
          />
        </section>

        {stats.mostReplayedTime != null && duration > 0 && (
          <button
            type="button"
            onClick={() => onJumpToTime(stats.mostReplayedTime!)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-xs text-white/70 hover:border-indigo-400/30 hover:bg-indigo-500/10"
          >
            Most replayed moment:{' '}
            <span className="font-medium text-indigo-200">{formatTime(stats.mostReplayedTime)}</span>
          </button>
        )}

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-white/45">
            Tricky sections
          </h3>
          {zones.length === 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              {events.length < 3
                ? 'Not enough activity yet — rewind or pause on a hard part and we will flag it here.'
                : 'No strong confusion signals yet. That can mean the material is clear, or you have not rewound/paused much.'}
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {zones.map((z) => (
                <button
                  key={`${z.startTime}-${z.endTime}`}
                  type="button"
                  onClick={() => onJumpToTime(z.startTime)}
                  className="flex w-full items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-left hover:bg-amber-500/15"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div>
                    <p className="text-sm font-medium text-white">
                      {formatTime(z.startTime)} – {formatTime(z.endTime)}
                    </p>
                    <p className="mt-0.5 text-xs text-white/55">{z.reasons.join(' · ')}</p>
                    <p className="text-[11px] text-amber-200/80">
                      Difficulty {(z.score * 100).toFixed(0)}% — tap to jump
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-white/45">
            Replay heatmap
          </h3>
          <div className="mt-2 h-10 overflow-hidden rounded-lg bg-white/6 flex ring-1 ring-white/10">
            {(buckets.length ? buckets : [{ startTime: 0, endTime: 1, density: 0 }]).map((b) => (
              <div
                key={b.startTime}
                className="h-full flex-1 min-w-[2px] cursor-pointer hover:opacity-90"
                style={{
                  background: `rgba(239,68,68,${0.08 + b.density * 0.85})`,
                }}
                title={`${formatTime(b.startTime)} — ${(b.density * 100).toFixed(0)}% activity`}
                onClick={() => onJumpToTime(b.startTime)}
              />
            ))}
          </div>
          {duration > 0 && (
            <p className="mt-1.5 flex justify-between text-[11px] text-white/40">
              <span>0:00</span>
              <span>{formatTime(duration)}</span>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Rewind;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-white/45">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
      <p className="text-[10px] text-white/35">{hint}</p>
    </div>
  );
}
