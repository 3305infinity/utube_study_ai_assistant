import { GEMINI } from '@lib/constants';

export function normalizeModelId(model: string): string {
  return model.replace(/^models\//, '').trim();
}

/** Primary model first, then lighter fallbacks (never escalate to Pro automatically). */
export function buildTextModelFallbackChain(primary: string): string[] {
  const chain = [
    normalizeModelId(primary),
    GEMINI.CHAT_MODEL,
    GEMINI.GENERATION_MODEL,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of chain) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function isRetryableGeminiStatus(status: number): boolean {
  return status === 429 || status === 503;
}

export function isModelUnavailableStatus(status: number): boolean {
  return status === 404;
}

/** Disable thinking on Flash-Lite / Flash for lower latency and token use. */
export function thinkingConfigForModel(
  model: string
): { thinkingConfig: { thinkingBudget: number } } | undefined {
  const id = normalizeModelId(model);
  if (id.includes('flash-lite') || id.includes('flash')) {
    return { thinkingConfig: { thinkingBudget: 0 } };
  }
  return undefined;
}
