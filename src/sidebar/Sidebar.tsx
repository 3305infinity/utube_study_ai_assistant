import { useEffect } from 'react';
import { SidebarLayout } from './SidebarLayout';
import { useVideo } from '@/hooks/useVideo';
import { useTranscript } from '@/hooks/useTranscript';
import { useRagStore } from '@/store/rag.store';
import { useChatStore } from '@/features/chat/chat.store';

export interface SidebarProps {
  videoId: string;
}

export function Sidebar({ videoId }: SidebarProps) {
  const { loadVideo } = useVideo(videoId);
  const { loadTranscript } = useTranscript(videoId);

  useEffect(() => {
    useRagStore.getState().reset();
    useChatStore.getState().clear();
  }, [videoId]);

  useEffect(() => {
    void loadVideo();
  }, [videoId, loadVideo]);

  return (
    <SidebarLayout
      videoId={videoId}
      onReloadTranscript={() => void loadTranscript()}
    />
  );
}
