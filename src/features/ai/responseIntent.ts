import type { ChatMode } from '@/features/chat/chat.service';

export type ResponseIntent = 'summary' | 'bullets' | 'interview' | 'explain';

const SUMMARY_RE =
  /\b(summarize|summary|main points|key points|tl;dr|overview|recap|in a nutshell)\b/i;
const BULLET_RE = /\b(\d+)\s*(bullet|point)s?\b|\bbullet\s*points?\b/i;
const INTERVIEW_RE = /\b(interview|mock interview|q\s*&\s*a|qa prep)\b/i;

export function detectResponseIntent(query: string, uiMode: ChatMode): ResponseIntent {
  const q = query.trim();

  if (SUMMARY_RE.test(q) || BULLET_RE.test(q)) {
    if (BULLET_RE.test(q) || /\bbullet/i.test(q)) return 'bullets';
    return 'summary';
  }

  if (uiMode === 'interview' || INTERVIEW_RE.test(q)) {
    return 'interview';
  }

  if (uiMode === 'deep') return 'explain';
  return 'explain';
}

export function bulletCountFromQuery(query: string): number | null {
  const m = query.match(/\b(\d+)\s*(?:bullet|point)s?\b/i);
  if (m) return Math.min(12, Math.max(3, parseInt(m[1]!, 10)));
  if (/\b(five|5)\b/i.test(query) && /bullet|point/i.test(query)) return 5;
  return null;
}

export function intentInstructions(intent: ResponseIntent, query: string): string {
  const n = bulletCountFromQuery(query);

  switch (intent) {
    case 'bullets':
      return [
        'FORMAT — Bullet summary (STRICT):',
        `- Exactly ${n ?? 5} markdown bullets, each starting with **Topic:**`,
        '- One concrete fact per bullet from the VIDEO transcript (translate Hindi/Hinglish to English).',
        '- NO Q&A. NO "Here are interview questions". NO preamble longer than one line.',
        '- First line: one English sentence stating what the lecture covers.',
      ].join('\n');
    case 'summary':
      return [
        'FORMAT — Short summary (STRICT):',
        '- 1 opening sentence + 4–6 markdown bullets OR one tight paragraph (max 120 words).',
        '- English only. Translate any Hindi/Hinglish from the transcript.',
        '- NO Q&A format. Answer the summarization request directly.',
      ].join('\n');
    case 'interview':
      return [
        'FORMAT — Interview prep (only because user asked):',
        '- 4–6 **Q:** / **A:** pairs in English.',
        '- Answers: transcript facts first, then "Background:" for general CS.',
      ].join('\n');
    case 'explain':
    default:
      return [
        'FORMAT — Direct answer:',
        '- Lead with the answer in 1–3 English sentences.',
        '- Then bullets or short sections as needed. NO generic Q&A unless user asked for interview prep.',
      ].join('\n');
  }
}
