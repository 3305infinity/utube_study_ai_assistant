import { create } from 'zustand';

interface VideoState {
  videoId: string | null;
  title: string | null;
  channel: string | null;
  duration: number;
  currentTime: number;
  setVideo: (videoId: string) => void;
  setMetadata: (meta: {
    title?: string | null;
    channel?: string | null;
    duration?: number;
  }) => void;
  setCurrentTime: (time: number) => void;
  reset: () => void;
}

export const useVideoStore = create<VideoState>((set) => ({
  videoId: null,
  title: null,
  channel: null,
  duration: 0,
  currentTime: 0,

  setVideo: (videoId) =>
    set({
      videoId,
      title: null,
      channel: null,
      duration: 0,
      currentTime: 0,
    }),

  setMetadata: (meta) =>
    set((state) => ({
      title: meta.title ?? state.title,
      channel: meta.channel ?? state.channel,
      duration: meta.duration ?? state.duration,
    })),

  setCurrentTime: (time) => set({ currentTime: time }),

  reset: () =>
    set({
      videoId: null,
      title: null,
      channel: null,
      duration: 0,
      currentTime: 0,
    }),
}));
