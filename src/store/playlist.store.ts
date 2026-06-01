import { create } from 'zustand';
import type { PlaylistInfo, SemanticChunk } from '@/types/ai';
import {
  countIndexedPlaylistVideos,
  loadPlaylistChunks,
  registerVideoInPlaylist,
  syncPlaylistFromPage,
} from '@/features/playlist/playlist.service';
import { getPlaylistIdFromUrl } from '@lib/playlist';

export type RagScope = 'video' | 'playlist';

interface PlaylistState {
  playlist: PlaylistInfo | null;
  scope: RagScope;
  playlistChunks: SemanticChunk[];
  indexedVideoCount: number;
  loading: boolean;
  syncFromPage: () => Promise<void>;
  setScope: (scope: RagScope) => void;
  refreshPlaylistChunks: () => Promise<void>;
  registerCurrentVideo: (videoId: string, videoTitle?: string) => Promise<void>;
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlist: null,
  scope: 'video',
  playlistChunks: [],
  indexedVideoCount: 0,
  loading: false,

  syncFromPage: async () => {
    const playlist = await syncPlaylistFromPage();
    set({ playlist });
    if (playlist) {
      const indexedVideoCount = await countIndexedPlaylistVideos(playlist.playlistId);
      set({ indexedVideoCount });
    }
  },

  setScope: (scope) => set({ scope }),

  refreshPlaylistChunks: async () => {
    const { playlist } = get();
    if (!playlist) return;
    set({ loading: true });
    try {
      const playlistChunks = await loadPlaylistChunks(playlist.playlistId);
      const indexedVideoCount = await countIndexedPlaylistVideos(playlist.playlistId);
      set({ playlistChunks, indexedVideoCount, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  registerCurrentVideo: async (videoId, videoTitle) => {
    const playlistId = getPlaylistIdFromUrl();
    if (!playlistId) return;
    await registerVideoInPlaylist(playlistId, videoId, videoTitle);
    await get().syncFromPage();
  },
}));
