// First-party, consent-gated product analytics.
//
// Design rules (these are product promises, not preferences):
//  - Nothing is collected before the visitor allows the `analytics` category.
//  - No cookies, no localStorage: the session id lives in memory only, so there
//    is nothing to clean up and nothing that follows a visitor between sites.
//  - No personal data: no email, no user id, no IP (the edge reports a country,
//    never an address), no full URLs (query strings and fragments are dropped),
//    no device fingerprints.
//  - Do Not Track and Global Privacy Control are honoured as a hard "no".
//  - Withdrawing consent stops the queue and deletes anything still buffered.
//
// Events go to our own Worker route (/api/analytics/collect) which aggregates
// counters in D1. `setAnalyticsTransport` exists so the same consent logic can
// drive a different sink later without touching call sites.

import {
  browserBlocksAnalytics,
  hasConsent,
  subscribeConsent,
} from "./consentService";

export const ANALYTICS_ENDPOINT = "/api/analytics/collect";
export const ANALYTICS_FLUSH_INTERVAL_MS = 5000;
export const ANALYTICS_MAX_BATCH = 20;

// Event names are validated, never free-form. Keep this list small and add
// deliberately: it is the public surface of the tracker.
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{2,39}$/;
export const ALLOWED_EVENT_NAMES = new Set([
  "page_view",
  "sign_up_started",
  "sign_up_completed",
  "sign_in_completed",
  "checkout_started",
  "creation_started",
  "creation_completed",
  "creation_failed",
  "publish_started",
  "publish_completed",
  "publish_failed",
  "download_used",
  "consent_updated",
  "consent_banner_shown",
  "embed_loaded",
  "error_shown",
]);

// Only these props may travel, each with a hard shape. Anything else is
// dropped before an event is queued.
const ALLOWED_PROPS = {
  path: (value) => sanitizePath(value),
  plan: (value) => sanitizeToken(value),
  surface: (value) => sanitizeToken(value),
  intent: (value) => sanitizeToken(value),
  status: (value) => sanitizeToken(value),
  reason: (value) => sanitizeToken(value),
  provider: (value) => sanitizeToken(value),
  size_bucket: (value) => sanitizeToken(value),
  count: (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(100000, Math.trunc(Number(value)))) : null),
};

function sanitizeToken(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (text.length > 40) return null;
  // Tokens are enums like "standard", "game", "timeout" — never free text,
  // so anything with whitespace, punctuation or an @ is refused outright.
  if (!/^[a-z0-9._:-]{1,40}$/.test(text)) return null;
  return text;
}

/** Keep only the pathname: no query string, no fragment, no origin. */
export function sanitizePath(value) {
  if (value === null || value === undefined) return null;
  let path = String(value).trim();
  if (!path) return null;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
      path = new URL(path).pathname;
    }
  } catch {
    return null;
  }
  path = path.split("?")[0].split("#")[0];
  if (!path.startsWith("/")) path = `/${path}`;
  // Collapse identifiers so routes like /chat/<id> aggregate as /chat/:id.
  path = path
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id")
    .replace(/\/chat\/[A-Za-z0-9_-]{6,}/g, "/chat/:id")
    .replace(/\/[A-Za-z0-9_-]{24,}/g, "/:id")
    .replace(/[^A-Za-z0-9/_:.-]/g, "");
  if (path.length > 120) path = path.slice(0, 120);
  return path || null;
}

export function sanitizeEvent(event) {
  if (!event || typeof event !== "object") return null;
  const name = typeof event.name === "string" ? event.name.trim().toLowerCase() : "";
  if (!EVENT_NAME_PATTERN.test(name) || !ALLOWED_EVENT_NAMES.has(name)) return null;
  const props = {};
  const sourceProps = event.props && typeof event.props === "object" ? event.props : {};
  for (const [key, sanitize] of Object.entries(ALLOWED_PROPS)) {
    if (!(key in sourceProps)) continue;
    const value = sanitize(sourceProps[key]);
    if (value !== null && value !== undefined) props[key] = value;
  }
  const ts = Number(event.ts);
  return {
    name,
    props,
    ts: Number.isFinite(ts) ? ts : Date.now(),
  };
}

let sessionId = null;
let queue = [];
let flushTimer = null;
let transport = defaultTransport;
let started = false;
let unsubscribeConsent = null;

function memorySessionId() {
  if (sessionId) return sessionId;
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      sessionId = crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  if (!sessionId) sessionId = `s_${Math.random().toString(36).slice(2, 12)}`;
  return sessionId;
}

async function defaultTransport(payload) {
  const response = await fetch(ANALYTICS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    keepalive: true,
    body: JSON.stringify(payload),
  });
  return response;
}

/**
 * Whether tracking may run right now. Three independent gates, all of which
 * must pass: explicit consent, no browser opt-out signal, and a browser context
 * that actually has fetch.
 */
export function shouldTrack() {
  if (typeof window === "undefined") return false;
  if (typeof fetch !== "function") return false;
  if (browserBlocksAnalytics()) return false;
  return hasConsent("analytics");
}

export function setAnalyticsTransport(nextTransport) {
  transport = typeof nextTransport === "function" ? nextTransport : defaultTransport;
}

export function getQueuedEvents() {
  return queue.slice();
}

export function track(name, props = {}) {
  if (!shouldTrack()) return false;
  const event = sanitizeEvent({ name, props, ts: Date.now() });
  if (!event) return false;
  if (queue.length >= 200) queue.shift();
  queue.push(event);
  scheduleFlush();
  return true;
}

let lastPath = null;

export function trackPageView(pathname) {
  const path = sanitizePath(pathname);
  if (!path) return false;
  if (path === lastPath) return false;
  lastPath = path;
  return track("page_view", { path });
}

export function resetPageViewMemory() {
  lastPath = null;
}

function scheduleFlush() {
  if (flushTimer) return;
  try {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, ANALYTICS_FLUSH_INTERVAL_MS);
  } catch {
    flushTimer = null;
  }
}

export async function flush() {
  if (!shouldTrack()) {
    queue = [];
    return { sent: 0, skipped: true };
  }
  if (queue.length === 0) return { sent: 0, skipped: false };

  const batch = queue.slice(0, ANALYTICS_MAX_BATCH);
  queue = queue.slice(batch.length);
  const payload = {
    sid: memorySessionId(),
    events: batch,
  };

  try {
    await transport(payload);
    return { sent: batch.length, skipped: false };
  } catch {
    // A failed send is dropped rather than retried forever: analytics must
    // never spend a visitor's bandwidth or block the UI.
    return { sent: 0, failed: batch.length, skipped: false };
  }
}

/**
 * Start the tracker. Safe to call repeatedly. The consent subscription makes
 * an opt-out take effect immediately, without a reload.
 */
export function startAnalytics() {
  if (started || typeof window === "undefined") return () => {};
  started = true;

  unsubscribeConsent = subscribeConsent(() => {
    if (!shouldTrack()) {
      queue = [];
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    }
  });

  const onHidden = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      flush();
    }
  };
  try {
    document.addEventListener("visibilitychange", onHidden);
  } catch {
    /* ignore */
  }

  return () => {
    started = false;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    try {
      document.removeEventListener("visibilitychange", onHidden);
    } catch {
      /* ignore */
    }
    if (unsubscribeConsent) {
      unsubscribeConsent();
      unsubscribeConsent = null;
    }
  };
}

/** Test seam: clears in-memory state without touching stored consent. */
export function __resetAnalyticsForTests() {
  queue = [];
  sessionId = null;
  lastPath = null;
  started = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (unsubscribeConsent) {
    unsubscribeConsent();
    unsubscribeConsent = null;
  }
  transport = defaultTransport;
}
