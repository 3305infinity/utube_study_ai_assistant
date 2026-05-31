import { create } from 'zustand';
import { getSettings, saveSettings, type Settings } from '@lib/storage';

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  update: (partial: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  geminiApiKey: '',
  autoLoadTranscript: true,
  chatMode: 'concise',
  defaultNoteType: 'concise',
  loaded: false,

  load: async () => {
    const s = await getSettings();
    set({ ...s, loaded: true });
  },

  update: async (partial) => {
    await saveSettings(partial);
    set(partial);
  },
}));
