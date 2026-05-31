import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { STUDYFLOW_EVENTS } from '@lib/constants';
import type { ConfusionZone, HeatmapBucket } from '@/types/ai';
import { formatTime } from '@lib/youtube';

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
    window.addEventListener(STUDYFLOW_EVENTS.HEATMAP_UPDATE, onHeatmap);
    return () => window.removeEventListener(STUDYFLOW_EVENTS.HEATMAP_UPDATE, onHeatmap);
  }, [videoId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/8 p-3">
        <p className="text-xs text-white/50">
          Learning analytics — rewinds, pauses, and seeks highlight difficult sections.
        </p>
        <p className="mt-1 text-[11px] text-white/35">
          Heatmap overlay is drawn on the YouTube progress bar.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-white/45">
            Confusion zones
          </h3>
          {zones.length === 0 ? (
            <p className="mt-2 text-sm text-white/45">No confusion detected yet — keep watching.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {zones.map((z) => (
                <button
                  key={`${z.startTime}-${z.endTime}`}
                  type="button"
                  onClick={() => onJumpToTime(z.startTime)}
                  className="flex w-full items-start gap-2 rounded-2xl glass-panel p-3 text-left hover:bg-white/8"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400" />
                  <div>
                    <p className="text-sm text-white">
                      {formatTime(z.startTime)} – {formatTime(z.endTime)}
                    </p>
                    <p className="text-xs text-white/50">{z.reasons.join(' · ')}</p>
                    <p className="text-[11px] text-amber-200/70">
                      Intensity {(z.score * 100).toFixed(0)}%
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-white/45">
            Activity density
          </h3>
          <div className="mt-2 h-8 overflow-hidden rounded-lg bg-white/6 flex">
            {buckets.slice(0, 80).map((b) => (
              <div
                key={b.startTime}
                className="h-full flex-1"
                style={{
                  background: `rgba(239,68,68,${0.1 + b.density * 0.75})`,
                }}
                title={`${formatTime(b.startTime)} density ${(b.density * 100).toFixed(0)}%`}
              />
            ))}
          </div>
          {duration > 0 && (
            <p className="mt-1 text-[11px] text-white/35">Video duration {formatTime(duration)}</p>
          )}
        </section>
      </div>
    </div>
  );
}
