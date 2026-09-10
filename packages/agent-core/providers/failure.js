// Provider failure classification shared by the worker chat chain and the
// package ProviderChain.
//
// Permanent failures (bad key, bad request, unsupported model) must never be
// retried. Everything else — 408/429/5xx, network interruptions, gateway
// hiccups, and unclassified transport errors — is transient and recovers with
// backoff when the provider does.

// Explicit permanent statuses. 501 is included because an unimplemented
// upstream endpoint can never fix itself on retry.
export const PERMANENT_STATUSES = Object.freeze(
  new Set([400, 401, 403, 404, 405, 413, 422, 501]),
);

const PERMANENT_MESSAGE_PATTERN =
  /unauthorized|invalid api|authentication|forbidden|not found|unsupported model|validation error|invalid request|context[_ ]?(?:length|window)|maximum context|too many tokens|token limit|content policy|moderation|safety/i;
const TRANSIENT_MESSAGE_PATTERN =
  /429|408|rate limit|too many|temporarily|unavailable|gateway|timeout|network|econn|fetch failed|ecosystem/i;

// Status-only classification for callers that already hold an HTTP status
// (e.g. the package ProviderChain). Returns 'permanent' or 'transient'.
export function classifyFailureStatus(status) {
  const code = Number(status);
  if (!Number.isFinite(code) || code <= 0) return 'transient';
  return PERMANENT_STATUSES.has(code) ? 'permanent' : 'transient';
}

/**
 * Classify a provider failure. Returns
 * { kind: 'transient'|'permanent', status, retryAfterMs }.
 */
export function classifyProviderFailure(error) {
  const status = Number(error?.status);
  const message = String(error?.message || '');
  const retryAfter = Number(error?.retryAfter) || 0;
  const retryAfterMs = retryAfter > 0 ? retryAfter * 1000 : 0;

  if (PERMANENT_STATUSES.has(status)) {
    return { kind: 'permanent', status, retryAfterMs: 0 };
  }

  if (
    status === 429 ||
    status === 408 ||
    (Number.isFinite(status) && status >= 500)
  ) {
    return { kind: 'transient', status, retryAfterMs };
  }

  if (PERMANENT_MESSAGE_PATTERN.test(message)) {
    return { kind: 'permanent', status, retryAfterMs: 0 };
  }

  if (TRANSIENT_MESSAGE_PATTERN.test(message)) {
    return { kind: 'transient', status, retryAfterMs };
  }

  // Unclassified network/transport failures are transient by default: the
  // recovery loop retries with backoff and stops only on permanent
  // classification, user cancellation, or the unavailability horizon.
  return { kind: 'transient', status, retryAfterMs: 0 };
}
