export const MAX_BODY_BYTES = 256 * 1024;

export function safeErrorDetail(error) {
  const raw = error instanceof Error
    ? error.message
    : typeof error?.message === 'string'
      ? error.message
      : String(error);

  return raw
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b(api[_-]?key|token|secret|password)\b(\s*[:=]\s*)([^\s&,;]+)/gi, '$1$2[REDACTED]')
    .slice(0, 500);
}

export async function readBoundedJson(request, maxBytes = MAX_BODY_BYTES) {
  const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (contentLength > maxBytes) {
    throw new Error(`Request body exceeds ${maxBytes} byte limit.`);
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new Error(`Request body exceeds ${maxBytes} byte limit.`);
  }
  return JSON.parse(text);
}
