import type { HeatmapBucket } from '@/types/ai';
import { CONFUSION } from '@lib/constants';

export type LearningEvent = {
  type: string;
  time: number;
  data?: Record<string, unknown>;
};

export function eventsToDensityBuckets(
  events: LearningEvent[],
  duration: number
): HeatmapBucket[] {
  const bucketSize = CONFUSION.BUCKET_SIZE_SEC;
  const count = Math.max(1, Math.ceil(duration / bucketSize));
  const buckets: HeatmapBucket[] = Array.from({ length: count }, (_, i) => ({
    startTime: i * bucketSize,
    endTime: (i + 1) * bucketSize,
    density: 0,
  }));

  const addWeight = (time: number, weight: number) => {
    const idx = Math.min(count - 1, Math.max(0, Math.floor(time / bucketSize)));
    buckets[idx]!.density += weight;
  };

  for (const ev of events) {
    if (ev.type === 'rewind') addWeight(ev.time, 3);
    else if (ev.type === 'pause') addWeight(ev.time, 2);
    else if (ev.type === 'seek') addWeight(ev.time, 1.5);
    else if (ev.type === 'speed_change') addWeight(ev.time, 1);
  }

  const max = Math.max(...buckets.map((b) => b.density), 1);
  return buckets.map((b) => ({ ...b, density: b.density / max }));
}

export function detectConfusionZones(
  events: LearningEvent[],
  duration: number
): Array<{ startTime: number; endTime: number; score: number; reasons: string[] }> {
  const buckets = eventsToDensityBuckets(events, duration);
  return buckets
    .filter((b) => b.density >= 0.45)
    .map((b) => ({
      startTime: b.startTime,
      endTime: b.endTime,
      score: b.density,
      reasons: [
        b.density > 0.7 ? 'Frequent rewinds/pauses' : 'Moderate replay activity',
      ],
    }));
}
