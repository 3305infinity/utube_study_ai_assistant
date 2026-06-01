import { GEMINI, VECTOR_SEARCH } from '@lib/constants';
import type { AIResponse, ChatCitation, SemanticChunk } from '@/types/ai';
import { createGeminiService } from '@/features/ai/gemini.service';
import { localChatAnswer } from '@/features/ai/localGeneration';
import { buildEducationalPrompt } from '@/features/ai/promptBuilder';
import { detectResponseIntent } from '@/features/ai/responseIntent';
import { retrieveRelevantChunksWithScores } from '@/features/ai/ragPipeline.service';
import type { ScoredChunk } from '@/features/ai/transcriptRetrieval';
import { canUseGeminiApi } from '@lib/storage';
import { useVideoStore } from '@store/video.store';
import { useChatStore } from './chat.store';

export type ChatMode = 'concise' | 'deep' | 'interview';

function recentUserMessages(limit = 4): string[] {
  return useChatStore
    .getState()
    .messages.filter((m) => m.role === 'user')
    .slice(-limit)
    .map((m) => m.content);
}

function conversationSummary(): string | undefined {
  const msgs = useChatStore
    .getState()
    .messages.filter((m) => m.content.trim())
    .slice(-8);
  if (msgs.length < 2) return undefined;
  return msgs
    .map((m) => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content.slice(0, 400)}`)
    .join('\n');
}

function toCitations(
  scored: ScoredChunk[],
  preferChunks: SemanticChunk[],
  videoDuration?: number
): ChatCitation[] {
  const byId = new Map<string, ScoredChunk>();
  for (const s of scored) byId.set(s.chunk.id, s);
  for (const c of preferChunks) {
    if (!byId.has(c.id)) byId.set(c.id, { chunk: c, score: 1 });
  }

  const maxTime =
    videoDuration && videoDuration > 0 ? videoDuration + 2 : Number.POSITIVE_INFINITY;

  const ordered = [...byId.values()].sort((a, b) => b.score - a.score);
  const seenTimes = new Set<number>();
  const out: ChatCitation[] = [];

  for (const { chunk, score } of ordered) {
    if (chunk.startTime > maxTime) continue;
    const t = Math.floor(chunk.startTime);
    if (seenTimes.has(t)) continue;
    seenTimes.add(t);
    out.push({
      id: `cite_${chunk.videoId ?? 'v'}_${chunk.id}`,
      chunkId: chunk.id,
      startTime: chunk.startTime,
      endTime: Math.min(chunk.endTime, maxTime),
      excerpt: chunk.text.slice(0, 220).trim(),
      similarityScore: score,
      videoId: chunk.videoId,
      videoTitle: chunk.videoTitle,
    });
    if (out.length >= 5) break;
  }
  return out;
}

function deliverLocalAnswer(
  assistantId: string,
  question: string,
  relevant: SemanticChunk[],
  videoTitle: string | undefined,
  scored: ScoredChunk[],
  mode: ChatMode,
  videoDuration?: number
): AIResponse {
  const local = localChatAnswer(question, relevant, videoTitle, mode);
  const citations = toCitations(scored, local.chunks, videoDuration);
  useChatStore.getState().finalizeAssistant(assistantId, local.content, citations);
  useChatStore.getState().setError(null);
  return {
    content: local.content,
    relevantChunks: local.chunks,
    model: 'local-transcript',
  };
}

export async function sendChatMessage(params: {
  question: string;
  videoId: string;
  videoTitle?: string;
  semanticChunks: SemanticChunk[];
  mode?: ChatMode;
}): Promise<AIResponse> {
  const question = params.question.trim();
  if (!question) throw new Error('Enter a question');

  const mode = params.mode ?? 'concise';
  const videoDuration = useVideoStore.getState().duration;

  const store = useChatStore.getState();
  store.addUserMessage(question);
  const assistantId = store.addAssistantPlaceholder();

  const history = recentUserMessages(4);
  const scored = await retrieveRelevantChunksWithScores(
    question,
    params.semanticChunks,
    VECTOR_SEARCH.CHAT_TOP_K,
    history.slice(0, -1)
  );
  const relevant = scored.map((s) => s.chunk);

  if (!(await canUseGeminiApi())) {
    return deliverLocalAnswer(
      assistantId,
      question,
      relevant,
      params.videoTitle,
      scored,
      mode,
      videoDuration
    );
  }

  try {
    const gemini = await createGeminiService();

    const responseIntent = detectResponseIntent(question, mode);

    const built = buildEducationalPrompt({
      userQuery: question,
      relevantChunks: relevant,
      videoTitle: params.videoTitle,
      conversationSummary: conversationSummary(),
      responseIntent,
      promptOptions: {
        mode: mode === 'interview' ? 'interview' : mode === 'deep' ? 'student' : 'default',
        includeTimestamps: true,
        maxContextChars: VECTOR_SEARCH.CHAT_MAX_CONTEXT_CHARS,
      },
    });

    const maxTokens =
      responseIntent === 'interview'
        ? 1400
        : responseIntent === 'bullets' || responseIntent === 'summary'
          ? 900
          : mode === 'deep'
            ? 1200
            : 900;

    const result = await gemini.generateText({
      model: GEMINI.CHAT_MODEL,
      prompt: { system: built.system, user: built.user },
      config: { temperature: 0.32, maxOutputTokens: maxTokens },
    });

    const citations = toCitations(scored, built.contextChunks, videoDuration);
    store.finalizeAssistant(assistantId, result.content, citations);
    store.setError(null);

    return {
      content: result.content,
      relevantChunks: built.contextChunks,
      tokensUsed: result.tokensUsed,
      model: result.model,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('quota') || msg.includes('429')) {
      console.warn('[YT StudyFlow] Gemini quota — using transcript fallback', e);
      return deliverLocalAnswer(
        assistantId,
        question,
        relevant,
        params.videoTitle,
        scored,
        mode,
        videoDuration
      );
    }
    console.error('[YT StudyFlow] Gemini chat failed', e);
    useChatStore.getState().setError(msg);
    useChatStore.getState().finalizeAssistant(assistantId, `Could not reach Gemini: ${msg}`, []);
    throw e;
  }
}
