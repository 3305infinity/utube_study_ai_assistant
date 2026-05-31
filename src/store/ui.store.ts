import { create } from 'zustand';

export type SidebarTab =
  | 'transcript'
  | 'chat'
  | 'notes'
  | 'chapters'
  | 'revision'
  | 'analytics'
  | 'export'
  | 'settings';

interface UiState {
  activeTab: SidebarTab;
  sidebarCollapsed: boolean;
  setActiveTab: (tab: SidebarTab) => void;
  toggleSidebarCollapsed: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'transcript',
  sidebarCollapsed: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebarCollapsed: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
