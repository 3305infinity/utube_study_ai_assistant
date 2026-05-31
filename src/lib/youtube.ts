/**
 * YouTube page utilities — sidebar runs in Shadow DOM on the same page.
 */

export function getPageWindow(): Window {
  return window;
}

export function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);

    if (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch') {
      return urlObj.searchParams.get('v');
    }

    if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.slice(1) || null;
    }

    if (urlObj.pathname.startsWith('/embed/')) {
      return urlObj.pathname.split('/')[2] ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

export function getCurrentVideoId(): string | null {
  return extractVideoId(window.location.href);
}

export function isYouTubeWatchPage(): boolean {
  return (
    window.location.hostname.includes('youtube.com') &&
    window.location.pathname === '/watch'
  );
}

export function getYouTubePlayer(): HTMLVideoElement | null {
  return document.querySelector('video.html5-main-video');
}

export function seekTo(time: number): void {
  const player = getYouTubePlayer();
  if (!player || !Number.isFinite(time) || time < 0) return;
  try {
    player.currentTime = time;
    void player.play().catch(() => {});
  } catch {
    // ignore
  }
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function getVideoTitleFromPage(): string | null {
  const meta = document.querySelector('meta[name="title"]');
  if (meta?.getAttribute('content')) {
    return meta.getAttribute('content');
  }

  const h1 = document.querySelector(
    'h1.ytd-watch-metadata yt-formatted-string, h1 yt-formatted-string, #title h1'
  );
  return h1?.textContent?.trim() ?? null;
}

export function getChannelNameFromPage(): string | null {
  const el = document.querySelector(
    '#owner #channel-name yt-formatted-string, ytd-channel-name yt-formatted-string, ytd-video-owner-renderer #channel-name'
  );
  return el?.textContent?.trim() ?? null;
}

export function getVideoDurationFromPlayer(): number {
  return getYouTubePlayer()?.duration ?? 0;
}

export function getPageContextWindow(): Window {
  return window;
}
