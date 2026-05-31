import { useCallback, useEffect, useRef } from 'react';
import {
  getChannelNameFromPage,
  getVideoDurationFromPlayer,
  getVideoTitleFromPage,
} from '@lib/youtube';
import { STUDYFLOW_EVENTS } from '@lib/constants';
import { useVideoStore } from '@store/video.store';

export function useVideo(videoId: string) {
  const { setVideo, setMetadata, setCurrentTime } = useVideoStore();

  useEffect(() => {
    if (!videoId) return;
    setVideo(videoId);
  }, [videoId, setVideo]);

  const loadVideo = useCallback(async () => {
    if (!videoId) return;

    const title = getVideoTitleFromPage();
    const channel = getChannelNameFromPage();
    const duration = getVideoDurationFromPlayer();

    setMetadata({ title, channel, duration });
  }, [videoId, setMetadata]);

  useEffect(() => {
    const onTime = (e: Event) => {
      const detail = (e as CustomEvent<{ currentTime: number; videoId: string }>).detail;
      if (!detail || detail.videoId !== videoId) return;
      setCurrentTime(detail.currentTime);
    };

    window.addEventListener(STUDYFLOW_EVENTS.TIME_UPDATE, onTime);
    return () => window.removeEventListener(STUDYFLOW_EVENTS.TIME_UPDATE, onTime);
  }, [videoId, setCurrentTime]);

  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadVideo();
    retryRef.current = setTimeout(loadVideo, 1500);
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [loadVideo]);

  return { loadVideo };
}
