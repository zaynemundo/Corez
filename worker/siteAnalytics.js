// First-party analytics for PUBLISHED SITES.
//
// Separate from worker/analytics.js on purpose: that collector measures Corez
// itself and stores only aggregate counters. A site owner needs to know whether
// a page is working — views, unique visitors, how many came back — so this
// module keeps just enough identity to answer that, without a cookie and
// without ever storing an address or a device string.
//
// The privacy model:
// - `visitor_key` is HMAC-SHA256(secret, site + IP + user agent), truncated to
//   16 hex chars. The inputs are never written; only the fingerprint is.
// - The key is scoped to ONE site (the slug is part of the message), so the
//   same visitor cannot be linked across two published pages, let alone across
//   the product. There is no advertising id and no cross-site graph.
// - Do Not Track and Global Privacy Control are honoured: the view is still
//   counted in the anonymous totals, but no fingerprint is created, so that
//   visitor is not counted as unique or returning.
// - Visitor rows are pruned after 90 days; anonymous daily totals after 400.
// - Bots, prefetches and the owner's own signed-in visits are not counted.
// - Unpublishing a site deletes all of its analytics (see deleteSiteAnalytics-
//   ForSlug and worker/publishStore.js deletePublishRecord).
//
// The collection path is deliberately fire-and-forget: recording must never
// add latency to the public page or make a published link fail. A storage
// error is swallowed (the page is still served) and the next view retries.

import { dayKey, isBotUserAgent, deviceClassFromUserAgent } from "./analytics.js";
import { SITE_ANALYTICS_SCHEMA } from "./dbSchema.js";
import { sessionUid } from "./auth.js";

export const SITE_ANALYTICS_TABLES = Object.freeze({
  daily: "site_analytics_daily",
  breakdown: "site_analytics_breakdown",
  visits: "site_analytics_visits",
  visitors: "site_analytics_visitors",
});

/** Windows the owner dashboard can ask for. Anything else is rejected. */
export const SITE_ANALYTICS_RANGES = Object.freeze([7, 30, 90]);
export const DEFAULT_ANALYTICS_RANGE = 30;

/** Visitor fingerprints live 90 days; anonymous totals can stay longer. */
export const VISITOR_RETENTION_DAYS = 90;
export const AGGREGATE_RETENTION_DAYS = 400;

export const HOME_PAGE = "index.html";

const MAX_SOURCE_LENGTH = 80;
const FINGERPRINT_BYTES = 16;
const DEDUPE_WINDOW_MS = 5_000;
const MAX_DEDUPE_ENTRIES = 5_000;
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;

const DIMENSIONS = Object.freeze(["source", "country", "device"]);
const DEVICES = new Set(["desktop", "mobile", "tablet", "unknown"]);
const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]{0,78}[a-z0-9])?$/;
const COUNTRY_PATTERN = /^[A-Z0-9]{2}$/;

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Storage bootstrap
// ---------------------------------------------------------------------------

const readyByDb = new WeakMap();

/**
 * Create this feature's four tables once per database binding. Returns false
 * when D1 cannot be prepared, so callers can answer honestly instead of
 * showing invented zeroes.
 */
export async function ensureSiteAnalyticsTables(env) {
  const db = env?.DB;
  if (!db || typeof db.prepare !== "function") return false;
  const cached = readyByDb.get(db);
  if (cached) return cached;
  const ready = (async () => {
    const statements = [
      ...SITE_ANALYTICS_SCHEMA.tables,
      ...SITE_ANALYTICS_SCHEMA.indexes,
    ];
    for (const sql of statements) {
      await db.prepare(sql).run();
    }
    return true;
  })();
  readyByDb.set(db, ready);
  try {
    return await ready;
  } catch {
    // Do not cache a failure: a later view may succeed (e.g. a transient D1
    // error) and the dashboard should recover without a redeploy.
    readyByDb.delete(db);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Request classification and normalisation
// ---------------------------------------------------------------------------

/** Only a real page navigation counts. Prefetches and subresource fetches do not. */
export function isCountableSiteNavigation(request) {
  if (!request || request.method !== "GET") return false;
  const purpose = [
    request.headers.get("Sec-Purpose"),
    request.headers.get("Purpose"),
    request.headers.get("X-Purpose"),
    request.headers.get("X-Moz"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/prefetch|prerender|preview/.test(purpose)) return false;

  // Multi-page creations navigate with their own fetch-swap router, which is
  // a `cors` fetch of the next HTML document — still a page view. Requiring
  // `navigate` here would silently under-count every sub-page of those sites.
  const mode = (request.headers.get("Sec-Fetch-Mode") || "").toLowerCase();
  if (mode && !["navigate", "cors"].includes(mode)) return false;
  const destination = (request.headers.get("Sec-Fetch-Dest") || "").toLowerCase();
  if (destination && !["document", "iframe", "empty"].includes(destination)) {
    return false;
  }
  return true;
}

/** DNT / GPC: count the view anonymously, never fingerprint the visitor. */
export function hasAnalyticsOptOut(request) {
  const dnt = String(request?.headers?.get("DNT") || "").trim();
  const gpc = String(request?.headers?.get("Sec-GPC") || "").trim();
  return dnt === "1" || gpc === "1";
}

export function countryFromRequest(request) {
  const raw = String(request?.cf?.country || "").toUpperCase();
  if (!COUNTRY_PATTERN.test(raw) || raw === "XX") return "unknown";
  return raw;
}

export function deviceFromRequest(request) {
  const device = deviceClassFromUserAgent(request?.headers?.get("User-Agent"));
  return DEVICES.has(device) ? device : "unknown";
}

/**
 * Where a visit came from, as a host the owner can recognise.
 *
 * `Sec-Fetch-Site` is checked before `Referer` because published pages send
 * `Referrer-Policy: no-referrer`: without it, every internal link would look
 * like a direct visit.
 */
export function sourceFromReferrer(request) {
  if (!request) return "direct";
  const site = String(request.headers.get("Sec-Fetch-Site") || "").toLowerCase();
  if (site === "same-origin" || site === "same-site") return "internal";

  const referer = request.headers.get("Referer") || request.headers.get("Referrer");
  if (!referer) return "direct";

  let url;
  try {
    url = new URL(referer);
  } catch {
    return "other";
  }
  if (!/^https?:$/.test(url.protocol)) return "other";

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host) return "direct";

  const ownHost = (() => {
    try {
      return new URL(request.url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (ownHost && host === ownHost) return "internal";

  const clean = host.slice(0, MAX_SOURCE_LENGTH);
  return HOST_PATTERN.test(clean) ? clean : "other";
}

// ---------------------------------------------------------------------------
// Visitor fingerprint
// ---------------------------------------------------------------------------

const keyCache = new Map();

async function importHmacKey(secret) {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const promise = crypto.subtle
    .importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ])
    .catch(() => null);
  keyCache.set(secret, promise);
  return promise;
}

function analyticsSecret(env) {
  return String(
    env?.SITE_ANALYTICS_SECRET ||
      env?.AUTH_SECRET ||
      "corez-site-analytics-development-only",
  );
}

/**
 * A per-site, daily-stable visitor fingerprint. Only this string is stored;
 * the address and user agent that produced it never leave this function.
 */
export async function visitorFingerprint(env, { slug, ip, userAgent }) {
  if (!slug) return null;
  const key = await importHmacKey(analyticsSecret(env));
  if (!key) return null;
  const payload = `${slug}\n${String(ip || "").slice(0, 128)}\n${String(userAgent || "").slice(0, 512)}`;
  try {
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    return Array.from(new Uint8Array(signature).slice(0, FINGERPRINT_BYTES))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

// A burst of duplicate requests (double navigation, back/forward) is one view.
const recentViews = new Map();

function isDuplicateView(key, now) {
  const previous = recentViews.get(key);
  recentViews.set(key, now);
  if (recentViews.size > MAX_DEDUPE_ENTRIES) {
    for (const [entry, at] of recentViews) {
      if (now - at > DEDUPE_WINDOW_MS) recentViews.delete(entry);
    }
    while (recentViews.size > MAX_DEDUPE_ENTRIES) {
      recentViews.delete(recentViews.keys().next().value);
    }
  }
  return typeof previous === "number" && now - previous < DEDUPE_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

function incrementStatements(env, { slug, day, page, source, country, device }) {
  const statements = [
    env.DB.prepare(
      `INSERT INTO ${SITE_ANALYTICS_TABLES.daily} (site_slug, day, page, views) VALUES (?,?,?,1) ON CONFLICT (site_slug, day, page) DO UPDATE SET views = views + 1`,
    ).bind(slug, day, page),
  ];
  const values = { source, country, device };
  for (const dimension of DIMENSIONS) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO ${SITE_ANALYTICS_TABLES.breakdown} (site_slug, day, dimension, value, views) VALUES (?,?,?,?,1) ON CONFLICT (site_slug, day, dimension, value) DO UPDATE SET views = views + 1`,
      ).bind(slug, day, dimension, values[dimension]),
    );
  }
  return statements;
}

async function storeView(env, request, { slug, page, record, now }) {
  const ready = await ensureSiteAnalyticsTables(env);
  if (!ready) return { recorded: false, reason: "storage" };

  // Signed-in owners checking their own page should not inflate their numbers.
  const viewerUid = await sessionUid(request, env).catch(() => null);
  if (viewerUid && record?.ownerUserId && viewerUid === record.ownerUserId) {
    return { recorded: false, reason: "owner" };
  }

  const day = dayKey(now);
  const statements = incrementStatements(env, {
    slug,
    day,
    page,
    source: sourceFromReferrer(request),
    country: countryFromRequest(request),
    device: deviceFromRequest(request),
  });

  if (!hasAnalyticsOptOut(request)) {
    const visitorKey = await visitorFingerprint(env, {
      slug,
      ip: request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For"),
      userAgent: request.headers.get("User-Agent"),
    });
    if (visitorKey && isDuplicateView(`${slug}\n${page}\n${visitorKey}`, now)) {
      return { recorded: false, reason: "duplicate" };
    }
    if (visitorKey) {
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO ${SITE_ANALYTICS_TABLES.visits} (site_slug, visitor_key, day) VALUES (?,?,?)`,
        ).bind(slug, visitorKey, day),
        env.DB.prepare(
          `INSERT INTO ${SITE_ANALYTICS_TABLES.visitors} (site_slug, visitor_key, first_day, last_day) VALUES (?,?,?,?) ON CONFLICT (site_slug, visitor_key) DO UPDATE SET last_day = excluded.last_day`,
        ).bind(slug, visitorKey, day, day),
      );
    }
  }

  await env.DB.batch(statements);
  return { recorded: true };
}

/**
 * Record one published-page view.
 *
 * With a Worker `ctx`, storage work is handed to `waitUntil` so the visitor
 * gets the page without waiting for D1. Without one (local calls and tests),
 * the work is awaited so the result is observable.
 */
export async function recordSitePageView(
  env,
  request,
  ctx,
  { slug, page = HOME_PAGE, record = null, now = Date.now() } = {},
) {
  if (!slug) return { recorded: false, reason: "no-slug" };
  if (env?.SITE_ANALYTICS_DISABLED === "1") {
    return { recorded: false, reason: "disabled" };
  }
  if (!env?.DB) return { recorded: false, reason: "no-database" };
  if (!isCountableSiteNavigation(request)) {
    return { recorded: false, reason: "not-a-navigation" };
  }
  if (isBotUserAgent(request.headers.get("User-Agent"))) {
    return { recorded: false, reason: "bot" };
  }

  const task = storeView(env, request, { slug, page, record, now }).catch(() => ({
    recorded: false,
    reason: "storage",
  }));

  if (typeof ctx?.waitUntil === "function") {
    ctx.waitUntil(task);
    return { recorded: true, scheduled: true };
  }
  return task;
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

let lastPruneAt = 0;

/**
 * Run retention at most once per interval in this isolate. The dashboard route
 * calls this after serving the report, so pruning happens on the screen that
 * consumes the data instead of adding writes to every public page view.
 */
export async function maybePruneSiteAnalytics(env, now = Date.now()) {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return false;
  lastPruneAt = now;
  return pruneSiteAnalytics(env, now);
}

/**
 * Drop expired visitor fingerprints and old anonymous totals. Deleting the
 * identity rows is the privacy guarantee; the daily counters are only deleted
 * when they are far past any reporting window.
 */
export async function pruneSiteAnalytics(env, now = Date.now()) {
  if (!env?.DB) return false;
  const ready = await ensureSiteAnalyticsTables(env);
  if (!ready) return false;
  const visitorCutoff = dayKey(now - VISITOR_RETENTION_DAYS * 86_400_000);
  const aggregateCutoff = dayKey(now - AGGREGATE_RETENTION_DAYS * 86_400_000);
  try {
    await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM ${SITE_ANALYTICS_TABLES.visits} WHERE day < ?`,
      ).bind(visitorCutoff),
      env.DB.prepare(
        `DELETE FROM ${SITE_ANALYTICS_TABLES.visitors} WHERE last_day < ?`,
      ).bind(visitorCutoff),
      env.DB.prepare(
        `DELETE FROM ${SITE_ANALYTICS_TABLES.daily} WHERE day < ?`,
      ).bind(aggregateCutoff),
      env.DB.prepare(
        `DELETE FROM ${SITE_ANALYTICS_TABLES.breakdown} WHERE day < ?`,
      ).bind(aggregateCutoff),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Unpublishing a page must take its traffic history with it. */
export async function deleteSiteAnalyticsForSlug(env, slug) {
  if (!env?.DB || !slug) return false;
  const ready = await ensureSiteAnalyticsTables(env);
  if (!ready) return false;
  try {
    await env.DB.batch(
      Object.values(SITE_ANALYTICS_TABLES).map((table) =>
        env.DB.prepare(`DELETE FROM ${table} WHERE site_slug = ?`).bind(slug),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Owner report
// ---------------------------------------------------------------------------

export function normalizeAnalyticsRange(days) {
  const value = Number(days);
  return SITE_ANALYTICS_RANGES.includes(value) ? value : null;
}

function isoDayOffset(day, offset) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return dayKey(date.getTime());
}

function percentChange(current, previous) {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

/**
 * The numbers behind one site's dashboard. Returns `null` when analytics
 * storage is unavailable, so the API can say so rather than show zeroes.
 */
export async function readSiteAnalytics(env, slug, { days = DEFAULT_ANALYTICS_RANGE, now = Date.now() } = {}) {
  const windowDays = normalizeAnalyticsRange(days) ?? DEFAULT_ANALYTICS_RANGE;
  const ready = await ensureSiteAnalyticsTables(env);
  if (!ready) return null;

  const to = dayKey(now);
  const from = isoDayOffset(to, -(windowDays - 1));
  const previousTo = isoDayOffset(from, -1);
  const previousFrom = isoDayOffset(previousTo, -(windowDays - 1));

  const queries = [
    // 0 daily views
    env.DB.prepare(
      `SELECT day, SUM(views) AS views FROM ${SITE_ANALYTICS_TABLES.daily} WHERE site_slug = ? AND day >= ? AND day <= ? GROUP BY day ORDER BY day ASC`,
    ).bind(slug, from, to),
    // 1 daily visitors (one row per visitor per day)
    env.DB.prepare(
      `SELECT day, COUNT(*) AS visitors FROM ${SITE_ANALYTICS_TABLES.visits} WHERE site_slug = ? AND day >= ? AND day <= ? GROUP BY day ORDER BY day ASC`,
    ).bind(slug, from, to),
    // 2 daily returning visitors
    env.DB.prepare(
      `SELECT v.day AS day, COUNT(*) AS returning FROM ${SITE_ANALYTICS_TABLES.visits} v JOIN ${SITE_ANALYTICS_TABLES.visitors} s ON s.site_slug = v.site_slug AND s.visitor_key = v.visitor_key WHERE v.site_slug = ? AND v.day >= ? AND v.day <= ? AND s.first_day < v.day GROUP BY v.day ORDER BY v.day ASC`,
    ).bind(slug, from, to),
    // 3 distinct visitors in the window
    env.DB.prepare(
      `SELECT COUNT(DISTINCT visitor_key) AS visitors FROM ${SITE_ANALYTICS_TABLES.visits} WHERE site_slug = ? AND day >= ? AND day <= ?`,
    ).bind(slug, from, to),
    // 4 returning visitors in the window: seen before the window began, or
    // came back on a later day inside it (the same rule as the daily series).
    env.DB.prepare(
      `SELECT COUNT(DISTINCT v.visitor_key) AS returning FROM ${SITE_ANALYTICS_TABLES.visits} v JOIN ${SITE_ANALYTICS_TABLES.visitors} s ON s.site_slug = v.site_slug AND s.visitor_key = v.visitor_key WHERE v.site_slug = ? AND v.day >= ? AND v.day <= ? AND (s.first_day < ? OR s.first_day < v.day)`,
    ).bind(slug, from, to, from),
    // 5 previous window views
    env.DB.prepare(
      `SELECT COALESCE(SUM(views), 0) AS views FROM ${SITE_ANALYTICS_TABLES.daily} WHERE site_slug = ? AND day >= ? AND day <= ?`,
    ).bind(slug, previousFrom, previousTo),
    // 6 previous window visitors
    env.DB.prepare(
      `SELECT COUNT(DISTINCT visitor_key) AS visitors FROM ${SITE_ANALYTICS_TABLES.visits} WHERE site_slug = ? AND day >= ? AND day <= ?`,
    ).bind(slug, previousFrom, previousTo),
    // 7 top pages
    env.DB.prepare(
      `SELECT page, SUM(views) AS views FROM ${SITE_ANALYTICS_TABLES.daily} WHERE site_slug = ? AND day >= ? AND day <= ? GROUP BY page ORDER BY views DESC LIMIT 8`,
    ).bind(slug, from, to),
    // 8 breakdowns
    env.DB.prepare(
      `SELECT dimension, value, SUM(views) AS views FROM ${SITE_ANALYTICS_TABLES.breakdown} WHERE site_slug = ? AND day >= ? AND day <= ? GROUP BY dimension, value ORDER BY views DESC LIMIT 60`,
    ).bind(slug, from, to),
    // 9 first day with any traffic
    env.DB.prepare(
      `SELECT MIN(day) AS since FROM ${SITE_ANALYTICS_TABLES.daily} WHERE site_slug = ?`,
    ).bind(slug),
  ];

  let results;
  try {
    results = await env.DB.batch(queries);
  } catch {
    return null;
  }

  const dailyRows = rowsOf(results?.[0]);
  const visitorRows = rowsOf(results?.[1]);
  const returningRows = rowsOf(results?.[2]);
  const uniqueRow = rowsOf(results?.[3])[0] || {};
  const returningRow = rowsOf(results?.[4])[0] || {};
  const previousViewsRow = rowsOf(results?.[5])[0] || {};
  const previousVisitorsRow = rowsOf(results?.[6])[0] || {};
  const pageRows = rowsOf(results?.[7]);
  const breakdownRows = rowsOf(results?.[8]);
  const sinceRow = rowsOf(results?.[9])[0] || {};

  const byDay = new Map();
  let views = 0;
  for (const row of dailyRows) {
    const day = String(row.day || "");
    if (!day) continue;
    const count = number(row.views);
    views += count;
    byDay.set(day, { day, views: count, visitors: 0, returning: 0 });
  }
  for (const row of visitorRows) {
    const entry = byDay.get(String(row.day || ""));
    if (entry) entry.visitors = number(row.visitors);
  }
  for (const row of returningRows) {
    const entry = byDay.get(String(row.day || ""));
    if (entry) entry.returning = number(row.returning);
  }

  // Fill the whole window so the chart shows quiet days instead of hiding them.
  const series = [];
  for (let offset = 0; offset < windowDays; offset += 1) {
    const day = isoDayOffset(from, offset);
    series.push(byDay.get(day) || { day, views: 0, visitors: 0, returning: 0 });
  }

  const visitors = number(uniqueRow.visitors);
  const returning = Math.min(visitors, number(returningRow.returning));
  const previousViews = number(previousViewsRow.views);
  const previousVisitors = number(previousVisitorsRow.visitors);

  const breakdowns = { source: [], country: [], device: [] };
  for (const row of breakdownRows) {
    const dimension = String(row.dimension || "");
    const value = String(row.value || "");
    if (!DIMENSIONS.includes(dimension) || !value) continue;
    if (breakdowns[dimension].length >= 6) continue;
    breakdowns[dimension].push({ value, views: number(row.views) });
  }

  return {
    slug,
    range: { days: windowDays, from, to },
    totals: {
      views,
      visitors,
      returning,
      newVisitors: Math.max(0, visitors - returning),
      viewsPerVisitor: visitors > 0 ? Math.round((views / visitors) * 10) / 10 : 0,
    },
    previous: { views: previousViews, visitors: previousVisitors },
    change: {
      views: percentChange(views, previousViews),
      visitors: percentChange(visitors, previousVisitors),
    },
    series,
    pages: pageRows
      .map((row) => ({ page: String(row.page || HOME_PAGE), views: number(row.views) }))
      .filter((row) => row.views > 0),
    ...breakdowns,
    trackingSince: typeof sinceRow.since === "string" ? sinceRow.since : null,
    hasData: views > 0 || visitors > 0,
    retentionDays: VISITOR_RETENTION_DAYS,
  };
}

/** Test seam: the dedupe map and key cache are per-isolate memory only. */
export function __resetSiteAnalyticsForTests() {
  recentViews.clear();
  lastPruneAt = 0;
  keyCache.clear();
}
