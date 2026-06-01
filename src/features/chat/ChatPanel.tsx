import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, MessageSquare, Send, Sparkles, Trash2, Clock, User } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { useChat } from '@/hooks/useChat';
import { useSettingsStore } from '@/store/settings.store';
import { useRagStore } from '@/store/rag.store';
import { formatTime } from '@lib/youtube';
import { Loader } from '@/components/Loader';
import { FeatureGate } from '@/components/FeatureGate';
import { MarkdownView } from '@/components/MarkdownView';
import type { ChatMode } from '@/features/chat/chat.service';
import { useAiReadiness, useHasApiKey } from '@/hooks/useAiReadiness';

const SUGGESTIONS = [
  'Which companies or topics are mentioned in this video?',
  'Summarize the main points in 5 bullets',
  'What opportunities or roles are discussed?',
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
      <div className="border-b border-white/10 bg-gradient-to-r from-indigo-500/10 via-transparent to-violet-500/10 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/40 to-violet-600/30 shadow-glow ring-1 ring-white/10">
              <MessageSquare className="h-4 w-4 text-indigo-100" />
            </div>
            <div>
              <span className="text-sm font-semibold text-white">AI Chat</span>
              <p className="text-[10px] text-white/45">Answers grounded in this video&apos;s transcript</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-white/10 bg-black/20 p-0.5 backdrop-blur-sm">
              {(['concise', 'deep', 'interview'] as ChatMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={twMerge(
                    clsx(
                      'rounded-lg px-2.5 py-1 text-[10px] font-medium capitalize transition-all',
                      mode === m
                        ? 'bg-gradient-to-r from-indigo-500/50 to-violet-500/40 text-white shadow-sm'
                        : 'text-white/45 hover:text-white/80'
                    )
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={clear}
              className="rounded-xl border border-white/10 p-2 text-white/40 hover:bg-white/8 hover:text-white"
              title="Clear chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {!hasApiKey && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 to-orange-500/10 px-3 py-2.5 text-[11px] leading-5 text-amber-50">
          Add a Google AI Studio API key in <strong className="font-medium">Settings</strong> for full AI answers.
          Without it, replies are transcript excerpts only.
        </div>
      )}

      {hasApiKey && (
        <div className="mx-4 mt-3 rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-3 py-2 text-[11px] leading-5 text-indigo-100/90">
          Tutor mode: this video&apos;s transcript + general knowledge (definitions, DSA, interview angles).
          {keywordOnly ? ' Transcript search is local; Gemini adds explanations.' : ''}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-6 text-center shadow-inner">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 ring-1 ring-indigo-400/30">
              <Sparkles className="h-6 w-6 text-indigo-200" />
            </div>
            <p className="mt-3 text-base font-semibold text-white">Ask about this lecture</p>
            <p className="mt-1.5 text-xs leading-5 text-white/50">
              Names like companies, people, and roles are searched across the full transcript.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void handleSend(s)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-xs leading-5 text-white/75 transition-colors hover:border-indigo-400/35 hover:bg-indigo-500/12 hover:text-white"
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
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={twMerge(clsx('flex gap-2.5', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'))}
          >
            <div
              className={twMerge(
                clsx(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1',
                  msg.role === 'user'
                    ? 'bg-indigo-500/35 ring-indigo-400/25'
                    : 'bg-white/[0.06] ring-white/10'
                )
              )}
            >
              {msg.role === 'user' ? (
                <User className="h-4 w-4 text-indigo-100" />
              ) : (
                <Bot className="h-4 w-4 text-indigo-200" />
              )}
            </div>

            <div
              className={twMerge(
                clsx(
                  'max-w-[90%] rounded-2xl px-4 py-3',
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-indigo-600/35 to-violet-600/25 text-[15px] leading-relaxed text-white ring-1 ring-indigo-400/20'
                    : 'border border-white/10 bg-surface-raised/80 text-white/92 shadow-sm backdrop-blur-sm'
                )
              )}
            >
              {msg.role === 'assistant' && msg.content ? (
                <MarkdownView content={msg.content} variant="notes" />
              ) : msg.role === 'user' ? (
                <p className="text-[15px] leading-relaxed">{msg.content}</p>
              ) : loading ? (
                <Loader label="Searching transcript…" />
              ) : null}

              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-white/40">
                    Jump to moment
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {msg.citations.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onJumpToTime(c.startTime)}
                        className="group flex items-start gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2 text-left hover:border-indigo-400/30 hover:bg-indigo-500/10"
                      >
                        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-100">
                          <Clock className="h-3 w-3" />
                          {formatTime(c.startTime)}
                        </span>
                        <span className="line-clamp-2 text-[11px] leading-4 text-white/55 group-hover:text-white/75">
                          {c.excerpt}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mx-4 mb-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      <div className="border-t border-white/10 bg-surface-raised/50 p-3 backdrop-blur-md">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void handleSend())}
            placeholder="e.g. Did they mention BlackRock?"
            disabled={loading}
            className="flex-1 rounded-xl border border-white/12 bg-black/25 px-3.5 py-2.5 text-sm text-white shadow-inner placeholder:text-white/30 focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2.5 text-white shadow-lg shadow-indigo-500/25 transition-opacity hover:opacity-95 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
