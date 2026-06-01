import type { SemanticChunk } from '@/types/ai';

export type ScoredChunk = { chunk: SemanticChunk; score: number };

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
  'it', 'its', 'they', 'them', 'their', 'we', 'you', 'your', 'he', 'she', 'his', 'her',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'about', 'with', 'from',
  'any', 'did', 'mention', 'mentioned', 'talk', 'talking', 'say', 'said', 'video', 'lecture',
  'ok', 'okay', 'yes', 'no', 'please', 'thanks', 'thank',
]);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function extractSearchTerms(question: string): string[] {
  const terms = new Set<string>();
  const q = question.trim();

  for (const m of q.matchAll(/"([^"]+)"/g)) {
    const phrase = m[1]!.trim().toLowerCase();
    if (phrase) {
      terms.add(phrase);
      terms.add(phrase.replace(/\s+/g, ''));
    }
  }

  for (const w of q.toLowerCase().split(/\W+/)) {
    if (w.length >= 2 && !STOP.has(w)) terms.add(w);
  }

  for (const m of q.matchAll(/\b[A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*\b/g)) {
    const phrase = m[0]!.trim();
    terms.add(phrase.toLowerCase());
    terms.add(phrase.replace(/\s+/g, '').toLowerCase());
  }

  return [...terms];
}

function scoreChunk(chunk: SemanticChunk, terms: string[], query: string): number {
  const text = chunk.text.toLowerCase();
  const normText = normalize(chunk.text);
  let score = 0;

  for (const term of terms) {
    if (term.length < 2) continue;
    const normTerm = normalize(term);
    if (text.includes(term)) score += term.length >= 6 ? 5 : 2;
    if (normTerm.length >= 3 && normText.includes(normTerm)) score += 4;
    if (term.includes(' ') && text.includes(term)) score += 6;
  }

  const qLow = query.toLowerCase().trim();
  if (qLow.length >= 10 && text.includes(qLow)) score += 12;

  if (/compan(y|ies)|corp|ltd|inc|llp|blackrock|intern|recruit|ctc|lpa/i.test(text)) {
    if (/compan(y|ies)|organiz|firm|blackrock|who.*talk|mentioned/i.test(query)) {
      score += 2;
    }
  }

  return score;
}

function pickSpread(chunks: SemanticChunk[], count: number): ScoredChunk[] {
  if (!chunks.length) return [];
  if (chunks.length <= count) {
    return chunks.map((c) => ({ chunk: c, score: 0.5 }));
  }
  const out: ScoredChunk[] = [];
  const step = (chunks.length - 1) / Math.max(count - 1, 1);
  for (let i = 0; i < count; i++) {
    out.push({ chunk: chunks[Math.round(i * step)]!, score: 0.5 });
  }
  return out;
}

export function expandQueryWithHistory(question: string, recentUserMessages: string[]): string {
  const q = question.trim();
  if (q.length >= 14 || !recentUserMessages.length) return q;
  const prev = recentUserMessages.filter(Boolean).slice(-2).join(' ');
  return `${prev} ${q}`.trim();
}

export function retrieveRelevantChunksScored(
  question: string,
  chunks: SemanticChunk[],
  topK: number,
  recentUserMessages: string[] = []
): ScoredChunk[] {
  if (!chunks.length) return [];

  const query = expandQueryWithHistory(question, recentUserMessages);
  const terms = extractSearchTerms(query);
  const broad =
    /summar|overview|main (idea|point)|key (point|takeaway)|what is this (video|about)/i.test(
      query
    );
  const entityQuestion =
    /compan(y|ies)|organiz|firm|corp|blackrock|who (is|are)|talking about|mentioned|opportunit/i.test(
      query
    );

  let scored = chunks.map((chunk) => ({
    chunk,
    score: scoreChunk(chunk, terms, query),
  }));

  if (terms.some((t) => normalize(t).length >= 4)) {
    const withSweep = chunks.map((chunk) => {
      let s = scoreChunk(chunk, terms, query);
      for (const term of terms) {
        const n = normalize(term);
        if (n.length >= 4 && normalize(chunk.text).includes(n)) s = Math.max(s, 6);
      }
      return { chunk, score: s };
    });
    scored = withSweep;
  }

  let hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  if (!hits.length) {
    return pickSpread(chunks, Math.min(topK, broad || entityQuestion ? 10 : 6));
  }

  if (entityQuestion || broad) {
    const seen = new Set(hits.map((h) => h.chunk.id));
    for (const s of pickSpread(chunks, 5)) {
      if (!seen.has(s.chunk.id) && hits.length < topK + 3) {
        hits.push({ chunk: s.chunk, score: Math.max(s.score, 1) });
        seen.add(s.chunk.id);
      }
    }
    hits.sort((a, b) => b.score - a.score);
  }

  return hits.slice(0, topK);
}
