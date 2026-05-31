/**
 * Page-context transcript transport (MAIN world).
 * - Credentialed XHR for caption URLs on request
 * - Intercepts YouTube's own timedtext fetches (includes auth tokens)
 */

const FETCH = 'YT_STUDYFLOW_FETCH_TRANSCRIPT';
const RESULT = 'YT_STUDYFLOW_TRANSCRIPT_RESULT';
const READY = 'YT_STUDYFLOW_PAGE_TRANSPORT_READY';
const GET_CAPTURED = 'YT_STUDYFLOW_GET_CAPTURED_CAPTIONS';
const CAPTURED_RESULT = 'YT_STUDYFLOW_CAPTURED_CAPTIONS';
const TIMEOUT_MS = 10000;

type FetchMessage = {
  type: typeof FETCH;
  requestToken: string;
  url: string;
};

type ResultMessage = {
  type: typeof RESULT;
  requestToken: string;
  ok: boolean;
  status: number;
  responseText: string;
  contentType: string;
  finalUrl: string;
  error?: string;
};

type CapturedCaption = {
  url: string;
  text: string;
  contentType: string;
  ts: number;
};

const captionCache: CapturedCaption[] = [];

function isCaptionUrl(url: string): boolean {
  return url.includes('/api/timedtext') || url.includes('timedtext');
}

function recordCaption(url: string, text: string, contentType: string): void {
  if (!isCaptionUrl(url)) return;
  if (!text || text.length < 8) return;
  if (/^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) return;

  captionCache.unshift({ url, text, contentType, ts: Date.now() });
  if (captionCache.length > 30) captionCache.pop();

  window.postMessage(
    { type: 'YT_STUDYFLOW_CAPTION_CAPTURED', url, textLen: text.length },
    '*'
  );
}

function installCaptionHooks(): void {
  const w = window as Window & { __ytStudyFlowCaptionHooks?: boolean };
  if (w.__ytStudyFlowCaptionHooks) return;
  w.__ytStudyFlowCaptionHooks = true;

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ) {
    (this as XMLHttpRequest & { _sfUrl?: string })._sfUrl = String(url);
    return origOpen.call(this, method, url, async ?? true, username, password);
  };

  XMLHttpRequest.prototype.send = function (body?: XMLHttpRequestBodyInit | null) {
    const xhr = this as XMLHttpRequest & { _sfUrl?: string };
    const url = xhr._sfUrl ?? '';
    if (isCaptionUrl(url)) {
      xhr.addEventListener('load', () => {
        recordCaption(url, xhr.responseText ?? '', xhr.getResponseHeader('content-type') ?? '');
      });
    }
    return origSend.call(this, body);
  };
}

function postResult(payload: ResultMessage): void {
  window.postMessage(payload, '*');
}

function handleFetch(data: FetchMessage): void {
  const { requestToken, url } = data;
  const xhr = new XMLHttpRequest();
  xhr.withCredentials = true;
  xhr.open('GET', url, true);

  const timeoutId = window.setTimeout(() => {
    try {
      xhr.abort();
    } catch {
      // ignore
    }
    postResult({
      type: RESULT,
      requestToken,
      ok: false,
      status: 0,
      responseText: '',
      contentType: '',
      finalUrl: url,
      error: 'timeout',
    });
  }, TIMEOUT_MS);

  const clear = () => window.clearTimeout(timeoutId);

  xhr.onload = () => {
    clear();
    const text = xhr.responseText ?? '';
    postResult({
      type: RESULT,
      requestToken,
      ok: xhr.status >= 200 && xhr.status < 300,
      status: xhr.status,
      responseText: text,
      contentType: xhr.getResponseHeader('content-type') ?? '',
      finalUrl: url,
    });
    if (xhr.status >= 200 && xhr.status < 300) {
      recordCaption(url, text, xhr.getResponseHeader('content-type') ?? '');
    }
  };

  xhr.onerror = () => {
    clear();
    postResult({
      type: RESULT,
      requestToken,
      ok: false,
      status: xhr.status || 0,
      responseText: '',
      contentType: '',
      finalUrl: url,
      error: 'xhr_error',
    });
  };

  xhr.send();
}

if (!(window as Window & { __ytStudyFlowTransportReady?: boolean }).__ytStudyFlowTransportReady) {
  installCaptionHooks();

  window.addEventListener('message', (ev: MessageEvent) => {
    const data = ev.data as
      | FetchMessage
      | { type?: string; requestToken?: string }
      | undefined;

    if (data?.type === FETCH) {
      handleFetch(data as FetchMessage);
      return;
    }

    if (data?.type === GET_CAPTURED) {
      window.postMessage(
        {
          type: CAPTURED_RESULT,
          requestToken: data.requestToken,
          captions: captionCache.slice(),
        },
        '*'
      );
    }
  });

  (window as Window & { __ytStudyFlowTransportReady?: boolean }).__ytStudyFlowTransportReady = true;
  window.postMessage({ type: READY }, '*');
}

export {};
