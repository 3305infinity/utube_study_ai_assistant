import { STORAGE_KEYS } from './constants';

export interface Settings {
  geminiApiKey: string;
  autoLoadTranscript: boolean;
  chatMode: 'concise' | 'deep' | 'interview';
  defaultNoteType: 'concise' | 'detailed' | 'interview' | 'revision';
}

const DEFAULT_SETTINGS: Settings = {
  geminiApiKey: '',
  autoLoadTranscript: true,
  chatMode: 'concise',
  defaultNoteType: 'concise',
};

export async function getSettings(): Promise<Settings> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.sync.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings },
  });
}

export async function getGeminiApiKey(): Promise<string> {
  const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (envKey?.trim()) return envKey.trim();
  const settings = await getSettings();
  return settings.geminiApiKey.trim();
}

/** Google AI Studio keys: legacy AIza… or newer AQ.… format */
export function isValidGeminiApiKey(key: string): boolean {
  const k = key.trim();
  return (k.startsWith('AIza') || k.startsWith('AQ.')) && k.length >= 20;
}

export async function canUseGeminiApi(): Promise<boolean> {
  return isValidGeminiApiKey(await getGeminiApiKey());
}
