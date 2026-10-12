import { jsonResponse, readBoundedJson, safeErrorDetail } from "./utils.js";
import {
  ZIINA_PLANS,
  ZIINA_PLANS_YEARLY,
  isTestPayment,
  isZiinaTestMode,
} from "./ziina.js";

const ZIINA_BASE = "https://api-v2.ziina.com/api";
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_DAYS = 30;
const YEAR_DAYS = 365;
const FREE_PLAN = "free";

export async function ensureSubscriptionTables(env) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency_code TEXT NOT NULL DEFAULT 'AED',
      status TEXT NOT NULL DEFAULT 'pending',
      period_start INTEGER,
      period_end INTEGER,
      ziina_payment_id TEXT,
      test_mode INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    ).run();
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, created_at DESC)`,
    ).run();
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`,
    ).run();
    try {
      await env.DB.prepare(
        `ALTER TABLE subscriptions ADD COLUMN test_mode INTEGER NOT NULL DEFAULT 0`,
      ).run();
    } catch {}
    // Ownership outlives the checkout UI state. `abandoned_at` marks a checkout
    // the user no longer wants to finish; the row itself is kept, because it is
    // the only local proof that a Ziina payment id belongs to this account. A
    // payment that completes after abandonment can therefore still be settled
    // instead of being refused as `payment_not_owned`.
    try {
      await env.DB.prepare(
        `ALTER TABLE subscriptions ADD COLUMN abandoned_at INTEGER`,
      ).run();
    } catch {}
    // Exactly-once payment settlement ledger. The Ziina payment id is the
    // primary key, so concurrent/duplicate verifications of the same payment
    // race on one atomic INSERT — only the claim holder activates, and every
    // later verification reads back the original period instead of minting a
    // new one.
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS payment_ledger (
      payment_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      currency_code TEXT NOT NULL DEFAULT 'AED',
      interval TEXT NOT NULL DEFAULT 'month',
      status TEXT NOT NULL DEFAULT 'processing',
      claim_token TEXT,
      subscription_id TEXT,
      period_start INTEGER,
      period_end INTEGER,
      test_mode INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    ).run();
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_payment_ledger_user ON payment_ledger(user_id, created_at DESC)`,
    ).run();
    // Ensure users has subscription fields
    try {
      await env.DB.prepare(
        `ALTER TABLE users ADD COLUMN subscription_plan TEXT DEFAULT 'free'`,
      ).run();
    } catch {}
    try {
      await env.DB.prepare(
        `ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'active'`,
      ).run();
    } catch {}
    try {
      await env.DB.prepare(
        `ALTER TABLE users ADD COLUMN subscription_period_end INTEGER`,
      ).run();
    } catch {}
    try {
      await env.DB.prepare(
        `ALTER TABLE users ADD COLUMN subscription_ziina_id TEXT`,
      ).run();
    } catch {}
    try {
      await env.DB.prepare(
        `ALTER TABLE users ADD COLUMN downgrade_plan TEXT`,
      ).run();
    } catch {}
    try {
      await env.DB.prepare(
        `ALTER TABLE users ADD COLUMN downgrade_scheduled_at INTEGER`,
      ).run();
    } catch {}
  } catch (e) {
    console.warn("ensureSubscriptionTables failed", safeErrorDetail(e));
  }
}

export function getPlanOrFree(plan) {
  const key = String(plan || "")
    .trim()
    .toLowerCase();
  if (ZIINA_PLANS[key]) return { key, meta: ZIINA_PLANS[key] };
  // fallback to free
  return { key: "free", meta: ZIINA_PLANS["free"] };
}

/**
 * Plan ordering, used to keep cancel/downgrade routes from ever moving a user
 * UP the ladder. Only the verified payment flow may grant a higher plan.
 */
export const PLAN_RANK = Object.freeze({ free: 0, standard: 1, premium: 2 });

/** True when `target` is a strictly lower plan than `current`. */
export function isDowngrade(current, target) {
  return (PLAN_RANK[target] ?? 0) < (PLAN_RANK[current] ?? 0);
}

/** A claim this old was abandoned (failed batch or crashed Worker) — retryable. */
const STALE_SETTLEMENT_MS = 2 * 60 * 1000;

/**
 * Amount (fils) -> canonical plan + interval.
 *
 * The amount is the only thing Ziina verifies, so it is the only thing that
 * decides what a payment buys. Unmatched amounts grant free; a client `plan`
 * hint can never raise it. `basic` is an alias and resolves to standard.
 */
export function derivePlanFromAmount(amount) {
  const paid = Number(amount);
  if (!Number.isFinite(paid)) {
    return { planKey: null, plan: "free", interval: "month", amount: NaN };
  }
  const paidEntry = Object.entries(ZIINA_PLANS).find(
    ([, meta]) => Number(meta.amount) === paid,
  );
  const planKey = paidEntry ? paidEntry[0] : null;
  if (!planKey || planKey === "free") {
    return { planKey: planKey || null, plan: "free", interval: "month", amount: paid };
  }
  const base = planKey.replace(/_yearly$/, "");
  return {
    planKey,
    plan: base === "basic" ? "standard" : base,
    interval: planKey.endsWith("_yearly") ? "year" : "month",
    amount: paid,
  };
}

/**
 * Turn a Ziina payment object into a grant decision. The caller must already
 * have established ownership (a local checkout belonging to the user); this
 * rejects payments that must not buy a production entitlement: unfinished,
 * non-AED, or test payments on a live deployment.
 */
export function inspectCompletedPayment(env, data, localTestMode = false) {
  const status = String(data?.status || "").toLowerCase();
  if (status !== "completed") {
    return { ok: false, reason: "not_completed", status: data?.status ?? null };
  }
  const currency = String(data?.currency_code || "")
    .trim()
    .toUpperCase();
  if (currency !== "AED") {
    return { ok: false, reason: "currency_mismatch", currency };
  }
  const testPayment = Boolean(localTestMode) || isTestPayment(data);
  if (testPayment && !isZiinaTestMode(env)) {
    return { ok: false, reason: "test_payment", testPayment: true };
  }
  return { ok: true, ...derivePlanFromAmount(data?.amount), testPayment };
}

export async function getActiveSubscription(env, userId) {
  if (!env?.DB || !userId) return null;
  try {
    // Latest pending (abandoned or in-flight upgrade) — reported but never current
    const pending = await env.DB.prepare(
      "SELECT plan, ziina_payment_id FROM subscriptions WHERE user_id=? AND status='pending' AND abandoned_at IS NULL ORDER BY created_at DESC LIMIT 1",
    )
      .bind(userId)
      .first()
      .catch(() => null);
    const pendingFields = {
      pending_plan: pending?.plan ? String(pending.plan).toLowerCase() : null,
      pending_payment_id: pending?.ziina_payment_id || null,
    };
    // Get user plan first
    const user = await env.DB.prepare(
      "SELECT plan, subscription_plan, subscription_status, subscription_period_end, downgrade_plan, downgrade_scheduled_at FROM users WHERE id=?",
    )
      .bind(userId)
      .first();
    let plan = user?.plan || user?.subscription_plan || "free";
    let periodEnd = user?.subscription_period_end;
    let status = user?.subscription_status || "active";
    let downgradePlan = user?.downgrade_plan ? String(user.downgrade_plan).toLowerCase() : null;

    // If free, always active (but check if downgrade scheduled to free is pending and period ended)
    if (plan === "free" || plan === FREE_PLAN) {
      // If free with downgrade scheduled, clear it
      if (downgradePlan) {
        try {
          await env.DB.prepare(
            `UPDATE users SET downgrade_plan=NULL, downgrade_scheduled_at=NULL WHERE id=?`,
          )
            .bind(userId)
            .run();
        } catch {}
      }
      return { plan: "free", status: "active", period_end: null, isFree: true, ...pendingFields };
    }

    // Scheduled downgrade that matches the current plan is meaningless — clear it
    if (downgradePlan && downgradePlan === plan) {
      try {
        await env.DB.prepare(
          `UPDATE users SET downgrade_plan=NULL, downgrade_scheduled_at=NULL, subscription_status='active' WHERE id=?`,
        )
          .bind(userId)
          .run();
      } catch {}
      downgradePlan = null;
      status = "active";
    }
    // 'canceled' without a scheduled downgrade is a stale legacy flag — the user
    // is still on their paid plan until period end (or expired past it).
    if (status === "canceled" && !downgradePlan) status = "active";

    // For paid, check expiry and scheduled downgrade
    const now = Date.now();
    // If period ended and there's a scheduled downgrade, perform it now (lazy)
    if (periodEnd && Number(periodEnd) < now) {
      if (downgradePlan && ZIINA_PLANS[downgradePlan]) {
        // Perform downgrade
        const newPlan = downgradePlan;
        try {
          await env.DB.prepare(
            `UPDATE users SET plan=?, subscription_plan=?, subscription_status='active', downgrade_plan=NULL, downgrade_scheduled_at=NULL, subscription_period_end=NULL, subscription_ziina_id=NULL WHERE id=?`,
          )
            .bind(newPlan, newPlan, userId)
            .run();
          // Insert a record for downgrade
          try {
            await env.DB.prepare(
              `INSERT INTO subscriptions (id, user_id, plan, amount, currency_code, status, period_start, period_end, ziina_payment_id, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            )
              .bind(
                crypto.randomUUID(),
                userId,
                newPlan,
                ZIINA_PLANS[newPlan].amount,
                "AED",
                "active",
                now,
                null,
                null,
                now,
                now,
              )
              .run();
          } catch {}
        } catch {}
        if (newPlan === "free") {
          return { plan: "free", status: "active", period_end: null, isFree: true, downgraded: true, ...pendingFields };
        }
        return {
          plan: newPlan,
          status: "active",
          period_end: null,
          isFree: false,
          downgraded: true,
          ...pendingFields,
        };
      }
      // No downgrade, just expired
      return {
        plan,
        status: "expired",
        period_end: Number(periodEnd),
        isExpired: true,
        isFree: false,
        downgrade_plan: downgradePlan || null,
        ...pendingFields,
      };
    }
    // If canceled/downgrade scheduled but still within period, show as active with scheduled flag
    if (downgradePlan) {
      return {
        plan,
        status: status === "canceled" ? "canceled" : "active",
        period_end: periodEnd ? Number(periodEnd) : null,
        isFree: false,
        isScheduledDowngrade: true,
        downgrade_plan: downgradePlan,
        downgrade_scheduled_at: user?.downgrade_scheduled_at ? Number(user.downgrade_scheduled_at) : null,
        ...pendingFields,
      };
    }
    if (status === "expired" || status === "canceled") {
      return {
        plan,
        status,
        period_end: periodEnd ? Number(periodEnd) : null,
        isFree: false,
        ...pendingFields,
      };
    }
    // Try to get latest ACTIVE subscription record (ignore pending — pending is not current)
    const sub = await env.DB.prepare(
      "SELECT * FROM subscriptions WHERE user_id=? AND status='active' ORDER BY created_at DESC LIMIT 1",
    )
      .bind(userId)
      .first()
      .catch(() => null);
    if (sub) {
      const isExpired =
        sub.period_end &&
        Number(sub.period_end) < now &&
        sub.status === "active";
      // If sub is expired but we have a scheduled downgrade, already handled above
      // Otherwise return active sub
      if (isExpired) {
        // Reconcile: the plan actually lapsed — treat as expired, keep fallback users-table fields
        return {
          plan: sub.plan,
          status: "expired",
          period_end: Number(sub.period_end),
          isExpired: true,
          isFree: false,
          ...pendingFields,
        };
      }
      return {
        plan: sub.plan,
        status: sub.status,
        period_start: sub.period_start ? Number(sub.period_start) : null,
        period_end: sub.period_end
          ? Number(sub.period_end)
          : periodEnd
            ? Number(periodEnd)
            : null,
        ziina_payment_id: sub.ziina_payment_id,
        isExpired: false,
        isFree: false,
        subscription: sub,
        ...pendingFields,
      };
    }
    // No active sub row, fallback to users table plan (handles free and scheduled)
    return {
      plan,
      status,
      period_end: periodEnd ? Number(periodEnd) : null,
      isFree: false,
      ...pendingFields,
    };
  } catch {
    return null;
  }
}

function isFreePlan(plan) {
  return plan === "free" || plan === FREE_PLAN;
}

/**
 * Activation statements for one user, executed as a single transaction.
 *
 * Database failures MUST propagate: a swallowed error here used to make a
 * failed activation look like a successful one. Callers either handle the
 * throw (and report failure) or run inside settleVerifiedPayment(), whose
 * ledger claim makes the retry safe.
 */
function buildActivationStatements(
  env,
  userId,
  plan,
  ziinaPaymentId,
  amount,
  interval = "month",
  now,
) {
  const isFree = isFreePlan(plan);
  const intervalKey = String(interval || "month").toLowerCase();
  const isYearly =
    intervalKey === "year" ||
    intervalKey === "yearly" ||
    intervalKey === "annual" ||
    intervalKey === "annually";
  const periodDays = isYearly ? YEAR_DAYS : MONTH_DAYS;
  const periodEnd = isFree ? null : now + periodDays * DAY_MS;
  const id = crypto.randomUUID();
  const meta = ZIINA_PLANS[plan] || ZIINA_PLANS["standard"];
  // For yearly, use the yearly amount when the caller did not pass one.
  let finalAmount = isFree ? 0 : Number(amount) || meta.amount;
  if (isYearly && !Number(amount)) {
    const yearlyMeta = ZIINA_PLANS[`${plan}_yearly`] || ZIINA_PLANS_YEARLY?.[plan];
    if (yearlyMeta) finalAmount = yearlyMeta.amount;
  }

  const statements = [
    // Mark any previous ACTIVE rows as completed (one true current plan) and drop
    // superseded pending rows so they can never activate later. Abandoned rows
    // are deliberately kept: they are the ownership record a late-completing
    // payment is settled or refunded through, and deleting one here would
    // reintroduce exactly the loss that marking replaced.
    env.DB.prepare(
      `UPDATE subscriptions SET status='completed', updated_at=? WHERE user_id=? AND status='active'`,
    ).bind(now, userId),
    env.DB.prepare(
      `DELETE FROM subscriptions WHERE user_id=? AND status='pending' AND abandoned_at IS NULL`,
    ).bind(userId),
    env.DB.prepare(
      `INSERT INTO subscriptions (id, user_id, plan, amount, currency_code, status, period_start, period_end, ziina_payment_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id,
      userId,
      plan,
      finalAmount,
      "AED",
      "active",
      now,
      periodEnd,
      ziinaPaymentId || null,
      now,
      now,
    ),
    // Update users table — clear any scheduled downgrade on activation.
    env.DB.prepare(
      `UPDATE users SET plan=?, subscription_plan=?, subscription_status=?, subscription_period_end=?, subscription_ziina_id=?, downgrade_plan=NULL, downgrade_scheduled_at=NULL WHERE id=?`,
    ).bind(plan, plan, "active", periodEnd, ziinaPaymentId || null, userId),
  ];
  return {
    statements,
    result: {
      id,
      plan,
      amount: finalAmount,
      period_start: now,
      period_end: periodEnd,
      ziina_payment_id: ziinaPaymentId || null,
    },
  };
}

/**
 * Execute prepared statements. D1's batch() wraps them in one transaction
 * (all-or-nothing); the sequential fallback keeps minimal test doubles and
 * older local shims working while still surfacing every failure.
 */
async function executeStatements(env, statements) {
  if (!env?.DB) throw new Error("Database not configured");
  if (typeof env.DB.batch === "function") {
    await env.DB.batch(statements);
    return;
  }
  for (const statement of statements) {
    await statement.run();
  }
}

export async function activateSubscription(
  env,
  userId,
  plan,
  ziinaPaymentId,
  amount,
  interval = "month",
) {
  const now = Date.now();
  const { statements, result } = buildActivationStatements(
    env,
    userId,
    plan,
    ziinaPaymentId,
    amount,
    interval,
    now,
  );
  await executeStatements(env, statements);
  return result;
}

function ledgerResult(row) {
  return {
    id: row.subscription_id,
    plan: String(row.plan || "free"),
    amount: Number(row.amount) || 0,
    period_start: row.period_start == null ? null : Number(row.period_start),
    period_end: row.period_end == null ? null : Number(row.period_end),
    ziina_payment_id: row.payment_id,
    interval: String(row.interval || "month"),
  };
}

/**
 * Settle a verified Ziina payment exactly once.
 *
 * The payment_ledger row is claimed with one atomic INSERT (payment id is the
 * primary key), so of N concurrent/duplicate verifications exactly one runs
 * the activation transaction. Everybody else reads the ledger back:
 *
 *   - settled    -> the ORIGINAL result (period_end included), never a freshly
 *                   computed period;
 *   - processing -> another verification is mid-flight; report in progress;
 *   - failed or stale processing -> re-claim and retry (safe: D1 batches are
 *                   atomic, so a rolled-back attempt activated nothing).
 *
 * A database failure marks the claim failed and rethrows — callers must never
 * translate it into a successful-looking response.
 */
export async function settleVerifiedPayment(env, options) {
  const {
    userId,
    paymentId,
    plan,
    amount,
    interval = "month",
    testMode = false,
  } = options || {};
  const paymentKey = String(paymentId || "").trim();
  if (!env?.DB) throw new Error("Database not configured");
  if (!userId) throw new Error("user id is required for settlement");
  if (!paymentKey) throw new Error("payment id is required for settlement");

  const now = Date.now();
  const claimToken = crypto.randomUUID();

  // Claim the payment (no-op when it was already claimed).
  await env.DB.prepare(
    `INSERT INTO payment_ledger (payment_id, user_id, plan, amount, currency_code, interval, status, claim_token, test_mode, created_at, updated_at)
     VALUES (?,?,?,?,?,?,'processing',?,?,?,?)
     ON CONFLICT(payment_id) DO NOTHING`,
  )
    .bind(
      paymentKey,
      userId,
      plan,
      Number(amount) || 0,
      "AED",
      interval,
      claimToken,
      testMode ? 1 : 0,
      now,
      now,
    )
    .run();

  // Take over a claim left behind by a failed batch or a crashed Worker.
  await env.DB.prepare(
    `UPDATE payment_ledger SET claim_token=?, plan=?, amount=?, interval=?, test_mode=?, status='processing', updated_at=?
     WHERE payment_id=? AND user_id=? AND (status='failed' OR (status='processing' AND updated_at<=?))`,
  )
    .bind(
      claimToken,
      plan,
      Number(amount) || 0,
      interval,
      testMode ? 1 : 0,
      now,
      paymentKey,
      userId,
      now - STALE_SETTLEMENT_MS,
    )
    .run();

  const claim = await env.DB.prepare(
    `SELECT payment_id, user_id, plan, amount, interval, status, claim_token, subscription_id, period_start, period_end FROM payment_ledger WHERE payment_id=?`,
  )
    .bind(paymentKey)
    .first();

  if (!claim || String(claim.user_id) !== String(userId)) {
    return { ok: false, code: "payment_owned_by_another_account" };
  }
  if (claim.claim_token !== claimToken) {
    if (String(claim.status) === "settled") {
      return { ok: true, duplicate: true, result: ledgerResult(claim) };
    }
    return { ok: true, inProgress: true, result: null };
  }

  const activationNow = Date.now();
  const { statements, result } = buildActivationStatements(
    env,
    userId,
    plan,
    paymentKey,
    amount,
    interval,
    activationNow,
  );
  statements.push(
    env.DB.prepare(
      `UPDATE payment_ledger SET status='settled', subscription_id=?, period_start=?, period_end=?, claim_token=NULL, updated_at=? WHERE payment_id=? AND claim_token=?`,
    ).bind(
      result.id,
      result.period_start,
      result.period_end,
      activationNow,
      paymentKey,
      claimToken,
    ),
  );

  try {
    await executeStatements(env, statements);
  } catch (error) {
    try {
      await env.DB.prepare(
        `UPDATE payment_ledger SET status='failed', claim_token=NULL, updated_at=? WHERE payment_id=? AND claim_token=?`,
      )
        .bind(Date.now(), paymentKey, claimToken)
        .run();
    } catch {
      // The original error is the one that matters.
    }
    throw error;
  }

  return { ok: true, duplicate: false, result };
}

// Reconcile pending (in-flight / abandoned) checkouts against Ziina.
//
// Settlement only — never cleanup. A completed payment settles exactly once
// (money is never silently discarded), and a transient Ziina/database failure
// keeps the row for a later retry.
//
// Crucially, this must NOT delete the local checkout row for a payment that
// may still complete. Since verification proves ownership by matching this
// row, a passive status check (GET /api/subscriptions/me calls this function)
// deleting an unfinished checkout would leave a later captured payment with
// no way to activate. Rows are removed only by:
//   - explicit POST /api/subscriptions/abandon,
//   - a fresh checkout for the same plan (which replaces dead intents),
//   - activation (which clears pending rows), or
//   - having no payment id at all (nothing could ever settle it).
export async function reconcilePendingSubscriptions(env, userId) {
  let pendingRows;
  try {
    const rows = await env.DB.prepare(
      "SELECT id, plan, amount, ziina_payment_id, test_mode FROM subscriptions WHERE user_id=? AND status='pending'",
    )
      .bind(userId).all();
    pendingRows = Array.isArray(rows?.results) ? rows.results : [];
  } catch {
    return { reconciled: false };
  }
  if (pendingRows.length === 0) return { reconciled: true, activated: null, unconfirmed: false };
  const apiKey = env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN;
  let activated = null;
  // True when at least one row could not be checked with Ziina. The caller must
  // not treat "we could not ask" as "we know it did not complete".
  let unconfirmed = false;
  const dropPending = async (rowId) => {
    try {
      await env.DB.prepare(`DELETE FROM subscriptions WHERE id=?`).bind(rowId).run();
    } catch {}
  };
  // Once a row has settled, its attribution has moved onto the active row the
  // activation inserted (same user_id + payment_id), so the live checkout record
  // retires. This is the one place deleting a row is safe: the payment is
  // already provably owned by an active subscription, so nothing is lost.
  const retireSettled = async (rowId) => {
    try {
      await env.DB.prepare(`DELETE FROM subscriptions WHERE id=?`).bind(rowId).run();
    } catch {}
  };
  for (const row of pendingRows) {
    // Without a payment id there is nothing that could ever settle this row.
    if (!row.ziina_payment_id) {
      await dropPending(row.id);
      continue;
    }
    // No Ziina credentials: keep the ownership row so a later reconcile (with
    // credentials restored) can still settle it.
    if (!apiKey) {
      unconfirmed = true;
      continue;
    }
    let data;
    try {
      const ziinaRes = await fetch(
        `${ZIINA_BASE}/payment_intent/${encodeURIComponent(row.ziina_payment_id)}`,
        { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
      );
      if (!ziinaRes.ok) {
        unconfirmed = true;
        continue; // Ziina unavailable — keep the row and retry later.
      }
      data = await ziinaRes.json().catch(() => ({}));
    } catch {
      unconfirmed = true;
      continue; // Network failure — the payment may still be captured; retry later.
    }
    const inspection = inspectCompletedPayment(env, data, row.test_mode);
    if (!inspection.ok) {
      // Unfinished (requires_user_action / pending / ...), failed, canceled,
      // test, or foreign-currency: keep the ownership record and retry later.
      // An in-flight payment is not abandoned — it may still complete — and a
      // completed payment that cannot buy an entitlement is re-reported on
      // every reconcile until the user retries checkout or calls /abandon.
      if (inspection.reason === "test_payment" || inspection.reason === "currency_mismatch") {
        console.warn(
          `reconcilePendingSubscriptions: refusing ${inspection.reason} payment ${row.ziina_payment_id}`,
        );
      }
      continue;
    }
    try {
      const settlement = await settleVerifiedPayment(env, {
        userId,
        paymentId: row.ziina_payment_id,
        plan: inspection.plan,
        amount: inspection.amount,
        interval: inspection.interval,
        testMode: inspection.testPayment,
      });
      if (settlement?.ok && !settlement.inProgress) {
        activated = settlement.result;
        await retireSettled(row.id);
      }
    } catch (e) {
      console.warn("reconcilePendingSubscriptions settlement failed", safeErrorDetail(e));
      // Keep the pending row: a later reconcile retries the settlement.
    }
  }
  return { reconciled: true, activated, unconfirmed };
}

export async function handleSubscriptions(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Only handle subscription routes
  if (!pathname.startsWith("/api/subscriptions")) return null;

  // Ensure tables exist
  await ensureSubscriptionTables(env);

  // Auth required for all subscription routes
  const authSecret = env?.AUTH_SECRET;
  if (authSecret) {
    const { verifySession } = await import("./auth.js");
    const sess = await verifySession(request, env);
    if (!sess) {
      return jsonResponse(401, {
        error: "Authentication required. Please log in.",
      });
    }
    // Attach user to request for handlers
    request._corez_user = sess;
  }

  const user = request._corez_user || { uid: "dev", email: "dev@corez.pro" };
  const userId = user.uid;

  // GET /api/subscriptions/me  -> current subscription
  if (pathname === "/api/subscriptions/me" && request.method === "GET") {
    // Reconcile in-flight checkouts first: a completed-but-unverified Ziina
    // payment activates here, abandoned ones are dropped — so a pending
    // upgrade can never mask or later clobber the user's real plan.
    await reconcilePendingSubscriptions(env, userId);
    const sub = await getActiveSubscription(env, userId);
    if (!sub)
      return jsonResponse(200, {
        plan: "free",
        status: "active",
        isFree: true,
      });
    return jsonResponse(200, sub);
  }

  // GET /api/subscriptions/pending -> in-flight checkout (resume payment)
  if (pathname === "/api/subscriptions/pending" && request.method === "GET") {
    const apiKey = env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN;
    try {
      const row = await env.DB.prepare(
        "SELECT plan, ziina_payment_id FROM subscriptions WHERE user_id=? AND status='pending' AND abandoned_at IS NULL ORDER BY created_at DESC LIMIT 1",
      )
        .bind(userId)
        .first();
      if (!row || !row.ziina_payment_id)
        return jsonResponse(200, { pending: null });
      let ziina = {};
      if (apiKey) {
        const r = await fetch(
          `${ZIINA_BASE}/payment_intent/${encodeURIComponent(row.ziina_payment_id)}`,
          { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
        );
        ziina = r.ok ? await r.json().catch(() => ({})) : {};
      }
      return jsonResponse(200, {
        pending: {
          plan: row.plan,
          payment_id: row.ziina_payment_id,
          status: ziina?.status || null,
          redirect_url: ziina?.redirect_url || null,
        },
      });
    } catch (e) {
      return jsonResponse(502, { error: "Failed to load pending checkout", detail: safeErrorDetail(e) });
    }
  }

  // POST /api/subscriptions/abandon -> stop an unfinished checkout (cancel upgrade)
  // Body: { plan? } — omit to abandon every pending checkout for this user.
  //
  // Abandoning is a UI decision, not a statement about the money. The row is
  // MARKED, never deleted: it is the local proof that a Ziina payment id
  // belongs to this account, so a payment that completes afterwards must still
  // be settleable. Deleting it turned a captured payment into an
  // unrecoverable `payment_not_owned` refusal on the next verification.
  if (pathname === "/api/subscriptions/abandon" && request.method === "POST") {
    let body;
    try { body = await readBoundedJson(request); } catch { body = {}; }
    if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
    const plan = String(body.plan || "").trim().toLowerCase();
    // Reconcile first: if the "abandoned" payment actually completed on Ziina,
    // it must activate — abandoning must never lose a captured payment.
    const reconciled = await reconcilePendingSubscriptions(env, userId);
    if (reconciled?.reconciled === false) {
      // The checkout rows could not be read, so which ones are safe to mark is
      // unknown. Report a retryable failure instead of guessing.
      return jsonResponse(503, {
        ok: false,
        code: "reconcile_unavailable",
        error: "Could not read the pending checkout right now. Try again shortly.",
      });
    }
    if (!reconciled?.activated) {
      const now = Date.now();
      try {
        if (plan && ZIINA_PLANS[plan]) {
          await env.DB.prepare(
            `UPDATE subscriptions SET abandoned_at=?, updated_at=? WHERE user_id=? AND status='pending' AND abandoned_at IS NULL AND lower(plan)=?`,
          )
            .bind(now, now, userId, plan)
            .run();
        } else {
          await env.DB.prepare(
            `UPDATE subscriptions SET abandoned_at=?, updated_at=? WHERE user_id=? AND status='pending' AND abandoned_at IS NULL`,
          )
            .bind(now, now, userId)
            .run();
        }
      } catch (err) {
        return jsonResponse(503, {
          ok: false,
          code: "abandon_unavailable",
          error: "Could not abandon the pending checkout right now. Try again shortly.",
          detail: safeErrorDetail(err),
        });
      }
    }
    const sub = await getActiveSubscription(env, userId);
    const confirmationPending = Boolean(reconciled?.unconfirmed);
    return jsonResponse(200, {
      ok: true,
      plan: sub?.plan || "free",
      activated: Boolean(reconciled?.activated),
      message: reconciled?.activated
        ? "Payment completed — plan activated"
        : confirmationPending
          ? "Checkout abandoned. Ziina could not be reached, so the payment is still tracked and will be settled automatically if it completed."
          : "Checkout abandoned",
      confirmation_pending: confirmationPending,
      subscription: sub,
    });
  }

  // GET /api/subscriptions/plans  -> list plans
  if (pathname === "/api/subscriptions/plans" && request.method === "GET") {
    return jsonResponse(200, {
      plans: [
        {
          id: "free",
          name: "Free",
          price: "0 AED",
          amount: 0,
          interval: "forever",
          features: ["Limited generations", "Community support"],
          popular: false,
        },
        {
          id: "standard",
          name: "Standard",
          price: "18.36 AED",
          amount: 1836,
          interval: "month",
          currency: "AED",
          fils: 1836,
          features: [
            "More builds & publish",
            "Priority queue",
            "Standard support",
          ],
          popular: true,
        },
        {
          id: "premium",
          name: "Premium",
          price: "27.54 AED",
          amount: 2754,
          interval: "month",
          currency: "AED",
          fils: 2754,
          features: ["Unlimited builds", "Priority support", "Early features"],
          popular: false,
        },
      ],
      currency: "AED",
      interval: "month",
    });
  }

  // POST /api/subscriptions/checkout  -> create Ziina payment intent for plan (monthly)
  if (pathname === "/api/subscriptions/checkout" && request.method === "POST") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON" });
    }
    const rawPlan = String(body.plan || body.tier || "standard")
      .trim()
      .toLowerCase();
    const allowed = new Set(["free", "standard", "premium"]);
    const plan = allowed.has(rawPlan) ? rawPlan : null;
    if (!plan)
      return jsonResponse(400, {
        error:
          "Invalid plan. Use free, standard (18.36 AED/month) or premium (27.54 AED/month)",
      });

    if (plan === "free") {
      // Free needs no payment — just activate. A database failure must fail the
      // request, never return a success-shaped "activated" response.
      try {
        await activateSubscription(env, userId, "free", null, 0, "month");
      } catch (err) {
        return jsonResponse(502, {
          error: "Failed to activate the free plan",
          detail: safeErrorDetail(err),
        });
      }
      return jsonResponse(200, {
        free: true,
        plan: "free",
        message: "Free plan activated — no payment required",
      });
    }

    const rawInterval = String(body.interval || body.billing || body.billing_interval || body.period || "").trim().toLowerCase();
    const isYearly = rawInterval === "yearly" || rawInterval === "year" || rawInterval === "annual" || rawInterval === "annually";
    const interval = isYearly ? "year" : "month";
    const yearlyKey = `${plan}_yearly`;
    const meta = isYearly && ZIINA_PLANS[yearlyKey] ? ZIINA_PLANS[yearlyKey] : ZIINA_PLANS[plan];
    if (!meta) return jsonResponse(400, { error: "Unknown plan" });
    const periodLabel = isYearly ? "365 days" : "30 days";
    const intervalLabel = isYearly ? "year" : "month";

    const apiKey = env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN;
    if (!apiKey) return jsonResponse(500, { error: "Ziina not configured" });

    // Reuse an existing in-flight checkout for this same plan+interval instead of
    // creating a duplicate Ziina intent — repeated Upgrade clicks resume.
    const pendingAmount = meta.amount;
    let existing = null;
    try {
      existing = await env.DB.prepare(
        "SELECT ziina_payment_id, amount, test_mode FROM subscriptions WHERE user_id=? AND status='pending' AND abandoned_at IS NULL AND lower(plan)=? AND amount=? ORDER BY created_at DESC LIMIT 1",
      )
        .bind(userId, plan, pendingAmount)
        .first();
    } catch {}
    if (existing?.ziina_payment_id) {
      let existingPayment = null;
      let fetchOk = false;
      try {
        const r = await fetch(
          `${ZIINA_BASE}/payment_intent/${encodeURIComponent(existing.ziina_payment_id)}`,
          { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
        );
        fetchOk = r.ok;
        existingPayment = r.ok ? await r.json().catch(() => ({})) : null;
      } catch {}
      if (
        fetchOk &&
        existingPayment?.id &&
        !["completed", "failed", "canceled"].includes(
          String(existingPayment.status || "").toLowerCase(),
        )
      ) {
        return jsonResponse(200, {
          plan,
          amount: meta.amount,
          aed: meta.aed,
          interval: intervalLabel,
          resumed: true,
          ziina_id: existingPayment.id,
          redirect_url: existingPayment.redirect_url,
          embedded_url: existingPayment.embedded_url,
          success_url: existingPayment.success_url,
          cancel_url: existingPayment.cancel_url,
          status: existingPayment.status,
          raw: existingPayment,
        });
      }
      // Completed but unverified → settle exactly once here; failed/canceled →
      // drop and create fresh.
      if (fetchOk && String(existingPayment?.status || "").toLowerCase() === "completed") {
        const inspection = inspectCompletedPayment(env, existingPayment, existing.test_mode);
        if (!inspection.ok) {
          // A completed payment that must not buy an entitlement can never be
          // useful — drop the phantom pending checkout and report it.
          try {
            await env.DB.prepare(
              `DELETE FROM subscriptions WHERE user_id=? AND status='pending' AND lower(plan)=? AND amount=?`,
            )
              .bind(userId, plan, pendingAmount)
              .run();
          } catch {}
          return jsonResponse(409, {
            verified: false,
            code: inspection.reason,
            error:
              inspection.reason === "test_payment"
                ? "Test payments do not grant a subscription on this deployment."
                : `Payment was made in ${inspection.currency || "an unsupported currency"}, not AED.`,
          });
        }
        let settlement;
        try {
          settlement = await settleVerifiedPayment(env, {
            userId,
            paymentId: existingPayment.id,
            plan: inspection.plan,
            amount: inspection.amount,
            interval: inspection.interval,
            testMode: inspection.testPayment,
          });
        } catch (err) {
          // The payment is captured; do not hand out a new checkout link that
          // could be paid on top of it. The pending row stays for a retry.
          return jsonResponse(502, {
            error: "Payment completed but activation failed. Please retry verification.",
            detail: safeErrorDetail(err),
          });
        }
        if (!settlement.ok) {
          return jsonResponse(409, {
            verified: false,
            code: settlement.code,
            error: "This payment is already linked to another account.",
          });
        }
        if (settlement.inProgress) {
          return jsonResponse(202, {
            verified: false,
            pending: true,
            code: "settlement_in_progress",
            message: "Verification is already in progress. Check your subscription in a moment.",
          });
        }
        return jsonResponse(200, {
          plan: settlement.result.plan,
          verified: true,
          status: "completed",
          alreadySettled: settlement.duplicate === true,
          period_end: settlement.result.period_end,
          aed: meta.aed,
          interval: intervalLabel,
          message: `Subscription activated — ${meta.label} valid for ${periodLabel}`,
        });
      }
      if (fetchOk) {
        try {
          await env.DB.prepare(
            `DELETE FROM subscriptions WHERE user_id=? AND status='pending' AND lower(plan)=? AND amount=?`,
          )
            .bind(userId, plan, pendingAmount)
            .run();
        } catch {}
      }
    }

    const origin = url.origin;
    const successUrl =
      body.success_url ||
      body.successUrl ||
      `${origin}/payment/success?plan=${plan}`;
    const cancelUrl =
      body.cancel_url ||
      body.cancelUrl ||
      `${origin}/pricing`;
    // Test/live is a deployment setting (ZIINA_TEST_MODE), never a client
    // choice: a test payment captures no money, so on a live deployment a
    // body.test flag must not be able to mint one.
    const testMode = isZiinaTestMode(env);

    // Validate URLs
    const isValidHttps = (v) => {
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    };
    if (!isValidHttps(successUrl) || !isValidHttps(cancelUrl)) {
      return jsonResponse(400, {
        error: "success_url and cancel_url must be valid https URLs",
      });
    }

    // Create Ziina intent
    const ziinaPayload = {
      amount: meta.amount,
      currency_code: "AED",
      message: body.message || `Corez ${meta.label} — ${meta.aed} AED / ${interval}`,
      success_url: successUrl,
      cancel_url: cancelUrl,
    };
    if (testMode) ziinaPayload.test = true;
    if (body.failure_url) ziinaPayload.failure_url = body.failure_url;

    try {
      const ziinaRes = await fetch(`${ZIINA_BASE}/payment_intent`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(ziinaPayload),
      });
      const text = await ziinaRes.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
      if (!ziinaRes.ok) {
        return jsonResponse(ziinaRes.status, {
          error: data?.message || "Ziina checkout failed",
          detail: data,
        });
      }
      // Store pending subscription. A failed insert would leave a captured
      // payment with no local checkout to verify against, so it must fail the
      // request instead of being swallowed.
      const pendingId = crypto.randomUUID();
      const now = Date.now();
      try {
        await env.DB.prepare(
          `INSERT INTO subscriptions (id, user_id, plan, amount, currency_code, status, period_start, period_end, ziina_payment_id, test_mode, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
          .bind(
            pendingId,
            userId,
            plan,
            meta.amount,
            "AED",
            "pending",
            null,
            null,
            data.id || null,
            testMode ? 1 : 0,
            now,
            now,
          )
          .run();
      } catch (err) {
        console.warn("checkout: failed to record pending subscription", safeErrorDetail(err));
        return jsonResponse(502, {
          error:
            "Checkout could not be recorded, so no payment link was issued. Please try again.",
        });
      }

      return jsonResponse(200, {
        plan,
        amount: meta.amount,
        aed: meta.aed,
        interval,
        ziina_id: data.id,
        redirect_url: data.redirect_url,
        embedded_url: data.embedded_url,
        success_url: data.success_url,
        cancel_url: data.cancel_url,
        status: data.status,
        raw: data,
      });
    } catch (err) {
      return jsonResponse(502, {
        error: "Failed to create checkout",
        detail: safeErrorDetail(err),
      });
    }
  }

  // POST /api/subscriptions/verify  -> verify Ziina payment and activate subscription
  if (pathname === "/api/subscriptions/verify" && request.method === "POST") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON" });
    }
    let paymentId = String(
      body.payment_id || body.paymentId || body.ziina_id || body.id || "",
    ).trim();
    // If no id supplied, resolve it against local checkouts only: the newest
    // pending checkout, then the most recent settled one (a repeated verify of
    // an already-settled payment must return the original result, not a new
    // period).
    if (!paymentId) {
      try {
        const pending = await env.DB.prepare(
          `SELECT ziina_payment_id FROM subscriptions WHERE user_id=? AND status='pending' AND ziina_payment_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
        )
          .bind(userId)
          .first();
        if (pending?.ziina_payment_id) {
          paymentId = String(pending.ziina_payment_id).trim();
        } else {
          const settled = await env.DB.prepare(
            `SELECT ziina_payment_id FROM subscriptions WHERE user_id=? AND ziina_payment_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
          )
            .bind(userId)
            .first();
          if (settled?.ziina_payment_id) paymentId = String(settled.ziina_payment_id).trim();
        }
      } catch {}
    }
    if (!paymentId)
      return jsonResponse(400, {
        error:
          "payment_id (Ziina payment intent id) is required — no pending payment found",
      });
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(paymentId))
      return jsonResponse(400, { error: "Invalid payment id" });

    const apiKey = env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN;
    if (!apiKey) return jsonResponse(500, { error: "Ziina not configured" });

    // Ownership first: the payment must be tied to a local checkout that
    // belongs to the authenticated user. A completed payment the user never
    // started (including one belonging to another account) must never activate
    // a plan here, no matter what amount it reports.
    let checkout;
    try {
      checkout = await env.DB.prepare(
        `SELECT id, plan, amount, ziina_payment_id, status, test_mode FROM subscriptions WHERE user_id=? AND ziina_payment_id=? ORDER BY created_at DESC LIMIT 1`,
      )
        .bind(userId, paymentId)
        .first();
    } catch (err) {
      return jsonResponse(502, {
        error: "Verification failed",
        detail: safeErrorDetail(err),
      });
    }
    if (!checkout) {
      return jsonResponse(403, {
        verified: false,
        code: "payment_not_owned",
        error:
          "This payment was not started for this account. Return to the pricing page to subscribe.",
      });
    }

    try {
      const ziinaRes = await fetch(
        `${ZIINA_BASE}/payment_intent/${encodeURIComponent(paymentId)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        },
      );
      const text = await ziinaRes.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
      if (!ziinaRes.ok) {
        return jsonResponse(ziinaRes.status, {
          error: data?.message || "Failed to fetch payment",
          detail: data,
        });
      }
      // Payment completed — activate the subscription the payment actually
      // buys. Both the plan and the interval are derived ONLY from the amount
      // verified against Ziina above, never from the request body. Test-mode
      // payments, non-AED payments, and unfinished payments grant nothing.
      const inspection = inspectCompletedPayment(env, data, checkout.test_mode);
      if (!inspection.ok) {
        const messages = {
          not_completed: `Payment not completed yet (status: ${data?.status}). Complete it on Ziina first.`,
          currency_mismatch: `Payment was made in ${inspection.currency || "an unsupported currency"}, not AED — subscriptions are priced in AED.`,
          test_payment: "Test payments do not grant a subscription on this deployment.",
        };
        const rejectionStatus =
          inspection.reason === "not_completed"
            ? 200
            : inspection.reason === "test_payment"
              ? 403
              : 400; // currency_mismatch and any future refusal
        return jsonResponse(rejectionStatus, {
          verified: false,
          code: inspection.reason,
          status: data?.status,
          message: messages[inspection.reason] || "Payment cannot activate a subscription.",
          raw: data,
        });
      }

      // Exactly-once settlement: duplicates read back the original period.
      const settlement = await settleVerifiedPayment(env, {
        userId,
        paymentId,
        plan: inspection.plan,
        amount: inspection.amount,
        interval: inspection.interval,
        testMode: inspection.testPayment,
      });
      if (!settlement.ok) {
        return jsonResponse(409, {
          verified: false,
          code: settlement.code,
          error: "This payment is already linked to another account and cannot be verified here.",
        });
      }
      if (settlement.inProgress) {
        return jsonResponse(202, {
          verified: false,
          pending: true,
          code: "settlement_in_progress",
          message: "Verification is already in progress. Check your subscription in a moment.",
        });
      }

      const activated = settlement.result;
      const alreadySettled = settlement.duplicate === true;
      if (inspection.plan === "free") {
        return jsonResponse(200, {
          verified: true,
          plan: "free",
          status: "completed",
          alreadySettled,
          raw: data,
        });
      }
      const isYearly = inspection.interval === "year";
      const periodLabel = isYearly ? "365 days" : "30 days";
      const planMeta = ZIINA_PLANS[inspection.plan] || ZIINA_PLANS.standard;
      return jsonResponse(200, {
        verified: true,
        plan: inspection.plan,
        status: "completed",
        alreadySettled,
        subscription_id: activated.id,
        period_start: activated.period_start,
        period_end: activated.period_end,
        amount: activated.amount,
        aed: isYearly
          ? ZIINA_PLANS[`${inspection.plan}_yearly`]?.aed || planMeta.aed
          : planMeta.aed,
        interval: inspection.interval,
        message: alreadySettled
          ? `Payment already settled — ${planMeta.label} active until ${new Date(activated.period_end).toLocaleDateString()}`
          : `Subscription activated — ${planMeta.label} valid for ${periodLabel}`,
        raw: data,
      });
    } catch (err) {
      // A database (or Ziina) failure must never produce a success-shaped
      // response: the ledger claim is released for a safe retry.
      return jsonResponse(502, {
        error: "Verification failed",
        detail: safeErrorDetail(err),
      });
    }
  }

  // POST /api/subscriptions/cancel  -> schedule cancel/downgrade after period_end
  // Body: { plan?: 'free'|'standard'|'premium', undo?: boolean }
  // If user has active paid plan with future period_end, keep it active until period_end then downgrade.
  // If already expired or no period, downgrade immediately.
  if (pathname === "/api/subscriptions/cancel" && request.method === "POST") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      body = {};
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
    // Reconcile first: if an in-flight payment actually completed on Ziina it
    // settles now (money is never silently discarded). Unfinished checkouts
    // keep their ownership rows so they can still be verified later — use
    // /abandon to drop them explicitly.
    await reconcilePendingSubscriptions(env, userId);
    // Handle undo of scheduled downgrade
    if (body.undo === true || body.keep === true || body.undo_downgrade === true) {
      try {
        await env.DB.prepare(
          `UPDATE users SET downgrade_plan=NULL, downgrade_scheduled_at=NULL, subscription_status='active' WHERE id=?`,
        )
          .bind(userId)
          .run();
      } catch {}
      const current = await getActiveSubscription(env, userId);
      return jsonResponse(200, {
        ok: true,
        plan: current?.plan || "free",
        message: "Scheduled downgrade canceled — keeping current plan",
        subscription: current,
      });
    }

    const rawTarget = String(body.plan || body.target_plan || body.downgrade_plan || "free")
      .trim()
      .toLowerCase();
    const targetPlan = ZIINA_PLANS[rawTarget] ? rawTarget : "free";

    // Get current subscription
    const current = await getActiveSubscription(env, userId);
    const currentPlan = current?.plan || "free";
    const periodEnd = current?.period_end ? Number(current.period_end) : null;
    const now = Date.now();

    // If already on target, nothing to do
    if (currentPlan === targetPlan && !current?.isScheduledDowngrade) {
      return jsonResponse(200, {
        ok: true,
        plan: currentPlan,
        message: `Already on ${targetPlan} plan`,
        subscription: current,
      });
    }

    // If target is same as scheduled downgrade, acknowledge
    if (current?.downgrade_plan === targetPlan) {
      return jsonResponse(200, {
        ok: true,
        plan: currentPlan,
        scheduled: targetPlan,
        period_end: periodEnd,
        message: `Already scheduled to downgrade to ${targetPlan} on ${periodEnd ? new Date(periodEnd).toLocaleDateString() : "period end"}`,
        subscription: current,
      });
    }

    // Cancel only ever moves a user DOWN the plan ladder. Without this guard a
    // free account (no active period, so periodEnd is null) fell straight into
    // the immediate-downgrade branch below and activateSubscription() granted it
    // premium with no payment at all — a self-service upgrade for free.
    if (!isDowngrade(currentPlan, targetPlan)) {
      return jsonResponse(400, {
        error:
          "Cancel only downgrades an existing plan. To move to a higher plan, complete checkout on the pricing page.",
        code: "not_a_downgrade",
        current_plan: currentPlan,
        requested_plan: targetPlan,
      });
    }

    // If no active period or already expired, downgrade immediately
    if (!periodEnd || periodEnd <= now || current?.isExpired) {
      try {
        await activateSubscription(env, userId, targetPlan, null, ZIINA_PLANS[targetPlan].amount);
      } catch (err) {
        return jsonResponse(502, {
          error: "Failed to apply the downgrade",
          detail: safeErrorDetail(err),
        });
      }
      const updated = await getActiveSubscription(env, userId);
      return jsonResponse(200, {
        ok: true,
        plan: targetPlan,
        message:
          targetPlan === "free"
            ? "Downgraded to Free immediately"
            : `Downgraded to ${targetPlan} immediately`,
        subscription: updated,
      });
    }

    // Has future period_end — schedule downgrade after period_end
    try {
      await env.DB.prepare(
        `UPDATE users SET downgrade_plan=?, downgrade_scheduled_at=?, subscription_status='canceled' WHERE id=?`,
      )
        .bind(targetPlan, now, userId)
        .run();
    } catch {
      // Fallback if downgrade columns missing — try to set via alter then retry
      try {
        await env.DB.prepare(`ALTER TABLE users ADD COLUMN downgrade_plan TEXT`).run();
      } catch {}
      try {
        await env.DB.prepare(`ALTER TABLE users ADD COLUMN downgrade_scheduled_at INTEGER`).run();
      } catch {}
      try {
        await env.DB.prepare(
          `UPDATE users SET downgrade_plan=?, downgrade_scheduled_at=?, subscription_status='canceled' WHERE id=?`,
        )
          .bind(targetPlan, now, userId)
          .run();
      } catch {}
    }
    const scheduled = await getActiveSubscription(env, userId);
    return jsonResponse(200, {
      ok: true,
      plan: currentPlan,
      scheduled: targetPlan,
      period_end: periodEnd,
      message:
        targetPlan === "free"
          ? `Scheduled to downgrade to Free on ${new Date(periodEnd).toLocaleDateString()} — you keep ${currentPlan} until then`
          : `Scheduled to downgrade to ${targetPlan} on ${new Date(periodEnd).toLocaleDateString()} — you keep ${currentPlan} until then`,
      subscription: scheduled,
    });
  }

  return jsonResponse(404, { error: "Subscription route not found" });
}
