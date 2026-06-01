import { GEMINI, VECTOR_SEARCH } from '@lib/constants';
import type { AIResponse, ChatCitation, SemanticChunk } from '@/types/ai';
import { createGeminiService } from '@/features/ai/gemini.service';
import { localChatAnswer } from '@/features/ai/localGeneration';
import { buildEducationalPrompt } from '@/features/ai/promptBuilder';
import { retrieveRelevantChunksWithScores } from '@/features/ai/ragPipeline.service';
import type { ScoredChunk } from '@/features/ai/transcriptRetrieval';
import { canUseGeminiApi } from '@lib/storage';
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
  const msgs = useChatStore.getState().messages.slice(-6);
  if (msgs.length < 2) return undefined;
  return msgs
    .map((m) => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content.slice(0, 200)}`)
    .join(' | ');
}

function toCitations(scored: ScoredChunk[], preferChunks: SemanticChunk[]): ChatCitation[] {
  const byId = new Map<string, ScoredChunk>();
  for (const s of scored) byId.set(s.chunk.id, s);
  for (const c of preferChunks) {
    if (!byId.has(c.id)) byId.set(c.id, { chunk: c, score: 1 });
  }

  const ordered = [...byId.values()].sort((a, b) => b.score - a.score);
  const seenTimes = new Set<number>();
  const out: ChatCitation[] = [];

  for (const { chunk, score } of ordered) {
    const t = Math.floor(chunk.startTime);
    if (seenTimes.has(t)) continue;
    seenTimes.add(t);
    out.push({
      id: `cite_${chunk.id}`,
      chunkId: chunk.id,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      excerpt: chunk.text.slice(0, 220).trim(),
      similarityScore: score,
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
  scored: ScoredChunk[]
): AIResponse {
  const local = localChatAnswer(question, relevant, videoTitle);
  const citations = toCitations(scored, local.chunks);
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
    return deliverLocalAnswer(assistantId, question, relevant, params.videoTitle, scored);
  }

  try {
    const gemini = await createGeminiService();

    const promptMode =
      params.mode === 'interview' ? 'interview' : params.mode === 'deep' ? 'student' : 'default';

    const built = buildEducationalPrompt({
      userQuery: question,
      relevantChunks: relevant,
      videoTitle: params.videoTitle,
      conversationSummary: conversationSummary(),
      promptOptions: {
        mode: promptMode,
        includeTimestamps: true,
        maxContextChars: VECTOR_SEARCH.CHAT_MAX_CONTEXT_CHARS,
        antiHallucination: true,
      },
    });

    const chatModel =
      params.mode === 'deep' ? GEMINI.GENERATION_MODEL : GEMINI.CHAT_MODEL;

    const maxTokens = params.mode === 'deep' ? 1400 : 1000;

    const result = await gemini.generateText({
      model: chatModel,
      prompt: { system: built.system, user: built.user },
      config: { temperature: 0.12, maxOutputTokens: maxTokens },
    });

    const citations = toCitations(scored, built.contextChunks);
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
      return deliverLocalAnswer(assistantId, question, relevant, params.videoTitle, scored);
    }
    console.error('[YT StudyFlow] Gemini chat failed', e);
    useChatStore.getState().setError(msg);
    useChatStore.getState().finalizeAssistant(assistantId, `Could not reach Gemini: ${msg}`, []);
    throw e;
  }
}
