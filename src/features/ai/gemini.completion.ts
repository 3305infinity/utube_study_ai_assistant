import type { GeminiTextRequest, GeminiTextResponse } from './gemini.service';

export function parseGeminiCompletionResponse(
  data: Record<string, unknown>,
  req: GeminiTextRequest
): GeminiTextResponse {
  const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
  const parts = (candidates?.[0]?.content as Record<string, unknown> | undefined)?.parts as
    | Array<{ text?: string }>
    | undefined;
  const content = parts?.map((p) => p.text ?? '').join('').trim();
  if (!content) throw new Error('Gemini returned empty response');

  const usage = data.usageMetadata as Record<string, number> | undefined;
  return {
    content,
    tokensUsed: usage?.totalTokenCount,
    model: req.model,
  };
}
