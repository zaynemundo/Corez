export const MAX_BODY_BYTES = 256 * 1024;

export const SECURITY_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
};

export function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS,
      ...extraHeaders
    }
  });
}

/**
 * Sliding-window per-client rate limiter keyed by CF-Connecting-IP.
 * Returns the Retry-After seconds when the client is over the limit,
 * otherwise null (and records the request).
 */
export function createRateLimiter({ windowMs = 60_000, limit = 20, maxClients = 1_000 } = {}) {
  const clients = new Map();

  function clientIdentity(request) {
    const candidate = request.headers.get('CF-Connecting-IP')
      || request.headers.get('X-Forwarded-For')?.split(',')[0]
      || 'anonymous';
    return candidate.trim().slice(0, 128) || 'anonymous';
  }

  return function rateRetryAfter(request, now = Date.now()) {
    for (const [client, record] of clients) {
      if (now - record.windowStart >= windowMs) clients.delete(client);
    }
    const client = clientIdentity(request);
    let record = clients.get(client);
    if (!record) {
      if (clients.size >= maxClients) {
        const oldest = clients.keys().next().value;
        if (oldest !== undefined) clients.delete(oldest);
      }
      record = { windowStart: now, count: 0 };
      clients.set(client, record);
    }
    if (now - record.windowStart >= windowMs) {
      record.windowStart = now;
      record.count = 0;
    }
    if (record.count >= limit) {
      return Math.max(1, Math.ceil((record.windowStart + windowMs - now) / 1000));
    }
    record.count += 1;
    return null;
  };
}

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
