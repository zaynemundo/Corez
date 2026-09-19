// First-party analytics collector.
//
// Accepts only the small, fixed event vocabulary the client tracker can emit,
// validates every field against an allowlist, and stores aggregate counters in
// D1. Nothing here can store an IP address, a user agent, a user id, an email
// or a full URL: the schema has no column for them and the sanitizer drops
// anything that does not match an enum or a pathname.
//
// Requests are unauthenticated by design (visitors are not signed in when the
// banner is answered) and carry no cookies, so there is no session to correlate
// with an account. Bot traffic is counted nowhere.
//
// When ANALYTICS_DISABLED=1 the endpoint accepts and discards: a deployment can
// turn collection off without breaking the client. When D1 is not configured
// the endpoint answers 202 and says nothing was stored, rather than pretending.

import { readBoundedJson, createRateLimiter, jsonResponse } from "./utils.js";

export const ANALYTICS_PATH = "/api/analytics/collect";
export const ANALYTICS_TABLE = "analytics_counters";

const MAX_EVENTS = 20;
const NAME_PATTERN = /^[a-z][a-z0-9_]{2,39}$/;
const TOKEN_PATTERN = /^[a-z0-9._:-]{1,40}$/;
const PATH_PATTERN = /^\/[A-Za-z0-9/_:.-]{0,119}$/;

// Mirrors ALLOWED_EVENT_NAMES in src/services/analytics.js. A name must appear
// in both lists to be stored, so a compromised client cannot invent metrics.
export const ANALYTICS_EVENT_NAMES = new Set([
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

const PROP_VALIDATORS = {
  path: (value) => (PATH_PATTERN.test(value) ? value : null),
  plan: tokenValidator,
  surface: tokenValidator,
  intent: tokenValidator,
  status: tokenValidator,
  reason: tokenValidator,
  provider: tokenValidator,
  size_bucket: tokenValidator,
  count: (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(0, Math.min(100000, Math.trunc(number)));
  },
};

function tokenValidator(value) {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  return TOKEN_PATTERN.test(token) ? token : null;
}

const analyticsRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 60 });

const BOT_PATTERN =
  /bot|crawler|spider|crawling|headlesschrome|phantomjs|slurp|bingpreview|facebookexternalhit|semrush|ahrefs|pingdom|uptimerobot|lighthouse|pagespeed/i;

export function isBotUserAgent(userAgent) {
  return BOT_PATTERN.test(String(userAgent || ""));
}

/** Device class only. The user agent string itself is never kept. */
export function deviceClassFromUserAgent(userAgent) {
  const ua = String(userAgent || "");
  if (!ua) return "unknown";
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return "mobile";
  return "desktop";
}

export function sanitizeAnalyticsEvent(event, now = Date.now()) {
  if (!event || typeof event !== "object") return null;
  const name = typeof event.name === "string" ? event.name.trim().toLowerCase() : "";
  if (!NAME_PATTERN.test(name) || !ANALYTICS_EVENT_NAMES.has(name)) return null;

  const rawProps = event.props && typeof event.props === "object" ? event.props : {};
  const props = {};
  for (const [key, validator] of Object.entries(PROP_VALIDATORS)) {
    if (!(key in rawProps)) continue;
    const value = validator(rawProps[key]);
    if (value !== null) props[key] = value;
  }

  const ts = Number(event.ts);
  // Reject timestamps far in the past or future: a client clock is allowed to
  // be wrong, but not to rewrite history.
  const timestamp =
    Number.isFinite(ts) && Math.abs(now - ts) <= 24 * 60 * 60 * 1000 ? ts : now;

  return { name, props, ts: timestamp };
}

export function dayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** Build the (key → count) rows for one accepted batch. */
export function aggregateCounters(events, { country, device, now = Date.now() } = {}) {
  const counters = new Map();
  for (const event of events) {
    const key = JSON.stringify([
      dayKey(event.ts ?? now),
      event.name,
      event.props?.path || "",
      country || "unknown",
      device || "unknown",
    ]);
    counters.set(key, (counters.get(key) || 0) + 1);
  }
  return counters;
}

let tableReady = false;

export async function ensureAnalyticsTable(env) {
  if (tableReady || !env?.DB) return tableReady;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS ${ANALYTICS_TABLE} (day TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, country TEXT NOT NULL, device TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name, path, country, device))`,
    ).run();
    tableReady = true;
  } catch {
    tableReady = false;
  }
  return tableReady;
}

async function storeCounters(env, counters) {
  if (counters.size === 0) return true;
  const ready = await ensureAnalyticsTable(env);
  if (!ready) return false;
  const statements = [];
  for (const [key, count] of counters) {
    const [day, name, path, country, device] = JSON.parse(key);
    statements.push(
      env.DB.prepare(
        `INSERT INTO ${ANALYTICS_TABLE} (day, name, path, country, device, count) VALUES (?,?,?,?,?,?) ON CONFLICT (day, name, path, country, device) DO UPDATE SET count = count + excluded.count`,
      ).bind(day, name, path, country, device, count),
    );
  }
  try {
    await env.DB.batch(statements);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handle POST /api/analytics/collect.
 * @returns {Promise<Response|null>} null when the path does not match.
 */
export async function handleAnalytics(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== ANALYTICS_PATH) return null;

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." }, { Allow: "POST" });
  }

  const retryAfter = analyticsRateLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(
      429,
      { error: "Too many analytics requests." },
      { "Retry-After": String(retryAfter) },
    );
  }

  const userAgent = request.headers.get("User-Agent");
  if (isBotUserAgent(userAgent)) {
    // Bots are not people: nothing to count, nothing to store.
    return jsonResponse(200, { ok: true, accepted: 0, stored: 0, reason: "bot" });
  }

  let body;
  try {
    body = await readBoundedJson(request, 16 * 1024);
  } catch (error) {
    const tooLarge = /exceeds .* byte limit/i.test(String(error?.message || ""));
    return jsonResponse(tooLarge ? 413 : 400, {
      error: tooLarge ? "Analytics payload too large." : "Invalid JSON body.",
    });
  }

  const rawEvents = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS) : [];
  // `body.sid` is deliberately ignored: a per-page session id exists on the
  // client so a batch can be grouped, but it is never written to storage, so a
  // visitor cannot be reconstructed from the counters.
  const now = Date.now();
  const events = rawEvents.map((event) => sanitizeAnalyticsEvent(event, now)).filter(Boolean);

  if (events.length === 0) {
    return jsonResponse(200, { ok: true, accepted: 0, stored: 0 });
  }

  if (env?.ANALYTICS_DISABLED === "1") {
    return jsonResponse(200, {
      ok: true,
      accepted: events.length,
      stored: 0,
      reason: "disabled",
    });
  }

  const country = String(request.cf?.country || "unknown").slice(0, 2).toUpperCase();
  const device = deviceClassFromUserAgent(userAgent);
  const counters = aggregateCounters(events, { country, device, now });
  const stored = await storeCounters(env, counters);

  if (!stored) {
    // Honest failure: accepted but not persisted. The client treats this as a
    // no-op and will not claim the events were recorded anywhere.
    return jsonResponse(202, {
      ok: true,
      accepted: events.length,
      stored: 0,
      reason: "analytics storage not configured",
    });
  }

  return jsonResponse(200, {
    ok: true,
    accepted: events.length,
    stored: counters.size,
  });
}

/** Read-only aggregate summary. Not routed publicly; used by operators/tests. */
export async function readAnalyticsSummary(env, { day } = {}) {
  if (!env?.DB) return null;
  try {
    const query = day
      ? env.DB.prepare(
          `SELECT day, name, path, country, device, count FROM ${ANALYTICS_TABLE} WHERE day = ? ORDER BY count DESC`,
        ).bind(day)
      : env.DB.prepare(
          `SELECT day, name, path, country, device, count FROM ${ANALYTICS_TABLE} ORDER BY day DESC, count DESC LIMIT 200`,
        );
    const result = await query.all();
    return Array.isArray(result?.results) ? result.results : [];
  } catch {
    return null;
  }
}
