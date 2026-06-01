/**
 * YouTube player event tracking for transcript sync + duration after ads.
 */

import { getYouTubePlayer } from '@lib/youtube';
import { ANALYTICS_EVENTS, STUDYFLOW_EVENTS } from '@lib/constants';

export interface VideoEvent {
  type: string;
  videoId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

function emitDurationUpdate(videoId: string, duration: number, currentTime: number): void {
  if (!Number.isFinite(duration) || duration <= 0) return;
  window.dispatchEvent(
    new CustomEvent(STUDYFLOW_EVENTS.DURATION_UPDATE, {
      detail: { videoId, duration, currentTime },
    })
  );
}

export function setupYouTubeEventTracking(videoId: string): () => void {
  const player = getYouTubePlayer();

  if (!player) {
    console.warn('[YT StudyFlow] Video player not found');
    return () => {};
  }

  let lastTime = player.currentTime;
  let lastPlaybackRate = player.playbackRate;
  let pauseStartTime = 0;
  let lastKnownDuration = player.duration;
  let adShowing = false;

  const emit = (event: VideoEvent) => {
    window.dispatchEvent(
      new CustomEvent(STUDYFLOW_EVENTS.PLAYER_EVENT, { detail: event })
    );
  };

  const refreshDuration = (reason: string) => {
    const duration = player.duration;
    const currentTime = player.currentTime;
    if (!Number.isFinite(duration) || duration <= 0) return;
    if (duration === lastKnownDuration && reason !== 'ad-ended') return;
    lastKnownDuration = duration;
    emit({
      type: ANALYTICS_EVENTS.VIDEO_LOAD,
      videoId,
      timestamp: Date.now(),
      data: { duration, currentTime, reason },
    });
    emitDurationUpdate(videoId, duration, currentTime);
  };

  const handleTimeUpdate = () => {
    const currentTime = player.currentTime;
    const diff = Math.abs(currentTime - lastTime);

    if (diff > 1) {
      emit({
        type: currentTime < lastTime ? ANALYTICS_EVENTS.REWIND : ANALYTICS_EVENTS.SEEK,
        videoId,
        timestamp: Date.now(),
        data: { from: lastTime, to: currentTime, diff: currentTime - lastTime },
      });
    }

    lastTime = currentTime;

    if (player.duration > 0 && player.duration !== lastKnownDuration) {
      refreshDuration('timeupdate');
    }

    window.dispatchEvent(
      new CustomEvent(STUDYFLOW_EVENTS.TIME_UPDATE, {
        detail: { currentTime, videoId, duration: player.duration },
      })
    );
  };

  const handlePause = () => {
    pauseStartTime = Date.now();
    emit({
      type: ANALYTICS_EVENTS.PAUSE,
      videoId,
      timestamp: pauseStartTime,
      data: { time: player.currentTime },
    });
  };

  const handlePlay = () => {
    refreshDuration('play');
    if (pauseStartTime > 0) {
      const duration = Date.now() - pauseStartTime;
      window.dispatchEvent(
        new CustomEvent('yt-studyflow-pause-duration', {
          detail: { duration, time: player.currentTime, videoId },
        })
      );
      pauseStartTime = 0;
    }
  };

  const handleRateChange = () => {
    const newRate = player.playbackRate;
    if (newRate !== lastPlaybackRate) {
      emit({
        type: ANALYTICS_EVENTS.SPEED_CHANGE,
        videoId,
        timestamp: Date.now(),
        data: { from: lastPlaybackRate, to: newRate, time: player.currentTime },
      });
      lastPlaybackRate = newRate;
    }
  };

  const handleLoadedMetadata = () => refreshDuration('loadedmetadata');
  const handleDurationChange = () => refreshDuration('durationchange');

  const handleAdEnded = () => {
    lastTime = player.currentTime;
    refreshDuration('ad-ended');
    window.dispatchEvent(
      new CustomEvent(STUDYFLOW_EVENTS.AD_ENDED, { detail: { videoId, currentTime: player.currentTime } })
    );
    window.dispatchEvent(
      new CustomEvent(STUDYFLOW_EVENTS.TIME_UPDATE, {
        detail: { currentTime: player.currentTime, videoId, duration: player.duration },
      })
    );
  };

  player.addEventListener('timeupdate', handleTimeUpdate);
  player.addEventListener('pause', handlePause);
  player.addEventListener('play', handlePlay);
  player.addEventListener('ratechange', handleRateChange);
  player.addEventListener('loadedmetadata', handleLoadedMetadata);
  player.addEventListener('durationchange', handleDurationChange);

  const playerShell = document.querySelector('.html5-video-player');
  let adObserver: MutationObserver | null = null;
  if (playerShell) {
    adShowing = playerShell.classList.contains('ad-showing');
    adObserver = new MutationObserver(() => {
      const nowAd = playerShell.classList.contains('ad-showing');
      if (adShowing && !nowAd) {
        setTimeout(handleAdEnded, 150);
      }
      adShowing = nowAd;
    });
    adObserver.observe(playerShell, { attributes: true, attributeFilter: ['class'] });
  }

  // Duration is often 0 until the main video starts (especially after pre-roll ads).
  const durationPoll = window.setInterval(() => {
    if (player.duration > 0) {
      refreshDuration('poll');
      window.clearInterval(durationPoll);
    }
  }, 400);
  const durationPollCap = window.setTimeout(() => window.clearInterval(durationPoll), 45_000);

  refreshDuration('init');
  emit({
    type: ANALYTICS_EVENTS.VIDEO_LOAD,
    videoId,
    timestamp: Date.now(),
    data: { duration: player.duration },
  });

  return () => {
    player.removeEventListener('timeupdate', handleTimeUpdate);
    player.removeEventListener('pause', handlePause);
    player.removeEventListener('play', handlePlay);
    player.removeEventListener('ratechange', handleRateChange);
    player.removeEventListener('loadedmetadata', handleLoadedMetadata);
    player.removeEventListener('durationchange', handleDurationChange);
    adObserver?.disconnect();
    window.clearInterval(durationPoll);
    window.clearTimeout(durationPollCap);
  };
}
