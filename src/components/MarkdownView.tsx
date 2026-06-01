import type { ReactNode } from 'react';

/** Lightweight markdown renderer — tuned for readable study notes. */

function inlineFormat(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[0.9em] text-indigo-100"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(
        <em key={match.index} className="text-white/90">
          {token.slice(1, -1)}
        </em>
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

export function MarkdownView({ content, variant = 'default' }: { content: string; variant?: 'default' | 'notes' }) {
  const isNotes = variant === 'notes';
  const lines = content.replace(/\r/g, '').split('\n');
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    nodes.push(
      <ul
        key={`ul-${nodes.length}`}
        className={
          isNotes
            ? 'my-3 ml-5 list-disc space-y-2 text-[15px] leading-relaxed text-white/88 marker:text-indigo-300/80'
            : 'my-2 ml-4 list-disc space-y-1 text-sm text-white/85'
        }
      >
        {listItems.map((item, i) => (
          <li key={i}>{inlineFormat(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*]\s+/, ''));
      continue;
    }

    flushList();

    if (trimmed.startsWith('#### ')) {
      nodes.push(
        <h5
          key={nodes.length}
          className={
            isNotes
              ? 'mb-2 mt-5 text-sm font-semibold tracking-wide text-indigo-200/95'
              : 'mb-1 mt-3 text-sm font-semibold text-white'
          }
        >
          {inlineFormat(trimmed.slice(5))}
        </h5>
      );
    } else if (trimmed.startsWith('### ')) {
      nodes.push(
        <h4
          key={nodes.length}
          className={
            isNotes
              ? 'mb-2 mt-6 border-b border-white/10 pb-1.5 text-base font-semibold text-white'
              : 'mb-1 mt-4 text-sm font-semibold text-white'
          }
        >
          {inlineFormat(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      nodes.push(
        <h3
          key={nodes.length}
          className={
            isNotes
              ? 'mb-3 mt-7 text-lg font-semibold tracking-tight text-white'
              : 'mb-2 mt-4 text-base font-semibold text-white'
          }
        >
          {inlineFormat(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      nodes.push(
        <h2
          key={nodes.length}
          className={
            isNotes
              ? 'mb-3 mt-2 text-xl font-bold tracking-tight text-white'
              : 'mb-2 mt-2 text-lg font-semibold text-white'
          }
        >
          {inlineFormat(trimmed.slice(2))}
        </h2>
      );
    } else if (trimmed.startsWith('> ')) {
      nodes.push(
        <blockquote
          key={nodes.length}
          className="my-3 border-l-2 border-indigo-400/50 bg-white/[0.04] py-2 pl-4 pr-2 text-[15px] leading-relaxed text-white/80"
        >
          {inlineFormat(trimmed.slice(2))}
        </blockquote>
      );
    } else {
      nodes.push(
        <p
          key={nodes.length}
          className={
            isNotes
              ? 'my-2.5 text-[15px] leading-[1.8] text-white/88'
              : 'my-1.5 text-sm leading-7 text-white/85'
          }
        >
          {inlineFormat(trimmed)}
        </p>
      );
    }
  }

  flushList();
  return (
    <div
      className={
        isNotes
          ? 'markdown-view notes-prose max-w-none font-[Inter,Segoe_UI,system-ui,sans-serif] antialiased'
          : 'markdown-view'
      }
    >
      {nodes}
    </div>
  );
}
