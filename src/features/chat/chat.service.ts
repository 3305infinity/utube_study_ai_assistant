import { GEMINI, VECTOR_SEARCH } from '@lib/constants';
import type { AIResponse, ChatCitation, SemanticChunk } from '@/types/ai';
import { createGeminiService } from '@/features/ai/gemini.service';
import { localChatAnswer } from '@/features/ai/localGeneration';
import { buildEducationalPrompt } from '@/features/ai/promptBuilder';
import { retrieveRelevantChunks } from '@/features/ai/ragPipeline.service';
import { canUseGeminiApi } from '@lib/storage';
import { useChatStore } from './chat.store';

export type ChatMode = 'concise' | 'deep' | 'interview';

function toCitations(chunks: SemanticChunk[], scores: Map<string, number>): ChatCitation[] {
  return chunks.slice(0, 6).map((c) => ({
    id: `cite_${c.id}`,
    chunkId: c.id,
    startTime: c.startTime,
    endTime: c.endTime,
    excerpt: c.text.slice(0, 180),
    similarityScore: scores.get(c.id) ?? 0,
  }));
}

function deliverLocalAnswer(
  assistantId: string,
  question: string,
  relevant: SemanticChunk[],
  videoTitle: string | undefined,
  scoreMap: Map<string, number>
): AIResponse {
  const local = localChatAnswer(question, relevant, videoTitle);
  const citations = toCitations(local.chunks, scoreMap);
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

  let relevant = await retrieveRelevantChunks(
    question,
    params.semanticChunks,
    VECTOR_SEARCH.TOP_K,
    0
  );

  const scoreMap = new Map<string, number>();

  if (!(await canUseGeminiApi())) {
    return deliverLocalAnswer(assistantId, question, relevant, params.videoTitle, scoreMap);
  }

  try {
    const gemini = await createGeminiService();

    const promptMode =
      params.mode === 'interview' ? 'interview' : params.mode === 'deep' ? 'student' : 'default';

    const built = buildEducationalPrompt({
      userQuery: question,
      relevantChunks: relevant,
      videoTitle: params.videoTitle,
      promptOptions: {
        mode: promptMode,
        includeTimestamps: true,
        maxContextChars: 6000,
        antiHallucination: true,
      },
    });

    const result = await gemini.generateText({
      model: GEMINI.CHAT_MODEL,
      prompt: { system: built.system, user: built.user },
      config: { temperature: 0.25, maxOutputTokens: 900 },
    });

    const citations = toCitations(relevant, scoreMap);
    store.finalizeAssistant(assistantId, result.content, citations);
    store.setError(null);

    return {
      content: result.content,
      relevantChunks: relevant,
      tokensUsed: result.tokensUsed,
      model: result.model,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('quota') || msg.includes('429')) {
      console.warn('[YT StudyFlow] Gemini quota — using transcript fallback', e);
      return deliverLocalAnswer(assistantId, question, relevant, params.videoTitle, scoreMap);
    }
    console.error('[YT StudyFlow] Gemini chat failed', e);
    useChatStore.getState().setError(msg);
    useChatStore.getState().finalizeAssistant(assistantId, `Could not reach Gemini: ${msg}`, []);
    throw e;
  }
}
