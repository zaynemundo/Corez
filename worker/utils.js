// Request-body guard: protects the Worker from memory exhaustion only.
// 24 MB is far beyond any legitimate conversation payload (the platform's
// own request limit is 100 MB), so normal AI tasks are never squeezed.
export const MAX_BODY_BYTES = 24 * 1024 * 1024;

// Estimated USD cost of a generation, based on per-1M-token rates that are
// env-overridable (defaults are approximate: $0.14/M input, $0.28/M output).
// An estimate only — the authoritative number lives in the provider's
// billing dashboard.
export function estimateCostUsd(inputTokens, outputTokens, env) {
  const inputRate = Number(env?.AI_COST_PER_M_INPUT_USD) || 0.14;
  const outputRate = Number(env?.AI_COST_PER_M_OUTPUT_USD) || 0.28;
  const input =
    Number.isFinite(inputTokens) && inputTokens > 0 ? inputTokens : 0;
  const output =
    Number.isFinite(outputTokens) && outputTokens > 0 ? outputTokens : 0;
  return (
    Math.round(
      ((input / 1e6) * inputRate + (output / 1e6) * outputRate) * 1e6,
    ) / 1e6
  );
}

export const SECURITY_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

export function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

export function safeErrorDetail(error) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error?.message === "string"
        ? error.message
        : String(error);

  return raw
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(
      /\b(api[_-]?key|token|secret|password)\b(\s*[:=]\s*)([^\s&,;]+)/gi,
      "$1$2[REDACTED]",
    )
    .slice(0, 500);
}

/**
 * Sliding-window per-client rate limiter keyed by CF-Connecting-IP.
 * Returns the Retry-After seconds when the client is over the limit,
 * otherwise null (and records the request).
 */
export function createRateLimiter({
  windowMs = 60_000,
  limit = 20,
  maxClients = 1_000,
} = {}) {
  const clients = new Map();

  function clientIdentity(request) {
    const candidate =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For")?.split(",")[0] ||
      "anonymous";
    return candidate.trim().slice(0, 128) || "anonymous";
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
      return Math.max(
        1,
        Math.ceil((record.windowStart + windowMs - now) / 1000),
      );
    }
    record.count += 1;
    return null;
  };
}

// Provider failure classification lives in the package layer so the worker
// chat chain and the package ProviderChain can never drift.
export { classifyProviderFailure } from "../packages/agent-core/providers/failure.js";

/**
 * Durable task-state store. R2-backed when ASSET_BUCKET is configured so a
 * task survives Worker invocations; an in-memory fallback keeps the same
 * code path usable in tests and local development. State records never
 * contain credentials — provider keys are re-derived from the environment
 * on every continuation.
 *
 * Per-user folders: pass `userId` (or `{ userId }`) to scope operational
 * state under `users/<uid>/corez-tasks/`. Calls without a user keep the
 * legacy `corez-tasks/` location so anonymous polling (GET /api/task/<id>)
 * and pre-move records keep working. Reads try the per-user key first,
 * then the legacy key.
 */
export function createTaskStateStore(env = {}) {
  const bucket = env?.ASSET_BUCKET;
  const memory = new Map();

  const sanitize = (taskId) =>
    `corez-tasks/${String(taskId).replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
  const sanitizeUser = (userId, taskId) => {
    const uid = String(userId || "dev").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200) || "dev";
    const tid = String(taskId).replace(/[^A-Za-z0-9._-]/g, "_");
    return `users/${uid}/corez-tasks/${tid}.json`;
  };
  const keysFor = (taskId, userId) => {
    const id = String(taskId);
    if (userId !== null && userId !== undefined) {
      return [sanitizeUser(userId, id), sanitize(id)];
    }
    return [sanitize(id), null];
  };
  const userOf = (opt) =>
    typeof opt === "string" ? opt : opt?.userId ?? opt?.user ?? null;

  return {
    async save(taskId, state, opt = null) {
      const [primary, fallback] = keysFor(taskId, userOf(opt));
      const serialized = JSON.stringify(state);
      memory.set(String(taskId), serialized);
      if (bucket) {
        await bucket.put(primary, serialized, {
          httpMetadata: { contentType: "application/json" },
        });
        // Best-effort legacy cleanup when moving into a user folder.
        if (fallback && fallback !== primary) {
          try {
            await bucket.delete(fallback);
          } catch {
            // best effort
          }
        }
      }
    },
    async load(taskId, opt = null) {
      const id = String(taskId);
      if (memory.has(id)) return JSON.parse(memory.get(id));
      if (bucket) {
        const [primary, fallback] = keysFor(taskId, userOf(opt));
        for (const key of [primary, fallback].filter(Boolean)) {
          try {
            const object = await bucket.get(key);
            if (object) return JSON.parse(await object.text());
          } catch {
            // try next: corrupt or missing record behaves as absent.
          }
        }
      }
      return null;
    },
    async remove(taskId, opt = null) {
      const id = String(taskId);
      memory.delete(id);
      if (bucket) {
        const [primary, fallback] = keysFor(taskId, userOf(opt));
        for (const key of [primary, fallback].filter(Boolean)) {
          try {
            await bucket.delete(key);
          } catch {
            // Best effort.
          }
        }
      }
    },
  };
}

export async function readBoundedJson(request, maxBytes = MAX_BODY_BYTES) {
  const contentLength = parseInt(
    request.headers.get("Content-Length") || "0",
    10,
  );
  if (contentLength > maxBytes) {
    throw new Error(`Request body exceeds ${maxBytes} byte limit.`);
  }
  // Stream the body and enforce the cap while reading: a chunked body with a
  // spoofed small Content-Length (or none at all) never gets buffered beyond
  // the limit, so this guard works even when the platform's own 100 MB cap
  // would otherwise allow a large body to reach memory.
  const decoder = new TextDecoder();
  let text = "";
  let bytesRead = 0;
  if (request.body) {
    const reader = request.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new Error(`Request body exceeds ${maxBytes} byte limit.`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  return JSON.parse(text);
}

/**
 * One safe path/storage segment: letters, digits, dot, dash and underscore.
 *
 * Route params and R2 key segments both need this bound. It used to exist as a
 * private copy in index.js and in memory.js; one copy means the two endpoints
 * that accept a segment can never disagree about what one is (a laxer copy
 * would let a key escape its folder).
 */
export const SAFE_STORAGE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

/**
 * Decode one URL path segment, or null when it is not valid percent-encoding.
 *
 * Route handlers repeat this on every `:id` they take from the path; one copy
 * keeps the "malformed encoding is the caller's 400/404, never a throw" rule
 * identical everywhere.
 */
export function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
