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
      const detail = (e as CustomEvent<{ currentTime: number; videoId: string; duration?: number }>)
        .detail;
      if (!detail || detail.videoId !== videoId) return;
      setCurrentTime(detail.currentTime);
      if (detail.duration && detail.duration > 0) {
        const state = useVideoStore.getState();
        setMetadata({ title: state.title, channel: state.channel, duration: detail.duration });
      }
    };

    const onDuration = (e: Event) => {
      const detail = (e as CustomEvent<{ duration: number; videoId: string }>).detail;
      if (!detail || detail.videoId !== videoId || !(detail.duration > 0)) return;
      const state = useVideoStore.getState();
      setMetadata({ title: state.title, channel: state.channel, duration: detail.duration });
    };

    const onAdEnded = (e: Event) => {
      const detail = (e as CustomEvent<{ videoId: string }>).detail;
      if (!detail || detail.videoId !== videoId) return;
      void loadVideo();
    };

    window.addEventListener(STUDYFLOW_EVENTS.TIME_UPDATE, onTime);
    window.addEventListener(STUDYFLOW_EVENTS.DURATION_UPDATE, onDuration);
    window.addEventListener(STUDYFLOW_EVENTS.AD_ENDED, onAdEnded);
    return () => {
      window.removeEventListener(STUDYFLOW_EVENTS.TIME_UPDATE, onTime);
      window.removeEventListener(STUDYFLOW_EVENTS.DURATION_UPDATE, onDuration);
      window.removeEventListener(STUDYFLOW_EVENTS.AD_ENDED, onAdEnded);
    };
  }, [videoId, setCurrentTime, setMetadata, loadVideo]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void loadVideo();
    const t1 = setTimeout(() => void loadVideo(), 1500);
    const t2 = setTimeout(() => void loadVideo(), 5000);

    pollRef.current = setInterval(() => {
      const d = getVideoDurationFromPlayer();
      if (d > 0) {
        const state = useVideoStore.getState();
        setMetadata({ title: state.title, channel: state.channel, duration: d });
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 500);

    const pollCap = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
    }, 60_000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (pollRef.current) clearInterval(pollRef.current);
      clearTimeout(pollCap);
    };
  }, [loadVideo, setMetadata]);

  return { loadVideo };
}
