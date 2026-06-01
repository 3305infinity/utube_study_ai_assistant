import { isValidGeminiApiKey } from './storage';

export function getViteGeminiApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? '';
}

export function hasBuiltInGeminiKey(): boolean {
  return isValidGeminiApiKey(getViteGeminiApiKey());
}
