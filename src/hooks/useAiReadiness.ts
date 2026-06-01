import { useMemo } from 'react';
import { useTranscriptStore } from '@/features/transcript/transcript.store';
import { useRagStore } from '@/store/rag.store';
import { useSettingsStore } from '@/store/settings.store';
import { isValidGeminiApiKey } from '@lib/storage';
export type AiReadiness =
  | { state: 'no-key'; message: string }
  | { state: 'loading-transcript'; message: string }
  | { state: 'no-transcript'; message: string }
  | { state: 'building-index'; message: string; stage?: string }
  | { state: 'index-error'; message: string }
  | { state: 'ready'; chunkCount: number; keywordOnly?: boolean };

export function useAiReadiness(): AiReadiness {
  const apiKey = useSettingsStore((s) => s.geminiApiKey);
  const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  const transcriptStatus = useTranscriptStore((s) => s.status);
  const transcriptLoading = useTranscriptStore((s) => s.loading);
  const enhancedCount = useTranscriptStore((s) => s.enhancedChunks.length);
  const ragStatus = useRagStore((s) => s.status);
  const ragStage = useRagStore((s) => s.stage);
  const ragError = useRagStore((s) => s.error);
  const chunkCount = useRagStore((s) => s.chunks.length);
  const keywordOnly = useRagStore((s) => s.keywordOnly);

  return useMemo(() => {
    const hasValidKey = isValidGeminiApiKey(apiKey ?? '') || isValidGeminiApiKey(envKey ?? '');

    if (transcriptLoading || transcriptStatus === 'loading' || transcriptStatus === 'idle') {
      return { state: 'loading-transcript', message: 'Loading transcript…' };
    }

    if (transcriptStatus === 'no-transcript' || transcriptStatus === 'error') {
      return {
        state: 'no-transcript',
        message: 'Transcript required. Enable CC on the video or retry in the Transcript tab.',
      };
    }

    if (!enhancedCount) {
      return { state: 'no-transcript', message: 'Waiting for transcript segments…' };
    }

    if (ragStatus === 'building') {
      return {
        state: 'building-index',
        message: 'Building index from transcript…',
        stage: ragStage,
      };
    }

    if (ragStatus === 'error') {
      return {
        state: 'index-error',
        message: ragError ?? 'Failed to build index.',
      };
    }

    if (ragStatus === 'ready' && chunkCount > 0) {
      return { state: 'ready', chunkCount, keywordOnly };
    }

    if (!hasValidKey) {
      return {
        state: 'no-key',
        message:
          'Set VITE_GEMINI_API_KEY in .env and rebuild, or wait for local transcript index.',
      };
    }

    return { state: 'building-index', message: 'Preparing index…', stage: ragStage };
  }, [
    apiKey,
    envKey,
    transcriptStatus,
    transcriptLoading,
    enhancedCount,
    ragStatus,
    ragStage,
    ragError,
    chunkCount,
    keywordOnly,
  ]);
}

export function useHasApiKey(): boolean {
  const apiKey = useSettingsStore((s) => s.geminiApiKey);
  const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  return isValidGeminiApiKey(apiKey ?? '') || isValidGeminiApiKey(envKey ?? '');
}
