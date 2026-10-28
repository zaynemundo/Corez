export function abortError() {
  const error = new Error("cancelled by user");
  error.name = "AbortError";
  return error;
}

export function sleepResumable(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Build the "why" for the honest fallback: name the transport error when the
// fetch itself failed, and give actionable guidance — the request never
// reached an AI provider, so a provider-key hint would be misleading.
export function describeHostedUnavailable(hostedError) {
  const message = hostedError?.message || "";
  const isRateLimit =
    /429|rate.?limit|rate_limit|too many requests/i.test(message);
  if (isRateLimit) {
    return " The hosted AI service is rate-limited right now and automatic retries are backing off. Please wait a moment and try again.";
  }
  const isTransportFailure =
    /networkerror|failed to fetch|load failed|fetch failed|ERR_CONNECTION|net::|econnrefused|connection refused/i.test(
      message,
    );
  let reason = message
    ? ` The hosted AI service is unavailable: ${message}`
    : " The hosted AI service is currently unavailable.";
  if (isTransportFailure) {
    reason +=
      " The request never reached the AI worker. Locally, /api/* is proxied to the Cloudflare Worker on port 8787 — start it with `npx wrangler dev` (with OPENCODE_GO_API_KEY in .dev.vars) so this request has a backend to answer. For the deployed site, make sure the Worker is deployed with `npx wrangler deploy`.";
  }
  return reason;
}

// --- Persistent keep-trying retry policy ----------------------------------
export const PERSISTENT_RETRY_BASE_DELAY_MS = 2000;
export const PERSISTENT_RETRY_MAX_DELAY_MS = 30000;
export const PERSISTENT_RETRY_DEFAULT_MAX_ATTEMPTS = 3;

export const BUILD_IN_PROGRESS_MAX_ATTEMPTS = 8;
export const BUILD_IN_PROGRESS_BASE_DELAY_MS = 15_000;
export const BUILD_IN_PROGRESS_MAX_DELAY_MS = 120_000;
export const BUILD_IN_PROGRESS_MESSAGE =
  "your build is still running on the server — send the same request again in a moment and it will pick up the finished result";

/** True when the worker answered "your build is already in progress". */
export function isBuildInProgressError(err) {
  return /build for this request is already in progress/i.test(
    err?.message || "",
  );
}

export function getBuildInProgressDelay(attempt) {
  const exp =
    BUILD_IN_PROGRESS_BASE_DELAY_MS * 2 ** Math.max(0, Number(attempt || 1) - 1);
  return Math.min(exp, BUILD_IN_PROGRESS_MAX_DELAY_MS);
}

export function getPersistentRetryDelay(
  attempt,
  baseDelayMs = PERSISTENT_RETRY_BASE_DELAY_MS,
  maxDelayMs = PERSISTENT_RETRY_MAX_DELAY_MS,
) {
  const base = Number(baseDelayMs) > 0 ? Number(baseDelayMs) : 2000;
  const max = Number(maxDelayMs) > 0 ? Number(maxDelayMs) : 30000;
  const exp = base * 2 ** Math.max(0, Number(attempt || 1) - 1);
  return Math.min(exp, max);
}

export function isRetryableHostedError(err) {
  if (!err) return true;
  if (err?.name === "AbortError") return false;
  if (/Authentication required/i.test(err?.message || "")) return false;
  return true;
}

export function isHostedUnavailableFallback(text) {
  if (!text || typeof text !== "string") return false;
  return /hosted AI service is (currently unavailable|rate-limited)|I can't act on|I can't properly answer|I couldn't apply your revision|couldn't analyse or revise|can't create (it|this specific app) right now|so I can't create/i.test(
    text,
  );
}

export function resolvePersistentRetryOpts(retryOpts) {
  const isTestEnv =
    (typeof process !== "undefined" &&
      (process?.env?.VITEST === "true" ||
        process?.env?.VITEST === "1" ||
        process?.env?.NODE_ENV === "test")) ||
    (typeof globalThis !== "undefined" && Boolean(globalThis.__VITEST__));
  const raw = retryOpts && typeof retryOpts === "object" ? retryOpts : {};
  return {
    maxPersistentAttempts:
      raw.maxPersistentAttempts ??
      raw.maxAttempts ??
      (isTestEnv ? 1 : PERSISTENT_RETRY_DEFAULT_MAX_ATTEMPTS),
    baseDelayMs: raw.baseDelayMs ?? PERSISTENT_RETRY_BASE_DELAY_MS,
    maxDelayMs: raw.maxDelayMs ?? PERSISTENT_RETRY_MAX_DELAY_MS,
    innerRetryDelaysMs: Array.isArray(raw.retryDelaysMs)
      ? raw.retryDelaysMs
      : Array.isArray(raw.innerRetryDelaysMs)
        ? raw.innerRetryDelaysMs
        : undefined,
    buildInProgressDelaysMs: Array.isArray(raw.buildInProgressDelaysMs)
      ? raw.buildInProgressDelaysMs
      : undefined,
  };
}
