import type { EnhancedTranscriptChunk, TranscriptChunk } from '@/types/transcript';

type RawCue = {
  start?: number;
  duration?: number;
  text?: string;
};

function normalizeText(input: string): string {
  return input
    .replace(/\u00A0/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stableId(videoId: string, start: number, index: number, text: string): string {
  return `${videoId}:${start.toFixed(3)}:${index}:${normalizeText(text).slice(0, 80)}`;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function parseYouTubeTranscript(
  videoId: string,
  raw: RawCue[] | null | undefined
): {
  chunks: TranscriptChunk[];
  enhancedChunks: EnhancedTranscriptChunk[];
  totalDuration: number;
} {
  if (!raw?.length) {
    return { chunks: [], enhancedChunks: [], totalDuration: 0 };
  }

  const normalized: TranscriptChunk[] = [];

  for (const cue of raw) {
    const start = asNumber(cue.start);
    const duration = asNumber(cue.duration);
    const text = typeof cue.text === 'string' ? normalizeText(cue.text) : '';
    if (start === null || duration === null || duration <= 0 || !text) continue;
    normalized.push({ text, start, duration });
  }

  normalized.sort((a, b) => a.start - b.start || a.duration - b.duration);

  const deduped: TranscriptChunk[] = [];
  const seen = new Set<string>();

  for (const chunk of normalized) {
    const key = `${Math.round(chunk.start * 100)}:${chunk.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(chunk);
  }

  const enhancedChunks: EnhancedTranscriptChunk[] = deduped.map((chunk, index) => ({
    ...chunk,
    end: chunk.start + chunk.duration,
    index,
    id: stableId(videoId, chunk.start, index, chunk.text),
  }));

  const totalDuration = enhancedChunks.length
    ? Math.max(...enhancedChunks.map((c) => c.end))
    : 0;

  return { chunks: deduped, enhancedChunks, totalDuration };
}

export function findActiveChunkIndex(
  chunks: EnhancedTranscriptChunk[],
  time: number
): number {
  if (!chunks.length || !Number.isFinite(time) || time < 0) return -1;

  let lo = 0;
  let hi = chunks.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const chunk = chunks[mid];
    if (!chunk) break;

    if (time < chunk.start) {
      hi = mid - 1;
    } else if (time >= chunk.end) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}

export function highlightSearchText(text: string, query: string): string {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<<mark>>$1<</mark>>');
}
