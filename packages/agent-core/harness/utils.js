// Shared harness utilities. This module must stay free of node: builtins so
// the harness core can run identically in Node (CLI) and Cloudflare Workers.

export function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function parseToolArguments(raw) {
  if (typeof raw !== 'string') return raw && typeof raw === 'object' ? raw : {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function nowIso() {
  return new Date().toISOString();
}
