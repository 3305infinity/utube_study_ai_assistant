import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, MessageSquare, Send, Trash2, Clock, User } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { useChat } from '@/hooks/useChat';
import { useSettingsStore } from '@/store/settings.store';
import { useRagStore } from '@/store/rag.store';
import { formatTime } from '@lib/youtube';
import { Loader } from '@/components/Loader';
import { FeatureGate, RagStatusBanner } from '@/components/FeatureGate';
import type { ChatMode } from '@/features/chat/chat.service';
import { useAiReadiness, useHasApiKey } from '@/hooks/useAiReadiness';

const SUGGESTIONS = [
  'Summarize this video in 3 bullet points',
  'What are the key concepts explained?',
  'Explain the main idea like I am new to this topic',
];

export function ChatPanel({
  onJumpToTime,
}: {
  videoId: string;
  onJumpToTime: (seconds: number) => void;
}) {
  const [input, setInput] = useState('');
  const defaultMode = useSettingsStore((s) => s.chatMode);
  const [mode, setMode] = useState<ChatMode>(defaultMode);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, loading, error, send, clear } = useChat();
  const readiness = useAiReadiness();
  const hasApiKey = useHasApiKey();
  const keywordOnly = useRagStore((s) => s.keywordOnly);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput('');
    try {
      await send(q, mode);
    } catch {
      // error in store
    }
  };

  if (readiness.state !== 'ready') {
    return <FeatureGate>{null}</FeatureGate>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-indigo-300" />
          <span className="text-sm font-medium text-white">AI Chat</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
            {(['concise', 'deep', 'interview'] as ChatMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={twMerge(
                  clsx(
                    'rounded-md px-2 py-0.5 text-[10px] capitalize transition-colors',
                    mode === m ? 'bg-indigo-500/25 text-white' : 'text-white/45 hover:text-white'
                  )
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <button type="button" onClick={clear} className="rounded-lg p-1.5 text-white/40 hover:bg-white/8 hover:text-white" title="Clear">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <RagStatusBanner />

      {keywordOnly && (
        <div className="mx-4 mt-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-100">
          {hasApiKey ? (
            <>
              Keyword search mode — Gemini AI is still used for answers. If you see transcript-only
              replies, your API quota may be temporarily exceeded. Wait a few minutes and retry.
            </>
          ) : (
            <>Add a Google AI Studio API key in Settings for AI-powered answers.</>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
            <Bot className="mx-auto h-8 w-8 text-indigo-300/80" />
            <p className="mt-2 text-sm font-medium text-white/90">Ask anything about this lecture</p>
            <p className="mt-1 text-xs text-white/45">Answers include clickable timestamps from the transcript.</p>
            <div className="mt-4 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void handleSend(s)}
                  className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-left text-xs text-white/70 hover:border-indigo-400/30 hover:bg-indigo-500/10 hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={twMerge(
              clsx('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')
            )}
          >
            <div
              className={twMerge(
                clsx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  msg.role === 'user' ? 'bg-indigo-500/30' : 'bg-white/8'
                )
              )}
            >
              {msg.role === 'user' ? (
                <User className="h-3.5 w-3.5 text-indigo-100" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-indigo-200" />
              )}
            </div>

            <div
              className={twMerge(
                clsx(
                  'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6',
                  msg.role === 'user'
                    ? 'bg-indigo-500/20 text-white'
                    : 'border border-white/8 bg-white/[0.04] text-white/90'
                )
              )}
            >
              {msg.content || (loading && msg.role === 'assistant' ? (
                <span className="inline-flex items-center gap-2 text-white/50">
                  <Loader label="Thinking…" />
                </span>
              ) : '')}

              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1 border-t border-white/10 pt-2">
                  {msg.citations.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onJumpToTime(c.startTime)}
                      className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-100 hover:bg-indigo-500/25"
                    >
                      <Clock className="h-3 w-3" />
                      {formatTime(c.startTime)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 pb-1 text-xs text-red-300">{error}</p>}

      <div className="border-t border-white/8 p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void handleSend())}
            placeholder="Ask about this lecture…"
            disabled={loading}
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-indigo-400/40 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
            className="rounded-xl bg-indigo-500 px-3.5 py-2 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
