/**
 * Run credentialed fetch/XHR in the page MAIN world (isolated world cannot read page cookies reliably).
 */

import { TRANSCRIPT_TRANSPORT } from '@lib/constants';

const TRANSPORT_READY = 'YT_STUDYFLOW_PAGE_TRANSPORT_READY';
const GET_CAPTURED = 'YT_STUDYFLOW_GET_CAPTURED_CAPTIONS';
const CAPTURED_RESULT = 'YT_STUDYFLOW_CAPTURED_CAPTIONS';

export type PageFetchResult = {
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
  error?: string;
};

export type CapturedCaption = {
  url: string;
  text: string;
  contentType: string;
  ts: number;
};

function waitForTransport(maxMs = 4000): Promise<boolean> {
  const w = window as Window & { __ytStudyFlowTransportReady?: boolean };
  if (w.__ytStudyFlowTransportReady) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onReady);
      resolve(!!w.__ytStudyFlowTransportReady);
    }, maxMs);

    const onReady = (ev: MessageEvent) => {
      if ((ev.data as { type?: string })?.type === TRANSPORT_READY) {
        clearTimeout(timer);
        window.removeEventListener('message', onReady);
        resolve(true);
      }
    };

    window.addEventListener('message', onReady);
  });
}

export async function fetchViaPageTransport(url: string): Promise<PageFetchResult> {
  await waitForTransport();

  const requestToken = `tt-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve) => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as {
        type?: string;
        requestToken?: string;
        ok?: boolean;
        status?: number;
        responseText?: string;
        contentType?: string;
        error?: string;
      };
      if (data?.type !== TRANSCRIPT_TRANSPORT.RESULT) return;
      if (data.requestToken !== requestToken) return;

      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve({
        ok: !!data.ok,
        status: Number(data.status ?? 0),
        text: String(data.responseText ?? ''),
        contentType: String(data.contentType ?? ''),
        error: data.error,
      });
    };

    window.addEventListener('message', onMessage);

    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve({ ok: false, status: 0, text: '', contentType: '', error: 'timeout' });
    }, TRANSCRIPT_TRANSPORT.TIMEOUT_MS);

    window.postMessage(
      { type: TRANSCRIPT_TRANSPORT.FETCH, requestToken, url },
      '*'
    );
  });
}

export async function fetchViaPageContext(
  url: string,
  method: 'GET' | 'POST' = 'GET',
  body?: string,
  extraHeaders?: Record<string, string>
): Promise<PageFetchResult> {
  if (method === 'GET' && !extraHeaders) {
    return fetchViaPageTransport(url);
  }

  try {
    const result = (await chrome.runtime.sendMessage({
      type: 'YT_STUDYFLOW_PAGE_FETCH',
      url,
      method,
      body: body ?? null,
      headers: extraHeaders ?? {},
    })) as PageFetchResult | null;

    if (result) return result;
  } catch {
    // fall through
  }

  return { ok: false, status: 0, text: '', contentType: '', error: 'no_response' };
}

export async function getCapturedCaptions(): Promise<CapturedCaption[]> {
  await waitForTransport();

  const requestToken = `cap-${Date.now()}`;

  return new Promise((resolve) => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as {
        type?: string;
        requestToken?: string;
        captions?: CapturedCaption[];
      };
      if (data?.type !== CAPTURED_RESULT) return;
      if (data.requestToken !== requestToken) return;

      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(Array.isArray(data.captions) ? data.captions : []);
    };

    window.addEventListener('message', onMessage);

    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve([]);
    }, 2000);

    window.postMessage({ type: GET_CAPTURED, requestToken }, '*');
  });
}

export async function triggerPlayerCaptions(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'YT_STUDYFLOW_ENABLE_CC' });
  } catch {
    // non-fatal
  }
}
