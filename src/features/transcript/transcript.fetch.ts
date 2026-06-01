/**

 * Fetch transcript text via page transport, captured player requests, and InnerTube.

 */



import {

  decodeTrackUrl,

  normalizeCaptionUrl,

} from './transcript.captions';

import {

  fetchViaPageContext,

  fetchViaPageTransport,

  getCapturedCaptions,

  triggerPlayerCaptions,

} from './transcript.pageFetch';

import { looksLikeTranscriptPayload } from './transcript.parsers';



type FetchAttempt = {

  ok: boolean;

  text: string;

  contentType: string;

  via: string;

  error?: string;

};



function pickBestAttempt(attempts: FetchAttempt[]): FetchAttempt {

  const nonHtml = attempts.filter(

    (a) => a.text && !/^\s*<!doctype html/i.test(a.text) && !/^\s*<html/i.test(a.text)

  );



  const valid = nonHtml.filter((a) => looksLikeTranscriptPayload(a.text, a.contentType));

  if (valid.length) {

    return valid.sort((a, b) => b.text.length - a.text.length)[0]!;

  }



  const longest = nonHtml.sort((a, b) => b.text.length - a.text.length)[0];

  if (longest) return longest;



  return { ok: false, text: '', contentType: '', via: 'none' };

}



export async function fetchFromCapturedCache(baseUrl?: string): Promise<{

  ok: boolean;

  text: string;

  contentType: string;

  via?: string;

}> {

  const captured = await getCapturedCaptions();

  if (!captured.length) return { ok: false, text: '', contentType: '' };



  const decoded = baseUrl ? decodeTrackUrl(baseUrl) : '';

  const videoMatch = decoded.match(/[?&]v=([^&]+)/)?.[1];



  for (const cap of captured) {

    if (decoded && cap.url.includes(decoded.split('?')[0] ?? '')) {

      if (looksLikeTranscriptPayload(cap.text, cap.contentType)) {

        return { ok: true, text: cap.text, contentType: cap.contentType, via: 'captured-url' };

      }

    }

    if (videoMatch && cap.url.includes(videoMatch)) {

      if (looksLikeTranscriptPayload(cap.text, cap.contentType)) {

        return { ok: true, text: cap.text, contentType: cap.contentType, via: 'captured-video' };

      }

    }

  }



  for (const cap of captured) {

    if (looksLikeTranscriptPayload(cap.text, cap.contentType)) {

      return { ok: true, text: cap.text, contentType: cap.contentType, via: 'captured-any' };

    }

  }



  return { ok: false, text: '', contentType: '' };

}



export async function fetchCaptionText(url: string): Promise<{

  ok: boolean;

  text: string;

  contentType: string;

  via?: string;

}> {

  const captured = await fetchFromCapturedCache(url);

  if (captured.ok) return captured;



  const attempts: FetchAttempt[] = [];



  const transport = await fetchViaPageTransport(url);

  attempts.push({ ...transport, via: 'transport' });



  const page = await fetchViaPageContext(url, 'GET');

  if (page.text) attempts.push({ ...page, via: 'scripting' });



  try {

    const resp = await fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' });

    const text = await resp.text();

    attempts.push({

      ok: resp.ok && text.length > 0,

      text,

      contentType: resp.headers.get('content-type') ?? '',

      via: 'direct',

    });

  } catch (err) {

    attempts.push({

      ok: false,

      text: '',

      contentType: '',

      via: 'direct',

      error: err instanceof Error ? err.message : String(err),

    });

  }



  const best = pickBestAttempt(attempts);



  if (best.text && looksLikeTranscriptPayload(best.text, best.contentType)) {

    return { ok: true, text: best.text, contentType: best.contentType, via: best.via };

  }



  if (best.text) {

    return { ok: true, text: best.text, contentType: best.contentType, via: best.via };

  }



  console.warn('[YT StudyFlow] caption fetch failed', {

    url: url.slice(0, 120),

    attempts: attempts.map((a) => ({

      via: a.via,

      ok: a.ok,

      len: a.text.length,

      error: a.error,

    })),

  });



  return { ok: false, text: '', contentType: '', via: 'none' };

}



export async function fetchCaptionTextWithFormats(baseUrl: string): Promise<{

  ok: boolean;

  text: string;

  contentType: string;

  via?: string;

}> {

  const captured = await fetchFromCapturedCache(baseUrl);

  if (captured.ok) return captured;



  const decoded = decodeTrackUrl(baseUrl);

  const urls = new Set<string>([decoded]);



  for (const fmt of ['json3', 'vtt', 'srv3'] as const) {

    urls.add(normalizeCaptionUrl(baseUrl, fmt));

  }



  for (const url of urls) {

    const result = await fetchCaptionText(url);

    if (result.ok && result.text && looksLikeTranscriptPayload(result.text, result.contentType)) {

      return result;

    }

  }



  return { ok: false, text: '', contentType: '' };

}



export async function waitForCapturedCaptions(

  baseUrl: string,

  maxWaitMs = 8000

): Promise<{ ok: boolean; text: string; contentType: string; via?: string }> {

  await triggerPlayerCaptions();



  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {

    const captured = await fetchFromCapturedCache(baseUrl);

    if (captured.ok) return captured;

    await new Promise((r) => setTimeout(r, 400));

  }



  return { ok: false, text: '', contentType: '' };

}


