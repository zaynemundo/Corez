// Per-plan usage metering.
//
// Every paid provider call in this Worker costs money. This module is the one
// place that decides what a plan may use in a month and records what it used.
//
// Storage: `usage_counters` holds one row per (user, month, metric). Admission
// is a SINGLE atomic statement — a guarded upsert that increments the counter
// only when the result stays within the plan's limit — so checking a budget and
// spending it can never race: with one generation remaining, two simultaneous
// requests admit exactly one. There is no separate check-then-record window.
//
// Reconciliation: actual consumption that exceeds the reserved estimate (the
// provider reports more tokens than were charged up front) is added afterwards
// through `recordUsageOnce`, which is idempotent via a `usage_receipts` row in
// the same D1 batch — a retried settlement is a no-op, never a double charge.
//
// Failure model (fail closed):
//   - No D1 binding or `USAGE_METERING_DISABLED=1` is the documented unmetered
//     mode: nothing is counted and nothing is blocked (local dev, tests, an
//     operator explicitly running without accounting).
//   - A configured accounting database that is unreachable or returns an
//     unusable result throws `UsageUnavailableError`. Callers return a
//     retryable 503 and MUST NOT start billable provider work. A read failure
//     is never reported as a fabricated zero balance.
//
// Honesty rules:
//  - Tokens are the provider's reported usage when the response carries it,
//    and otherwise an estimate (characters / 4). `tokensEstimated` counts how
//    much of the total was estimated so the number is never mistaken for
//    billed truth.
//  - A plan may be unlimited (null limit). Unlimited is never a number.

import { jsonResponse } from "./utils.js";

export const USAGE_TABLE = "usage_counters";
export const USAGE_RECEIPTS_TABLE = "usage_receipts";

/** Metrics that are summed over the month. */
export const USAGE_METRICS = [
  "messages",
  "titles",
  "tokens",
  "tokensEstimated",
  "swarm_runs",
  "images",
  "publishes",
  "research_reports",
];

// tokensEstimated is a diagnostic of `tokens`, never a budget of its own, so it
// can never be charged by admission.
const CHARGEABLE_METRICS = new Set(USAGE_METRICS.filter((metric) => metric !== "tokensEstimated"));

const UNLIMITED = null;

/**
 * Plan limits, aligned with what the pricing page promises:
 *   Free      20 generations a month, 1 project, publishing with a badge
 *   Standard  200 generations a month, 10 projects, badge-free
 *   Premium   unlimited generations and projects
 *
 * `messages` is a generation (one user turn), `titles` is the bounded
 * allowance for chat-title generation (a small provider call that is NOT a
 * generation but is still billed work), `swarm_runs` bounds the expensive
 * multi-call build harness separately, `tokens` is the provider-cost backstop,
 * and `images`/`publishes` cover the two other paid paths. `publishedPages` is
 * a live gauge rather than a monthly counter.
 */
export const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({
    messages: 20,
    titles: 50,
    tokens: 250_000,
    swarm_runs: 10,
    images: 10,
    publishes: 3,
    publishedPages: 1,
    research_reports: 5,
  }),
  standard: Object.freeze({
    messages: 200,
    titles: 500,
    tokens: 5_000_000,
    swarm_runs: 100,
    images: 200,
    publishes: 50,
    publishedPages: 10,
    research_reports: 50,
  }),
  premium: Object.freeze({
    messages: UNLIMITED,
    titles: UNLIMITED,
    tokens: UNLIMITED,
    swarm_runs: UNLIMITED,
    images: UNLIMITED,
    publishes: UNLIMITED,
    publishedPages: UNLIMITED,
    research_reports: UNLIMITED,
  }),
});

export const DOMAIN_LIMITS = Object.freeze({
  free: 0,
  standard: 5,
  premium: 20,
});

/**
 * Raised when the accounting database is configured but unusable. Callers
 * must translate it into a retryable error and must not start provider work.
 */
export class UsageUnavailableError extends Error {
  constructor(message = "Usage accounting is unavailable.") {
    super(message);
    this.name = "UsageUnavailableError";
    this.code = "usage_unavailable";
    this.retryable = true;
  }
}

/** The retryable refusal used when the accounting store cannot be reached. */
export function usageUnavailableResponse() {
  return jsonResponse(
    503,
    {
      error: "Usage accounting is temporarily unavailable. Retry shortly.",
      code: "usage_unavailable",
      retryable: true,
    },
    { "Retry-After": "5" },
  );
}

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

// Schema creation is idempotent and cached per D1 binding object so a busy
// isolate does not re-run DDL on every request. A failed attempt is not
// cached: the next request may find the database healthy again.
const usageSchemaReady = new WeakSet();

export async function ensureUsageTables(env) {
  if (!meteringEnabled(env)) return false;
  const db = env.DB;
  if (usageSchemaReady.has(db)) return true;
  const ddl = [
    `CREATE TABLE IF NOT EXISTS ${USAGE_TABLE} (user_id TEXT NOT NULL, period TEXT NOT NULL, metric TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, period, metric))`,
    `CREATE INDEX IF NOT EXISTS idx_usage_period ON ${USAGE_TABLE}(period)`,
    `CREATE TABLE IF NOT EXISTS ${USAGE_RECEIPTS_TABLE} (receipt_key TEXT PRIMARY KEY, user_id TEXT NOT NULL, period TEXT NOT NULL, metric TEXT, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_usage_receipts_user ON ${USAGE_RECEIPTS_TABLE}(user_id, period)`,
  ];
  try {
    if (typeof db.batch === "function") {
      await db.batch(ddl.map((statement) => db.prepare(statement)));
    } else {
      for (const statement of ddl) {
        await db.prepare(statement).run();
      }
    }
  } catch (err) {
    throw new UsageUnavailableError(
      `Usage accounting tables are unavailable: ${err?.message || err}`,
    );
  }
  usageSchemaReady.add(db);
  return true;
}

// One statement decides admission atomically: the row is inserted/updated only
// when the charged amount keeps the counter within the plan limit. A NULL
// limit (unlimited) always charges. `meta.changes === 0` is the refusal.
const CHARGE_SQL = `
  INSERT INTO ${USAGE_TABLE} (user_id, period, metric, count, updated_at)
  SELECT ?, ?, ?, ?, ?
  WHERE ? IS NULL OR ? <= ?
  ON CONFLICT(user_id, period, metric) DO UPDATE SET
    count = ${USAGE_TABLE}.count + excluded.count,
    updated_at = excluded.updated_at
  WHERE ? IS NULL OR ${USAGE_TABLE}.count + excluded.count <= ?`;

const REFUND_SQL = `
  UPDATE ${USAGE_TABLE} SET count = MAX(0, count - ?), updated_at = ?
  WHERE user_id = ? AND period = ? AND metric = ?`;

// Receipt-guarded top-up: the counter moves only when no receipt with this key
// exists yet, and the receipt is written in the same batch. A replay changes
// nothing — idempotent reconciliation.
const RECEIPT_CHARGE_SQL = `
  INSERT INTO ${USAGE_TABLE} (user_id, period, metric, count, updated_at)
  SELECT ?, ?, ?, ?, ?
  WHERE NOT EXISTS (SELECT 1 FROM ${USAGE_RECEIPTS_TABLE} WHERE receipt_key = ?)
  ON CONFLICT(user_id, period, metric) DO UPDATE SET
    count = ${USAGE_TABLE}.count + excluded.count,
    updated_at = excluded.updated_at
  WHERE NOT EXISTS (SELECT 1 FROM ${USAGE_RECEIPTS_TABLE} WHERE receipt_key = ?)`;

const RECEIPT_INSERT_SQL = `
  INSERT INTO ${USAGE_RECEIPTS_TABLE} (receipt_key, user_id, period, metric, created_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(receipt_key) DO NOTHING`;

const SELECT_USAGE_SQL = `SELECT metric, count FROM ${USAGE_TABLE} WHERE user_id=? AND period=?`;

function changesOf(result, context) {
  const changes = result?.meta?.changes;
  if (!Number.isFinite(changes)) {
    throw new UsageUnavailableError(
      `Usage accounting write returned no change metadata (${context}).`,
    );
  }
  return changes;
}

function limitFor(plan, metric) {
  const limits = limitsForPlan(plan);
  return Object.prototype.hasOwnProperty.call(limits, metric) ? limits[metric] : null;
}

function normalizeCharges(charges) {
  const entries = [];
  for (const charge of Array.isArray(charges) ? charges : []) {
    const metric = String(charge?.metric || "");
    const amount = Math.trunc(Number(charge?.amount));
    if (!CHARGEABLE_METRICS.has(metric)) continue;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    entries.push({ metric, amount });
  }
  return entries;
}

/** Read this month's counters for one account. Throws when the store fails. */
export async function getUsage(env, uid, { period = periodKey() } = {}) {
  const usage = emptyUsage();
  if (!meteringEnabled(env) || !uid) return usage;
  await ensureUsageTables(env);
  let result;
  try {
    result = await env.DB.prepare(SELECT_USAGE_SQL).bind(uid, period).all();
  } catch (err) {
    throw new UsageUnavailableError(
      `Usage counters could not be read: ${err?.message || err}`,
    );
  }
  const rows = Array.isArray(result?.results) ? result.results : [];
  for (const row of rows) {
    const metric = String(row?.metric || "");
    if (!USAGE_METRICS.includes(metric)) continue;
    usage[metric] = Number(row.count) || 0;
  }
  return usage;
}

/**
 * Atomically admit (and charge) a set of metrics before billable work starts.
 *
 * Each metric is one guarded upsert, so two concurrent requests can never both
 * pass against the same remaining allowance. When a later charge is refused the
 * earlier charges of this request are refunded (best effort), so a multi-metric
 * request never half-charges.
 *
 * @returns {Promise<{ok: true, consumed: Array<{metric: string, amount: number}>, period: string}
 *   | {ok: false, reason: 'limit', metric: string, evaluation: object, refunded: boolean, period: string}>}
 * @throws {UsageUnavailableError} when the accounting database is unusable.
 */
export async function consumeAllowance(
  env,
  uid,
  { plan = "free", period = periodKey(), charges = [], now = Date.now() } = {},
) {
  const entries = normalizeCharges(charges);
  if (!meteringEnabled(env) || !uid) {
    return { ok: true, skipped: true, consumed: [], period };
  }
  await ensureUsageTables(env);
  const applied = [];
  for (const entry of entries) {
    const limit = limitFor(plan, entry.metric);
    const result = await env.DB.prepare(CHARGE_SQL)
      .bind(
        uid,
        period,
        entry.metric,
        entry.amount,
        now,
        limit,
        entry.amount,
        limit,
        limit,
        limit,
      )
      .run();
    const changes = changesOf(result, entry.metric);
    if (changes === 0) {
      const refunded = await refundCharges(env, uid, period, applied, now);
      const usage = await getUsage(env, uid, { period });
      const evaluation = {
        ...evaluateLimit(plan, usage, entry.metric),
        allowed: false,
      };
      return { ok: false, reason: "limit", metric: entry.metric, evaluation, refunded, period };
    }
    applied.push(entry);
  }
  return { ok: true, consumed: applied, period };
}

async function refundCharges(env, uid, period, charges, now) {
  if (charges.length === 0) return true;
  try {
    const statements = charges.map((charge) =>
      env.DB.prepare(REFUND_SQL).bind(charge.amount, now, uid, period, charge.metric),
    );
    if (typeof env.DB.batch === "function") {
      await env.DB.batch(statements);
    } else {
      for (const statement of statements) await statement.run();
    }
    return true;
  } catch {
    // A failed refund only means the account is charged for work that was not
    // admitted — conservative, never an over-allowance. The next request
    // reports the limit, so no provider work starts either way.
    return false;
  }
}

/**
 * Read-only admission check (no charge). Used where the account has already
 * been charged for the work and only a gate on the remaining backstop budget is
 * wanted (e.g. resuming a task the account already paid for). Still strict:
 * an unavailable accounting database throws instead of allowing the work.
 *
 * @throws {UsageUnavailableError} when the accounting database is unusable.
 */
export async function checkAllowance(
  env,
  uid,
  { plan = "free", period = periodKey(), charges = [] } = {},
) {
  const entries = normalizeCharges(charges);
  if (!meteringEnabled(env) || !uid) {
    return { ok: true, skipped: true, period };
  }
  const usage = await getUsage(env, uid, { period });
  for (const entry of entries) {
    const limit = limitFor(plan, entry.metric);
    const used = Number(usage[entry.metric] || 0);
    if (limit !== null && used + entry.amount > limit) {
      return {
        ok: false,
        reason: "limit",
        metric: entry.metric,
        evaluation: { allowed: false, used, limit, remaining: Math.max(0, limit - used) },
        period,
      };
    }
  }
  return { ok: true, period };
}

/**
 * Idempotently add actual consumption after the fact (reconciliation).
 *
 * The same `key` applied twice records once: the counter moves and the receipt
 * is written in one D1 batch (a transaction), and the replay's guard finds the
 * receipt and changes nothing. A missing `batch` still writes but is not
 * atomic, so callers running on real D1 always get the idempotent path.
 *
 * @returns {Promise<{recorded: boolean, skipped?: boolean}>}
 * @throws {UsageUnavailableError} when the accounting database is unusable.
 */
export async function recordUsageOnce(
  env,
  uid,
  { key, increments, period = periodKey(), now = Date.now() } = {},
) {
  if (!meteringEnabled(env) || !uid || !key) {
    return { recorded: false, skipped: true };
  }
  const entries = normalizeIncrements(increments);
  if (entries.length === 0) return { recorded: false, skipped: true };
  await ensureUsageTables(env);
  const metricLabel = entries.map(([metric]) => metric).join(",");
  const chargeStatements = entries.map(([metric, amount]) =>
    env.DB.prepare(RECEIPT_CHARGE_SQL).bind(uid, period, metric, amount, now, key, key),
  );
  const receiptStatement = env.DB.prepare(RECEIPT_INSERT_SQL).bind(
    key,
    uid,
    period,
    metricLabel,
    now,
  );
  try {
    if (typeof env.DB.batch === "function") {
      const results = await env.DB.batch([...chargeStatements, receiptStatement]);
      const recorded = chargeStatements.some(
        (_, index) => Number(results?.[index]?.meta?.changes) > 0,
      );
      return { recorded };
    }
    // No batch support (test doubles): sequential, still receipt-guarded.
    let recorded = false;
    for (const statement of chargeStatements) {
      const result = await statement.run();
      if (Number(result?.meta?.changes) > 0) recorded = true;
    }
    await receiptStatement.run();
    return { recorded };
  } catch (err) {
    if (err instanceof UsageUnavailableError) throw err;
    throw new UsageUnavailableError(
      `Usage reconciliation failed: ${err?.message || err}`,
    );
  }
}

function normalizeIncrements(increments) {
  const entries = [];
  for (const [metric, amount] of Object.entries(increments || {})) {
    const value = Math.trunc(Number(amount));
    if (!CHARGEABLE_METRICS.has(metric)) continue;
    if (!Number.isFinite(value) || value <= 0) continue;
    entries.push([metric, value]);
  }
  return entries;
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
 * Whether `metric` still has room on this plan, for display and evaluation.
 * @returns {{allowed: boolean, used: number, limit: number|null, remaining: number|null}}
 */
export function evaluateLimit(plan, usage, metric, extra = {}) {
  const limit = limitFor(plan, metric);
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
    titles: "chat titles",
    tokens: "tokens",
    swarm_runs: "build runs",
    images: "images",
    publishes: "publishes",
    publishedPages: "published pages",
    research_reports: "research reports",
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

/** The numbers the settings panel shows. Throws when the store is unusable. */
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
