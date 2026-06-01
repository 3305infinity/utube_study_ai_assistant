import { DbIds, ensureDbReady, getDb, nowMs } from '@lib/db';
import { readPlaylistFromPage, scrapePlaylistVideosFromPage } from '@lib/playlist';
import type { PlaylistInfo, SemanticChunk } from '@/types/ai';
import { GEMINI } from '@lib/constants';

export async function syncPlaylistFromPage(): Promise<PlaylistInfo | null> {
  const info = readPlaylistFromPage();
  if (!info) return null;

  await ensureDbReady();
  const ts = nowMs();
  const existing = await getDb().playlists.get(DbIds.playlist(info.playlistId));
  const mergedIds = [...new Set([...(existing?.videoIds ?? []), ...info.videoIds])];
  const page = readPlaylistFromPage();
  const videoTitles = { ...(existing?.videoTitles ?? {}) };
  if (page) {
    for (const v of scrapePlaylistVideosFromPage()) {
      videoTitles[v.videoId] = v.title;
    }
    const cur = new URL(window.location.href).searchParams.get('v');
    if (cur) {
      videoTitles[cur] =
        document.querySelector('h1 yt-formatted-string, h1')?.textContent?.trim() ?? cur;
    }
  }

  await getDb().playlists.put({
    id: DbIds.playlist(info.playlistId),
    title: info.title || existing?.title || 'Playlist',
    videoIds: mergedIds,
    videoTitles,
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
    schemaVersion: 2,
  });

  return { ...info, videoIds: mergedIds };
}

export async function getPlaylist(playlistId: string): Promise<PlaylistInfo | null> {
  await ensureDbReady();
  const row = await getDb().playlists.get(DbIds.playlist(playlistId));
  if (!row) return null;
  return {
    playlistId,
    title: row.title,
    videoIds: row.videoIds,
  };
}

export async function registerVideoInPlaylist(
  playlistId: string,
  videoId: string,
  videoTitle?: string
): Promise<void> {
  await ensureDbReady();
  const id = DbIds.playlist(playlistId);
  const row = await getDb().playlists.get(id);
  const ts = nowMs();
  const videoIds = [...new Set([...(row?.videoIds ?? []), videoId])];
  const videoTitles = { ...(row?.videoTitles ?? {}) };
  if (videoTitle) videoTitles[videoId] = videoTitle;

  await getDb().playlists.put({
    id,
    title: row?.title ?? 'Playlist',
    videoIds,
    videoTitles,
    createdAt: row?.createdAt ?? ts,
    updatedAt: ts,
    schemaVersion: 2,
  });
}

/** Load all indexed chunks for every video in a playlist (playlist-level RAG corpus). */
export async function loadPlaylistChunks(playlistId: string): Promise<SemanticChunk[]> {
  await ensureDbReady();
  const playlist = await getDb().playlists.get(DbIds.playlist(playlistId));
  if (!playlist?.videoIds.length) return [];

  const all: SemanticChunk[] = [];
  const embeddings = await getDb().embeddings.toArray();
  const embByVideoChunk = new Map<string, number[]>();

  for (const e of embeddings) {
    if (e.model === GEMINI.EMBEDDING_MODEL || e.model === 'keyword-only') {
      embByVideoChunk.set(`${e.videoId}|${e.semanticChunkId}`, e.vector);
    }
  }

  for (const videoId of playlist.videoIds) {
    const rows = await getDb().semanticChunks.where('videoId').equals(videoId).toArray();
    const title = playlist.videoTitles[videoId];
    for (const r of rows) {
      all.push({
        id: r.semanticChunkId,
        text: r.text,
        startTime: r.startTime,
        endTime: r.endTime,
        transcriptChunkIds: r.transcriptChunkIds,
        embedding: embByVideoChunk.get(`${videoId}|${r.semanticChunkId}`) ?? null,
        videoId,
        videoTitle: r.videoTitle ?? title,
        playlistId,
      });
    }
  }

  return all;
}

export async function countIndexedPlaylistVideos(playlistId: string): Promise<number> {
  const chunks = await loadPlaylistChunks(playlistId);
  const videos = new Set(chunks.map((c) => c.videoId).filter(Boolean));
  return videos.size;
}
