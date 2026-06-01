/**
 * YouTube playlist detection from the watch page (no API key).
 */

import type { PlaylistInfo } from '@/types/ai';

export function getPlaylistIdFromUrl(url = window.location.href): string | null {
  try {
    const list = new URL(url).searchParams.get('list');
    if (!list || list.startsWith('RD')) return null;
    return list;
  } catch {
    return null;
  }
}

export function getPlaylistTitleFromPage(): string | null {
  const el = document.querySelector(
    'ytd-playlist-panel-header-renderer #title, ytd-section-list-renderer #title, #title yt-formatted-string'
  );
  return el?.textContent?.trim() ?? null;
}

/** Scrape visible playlist panel entries on the watch page. */
export function scrapePlaylistVideosFromPage(): Array<{ videoId: string; title: string }> {
  const out: Array<{ videoId: string; title: string }> = [];
  const seen = new Set<string>();

  const rows = document.querySelectorAll(
    'ytd-playlist-panel-video-renderer, ytd-playlist-video-list-renderer'
  );

  rows.forEach((row) => {
    const link = row.querySelector('a#wc-endpoint, a.yt-simple-endpoint[href*="v="]') as HTMLAnchorElement | null;
    const href = link?.href ?? link?.getAttribute('href') ?? '';
    const match = href.match(/[?&]v=([^&]+)/);
    const videoId = match?.[1];
    if (!videoId || seen.has(videoId)) return;
    seen.add(videoId);
    const title =
      row.querySelector('#video-title')?.textContent?.trim() ??
      link?.getAttribute('title')?.trim() ??
      videoId;
    out.push({ videoId, title });
  });

  return out;
}

export function readPlaylistFromPage(): PlaylistInfo | null {
  const playlistId = getPlaylistIdFromUrl();
  if (!playlistId) return null;

  const scraped = scrapePlaylistVideosFromPage();
  const currentId = new URL(window.location.href).searchParams.get('v');
  const videoIds = scraped.map((v) => v.videoId);
  if (currentId && !videoIds.includes(currentId)) {
    videoIds.unshift(currentId);
  }

  const videoTitles: Record<string, string> = {};
  for (const v of scraped) videoTitles[v.videoId] = v.title;
  if (currentId && !videoTitles[currentId]) {
    videoTitles[currentId] = document.title.replace(' - YouTube', '').trim();
  }

  return {
    playlistId,
    title: getPlaylistTitleFromPage() ?? 'Playlist',
    videoIds: [...new Set(videoIds)],
  };
}

export function watchUrlFor(videoId: string, startSec?: number, playlistId?: string): string {
  const params = new URLSearchParams({ v: videoId });
  if (playlistId) params.set('list', playlistId);
  if (startSec != null && startSec > 0) params.set('t', `${Math.floor(startSec)}s`);
  return `https://www.youtube.com/watch?${params.toString()}`;
}
