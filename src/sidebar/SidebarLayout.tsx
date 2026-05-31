import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Brain, ChevronRight } from 'lucide-react';

import { TranscriptPanel } from '@/features/transcript/TranscriptPanel';
import { ChatPanel } from '@/features/chat/ChatPanel';
import { NotesPanel } from '@/features/notes/NotesPanel';
import { ChaptersPanel } from '@/features/chapters/ChaptersPanel';
import { RevisionPanel } from '@/features/revision/RevisionPanel';
import { AnalyticsPanel } from '@/features/confusion/ConfusionBanner';
import { ExportPanel } from '@/features/export/ExportPanel';
import { SettingsPanel } from '@/pages/Settings';
import { Tabs } from '@/components/Tabs';
import { seekTo, formatTime } from '@lib/youtube';
import { useVideoStore } from '@store/video.store';
import { useUiStore, type SidebarTab } from '@store/ui.store';
import { useRagPipeline } from '@/hooks/useRagPipeline';

const TAB_ITEMS: Array<{ id: SidebarTab; label: string }> = [
  { id: 'transcript', label: 'Transcript' },
  { id: 'chat', label: 'Chat' },
  { id: 'notes', label: 'Notes' },
  { id: 'chapters', label: 'Chapters' },
  { id: 'revision', label: 'Revision' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'export', label: 'Export' },
  { id: 'settings', label: 'Settings' },
];

export function SidebarLayout({
  videoId,
  onReloadTranscript,
}: {
  videoId: string;
  onReloadTranscript?: () => void;
}) {
  const { title, channel, currentTime, duration } = useVideoStore();
  const { activeTab, setActiveTab, toggleSidebarCollapsed, sidebarCollapsed } = useUiStore();
  useRagPipeline(videoId);

  const onJumpToTime = useMemo(() => (seconds: number) => seekTo(seconds), []);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-surface text-white animate-slide-in pointer-events-auto">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.18),transparent_45%)]" />

      <header className="relative z-10 border-b border-white/8 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/20">
                <Brain className="h-4 w-4 text-accent-muted" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-gradient">YT StudyFlow</h1>
                <p className="text-[11px] text-white/45">AI learning layer</p>
              </div>
            </div>
            <div className="mt-3 min-w-0">
              <p className="truncate text-sm font-medium text-white/90">
                {title ?? 'Loading video…'}
              </p>
              {channel && <p className="truncate text-xs text-white/45">{channel}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="rounded-xl border border-white/10 p-2 text-white/70 hover:bg-white/8"
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-white/45">
            <span>{formatTime(currentTime)}</span>
            <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent to-indigo-300"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Tabs items={TAB_ITEMS} value={activeTab} onChange={setActiveTab} />
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1">
        {activeTab === 'transcript' && (
          <TranscriptPanel onJumpToTime={onJumpToTime} onReload={onReloadTranscript} />
        )}
        {activeTab === 'chat' && <ChatPanel videoId={videoId} onJumpToTime={onJumpToTime} />}
        {activeTab === 'notes' && <NotesPanel videoId={videoId} />}
        {activeTab === 'chapters' && (
          <ChaptersPanel videoId={videoId} onJumpToTime={onJumpToTime} />
        )}
        {activeTab === 'revision' && <RevisionPanel videoId={videoId} />}
        {activeTab === 'analytics' && (
          <AnalyticsPanel
            videoId={videoId}
            duration={duration}
            onJumpToTime={onJumpToTime}
          />
        )}
        {activeTab === 'export' && <ExportPanel videoId={videoId} />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}
