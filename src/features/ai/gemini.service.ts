import { parseGeminiCompletionResponse } from './gemini.completion';
import { GEMINI } from '@lib/constants';
import { geminiFetch } from './geminiRateLimit';

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

/** One model only — fallbacks multiply quota usage on rate-limited keys */
const GENERATION_MODEL = GEMINI.CHAT_MODEL;

function formatApiError(status: number, body: string): Error {
  if (status === 429) {
    try {
      const j = JSON.parse(body) as { error?: { message?: string; status?: string } };
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
  return new Error(`Gemini error ${status}: ${body.slice(0, 200)}`);
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

  async generateText(req: GeminiTextRequest): Promise<GeminiTextResponse> {
    this.ensureKey();
    const model = req.model.replace(/^models\//, '') || GENERATION_MODEL;
    return this.generateTextWithModel(model, req);
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
        maxOutputTokens: req.config?.maxOutputTokens ?? 900,
      },
    };

    const r = await geminiFetch(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      this.apiKey
    );
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw formatApiError(r.status, text);
    }
    const resp = (await r.json()) as Record<string, unknown>;
    return parseGeminiCompletionResponse(resp, { ...req, model });
  }

  async embedTexts(req: GeminiEmbeddingsRequest): Promise<GeminiEmbeddingsResponse> {
    this.ensureKey();
    const model = req.model.replace(/^models\//, '') || GEMINI.EMBEDDING_MODEL;
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
