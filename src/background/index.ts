/// <reference lib="webworker" />

/**
 * Background service worker — page fetch, CC toggle, Gemini API proxy.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[YT StudyFlow] Extension installed');
});

type PageFetchResult = {
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
  error?: string;
};

type GeminiFetchResult = {
  ok: boolean;
  status: number;
  body: string;
  error?: string;
};

function pageFetchInMainWorld(
  url: string,
  method: string,
  body: string | null,
  headers: Record<string, string>
): PageFetchResult {
  try {
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.open(method, url, false);
    xhr.timeout = 12000;

    xhr.setRequestHeader('Content-Type', 'application/json');
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== 'content-type') {
        xhr.setRequestHeader(key, value);
      }
    }

    xhr.send(body);

    return {
      ok: xhr.status >= 200 && xhr.status < 300,
      status: xhr.status,
      text: xhr.responseText ?? '',
      contentType: xhr.getResponseHeader('content-type') ?? '',
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      text: '',
      contentType: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function enableCaptionsInMainWorld(): boolean {
  const btn =
    document.querySelector('.ytp-subtitles-button[aria-pressed="false"]') ??
    document.querySelector('.ytp-subtitles-button');

  if (btn instanceof HTMLElement) {
    btn.click();
    return true;
  }

  const player = (window as { ytplayer?: { config?: { args?: { cc_load_policy?: number } } } })
    .ytplayer;
  if (player?.config?.args) {
    player.config.args.cc_load_policy = 1;
  }

  return false;
}

async function geminiFetchInBackground(
  url: string,
  method: string,
  body: string,
  apiKey: string
): Promise<GeminiFetchResult> {
  const key = apiKey.trim();
  if (!key) {
    return { ok: false, status: 0, body: '', error: 'API key missing' };
  }

  // Native Gemini REST: key in query string (works for AIza and AQ keys).
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${sep}key=${encodeURIComponent(key)}`;

  try {
    const resp = await fetch(fullUrl, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body || undefined,
    });
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, body: text };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'YT_STUDYFLOW_GEMINI_FETCH') {
    void geminiFetchInBackground(
      String(message.url ?? ''),
      String(message.method ?? 'POST'),
      String(message.body ?? ''),
      String(message.apiKey ?? '')
    ).then(sendResponse);
    return true;
  }

  const tabId = sender.tab?.id;
  if (!tabId) return false;

  if (message?.type === 'YT_STUDYFLOW_PAGE_FETCH') {
    chrome.scripting
      .executeScript({
        target: { tabId },
        world: 'MAIN',
        func: pageFetchInMainWorld,
        args: [
          String(message.url ?? ''),
          String(message.method ?? 'GET'),
          message.body ? String(message.body) : null,
          (message.headers ?? {}) as Record<string, string>,
        ],
      })
      .then((results) => {
        sendResponse((results[0]?.result as PageFetchResult) ?? null);
      })
      .catch((err) => {
        sendResponse({
          ok: false,
          status: 0,
          text: '',
          contentType: '',
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return true;
  }

  if (message?.type === 'YT_STUDYFLOW_ENABLE_CC') {
    chrome.scripting
      .executeScript({
        target: { tabId },
        world: 'MAIN',
        func: enableCaptionsInMainWorld,
      })
      .then((results) => {
        sendResponse({ clicked: !!results[0]?.result });
      })
      .catch(() => sendResponse({ clicked: false }));
    return true;
  }

  return false;
});

export {};
