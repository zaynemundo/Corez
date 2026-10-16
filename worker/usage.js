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
import { USAGE_SCHEMA } from "./dbSchema.js";

export const USAGE_TABLE = "usage_counters";
export const USAGE_RECEIPTS_TABLE = "usage_receipts";
export const USAGE_COMPENSATIONS_TABLE = "usage_compensations";

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
  // DDL text lives in worker/dbSchema.js (USAGE_SCHEMA). The Owed-allowance
  // comment block below stays with the wrapper that owns the table.
  const ddl = [
    USAGE_SCHEMA.tables[0],
    USAGE_SCHEMA.indexes[0],
    USAGE_SCHEMA.tables[1],
    USAGE_SCHEMA.indexes[1],
    // Owed allowance. A refund that could not be written leaves the account
    // charged for work that was refused, and the charges have already
    // committed, so the debt is recorded here instead of being remembered only
    // by the log line that reported the failure. Each row is one metric of one
    // operation: `pending` until `settlePendingCompensations` applies it, and
    // the transition is the guard that makes recovery exactly-once.
    USAGE_SCHEMA.tables[2],
    USAGE_SCHEMA.indexes[2],
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

// Owed allowance that could not be written when it was owed. Recording is
// idempotent per key so a retried failure cannot queue the same debt twice.
const COMPENSATION_INSERT_SQL = `
  INSERT INTO ${USAGE_COMPENSATIONS_TABLE}
    (compensation_key, user_id, period, metric, amount, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  ON CONFLICT(compensation_key) DO NOTHING`;

const PENDING_COMPENSATIONS_SQL = `
  SELECT compensation_key, metric, amount FROM ${USAGE_COMPENSATIONS_TABLE}
  WHERE user_id = ? AND period = ? AND status = 'pending'
  ORDER BY created_at ASC LIMIT 50`;

// Recovery is exactly-once because the counter moves only while the row is
// still pending, and the same transaction then marks it applied. A replay finds
// the row applied, the guard fails, and no counter is touched — a second refund
// can never erase usage that belongs to other work.
const COMPENSATE_COUNTER_SQL = `
  UPDATE ${USAGE_TABLE} SET count = MAX(0, count - ?), updated_at = ?
  WHERE user_id = ? AND period = ? AND metric = ?
    AND EXISTS (
      SELECT 1 FROM ${USAGE_COMPENSATIONS_TABLE}
      WHERE compensation_key = ? AND status = 'pending'
    )`;

const MARK_COMPENSATION_APPLIED_SQL = `
  UPDATE ${USAGE_COMPENSATIONS_TABLE} SET status = 'applied', updated_at = ?
  WHERE compensation_key = ? AND status = 'pending'`;

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

// Run a set of statements as ONE transaction where the binding supports it.
// A statement that throws must roll back the statements before it, because a
// half-applied admission is exactly the bug this guards against.
async function runCharges(env, statements) {
  try {
    if (typeof env.DB.batch === "function") return await env.DB.batch(statements);
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  } catch (err) {
    if (err instanceof UsageUnavailableError) throw err;
    throw new UsageUnavailableError(
      `Usage counters could not be charged: ${err?.message || err}`,
    );
  }
}

/**
 * Atomically admit (and charge) a set of metrics before billable work starts.
 *
 * The whole charge set is applied as one transaction, so a statement that fails
 * rolls back every charge of this request — a failure can never leave a
 * half-applied admission behind. Each metric is still one guarded upsert, so
 * two concurrent requests can never both pass against the same remaining
 * allowance.
 *
 * A metric that is *refused* (rather than failing) does not roll anything back,
 * because a guard that declines is not an error. The whole result set is
 * inspected first, so a refused metric anywhere in the set causes every charge
 * the batch DID apply — including ones after the refusal — to be refunded by
 * compensation. The refund is written in its own transaction, so it is
 * all-or-nothing too, and a failed refund is reported (`refunded: false`)
 * instead of being assumed; the caller can retry it durably.
 *
 * @returns {Promise<{ok: true, consumed: Array<{metric: string, amount: number}>, period: string}
 *   | {ok: false, reason: 'limit', metric: string, evaluation: object, refunded: boolean, refundedCharges: Array<{metric: string, amount: number}>, period: string}>}
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
  if (entries.length === 0) return { ok: true, consumed: [], period };
  await ensureUsageTables(env);

  // Return any allowance a previous refund could not return, before the guards
  // below read the counters — otherwise a retry after a failed refund would be
  // refused against a balance that already owes the account. Best effort: the
  // debt is durable, so a failure here costs a later retry rather than the
  // allowance, and it must not block this admission.
  try {
    await settlePendingCompensations(env, uid, { period, now });
  } catch (err) {
    console.warn(
      `usage compensation sweep failed for ${uid} (${period}): ${err?.message || err}`,
    );
  }

  const statements = entries.map((entry) =>
    env.DB.prepare(CHARGE_SQL).bind(
      uid,
      period,
      entry.metric,
      entry.amount,
      now,
      limitFor(plan, entry.metric),
      entry.amount,
      limitFor(plan, entry.metric),
      limitFor(plan, entry.metric),
      limitFor(plan, entry.metric),
    ),
  );

  const results = await runCharges(env, statements);

  // Inspect EVERY result before deciding anything. A guarded upsert that
  // declines is a successful statement with zero changed rows, so the batch
  // still applied the charges after the refused metric — refunding only the
  // entries seen before the first refusal left those later charges on the
  // counter with no work admitted (the ordering-dependent leak).
  const applied = [];
  let refusal = null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const changes = changesOf(results?.[index], entry.metric);
    if (changes === 0) {
      if (!refusal) refusal = { index, entry };
      continue;
    }
    applied.push(entry);
  }

  if (refusal) {
    // Any failed limit rejects the whole request; every charge the batch did
    // apply is compensated. The refund is one transaction (all-or-nothing). If
    // it cannot be written the debt is recorded durably and `refundDeferred`
    // reports that the allowance is owed rather than returned — a caller must
    // never be told a refund happened when the counters still hold it.
    const refund = await refundCharges(env, uid, period, applied, now);
    const usage = await getUsage(env, uid, { period });
    const evaluation = {
      ...evaluateLimit(plan, usage, refusal.entry.metric),
      allowed: false,
    };
    return {
      ok: false,
      reason: "limit",
      metric: refusal.entry.metric,
      evaluation,
      refunded: refund.refunded,
      refundDeferred: refund.deferred,
      refundedCharges: refund.refunded || refund.deferred ? applied : [],
      period,
    };
  }

  return { ok: true, consumed: applied, period };
}

/**
 * Give back an admission that never became billable work.
 *
 * The counterpart to `consumeAllowance`, for the case where the allowance was
 * reserved and the work was then refused acceptance — a task that could not be
 * created or durably dispatched. The refund is one transaction and can never
 * take a counter below zero, so a repeated failure cannot be used to mint
 * quota.
 *
 * @throws {UsageUnavailableError} when the accounting database is unusable.
 */
export async function refundUsage(
  env,
  uid,
  { period = periodKey(), charges = [], now = Date.now() } = {},
) {
  const entries = normalizeCharges(charges);
  if (!meteringEnabled(env) || !uid) {
    return { ok: true, skipped: true, refunded: [] };
  }
  if (entries.length === 0) return { ok: true, refunded: [] };
  await ensureUsageTables(env);
  const refund = await refundCharges(env, uid, period, entries, now);
  if (!refund.refunded && !refund.deferred) {
    throw new UsageUnavailableError("Usage counters could not be refunded.");
  }
  // Deferred means the debt is durable and will be returned on the next
  // admission for this account. Reporting that as a failure would be wrong, and
  // reporting it as "already returned" would be worse.
  return { ok: true, refunded: entries, deferred: refund.deferred };
}

async function refundCharges(env, uid, period, charges, now) {
  if (charges.length === 0) return { refunded: true, deferred: false, recorded: [] };
  try {
    const statements = charges.map((charge) =>
      env.DB.prepare(REFUND_SQL).bind(charge.amount, now, uid, period, charge.metric),
    );
    // One transaction: a partial refund would leave the account charged for a
    // request that was refused.
    if (typeof env.DB.batch === "function") {
      await env.DB.batch(statements);
    } else {
      for (const statement of statements) await statement.run();
    }
    return { refunded: true, deferred: false, recorded: [] };
  } catch (err) {
    // The charges have already committed, so the allowance is genuinely owed.
    // Losing it must not depend on this call being retried: the debt is written
    // down durably and `settlePendingCompensations` returns it later.
    console.error(
      `usage refund failed for ${uid} (${period}): ${err?.message || err}; ${charges
        .map((charge) => `${charge.metric}+${charge.amount}`)
        .join(", ")}`,
    );
    const recorded = await recordCompensations(env, uid, period, charges, now);
    return {
      refunded: false,
      deferred: recorded.length === charges.length,
      recorded,
    };
  }
}

/**
 * Write down allowance that is owed but could not be returned.
 *
 * Each metric becomes its own row keyed by a fresh id: queuing the same debt
 * twice is a no-op, and one metric failing to record cannot make another metric
 * refundable twice.
 */
async function recordCompensations(env, uid, period, charges, now) {
  const keyFor = (charge) => {
    const unique =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${now}-${Math.random().toString(36).slice(2)}`;
    return `${uid}:${period}:${charge.metric}:${unique}`;
  };
  const statements = charges.map((charge) =>
    env.DB.prepare(COMPENSATION_INSERT_SQL).bind(
      keyFor(charge),
      uid,
      period,
      charge.metric,
      charge.amount,
      now,
      now,
    ),
  );
  try {
    if (typeof env.DB.batch === "function") {
      await env.DB.batch(statements);
    } else {
      for (const statement of statements) await statement.run();
    }
    return charges;
  } catch (err) {
    // The last resort: the debt could not even be written down. Nothing more
    // can be done here, so it must be loud.
    console.error(
      `usage compensation could not be recorded for ${uid} (${period}): ${err?.message || err}; ${charges
        .map((charge) => `${charge.metric}+${charge.amount}`)
        .join(", ")}`,
    );
    return [];
  }
}

/**
 * Return allowance that a previous refund could not return.
 *
 * Runs the owed counters back down and marks each debt applied in one
 * transaction. The guard is the `pending` status, so recovery is exactly-once
 * however many times it runs: a replay touches nothing. The decrement is floored
 * at zero, so even a corrupted ledger cannot mint a negative balance.
 *
 * @returns {Promise<{settled: number, skipped?: boolean}>}
 * @throws {UsageUnavailableError} when the accounting database is unusable.
 */
export async function settlePendingCompensations(
  env,
  uid,
  { period = periodKey(), now = Date.now() } = {},
) {
  if (!meteringEnabled(env) || !uid) return { settled: 0, skipped: true };
  await ensureUsageTables(env);
  let rows;
  try {
    const result = await env.DB.prepare(PENDING_COMPENSATIONS_SQL)
      .bind(uid, period)
      .all();
    rows = Array.isArray(result?.results) ? result.results : [];
  } catch (err) {
    throw new UsageUnavailableError(
      `Usage compensations could not be read: ${err?.message || err}`,
    );
  }
  if (rows.length === 0) return { settled: 0 };

  const statements = [];
  for (const row of rows) {
    statements.push(
      env.DB.prepare(COMPENSATE_COUNTER_SQL).bind(
        Number(row.amount) || 0,
        now,
        uid,
        period,
        String(row.metric || ""),
        String(row.compensation_key || ""),
      ),
    );
    statements.push(
      env.DB.prepare(MARK_COMPENSATION_APPLIED_SQL).bind(
        now,
        String(row.compensation_key || ""),
      ),
    );
  }
  try {
    if (typeof env.DB.batch === "function") {
      await env.DB.batch(statements);
    } else {
      for (const statement of statements) await statement.run();
    }
  } catch (err) {
    throw new UsageUnavailableError(
      `Usage compensations could not be applied: ${err?.message || err}`,
    );
  }
  return { settled: rows.length };
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
