/**
 * Application-wide constants
 */

export const UI = {
  SIDEBAR_WIDTH: 420,
  ANIMATION_MS: 280,
} as const;

export const STORAGE_KEYS = {
  SETTINGS: 'studyflow_settings',
} as const;

export const ANALYTICS_EVENTS = {
  VIDEO_LOAD: 'video_load',
  SEEK: 'seek',
  PAUSE: 'pause',
  REWIND: 'rewind',
  SPEED_CHANGE: 'speed_change',
  CONFUSION_DETECTED: 'confusion_detected',
} as const;

export const TRANSCRIPT_TRANSPORT = {
  FETCH: 'YT_STUDYFLOW_FETCH_TRANSCRIPT',
  RESULT: 'YT_STUDYFLOW_TRANSCRIPT_RESULT',
  TIMEOUT_MS: 10000,
} as const;

export const STUDYFLOW_EVENTS = {
  TIME_UPDATE: 'yt-studyflow-time-update',
  DURATION_UPDATE: 'yt-studyflow-duration-update',
  AD_ENDED: 'yt-studyflow-ad-ended',
  PLAYER_EVENT: 'yt-studyflow-event',
  HEATMAP_UPDATE: 'yt-studyflow-heatmap-update',
  CONFUSION_UPDATE: 'yt-studyflow-confusion-update',
} as const;

export const CHUNKING = {
  MAX_CHUNK_SIZE: 800,
  MIN_CHUNK_SIZE: 100,
  OVERLAP_SIZE: 80,
} as const;

export const VECTOR_SEARCH = {
  TOP_K: 6,
  /** Chat pulls more transcript context for entity / company questions */
  CHAT_TOP_K: 14,
  SIMILARITY_THRESHOLD: 0.25,
  CHAT_MAX_CONTEXT_CHARS: 12_000,
} as const;

export const GEMINI = {
  /** Simple chat — cheapest / highest RPM */
  CHAT_MODEL: 'gemini-2.5-flash-lite',
  /** Notes, chapters, quiz, flashcards */
  GENERATION_MODEL: 'gemini-2.5-flash',
  /** Deep reasoning only — strict rate limits; avoid for routine calls */
  REASONING_MODEL: 'gemini-2.5-pro',
  /** text-embedding-004 was shut down Jan 2026 — use gemini-embedding-001 */
  EMBEDDING_MODEL: 'gemini-embedding-001',
  EMBEDDING_FALLBACKS: ['embedding-001'] as const,
  /** Vector RAG: cosine similarity over stored embeddings */
  EMBEDDINGS_ENABLED: true,
  /** Cap per video to protect free-tier embedding quota */
  MAX_EMBED_CHUNKS: 48,
  MAX_OUTPUT_TOKENS: 1200,
  TEMPERATURE: 0.3,
} as const;

export const CONFUSION = {
  REWIND_WINDOW_SEC: 15,
  PAUSE_THRESHOLD_MS: 4000,
  SEEK_BACK_THRESHOLD_SEC: 8,
  BUCKET_SIZE_SEC: 5,
} as const;
