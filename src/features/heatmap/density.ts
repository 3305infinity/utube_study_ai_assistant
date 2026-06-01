import type { HeatmapBucket } from '@/types/ai';
import { CONFUSION } from '@lib/constants';

export type LearningEvent = {
  type: string;
  time: number;
  data?: Record<string, unknown>;
};

export type SessionStats = {
  rewinds: number;
  pauses: number;
  longPauses: number;
  seeks: number;
  speedChanges: number;
  totalEvents: number;
  mostReplayedTime: number | null;
  watchPercentEstimate: number;
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
    if (!Number.isFinite(time) || time < 0) return;
    const idx = Math.min(count - 1, Math.max(0, Math.floor(time / bucketSize)));
    buckets[idx]!.density += weight;
  };

  for (const ev of events) {
    if (ev.type === 'rewind') addWeight(ev.time, 3);
    else if (ev.type === 'long_pause') addWeight(ev.time, 2.5);
    else if (ev.type === 'pause') addWeight(ev.time, 1.5);
    else if (ev.type === 'seek') addWeight(ev.time, 1.2);
    else if (ev.type === 'speed_change') addWeight(ev.time, 0.8);
  }

  const max = Math.max(...buckets.map((b) => b.density), 1);
  return buckets.map((b) => ({ ...b, density: b.density / max }));
}

export function computeSessionStats(events: LearningEvent[], duration: number): SessionStats {
  const rewinds = events.filter((e) => e.type === 'rewind').length;
  const pauses = events.filter((e) => e.type === 'pause').length;
  const longPauses = events.filter((e) => e.type === 'long_pause').length;
  const seeks = events.filter((e) => e.type === 'seek').length;
  const speedChanges = events.filter((e) => e.type === 'speed_change').length;

  const buckets = eventsToDensityBuckets(events, duration || 1);
  let peak = buckets[0];
  for (const b of buckets) {
    if (b.density > (peak?.density ?? 0)) peak = b;
  }

  const replayHeavy = rewinds + longPauses;
  const watchPercentEstimate =
    duration > 0
      ? Math.min(100, Math.round(((events.length * 8 + replayHeavy * 15) / duration) * 10))
      : 0;

  return {
    rewinds,
    pauses,
    longPauses,
    seeks,
    speedChanges,
    totalEvents: events.length,
    mostReplayedTime: peak && peak.density > 0.2 ? peak.startTime : null,
    watchPercentEstimate,
  };
}

function reasonsForBucket(events: LearningEvent[], start: number, end: number): string[] {
  const inRange = events.filter((e) => e.time >= start && e.time < end);
  const reasons: string[] = [];
  const r = inRange.filter((e) => e.type === 'rewind').length;
  const lp = inRange.filter((e) => e.type === 'long_pause').length;
  const p = inRange.filter((e) => e.type === 'pause').length;
  const s = inRange.filter((e) => e.type === 'seek').length;
  if (r >= 2) reasons.push(`${r} rewinds`);
  else if (r === 1) reasons.push('rewind');
  if (lp >= 1) reasons.push('long pause');
  else if (p >= 2) reasons.push(`${p} pauses`);
  if (s >= 2) reasons.push('repeated seeks');
  if (!reasons.length) reasons.push('elevated replay activity');
  return reasons;
}

export function detectConfusionZones(
  events: LearningEvent[],
  duration: number
): Array<{ startTime: number; endTime: number; score: number; reasons: string[] }> {
  if (!events.length || duration <= 0) return [];

  const buckets = eventsToDensityBuckets(events, duration);
  const threshold = events.length < 5 ? 0.28 : 0.38;

  const hot = buckets
    .filter((b) => b.density >= threshold)
    .map((b) => ({
      startTime: b.startTime,
      endTime: b.endTime,
      score: b.density,
      reasons: reasonsForBucket(events, b.startTime, b.endTime),
    }));

  if (!hot.length) return [];

  const merged: typeof hot = [];
  for (const zone of hot) {
    const last = merged[merged.length - 1];
    if (last && zone.startTime <= last.endTime + CONFUSION.BUCKET_SIZE_SEC) {
      last.endTime = Math.max(last.endTime, zone.endTime);
      last.score = Math.max(last.score, zone.score);
      last.reasons = [...new Set([...last.reasons, ...zone.reasons])];
    } else {
      merged.push({ ...zone });
    }
  }

  return merged.sort((a, b) => b.score - a.score).slice(0, 8);
}
