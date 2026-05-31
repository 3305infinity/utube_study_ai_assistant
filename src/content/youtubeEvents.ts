/**
 * YouTube player event tracking for transcript sync + future analytics.
 */

import { getYouTubePlayer } from '@lib/youtube';
import { ANALYTICS_EVENTS, STUDYFLOW_EVENTS } from '@lib/constants';

export interface VideoEvent {
  type: string;
  videoId: string;
  timestamp: number;
  data?: Record<string, unknown>;
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

  const emit = (event: VideoEvent) => {
    window.dispatchEvent(
      new CustomEvent(STUDYFLOW_EVENTS.PLAYER_EVENT, { detail: event })
    );
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

    window.dispatchEvent(
      new CustomEvent(STUDYFLOW_EVENTS.TIME_UPDATE, {
        detail: { currentTime, videoId },
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

  player.addEventListener('timeupdate', handleTimeUpdate);
  player.addEventListener('pause', handlePause);
  player.addEventListener('play', handlePlay);
  player.addEventListener('ratechange', handleRateChange);

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
  };
}
