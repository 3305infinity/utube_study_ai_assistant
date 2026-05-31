import type { RawCue } from './transcript.parser.types';

export type { RawCue };

function segText(seg: Record<string, unknown>): string {
  return String(seg.utf8 ?? seg.utf8Text ?? seg.text ?? '');
}

export function parseJson3(text: string): RawCue[] | null {
  try {
    const json = JSON.parse(text) as { events?: Array<Record<string, unknown>> };
    if (!Array.isArray(json.events)) return null;

    const cues: RawCue[] = [];

    for (let i = 0; i < json.events.length; i++) {
      const event = json.events[i]!;
      const startMs = Number(event.tStartMs ?? 0);
      const nextStartMs = Number(json.events[i + 1]?.tStartMs ?? 0);
      const durationMs =
        Number(event.dDurationMs ?? 0) ||
        (nextStartMs > startMs ? nextStartMs - startMs : 2000);

      const segs = Array.isArray(event.segs) ? event.segs : [];
      if (!segs.length) continue;

      let combined = '';
      for (const seg of segs as Array<Record<string, unknown>>) {
        combined += segText(seg);
      }
      combined = combined.replace(/\n/g, ' ').trim();
      if (!combined) continue;

      cues.push({
        start: startMs / 1000,
        duration: Math.max(durationMs / 1000, 0.05),
        text: combined,
      });
    }

    if (cues.length) return cues;

    // Word-by-word ASR: one segment per event
    for (let i = 0; i < json.events.length; i++) {
      const event = json.events[i]!;
      const segs = Array.isArray(event.segs) ? event.segs : [];
      for (const seg of segs as Array<Record<string, unknown>>) {
        const textPart = segText(seg).replace(/\n/g, ' ').trim();
        if (!textPart) continue;

        const startMs = Number(event.tStartMs ?? seg.startMs ?? 0);
        const durationMs = Number(
          seg.dDurationMs ?? seg.durationMs ?? event.dDurationMs ?? 500
        );

        cues.push({
          start: startMs / 1000,
          duration: Math.max(durationMs / 1000, 0.05),
          text: textPart,
        });
      }
    }

    return cues.length ? cues : null;
  } catch {
    return null;
  }
}

export function looksLikeTranscriptPayload(text: string, contentType: string): boolean {
  if (!text?.trim()) return false;
  if (/^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) return false;
  if (contentType.includes('vtt') || text.includes('WEBVTT')) return true;
  if (text.includes('<text') && text.includes('start=')) return true;
  if (text.includes('transcriptSegmentRenderer')) return true;

  try {
    const json = JSON.parse(text) as { events?: unknown[] };
    if (Array.isArray(json.events) && json.events.length > 0) return true;
  } catch {
    // not json
  }

  return false;
}

export function parseVtt(text: string): RawCue[] {
  const cues: RawCue[] = [];
  const lines = text.replace(/\r/g, '').split('\n');

  const toSeconds = (ts: string): number | null => {
    const parts = ts.trim().split(':');
    if (parts.length === 2) {
      const [m, sPart] = parts;
      const [s, ms = '0'] = (sPart ?? '0').split('.');
      return Number(m) * 60 + Number(s) + Number(ms) / 1000;
    }
    if (parts.length === 3) {
      const [h, m, sPart] = parts;
      const [s, ms = '0'] = (sPart ?? '0').split('.');
      return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
    }
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    if (!line.includes('-->')) continue;

    const [startRaw, endRaw] = line.split('-->').map((p) => p.trim().split(' ')[0] ?? '');
    const start = toSeconds(startRaw ?? '');
    const end = toSeconds(endRaw ?? '');
    i++;

    const textLines: string[] = [];
    while (i < lines.length && lines[i]?.trim()) {
      textLines.push(lines[i]!.replace(/<[^>]+>/g, '').trim());
      i++;
    }

    const cueText = textLines.join(' ').trim();
    if (start !== null && end !== null && end > start && cueText) {
      cues.push({ start, duration: end - start, text: cueText });
    }
  }

  return cues;
}

export function parseXml(text: string): RawCue[] {
  const cues: RawCue[] = [];
  const re = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text))) {
    const start = Number(match[1]) / 1000;
    const duration = Number(match[2]) / 1000;
    const cueText = (match[3] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();

    if (Number.isFinite(start) && Number.isFinite(duration) && duration > 0 && cueText) {
      cues.push({ start, duration, text: cueText });
    }
  }

  return cues;
}

function collectInnertubeSegments(node: unknown, out: RawCue[]): void {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) collectInnertubeSegments(item, out);
    return;
  }

  const obj = node as Record<string, unknown>;

  if (obj.transcriptSegmentRenderer) {
    const seg = obj.transcriptSegmentRenderer as Record<string, unknown>;
    const startMs = Number(seg.startMs ?? 0);
    const endMs = Number(seg.endMs ?? startMs + 2000);
    const snippet = seg.snippet as Record<string, unknown> | undefined;
    const runs = snippet?.runs as Array<{ text?: string }> | undefined;
    const text = runs?.map((r) => r.text ?? '').join('').trim() ?? '';
    if (text) {
      out.push({
        start: startMs / 1000,
        duration: Math.max((endMs - startMs) / 1000, 0.05),
        text,
      });
    }
  }

  if (obj.cueGroup) {
    const group = obj.cueGroup as Record<string, unknown>;
    collectInnertubeSegments(group, out);
  }

  if (obj.transcriptCueGroupRenderer) {
    const group = obj.transcriptCueGroupRenderer as Record<string, unknown>;
    const cues = group.cues as unknown[] | undefined;
    if (Array.isArray(cues)) {
      for (const cue of cues) collectInnertubeSegments(cue, out);
    }
  }

  for (const value of Object.values(obj)) {
    collectInnertubeSegments(value, out);
  }
}

export function parseInnertubeTranscript(data: Record<string, unknown>): RawCue[] | null {
  const cues: RawCue[] = [];
  collectInnertubeSegments(data, cues);
  if (!cues.length) return null;
  cues.sort((a, b) => a.start - b.start);
  return cues;
}

export function parseCaptionPayload(text: string, contentType: string): RawCue[] | null {
  if (!text) return null;
  if (/^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) return null;

  if (contentType.includes('vtt') || text.includes('WEBVTT')) {
    const vtt = parseVtt(text);
    return vtt.length ? vtt : null;
  }

  const json3 = parseJson3(text);
  if (json3?.length) return json3;

  const xml = parseXml(text);
  return xml.length ? xml : null;
}

export function extractFromDomPanel(): RawCue[] {
  const selectors = [
    'ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer',
    'ytd-transcript-segment-renderer',
    '#segments-container ytd-transcript-segment-renderer',
  ];

  let segments: NodeListOf<Element> | null = null;
  for (const sel of selectors) {
    const found = document.querySelectorAll(sel);
    if (found.length) {
      segments = found;
      break;
    }
  }

  if (!segments?.length) return [];

  const cues: RawCue[] = [];
  segments.forEach((seg) => {
    const timeEl =
      seg.querySelector('.segment-timestamp') ??
      seg.querySelector('[class*="timestamp"]') ??
      seg.querySelector('div.content.style-scope.ytd-transcript-segment-renderer > div:first-child');

    const textEl =
      seg.querySelector('yt-formatted-string.segment-text') ??
      seg.querySelector('.segment-text') ??
      seg.querySelector('yt-formatted-string');

    const timeStr = timeEl?.textContent?.trim() ?? '';
    let text = textEl?.textContent?.trim() ?? '';
    if (!text) {
      text = (seg.textContent ?? '').replace(timeStr, '').trim();
    }
    if (!text) return;

    const parts = timeStr.split(':').map((p) => parseInt(p, 10));
    let start = 0;
    if (parts.length === 2 && parts.every((n) => !Number.isNaN(n))) {
      start = parts[0]! * 60 + parts[1]!;
    } else if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
      start = parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
    }

    cues.push({ start, duration: 2, text });
  });

  return cues;
}

async function tryOpenTranscriptPanel(): Promise<void> {
  const expandBtn = document.querySelector(
    'ytd-video-description-transcript-section-renderer button, button[aria-label*="transcript" i], button[aria-label*="Transcript" i]'
  );
  if (expandBtn instanceof HTMLElement) {
    expandBtn.click();
    await new Promise((r) => setTimeout(r, 900));
    return;
  }

  const showTranscript = document.querySelector(
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'
  );
  if (showTranscript instanceof HTMLElement) {
    showTranscript.click();
    await new Promise((r) => setTimeout(r, 900));
    return;
  }

  const moreBtn =
    document.querySelector('button[aria-label="More actions"]') ??
    document.querySelector('ytd-menu-renderer button[aria-label*="More"]') ??
    document.querySelector('#button-shape button');

  if (!(moreBtn instanceof HTMLElement)) return;
  moreBtn.click();
  await new Promise((r) => setTimeout(r, 300));

  const items = document.querySelectorAll(
    'ytd-menu-service-item-renderer, tp-yt-paper-item, ytd-engagement-panel-section-list-renderer'
  );
  for (const item of items) {
    const label = item.textContent?.toLowerCase() ?? '';
    if (label.includes('transcript') || label.includes('show transcript')) {
      (item as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 900));
      return;
    }
  }
}

export async function extractFromDomWithPanelOpen(): Promise<RawCue[]> {
  let cues = extractFromDomPanel();
  if (cues.length) return cues;

  await tryOpenTranscriptPanel();
  cues = extractFromDomPanel();
  return cues;
}
