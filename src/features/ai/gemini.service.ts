import { parseGeminiCompletionResponse } from './gemini.completion';
import { GEMINI } from '@lib/constants';
import { geminiFetch } from './geminiRateLimit';
import {
  buildTextModelFallbackChain,
  isModelUnavailableStatus,
  isRetryableGeminiStatus,
  normalizeModelId,
  thinkingConfigForModel,
} from './geminiModels';

export type GeminiEmbeddingsRequest = {
  model: string;
  input: string[];
  taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY';
};

export type GeminiEmbeddingsResponse = { model: string; embeddings: number[][] };

export type GeminiTextRequest = {
  model: string;
  prompt: { system?: string; user: string };
  config?: { temperature?: number; maxOutputTokens?: number };
};

export type GeminiTextResponse = {
  content: string;
  tokensUsed?: number;
  model: string;
};

const DEFAULT_TEXT_MODEL = GEMINI.CHAT_MODEL;
const MAX_PROMPT_CHARS = 120_000;
const GENERATE_MAX_ATTEMPTS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatApiError(status: number, body: string): Error {
  if (status === 429) {
    try {
      const j = JSON.parse(body) as { error?: { message?: string } };
      const msg = j.error?.message ?? body.slice(0, 120);
      return new Error(`Gemini rate limit: ${msg}`);
    } catch {
      return new Error(`Gemini rate limit (429). Wait 30s and try one feature at a time.`);
    }
  }
  if (body.toLowerCase().includes('quota')) {
    return new Error(`Gemini: ${body.slice(0, 150)}`);
  }
  if (status === 401 || status === 403) {
    return new Error('Invalid Gemini API key. Get a free key at aistudio.google.com.');
  }
  if (status === 400) {
    try {
      const j = JSON.parse(body) as { error?: { message?: string } };
      return new Error(j.error?.message ?? `Invalid request: ${body.slice(0, 120)}`);
    } catch {
      return new Error(`Invalid request: ${body.slice(0, 120)}`);
    }
  }
  if (status === 404) {
    try {
      const j = JSON.parse(body) as { error?: { message?: string } };
      return new Error(j.error?.message ?? 'Model not found');
    } catch {
      return new Error('Model not found for this API version');
    }
  }
  if (status === 503) {
    return new Error('Gemini is temporarily unavailable. Try again in a moment.');
  }
  return new Error(`Gemini error ${status}: ${body.slice(0, 200)}`);
}

function extractTokenUsage(data: Record<string, unknown>): number | undefined {
  const usage = data.usageMetadata as { totalTokenCount?: number } | undefined;
  return typeof usage?.totalTokenCount === 'number' ? usage.totalTokenCount : undefined;
}

export class GeminiService {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  private ensureKey(): void {
    if (!this.apiKey) {
      throw new Error('Gemini API key missing. Add it in Settings.');
    }
    if (!this.apiKey.startsWith('AIza') && !this.apiKey.startsWith('AQ.')) {
      throw new Error(
        'API key format looks wrong. Use a Google AI Studio key (AIza… or AQ.…).'
      );
    }
  }

  private validatePrompt(req: GeminiTextRequest): void {
    const user = req.prompt.user?.trim();
    if (!user) throw new Error('Prompt is empty');
    if (user.length > MAX_PROMPT_CHARS) {
      throw new Error('Prompt is too long. Try a shorter question or fewer transcript chunks.');
    }
  }

  async generateText(req: GeminiTextRequest): Promise<GeminiTextResponse> {
    this.ensureKey();
    this.validatePrompt(req);

    const primary = normalizeModelId(req.model) || DEFAULT_TEXT_MODEL;
    const chain = buildTextModelFallbackChain(primary);
    let lastErr: Error | null = null;

    for (const model of chain) {
      try {
        return await this.generateTextWithModel(model, req);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        lastErr = err;
        const status = (err as Error & { status?: number }).status;
        if (isModelUnavailableStatus(status ?? 0) || isRetryableGeminiStatus(status ?? 0)) {
          console.warn(`[YT StudyFlow] Gemini model ${model} failed (${status}), trying fallback`);
          continue;
        }
        throw err;
      }
    }

    throw lastErr ?? new Error('All Gemini models failed');
  }

  private async fetchGenerateWithRetry(
    url: string,
    body: string
  ): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; body: string }> {
    let lastStatus = 0;
    let lastBody = '';

    for (let attempt = 0; attempt < GENERATE_MAX_ATTEMPTS; attempt++) {
      const r = await geminiFetch(url, { method: 'POST', body }, this.apiKey);
      if (r.ok) {
        const data = (await r.json()) as Record<string, unknown>;
        return { ok: true, data };
      }

      lastStatus = r.status;
      lastBody = await r.text().catch(() => '');

      if (isRetryableGeminiStatus(lastStatus) && attempt < GENERATE_MAX_ATTEMPTS - 1) {
        await sleep(2 ** attempt * 1000);
        continue;
      }

      break;
    }

    return { ok: false, status: lastStatus, body: lastBody };
  }

  private async generateTextWithModel(
    model: string,
    req: GeminiTextRequest
  ): Promise<GeminiTextResponse> {
    const url = `${this.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const body = {
      systemInstruction: req.prompt.system
        ? { parts: [{ text: req.prompt.system }] }
        : undefined,
      contents: [{ role: 'user', parts: [{ text: req.prompt.user }] }],
      generationConfig: {
        temperature: req.config?.temperature ?? 0.3,
        maxOutputTokens: req.config?.maxOutputTokens ?? GEMINI.MAX_OUTPUT_TOKENS,
        ...thinkingConfigForModel(model),
      },
    };

    const result = await this.fetchGenerateWithRetry(url, JSON.stringify(body));

    if (!result.ok) {
      const err = formatApiError(result.status, result.body);
      (err as Error & { status?: number }).status = result.status;
      throw err;
    }

    const tokensUsed = extractTokenUsage(result.data);
    if (tokensUsed != null) {
      console.debug(`[YT StudyFlow] Gemini ${model} tokens: ${tokensUsed}`);
    }

    const parsed = parseGeminiCompletionResponse(result.data, { ...req, model });
    return { ...parsed, model };
  }

  async embedTexts(req: GeminiEmbeddingsRequest): Promise<GeminiEmbeddingsResponse> {
    this.ensureKey();
    const model = normalizeModelId(req.model) || GEMINI.EMBEDDING_MODEL;
    return this.embedWithModel(model, req);
  }

  private async embedWithModel(
    model: string,
    req: GeminiEmbeddingsRequest
  ): Promise<GeminiEmbeddingsResponse> {
    const taskType = req.taskType ?? 'RETRIEVAL_DOCUMENT';
    const modelPath = `models/${model}`;

    if (req.input.length === 1) {
      const url = `${this.baseUrl}/v1beta/models/${encodeURIComponent(model)}:embedContent`;
      const r = await geminiFetch(
        url,
        {
          method: 'POST',
          body: JSON.stringify({
            model: modelPath,
            content: { parts: [{ text: req.input[0] }] },
            taskType,
          }),
        },
        this.apiKey
      );
      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        throw formatApiError(r.status, errText);
      }
      const data = (await r.json()) as Record<string, unknown>;
      const values =
        (data.embedding as { values?: number[] } | undefined)?.values ??
        ((data.embeddings as Array<{ values?: number[] }> | undefined)?.[0]?.values);
      if (!values?.length) throw new Error('Failed to parse embedding response');
      return { model, embeddings: [values.map(Number)] };
    }

    const url = `${this.baseUrl}/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`;
    const r = await geminiFetch(
      url,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: req.input.map((text) => ({
            model: modelPath,
            content: { parts: [{ text }] },
            taskType,
          })),
        }),
      },
      this.apiKey
    );
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      throw formatApiError(r.status, errText);
    }
    const data = (await r.json()) as Record<string, unknown>;
    const raw =
      (data.embeddings as Array<{ values?: number[] }> | undefined) ??
      (data.responses as Array<{ embedding?: { values?: number[] } }> | undefined)?.map(
        (item) => item.embedding
      );
    const embeddings = (raw ?? [])
      .map((e) => e?.values?.map(Number))
      .filter((v): v is number[] => !!v?.length);
    if (embeddings.length !== req.input.length) {
      throw new Error('Failed to parse batch embedding response');
    }
    return { model, embeddings };
  }
}

export async function createGeminiService(): Promise<GeminiService> {
  const { getGeminiApiKey } = await import('@lib/storage');
  return new GeminiService(await getGeminiApiKey());
}
