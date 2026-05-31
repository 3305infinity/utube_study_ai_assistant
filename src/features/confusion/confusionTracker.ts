import { ANALYTICS_EVENTS, CONFUSION, STUDYFLOW_EVENTS } from '@lib/constants';
import type { LearningEvent } from '@/features/heatmap/density';
import { eventsToDensityBuckets, detectConfusionZones } from '@/features/heatmap/density';
import { renderHeatmapOverlay } from '@/features/heatmap/heatmapOverlay';
import { DbIds, ensureDbReady, getDb, nowMs } from '@lib/db';
import { getYouTubePlayer } from '@lib/youtube';

type TrackerState = {
  videoId: string;
  events: LearningEvent[];
  pauseStart: number;
  lastTime: number;
};

let state: TrackerState | null = null;
let cleanup: (() => void) | null = null;

function pushEvent(type: string, time: number, data?: Record<string, unknown>): void {
  if (!state) return;
  state.events.push({ type, time, data });

  window.dispatchEvent(
    new CustomEvent(STUDYFLOW_EVENTS.CONFUSION_UPDATE, {
      detail: { videoId: state.videoId, events: [...state.events] },
    })
  );
}

async function persistAnalytics(videoId: string, events: LearningEvent[]): Promise<void> {
  try {
    await ensureDbReady();
    await getDb().analytics.put({
      id: DbIds.analytics(videoId, 'session'),
      videoId,
      kind: 'learning_event',
      payload: { events, savedAt: nowMs() },
      createdAt: nowMs(),
      updatedAt: nowMs(),
      schemaVersion: 1,
    });
  } catch {
    // non-fatal
  }
}

function broadcastHeatmap(videoId: string, duration: number): void {
  if (!state) return;
  const buckets = eventsToDensityBuckets(state.events, duration);
  renderHeatmapOverlay(buckets, duration);
  window.dispatchEvent(
    new CustomEvent(STUDYFLOW_EVENTS.HEATMAP_UPDATE, {
      detail: { videoId, buckets, zones: detectConfusionZones(state.events, duration) },
    })
  );
}

export function startConfusionTracker(videoId: string): () => void {
  stopConfusionTracker();

  const player = getYouTubePlayer();
  state = {
    videoId,
    events: [],
    pauseStart: 0,
    lastTime: player?.currentTime ?? 0,
  };

  const onPlayerEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      type: string;
      videoId: string;
      data?: Record<string, unknown>;
    };
    if (!state || detail.videoId !== videoId) return;

    const time = Number(detail.data?.time ?? detail.data?.to ?? player?.currentTime ?? 0);

    if (detail.type === ANALYTICS_EVENTS.REWIND) {
      const diff = Number(detail.data?.diff ?? 0);
      if (Math.abs(diff) >= CONFUSION.SEEK_BACK_THRESHOLD_SEC) {
        pushEvent('rewind', time, detail.data);
      }
    } else if (detail.type === ANALYTICS_EVENTS.PAUSE) {
      state.pauseStart = Date.now();
      pushEvent('pause', time, detail.data);
    } else if (detail.type === ANALYTICS_EVENTS.SEEK) {
      pushEvent('seek', time, detail.data);
    } else if (detail.type === ANALYTICS_EVENTS.SPEED_CHANGE) {
      pushEvent('speed_change', time, detail.data);
    }
  };

  const onPauseDuration = (e: Event) => {
    const detail = (e as CustomEvent).detail as { duration: number; time: number; videoId: string };
    if (!state || detail.videoId !== videoId) return;
    if (detail.duration >= CONFUSION.PAUSE_THRESHOLD_MS) {
      pushEvent('long_pause', detail.time, { durationMs: detail.duration });
    }
  };

  const onTime = () => {
    const p = getYouTubePlayer();
    if (!p || !state) return;
    broadcastHeatmap(videoId, p.duration || 0);
  };

  window.addEventListener(STUDYFLOW_EVENTS.PLAYER_EVENT, onPlayerEvent);
  window.addEventListener('yt-studyflow-pause-duration', onPauseDuration);
  window.addEventListener(STUDYFLOW_EVENTS.TIME_UPDATE, onTime);

  cleanup = () => {
    window.removeEventListener(STUDYFLOW_EVENTS.PLAYER_EVENT, onPlayerEvent);
    window.removeEventListener('yt-studyflow-pause-duration', onPauseDuration);
    window.removeEventListener(STUDYFLOW_EVENTS.TIME_UPDATE, onTime);
    if (state) void persistAnalytics(state.videoId, state.events);
    state = null;
  };

  return cleanup;
}

export function stopConfusionTracker(): void {
  cleanup?.();
  cleanup = null;
}

export function getTrackerEvents(): LearningEvent[] {
  return state?.events ?? [];
}
