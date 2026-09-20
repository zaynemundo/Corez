// Per-plan usage metering.
//
// Every paid provider call in this Worker costs money, and until now nothing
// counted them: a free account could run unlimited generations. This module is
// the single place that decides what a plan may use in a month and records what
// it has used.
//
// Storage: one D1 row per (user, month, metric) in `usage_counters`. An upsert
// with `count = count + excluded.count` is atomic in D1, so concurrent requests
// from the same account cannot lose increments. The period is the UTC month
// ('2026-09'), which is also the reset boundary: a new month simply starts at
// zero because the key changes, so there is no cleanup job to forget.
//
// Honesty rules:
//  - Tokens are the provider's reported usage when the response carries it, and
//    otherwise an estimate (characters / 4, which is conservative for English
//    and code). `tokensEstimated` counts how much of the total was estimated so
//    the number can never be mistaken for billed truth.
//  - Without D1 there is nothing to count against, so metering is skipped and
//    requests are never blocked. A deployment cannot silently start refusing
//    work because its database is missing.
//  - A plan may be unlimited (null limit). Unlimited is never a number.

import { jsonResponse } from "./utils.js";

export const USAGE_TABLE = "usage_counters";

/** Metrics that are summed over the month. */
export const USAGE_METRICS = [
  "messages",
  "tokens",
  "tokensEstimated",
  "swarm_runs",
  "images",
  "publishes",
];

const UNLIMITED = null;

/**
 * Plan limits, aligned with what the pricing page promises:
 *   Free      20 generations a month, 1 project, publishing with a badge
 *   Standard  200 generations a month, 10 projects, badge-free
 *   Premium   unlimited generations and projects
 *
 * `messages` is a generation (one user turn), `swarm_runs` bounds the expensive
 * multi-call build harness separately from a one-shot answer, `tokens` is the
 * provider-cost backstop, and `images`/`publishes` cover the two other paid
 * paths. `publishedPages` is a live gauge rather than a monthly counter.
 */
export const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({
    messages: 20,
    tokens: 250_000,
    swarm_runs: 10,
    images: 10,
    publishes: 3,
    publishedPages: 1,
  }),
  standard: Object.freeze({
    messages: 200,
    tokens: 5_000_000,
    swarm_runs: 100,
    images: 200,
    publishes: 50,
    publishedPages: 10,
  }),
  premium: Object.freeze({
    messages: UNLIMITED,
    tokens: UNLIMITED,
    swarm_runs: UNLIMITED,
    images: UNLIMITED,
    publishes: UNLIMITED,
    publishedPages: UNLIMITED,
  }),
});

export const DOMAIN_LIMITS = Object.freeze({
  free: 0,
  standard: 5,
  premium: 20,
});

export function normalizePlan(plan) {
  const value = String(plan || "free").toLowerCase();
  return value === "standard" || value === "premium" ? value : "free";
}

export function limitsForPlan(plan) {
  return PLAN_LIMITS[normalizePlan(plan)];
}

/** The UTC month used as the accounting period, e.g. '2026-09'. */
export function periodKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** First instant of the next UTC month — when a spent limit comes back. */
export function periodResetAt(date = new Date()) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0);
}

export function emptyUsage() {
  const usage = {};
  for (const metric of USAGE_METRICS) usage[metric] = 0;
  return usage;
}

export function meteringEnabled(env) {
  if (env?.USAGE_METERING_DISABLED === "1") return false;
  return Boolean(env?.DB);
}

let tableReady = false;

export async function ensureUsageTable(env) {
  if (tableReady || !env?.DB) return tableReady;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS ${USAGE_TABLE} (user_id TEXT NOT NULL, period TEXT NOT NULL, metric TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, period, metric))`,
    ).run();
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_usage_period ON ${USAGE_TABLE}(period)`,
    ).run().catch(() => null);
    tableReady = true;
  } catch {
    tableReady = false;
  }
  return tableReady;
}

/** Read this month's counters for one account. Skipped reads return zeros. */
export async function getUsage(env, uid, { period = periodKey() } = {}) {
  const usage = emptyUsage();
  if (!meteringEnabled(env) || !uid) return usage;
  try {
    const ready = await ensureUsageTable(env);
    if (!ready) return usage;
    const result = await env.DB.prepare(
      `SELECT metric, count FROM ${USAGE_TABLE} WHERE user_id=? AND period=?`,
    )
      .bind(uid, period)
      .all();
    const rows = Array.isArray(result?.results) ? result.results : [];
    for (const row of rows) {
      const metric = String(row?.metric || "");
      if (!USAGE_METRICS.includes(metric)) continue;
      usage[metric] = Number(row.count) || 0;
    }
  } catch {
    // A read failure must never block a request: report zeros.
  }
  return usage;
}

/**
 * Add to one or more counters. Never throws: a metering failure is logged by
 * the caller's `onError` at most, and never fails the user's request.
 * @returns {Promise<boolean>} whether the counters were written
 */
export async function addUsage(env, uid, increments, { period = periodKey(), now = Date.now() } = {}) {
  if (!meteringEnabled(env) || !uid) return false;
  const entries = Object.entries(increments || {}).filter(
    ([metric, amount]) => USAGE_METRICS.includes(metric) && Number.isFinite(amount) && amount !== 0,
  );
  if (entries.length === 0) return false;
  try {
    const ready = await ensureUsageTable(env);
    if (!ready) return false;
    const statements = entries.map(([metric, amount]) =>
      env.DB.prepare(
        `INSERT INTO ${USAGE_TABLE} (user_id, period, metric, count, updated_at) VALUES (?,?,?,?,?) ON CONFLICT (user_id, period, metric) DO UPDATE SET count = count + excluded.count, updated_at = excluded.updated_at`,
      ).bind(uid, period, metric, Math.trunc(amount), now),
    );
    await env.DB.batch(statements);
    return true;
  } catch {
    return false;
  }
}

/**
 * Estimate tokens from text length. Conservative on purpose: ~4 characters per
 * token for English and code, and it under-counts dense non-Latin scripts
 * rather than over-counting them.
 */
export function estimateTokens(...texts) {
  let chars = 0;
  for (const text of texts) {
    if (typeof text === "string") chars += text.length;
  }
  return Math.ceil(chars / 4);
}

/**
 * Whether `metric` still has room on this plan.
 * @returns {{allowed: boolean, used: number, limit: number|null, remaining: number|null}}
 */
export function evaluateLimit(plan, usage, metric, extra = {}) {
  const limits = limitsForPlan(plan);
  const limit = Object.prototype.hasOwnProperty.call(limits, metric)
    ? limits[metric]
    : null;
  const used = Number(usage?.[metric] || 0) + Number(extra?.pending || 0);
  if (limit === null) {
    return { allowed: true, used, limit: null, remaining: null };
  }
  const remaining = Math.max(0, limit - used);
  return { allowed: used < limit, used, limit, remaining };
}

/**
 * The refusal a client can act on: which limit, what it was, and when it comes
 * back. 402 so the UI can tell "you are out of quota" apart from "not allowed".
 */
export function limitResponse(metric, evaluation, plan, { now = new Date() } = {}) {
  const labels = {
    messages: "generations",
    tokens: "tokens",
    swarm_runs: "build runs",
    images: "images",
    publishes: "publishes",
    publishedPages: "published pages",
  };
  const label = labels[metric] || metric;
  return jsonResponse(402, {
    error: `You have used all ${evaluation.limit} ${label} on the ${normalizePlan(plan)} plan this month. Upgrade to keep going.`,
    code: "plan_limit",
    metric,
    limit: evaluation.limit,
    used: evaluation.used,
    plan: normalizePlan(plan),
    resetsAt: periodResetAt(now),
    upgradeUrl: "/pricing",
  });
}

/**
 * Check a metric before spending money, and record it when allowed.
 * `increments` lets a request count into several metrics at once (a build is a
 * message AND a swarm run AND some tokens).
 */
export async function consumeUsage(
  env,
  uid,
  { metric, increments = null, plan = "free", extra = {} } = {},
) {
  if (!meteringEnabled(env) || !uid) {
    return { allowed: true, skipped: true, used: 0, limit: null, remaining: null };
  }
  const usage = await getUsage(env, uid);
  const evaluation = metric ? evaluateLimit(plan, usage, metric, extra) : { allowed: true };
  if (!evaluation.allowed) {
    return { allowed: false, ...evaluation, usage };
  }
  const written = increments ? await addUsage(env, uid, increments) : true;
  return { allowed: true, ...evaluation, usage, recorded: Boolean(written) };
}

/** The numbers the settings panel shows. */
export async function usageSummary(env, uid, { plan = "free", publishedPages = null, now = new Date() } = {}) {
  const period = periodKey(now);
  const usage = await getUsage(env, uid, { period });
  const limits = limitsForPlan(plan);
  const metrics = {};
  for (const metric of USAGE_METRICS) {
    // tokensEstimated is a diagnostic of `tokens`, not a limit of its own.
    if (metric === "tokensEstimated") continue;
    metrics[metric] = evaluateLimit(plan, usage, metric);
  }
  if (publishedPages !== null) {
    metrics.publishedPages = evaluateLimit(plan, { publishedPages }, "publishedPages");
  }
  const exceeded = Object.entries(metrics)
    .filter(([, value]) => value.limit !== null && value.used >= value.limit)
    .map(([metric]) => metric);
  const nearLimit = Object.entries(metrics)
    .filter(
      ([, value]) =>
        value.limit !== null && value.limit > 0 && value.used / value.limit >= 0.8 && value.used < value.limit,
    )
    .map(([metric]) => metric);
  return {
    period,
    resetsAt: periodResetAt(now),
    plan: normalizePlan(plan),
    limits,
    usage,
    tokensEstimated: usage.tokensEstimated || 0,
    metrics,
    exceeded,
    nearLimit,
    meteringEnabled: meteringEnabled(env),
  };
}
