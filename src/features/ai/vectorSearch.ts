import type { EmbeddingVector, SemanticChunk } from '@/types/ai';
import type { GeminiService } from './gemini.service';

export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export type VectorSearchParams = {
  queryEmbedding: EmbeddingVector;
  chunks: SemanticChunk[];
  topK: number;
  threshold?: number;
};

export function vectorSearchTopK({
  queryEmbedding,
  chunks,
  topK,
  threshold,
}: VectorSearchParams) {
  const results = chunks
    .filter((c) => c.embedding?.length)
    .map((chunk) => ({
      chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding!),
      rank: 0,
    }))
    .filter((r) => (threshold == null ? true : r.similarity >= threshold))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return results.map((r, i) => ({ ...r, rank: i + 1 }));
}

export async function embedSemanticChunks(
  chunks: SemanticChunk[],
  gemini: GeminiService,
  model: string
): Promise<SemanticChunk[]> {
  const pending = chunks.filter((c) => !c.embedding?.length);
  if (!pending.length) return chunks;

  const batchSize = 8;
  const updated = new Map<string, number[]>();

  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const resp = await gemini.embedTexts({
      model,
      input: batch.map((c) => c.text),
      taskType: 'RETRIEVAL_DOCUMENT',
    });
    batch.forEach((chunk, idx) => {
      const vec = resp.embeddings[idx];
      if (vec?.length) updated.set(chunk.id, vec);
    });
  }

  return chunks.map((c) =>
    updated.has(c.id) ? { ...c, embedding: updated.get(c.id)! } : c
  );
}
