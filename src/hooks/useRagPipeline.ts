import { useCallback, useEffect } from 'react';
import { useTranscriptStore } from '@/features/transcript/transcript.store';
import { useRagStore } from '@/store/rag.store';
import { useSettingsStore } from '@/store/settings.store';

export function useRagPipeline(videoId: string) {
  const enhancedChunks = useTranscriptStore((s) => s.enhancedChunks);
  const transcriptStatus = useTranscriptStore((s) => s.status);
  const { buildIndex, status, stage, chunks, error } = useRagStore();
  const settingsLoaded = useSettingsStore((s) => s.loaded);

  useEffect(() => {
    useSettingsStore.getState().load();
  }, []);

  useEffect(() => {
    useRagStore.getState().reset();
  }, [videoId]);

  useEffect(() => {
    if (!videoId || transcriptStatus !== 'success' || !enhancedChunks.length) return;
    if (!settingsLoaded) return;
    const t = window.setTimeout(() => {
      void buildIndex(videoId, enhancedChunks);
    }, 500);
    return () => window.clearTimeout(t);
  }, [videoId, transcriptStatus, enhancedChunks.length, buildIndex, settingsLoaded]);

  const rebuild = useCallback(() => {
    if (videoId && enhancedChunks.length) {
      useRagStore.getState().reset();
      void buildIndex(videoId, enhancedChunks);
    }
  }, [videoId, enhancedChunks, buildIndex]);

  return { status, stage, chunks, error, rebuild };
}
