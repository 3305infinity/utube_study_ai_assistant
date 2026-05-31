import type { ReactNode } from 'react';

/** Lightweight markdown renderer — no extra dependencies. */

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
          className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em] text-indigo-100"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

export function MarkdownView({ content }: { content: string }) {
  const lines = content.replace(/\r/g, '').split('\n');
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="my-2 ml-4 list-disc space-y-1 text-sm text-white/85">
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

    if (trimmed.startsWith('### ')) {
      nodes.push(
        <h4 key={nodes.length} className="mb-1 mt-4 text-sm font-semibold text-white">
          {inlineFormat(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      nodes.push(
        <h3 key={nodes.length} className="mb-2 mt-4 text-base font-semibold text-white">
          {inlineFormat(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      nodes.push(
        <h2 key={nodes.length} className="mb-2 mt-2 text-lg font-semibold text-white">
          {inlineFormat(trimmed.slice(2))}
        </h2>
      );
    } else {
      nodes.push(
        <p key={nodes.length} className="my-1.5 text-sm leading-7 text-white/85">
          {inlineFormat(trimmed)}
        </p>
      );
    }
  }

  flushList();
  return <div className="markdown-view">{nodes}</div>;
}
