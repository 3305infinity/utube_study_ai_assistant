import { useEffect, useState } from 'react';
import { FileText, Plus, Sparkles, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { useNotesStore } from './notes.store';
import { useRagStore } from '@/store/rag.store';
import { useVideoStore } from '@/store/video.store';
import { useSettingsStore } from '@/store/settings.store';
import type { NoteType } from '@/types/notes';
import { Loader } from '@/components/Loader';
import { FeatureGate } from '@/components/FeatureGate';
import { MarkdownView } from '@/components/MarkdownView';
import { useAiReadiness } from '@/hooks/useAiReadiness';

const NOTE_TYPES: Array<{ id: NoteType; label: string; desc: string }> = [
  { id: 'concise', label: 'Concise', desc: 'Quick summary' },
  { id: 'detailed', label: 'Detailed', desc: 'Full breakdown' },
  { id: 'interview', label: 'Interview', desc: 'Q&A style' },
  { id: 'revision', label: 'Revision', desc: 'Exam-focused' },
];

export function NotesPanel({ videoId }: { videoId: string }) {
  const { notes, loading, error, load, generate, remove } = useNotesStore();
  const chunks = useRagStore((s) => s.chunks);
  const title = useVideoStore((s) => s.title);
  const defaultNoteType = useSettingsStore((s) => s.defaultNoteType);
  const [selected, setSelected] = useState<string | null>(null);
  const readiness = useAiReadiness();

  useEffect(() => {
    void load(videoId);
  }, [videoId, load]);

  useEffect(() => {
    if (notes.length && !selected) setSelected(notes[0]!.id);
  }, [notes, selected]);

  const active = notes.find((n) => n.id === selected) ?? notes[0];

  const handleGenerate = (type: NoteType) => {
    void generate({ videoId, type, chunks, videoTitle: title ?? undefined });
  };

  if (readiness.state !== 'ready') {
    return <FeatureGate>{null}</FeatureGate>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/8 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-white">AI Notes</p>
            <p className="text-[11px] text-white/45">Generated from transcript context</p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleGenerate(defaultNoteType)}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-500/25 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500/35 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            New {defaultNoteType}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {NOTE_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={loading}
              onClick={() => handleGenerate(t.id)}
              className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2 text-left hover:border-indigo-400/25 hover:bg-indigo-500/10 disabled:opacity-40"
            >
              <p className="text-[11px] font-medium capitalize text-white">{t.label}</p>
              <p className="text-[10px] text-white/40">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="border-b border-white/8 p-4">
          <Loader label="Generating notes…" />
        </div>
      )}
      {error && <p className="border-b border-white/8 px-4 py-2 text-xs text-red-300">{error}</p>}

      <div className="flex min-h-0 flex-1">
        <div className="w-[38%] shrink-0 overflow-y-auto border-r border-white/8 p-2">
          {notes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setSelected(n.id)}
              className={twMerge(
                clsx(
                  'mb-1 w-full rounded-xl px-2.5 py-2.5 text-left transition-colors',
                  active?.id === n.id
                    ? 'bg-indigo-500/20 ring-1 ring-indigo-400/30'
                    : 'hover:bg-white/[0.05]'
                )
              )}
            >
              <div className="flex items-center gap-1.5 text-indigo-200/80">
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate text-[11px] font-medium capitalize text-white/90">
                  {n.type}
                </span>
              </div>
              <p className="mt-1 truncate text-[10px] text-white/45">{n.title}</p>
            </button>
          ))}

          {!notes.length && !loading && (
            <div className="flex flex-col items-center py-8 text-center">
              <Sparkles className="h-6 w-6 text-indigo-300/60" />
              <p className="mt-2 text-[11px] text-white/40">No notes yet</p>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {active ? (
            <>
              <div className="mb-5 flex items-start justify-between gap-2 border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-semibold leading-snug tracking-tight text-white">
                    {active.title}
                  </h3>
                  <p className="mt-1 text-xs capitalize text-white/45">{active.type} notes</p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(active.id, videoId)}
                  className="rounded-lg p-1.5 text-white/35 hover:bg-red-500/15 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <MarkdownView content={active.content} variant="notes" />
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <Sparkles className="mx-auto h-7 w-7 text-indigo-300/70" />
                <p className="mt-2 text-sm text-white/50">Generate your first note set</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
