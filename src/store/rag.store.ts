import { create } from 'zustand';
import type { SemanticChunk } from '@/types/ai';
import { buildSemanticIndex, buildKeywordOnlyIndex } from '@/features/ai/ragPipeline.service';
import { isQuotaOrAuthError } from '@/features/ai/localGeneration';
import { isValidGeminiApiKey } from '@lib/storage';

interface RagState {
  videoId: string | null;
  chunks: SemanticChunk[];
  status: 'idle' | 'building' | 'ready' | 'error';
  stage: string;
  error: string | null;
  keywordOnly: boolean;
  buildIndex: (videoId: string, enhancedChunks: import('@/types/transcript').EnhancedTranscriptChunk[]) => Promise<void>;
  reset: () => void;
}

export const useRagStore = create<RagState>((set, get) => ({
  videoId: null,
  chunks: [],
  status: 'idle',
  stage: '',
  error: null,
  keywordOnly: false,

  buildIndex: async (videoId, enhancedChunks) => {
    if (!enhancedChunks.length) return;
    const state = get();
    if (state.videoId === videoId && state.status === 'building') return;
    if (state.videoId === videoId && state.status === 'ready' && state.chunks.length) return;

    set({ videoId, status: 'building', error: null, stage: 'Starting…', keywordOnly: false });
    try {
      const { getGeminiApiKey } = await import('@lib/storage');
      const key = (await getGeminiApiKey())?.trim() ?? '';

      if (!isValidGeminiApiKey(key)) {
        const chunks = await buildKeywordOnlyIndex(videoId, enhancedChunks, (stage) =>
          set({ stage })
        );
        set({
          chunks,
          status: 'ready',
          stage: 'Local mode — add a Google AI Studio key in Settings for AI answers',
          keywordOnly: true,
        });
        return;
      }

      const chunks = await buildSemanticIndex(videoId, enhancedChunks, (stage) =>
        set({ stage })
      );
      const keywordOnly = !chunks.some((c) => c.embedding?.length);
      set({
        chunks,
        status: 'ready',
        stage: keywordOnly
          ? isValidGeminiApiKey(key)
            ? 'Ready — keyword search (AI chat uses Gemini)'
            : 'Local mode — add API key in Settings'
          : 'Ready',
        keywordOnly,
      });
    } catch (e) {
      if (isQuotaOrAuthError(e)) {
        try {
          const chunks = await buildKeywordOnlyIndex(videoId, enhancedChunks, (stage) =>
            set({ stage })
          );
          set({
            chunks,
            status: 'ready',
            stage: 'Local mode — Gemini quota exceeded',
            keywordOnly: true,
            error: null,
          });
          return;
        } catch {
          // fall through
        }
      }
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        stage: '',
      });
    }
  },

  reset: () =>
    set({ videoId: null, chunks: [], status: 'idle', stage: '', error: null, keywordOnly: false }),
}));
