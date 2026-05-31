/** Routes Gemini HTTP through the background service worker (proper MV3 pattern). */

let lastRequestAt = 0;
const MIN_GAP_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function resetGeminiRateLimit(): void {
  lastRequestAt = 0;
}

type GeminiProxyResponse = {
  ok: boolean;
  status: number;
  body: string;
  error?: string;
};

async function waitForSlot(): Promise<void> {
  const wait = MIN_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

export async function geminiFetch(
  url: string,
  init: RequestInit,
  apiKey: string
): Promise<Response> {
  await waitForSlot();

  const result = (await chrome.runtime.sendMessage({
    type: 'YT_STUDYFLOW_GEMINI_FETCH',
    url,
    method: init.method ?? 'POST',
    body: typeof init.body === 'string' ? init.body : '',
    apiKey,
  })) as GeminiProxyResponse | undefined;

  if (!result) {
    return new Response('Extension background unavailable', { status: 503 });
  }

  if (result.error && !result.body) {
    return new Response(result.error, { status: result.status || 503 });
  }

  return new Response(result.body, { status: result.status });
}

export function isCircuitOpen(): boolean {
  return false;
}

export function getCircuitMessage(): string {
  return '';
}

export function record429(_body: string): void {
  // no-op — circuit breaker removed; was blocking valid keys after earlier errors
}

export function recordSuccess(): void {
  // no-op
}
