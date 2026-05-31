import type { ChunkingOptions, SemanticChunk } from '@/types/ai';
import type { EnhancedTranscriptChunk } from '@/types/transcript';

type Paragraph = {
  text: string;
  startTime: number;
  endTime: number;
  transcriptChunkIds: string[];
};

function normalizeSpaces(s: string): string {
  return s.replace(/\u00A0/g, ' ').replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function splitIntoParagraphs(chunks: EnhancedTranscriptChunk[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let bufText: string[] = [];
  let bufIds: string[] = [];
  let bufStart: number | null = null;
  let bufEnd: number | null = null;

  const flush = () => {
    const text = normalizeSpaces(bufText.join(' '));
    if (!text) {
      bufText = [];
      bufIds = [];
      bufStart = null;
      bufEnd = null;
      return;
    }
    paragraphs.push({
      text,
      startTime: bufStart ?? 0,
      endTime: bufEnd ?? bufStart ?? 0,
      transcriptChunkIds: [...new Set(bufIds)],
    });
    bufText = [];
    bufIds = [];
    bufStart = null;
    bufEnd = null;
  };

  for (const c of chunks) {
    if (bufStart == null) bufStart = c.start;
    bufEnd = c.end;
    bufIds.push(c.id);

    const parts = c.text.split(/\n\s*\n/g);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]?.trim() ?? '';
      if (part) bufText.push(part);
      if (i < parts.length - 1) flush();
      else if (/[.!?]\s*$/.test(part)) flush();
    }
  }
  flush();
  return paragraphs;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function stableId(
  videoId: string,
  start: number,
  end: number,
  index: number,
  text: string
): string {
  return `${videoId}:sem:${start.toFixed(2)}:${end.toFixed(2)}:${index}:${normalizeSpaces(text).slice(0, 80)}`;
}

export function chunkTranscriptSemantically(
  videoId: string,
  enhancedChunks: EnhancedTranscriptChunk[],
  options: ChunkingOptions
): SemanticChunk[] {
  const maxSize = Math.max(256, options.maxChunkSize);
  const minSize = Math.max(32, Math.min(options.minChunkSize, maxSize));
  const overlap = Math.max(0, Math.min(options.overlapSize, maxSize - minSize));

  const paragraphs = splitIntoParagraphs(enhancedChunks);
  if (!paragraphs.length) return [];

  const chunks: SemanticChunk[] = [];
  let pIndex = 0;
  let chunkIndex = 0;

  while (pIndex < paragraphs.length) {
    const startP = pIndex;
    const first = paragraphs[startP]!;
    let startTime = first.startTime;
    let endTime = first.endTime;
    const ids: string[] = [];
    const parts: string[] = [];
    let tokens = 0;

    while (pIndex < paragraphs.length) {
      const p = paragraphs[pIndex]!;
      const pTokens = estimateTokens(p.text);
      if (parts.length > 0 && tokens + pTokens > maxSize) break;
      parts.push(p.text);
      ids.push(...p.transcriptChunkIds);
      tokens += pTokens;
      endTime = p.endTime;
      pIndex++;
    }

    if (tokens < minSize && pIndex < paragraphs.length) {
      const p = paragraphs[pIndex]!;
      parts.push(p.text);
      ids.push(...p.transcriptChunkIds);
      endTime = p.endTime;
      pIndex++;
    }

    const text = normalizeSpaces(parts.join(' '));
    if (text) {
      chunks.push({
        id: stableId(videoId, startTime, endTime, chunkIndex, text),
        text,
        startTime,
        endTime,
        embedding: null,
        transcriptChunkIds: [...new Set(ids)],
      });
      chunkIndex++;
    }

    if (overlap <= 0) continue;
    const endP = pIndex;
    let backP = endP - 1;
    let backTokens = 0;
    while (backP >= startP && backTokens < overlap) {
      backTokens += estimateTokens(paragraphs[backP]?.text ?? '');
      backP--;
    }
    const nextStart = Math.max(0, backP + 1);
    if (nextStart > startP) pIndex = nextStart;
  }

  return chunks;
}
