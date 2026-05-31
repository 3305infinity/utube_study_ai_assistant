/**
 * Relay page-level StudyFlow events into the sidebar iframe.
 */

import { STUDYFLOW_EVENTS } from '@lib/constants';

const IFRAME_ID = 'yt-studyflow-iframe';

const RELAY_EVENTS = [
  STUDYFLOW_EVENTS.TIME_UPDATE,
  STUDYFLOW_EVENTS.PLAYER_EVENT,
  STUDYFLOW_EVENTS.HEATMAP_UPDATE,
  STUDYFLOW_EVENTS.CONFUSION_UPDATE,
  'yt-studyflow-pause-duration',
] as const;

function relayToIframe(event: Event): void {
  const iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;
  const target = iframe?.contentWindow;
  if (!target) return;

  const detail = (event as CustomEvent).detail;
  target.dispatchEvent(new CustomEvent(event.type, { detail }));
}

export function setupIframeEventBridge(): () => void {
  const handlers = RELAY_EVENTS.map((type) => {
    const handler = (e: Event) => relayToIframe(e);
    window.addEventListener(type, handler);
    return { type, handler };
  });

  return () => {
    handlers.forEach(({ type, handler }) => window.removeEventListener(type, handler));
  };
}
