/**
 * InnerTube API helpers — /next for transcript params, /get_transcript for cues.
 */

import { getInnertubeContext, getTranscriptInnertubeParams } from './transcript.captions';
import { fetchViaPageContext } from './transcript.pageFetch';

function getInnertubeHeaders(): Record<string, string> {
  const ytcfg = (window as { ytcfg?: { data_?: Record<string, unknown> } }).ytcfg?.data_;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const visitor = ytcfg?.VISITOR_DATA;
  if (typeof visitor === 'string' && visitor) {
    headers['X-Goog-Visitor-Id'] = visitor;
  }

  const clientVersion =
    ytcfg?.INNERTUBE_CLIENT_VERSION ??
    (ytcfg?.INNERTUBE_CONTEXT as { client?: { clientVersion?: string } } | undefined)?.client
      ?.clientVersion;

  if (clientVersion) {
    headers['X-YouTube-Client-Version'] = String(clientVersion);
  }

  headers['X-YouTube-Client-Name'] = '1';

  return headers;
}

async function innertubePost(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const url = `https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`;
  const body = JSON.stringify(payload);
  const headers = getInnertubeHeaders();

  try {
    const resp = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body,
    });
    if (resp.ok) {
      return (await resp.json()) as Record<string, unknown>;
    }
  } catch {
    // fall through
  }

  const page = await fetchViaPageContext(url, 'POST', body, headers);
  if (page.ok && page.text) {
    try {
      return JSON.parse(page.text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return null;
}

export async function fetchTranscriptParamsViaNext(
  videoId: string,
  player: Record<string, unknown> | null
): Promise<string | null> {
  const fromPage = getTranscriptInnertubeParams(player);
  if (fromPage) return fromPage;

  const initialData = (window as { ytInitialData?: Record<string, unknown> }).ytInitialData;
  const fromInitial = getTranscriptInnertubeParams(initialData ?? null);
  if (fromInitial) return fromInitial;

  const context = getInnertubeContext();
  const payload: Record<string, unknown> = {
    context,
    videoId,
    racyCheckOk: false,
    contentCheckOk: false,
  };

  const next = await innertubePost('next', payload);
  if (!next) return null;

  return getTranscriptInnertubeParams(next);
}

export async function fetchInnertubeTranscriptData(
  params: string
): Promise<Record<string, unknown> | null> {
  return innertubePost('get_transcript', {
    context: getInnertubeContext(),
    params,
  });
}
