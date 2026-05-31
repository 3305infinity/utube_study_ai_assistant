/**
 * Content script bootstrap — SPA-aware sidebar injection on YouTube watch pages.
 */

import { injectSidebar, removeSidebar } from './injectSidebar';
import { setupYouTubeEventTracking } from './youtubeEvents';
import { startConfusionTracker, stopConfusionTracker } from '@/features/confusion/confusionTracker';
import { getCurrentVideoId, isYouTubeWatchPage } from '@lib/youtube';

const HOST_ID = 'yt-studyflow-host';

let currentVideoId: string | null = null;
let cleanupEvents: (() => void) | null = null;
let cleanupConfusion: (() => void) | null = null;
let initTimer: ReturnType<typeof setTimeout> | null = null;

function initialize(force = false): void {
  if (!isYouTubeWatchPage()) return;

  if (initTimer) clearTimeout(initTimer);

  initTimer = setTimeout(() => {
    const videoId = getCurrentVideoId();
    if (!videoId) return;

    const sameVideo = videoId === currentVideoId;
    const hostExists = !!document.getElementById(HOST_ID);

    if (sameVideo && hostExists && !force) return;

    if (cleanupEvents) {
      cleanupEvents();
      cleanupEvents = null;
    }
    cleanupConfusion?.();

    if (!sameVideo) {
      removeSidebar();
    }

    injectSidebar(videoId);
    cleanupEvents = setupYouTubeEventTracking(videoId);
    cleanupConfusion = startConfusionTracker(videoId);
    currentVideoId = videoId;
  }, 500);
}

function watchNavigation(): void {
  initialize();

  const urlKey = () => location.pathname + location.search + location.hash;
  let lastKey = urlKey();

  const onNavigate = () => {
    const key = urlKey();
    if (key === lastKey) return;
    lastKey = key;
    currentVideoId = null;
    initialize(true);
  };

  window.addEventListener('popstate', onNavigate);
  window.addEventListener('yt-navigate-finish', onNavigate);

  const observer = new MutationObserver((mutations) => {
    const key = urlKey();
    if (key !== lastKey) {
      onNavigate();
      return;
    }

    const fromSidebar = mutations.some((m) => {
      const el = m.target as Node;
      return el instanceof Element && (el.closest(`#${HOST_ID}`) || el.id === HOST_ID);
    });
    if (fromSidebar) return;
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener('beforeunload', () => {
    cleanupEvents?.();
    cleanupConfusion?.();
    stopConfusionTracker();
    removeSidebar();
    observer.disconnect();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watchNavigation);
} else {
  watchNavigation();
}

export {};
