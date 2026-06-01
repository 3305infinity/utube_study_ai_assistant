import { GEMINI } from '@lib/constants';

export function normalizeModelId(model: string): string {
  return model.replace(/^models\//, '').trim();
}

/** Prefer flash-lite first to protect free-tier RPM/quota, then requested model. */
export function buildTextModelFallbackChain(primary: string): string[] {
  const p = normalizeModelId(primary);
  const chain = [GEMINI.CHAT_MODEL, p, GEMINI.GENERATION_MODEL];
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
