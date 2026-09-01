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

/**
 * Classify a provider failure. Transient failures (408, 429, 5xx, network
 * interruptions, gateway hiccups) are recoverable with backoff. Permanent
 * failures (authentication, validation, unsupported models) must never be
 * retried. Returns { kind: 'transient'|'permanent', status, retryAfterMs }.
 */
export function classifyProviderFailure(error) {
  const status = Number(error?.status);
  const message = String(error?.message || "");
  const retryAfter = Number(error?.retryAfter) || 0;

  const PERMANENT_STATUS = new Set([400, 401, 403, 404, 405, 413, 422, 501]);
  if (PERMANENT_STATUS.has(status)) {
    return { kind: "permanent", status, retryAfterMs: 0 };
  }

  if (
    status === 429 ||
    status === 408 ||
    (Number.isFinite(status) && status >= 500)
  ) {
    return {
      kind: "transient",
      status,
      retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : 0,
    };
  }

  if (
    /unauthorized|invalid api|authentication|forbidden|not found|unsupported model|validation error|invalid request/i.test(
      message,
    )
  ) {
    return { kind: "permanent", status, retryAfterMs: 0 };
  }

  if (
    /429|408|rate limit|too many|temporarily|unavailable|gateway|timeout|network|econn|fetch failed|ecosystem/i.test(
      message,
    )
  ) {
    return {
      kind: "transient",
      status,
      retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : 0,
    };
  }

  // Unclassified network/transport failures are transient by default: the
  // recovery loop retries with backoff and stops only on permanent
  // classification, user cancellation, or the unavailability horizon.
  return { kind: "transient", status, retryAfterMs: 0 };
}

/**
 * Durable task-state store. R2-backed when ASSET_BUCKET is configured so a
 * task survives Worker invocations; an in-memory fallback keeps the same
 * code path usable in tests and local development. State records never
 * contain credentials — provider keys are re-derived from the environment
 * on every continuation.
 */
export function createTaskStateStore(env = {}) {
  const bucket = env?.ASSET_BUCKET;
  const memory = new Map();

  const keyOf = (taskId) =>
    `corez-tasks/${String(taskId).replace(/[^A-Za-z0-9._-]/g, "_")}.json`;

  return {
    async save(taskId, state) {
      const serialized = JSON.stringify(state);
      memory.set(String(taskId), serialized);
      if (bucket) {
        await bucket.put(keyOf(taskId), serialized, {
          httpMetadata: { contentType: "application/json" },
        });
      }
    },
    async load(taskId) {
      const id = String(taskId);
      if (memory.has(id)) return JSON.parse(memory.get(id));
      if (bucket) {
        try {
          const object = await bucket.get(keyOf(id));
          if (object) return JSON.parse(await object.text());
        } catch {
          // Fall through: corrupt or missing record behaves as absent.
        }
      }
      return null;
    },
    async remove(taskId) {
      const id = String(taskId);
      memory.delete(id);
      if (bucket) {
        try {
          await bucket.delete(keyOf(id));
        } catch {
          // Best effort.
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
