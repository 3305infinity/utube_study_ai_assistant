import { useCallback } from 'react';
import { sendChatMessage, type ChatMode } from '@/features/chat/chat.service';
import { useRagStore } from '@/store/rag.store';
import { useVideoStore } from '@/store/video.store';
import { useChatStore } from '@/features/chat/chat.store';

export function useChat() {
  const chunks = useRagStore((s) => s.chunks);
  const ragStatus = useRagStore((s) => s.status);
  const { messages, loading, error } = useChatStore();
  const title = useVideoStore((s) => s.title);
  const videoId = useVideoStore((s) => s.videoId);

  const send = useCallback(
    async (question: string, mode: ChatMode = 'concise') => {
      if (!videoId) throw new Error('No video loaded');
      if (!chunks.length) throw new Error('Semantic index not ready');
      return sendChatMessage({
        question,
        videoId,
        videoTitle: title ?? undefined,
        semanticChunks: chunks,
        mode,
      });
    },
    [videoId, title, chunks]
  );

  const clear = useCallback(() => useChatStore.getState().clear(), []);

  return { messages, loading, error, send, clear, ragStatus, indexReady: chunks.length > 0 };
}
