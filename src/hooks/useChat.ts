import { useCallback } from 'react';
import { sendChatMessage, type ChatMode } from '@/features/chat/chat.service';
import { useRagStore } from '@/store/rag.store';
import { usePlaylistStore } from '@/store/playlist.store';
import { useVideoStore } from '@/store/video.store';
import { useChatStore } from '@/features/chat/chat.store';

export function useChat() {
  const videoChunks = useRagStore((s) => s.chunks);
  const scope = usePlaylistStore((s) => s.scope);
  const playlistChunks = usePlaylistStore((s) => s.playlistChunks);
  const chunks = scope === 'playlist' && playlistChunks.length ? playlistChunks : videoChunks;
  const ragStatus = useRagStore((s) => s.status);
  const { messages, loading, error } = useChatStore();
  const title = useVideoStore((s) => s.title);
  const videoId = useVideoStore((s) => s.videoId);

  const send = useCallback(
    async (question: string, mode: ChatMode = 'concise') => {
      if (!videoId) throw new Error('No video loaded');
      if (!chunks.length) {
        throw new Error(
          scope === 'playlist'
            ? 'Playlist index empty — open more videos in this playlist to index them'
            : 'Semantic index not ready'
        );
      }
      return sendChatMessage({
        question,
        videoId,
        videoTitle: title ?? undefined,
        semanticChunks: chunks,
        mode,
      });
    },
    [videoId, title, chunks, scope]
  );

  const clear = useCallback(() => useChatStore.getState().clear(), []);

  return { messages, loading, error, send, clear, ragStatus, indexReady: chunks.length > 0 };
}
