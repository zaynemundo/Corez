import { safeErrorDetail } from "./utils.js";
import { SUBSCRIPTIONS_SCHEMA } from "./dbSchema.js";
import {
  ZIINA_PLANS,
  ZIINA_PLANS_YEARLY,
  isTestPayment,
  isZiinaTestMode,
} from "./ziina.js";

export const ZIINA_BASE = "https://api-v2.ziina.com/api";
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MONTH_DAYS = 30;
export const YEAR_DAYS = 365;
export const FREE_PLAN = "free";

export async function ensureSubscriptionTables(env) {
  if (!env?.DB) return;
  // Table/index/column text lives in worker/dbSchema.js (SUBSCRIPTIONS_SCHEMA).
  try {
    await env.DB.prepare(SUBSCRIPTIONS_SCHEMA.tables[0]).run();
    await env.DB.prepare(SUBSCRIPTIONS_SCHEMA.indexes[0]).run();
    await env.DB.prepare(SUBSCRIPTIONS_SCHEMA.indexes[1]).run();
    try {
      await env.DB.prepare(SUBSCRIPTIONS_SCHEMA.columns[0]).run();
    } catch {}
    // Ownership outlives the checkout UI state. `abandoned_at` marks a checkout
    // the user no longer wants to finish; the row itself is kept, because it is
    // the only local proof that a Ziina payment id belongs to this account. A
    // payment that completes after abandonment can therefore still be settled
    // instead of being refused as `payment_not_owned`.
    try {
      await env.DB.prepare(SUBSCRIPTIONS_SCHEMA.columns[1]).run();
    } catch {}
    // Exactly-once payment settlement ledger. The Ziina payment id is the
    // primary key, so concurrent/duplicate verifications of the same payment
    // race on one atomic INSERT — only the claim holder activates, and every
    // later verification reads back the original period instead of minting a
    // new one.
    await env.DB.prepare(SUBSCRIPTIONS_SCHEMA.tables[1]).run();
    await env.DB.prepare(SUBSCRIPTIONS_SCHEMA.indexes[2]).run();
    // Ensure users has subscription fields
    for (const sql of SUBSCRIPTIONS_SCHEMA.columns.slice(2)) {
      try {
        await env.DB.prepare(sql).run();
      } catch {}
    }
  } catch (e) {
    console.warn("ensureSubscriptionTables failed", safeErrorDetail(e));
  }
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
      if (isExpired) {
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
  let finalAmount = isFree ? 0 : Number(amount) || meta.amount;
  if (isYearly && !Number(amount)) {
    const yearlyMeta = ZIINA_PLANS[`${plan}_yearly`] || ZIINA_PLANS_YEARLY?.[plan];
    if (yearlyMeta) finalAmount = yearlyMeta.amount;
  }

  const paymentKey = ziinaPaymentId || "";
  const statements = [
    env.DB.prepare(
      `UPDATE subscriptions SET status='completed', updated_at=? WHERE user_id=? AND status='active'`,
    ).bind(now, userId),
    env.DB.prepare(
      `DELETE FROM subscriptions WHERE user_id=? AND status='pending' AND abandoned_at IS NULL AND ziina_payment_id IS NULL`,
    ).bind(userId),
    env.DB.prepare(
      `UPDATE subscriptions SET abandoned_at=?, updated_at=? WHERE user_id=? AND status='pending' AND abandoned_at IS NULL AND ziina_payment_id IS NOT NULL AND ziina_payment_id!=?`,
    ).bind(now, now, userId, paymentKey),
    env.DB.prepare(
      `DELETE FROM subscriptions WHERE id IN (SELECT id FROM subscriptions WHERE user_id=? AND status='pending' AND abandoned_at IS NULL AND ziina_payment_id=? ORDER BY created_at DESC LIMIT 1)`,
    ).bind(userId, paymentKey),
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

export async function reconcilePendingSubscriptions(env, userId) {
  let pendingRows;
  try {
    const rows = await env.DB.prepare(
      "SELECT id, plan, amount, ziina_payment_id, test_mode FROM subscriptions WHERE user_id=? AND status='pending'",
    )
      .bind(userId)
      .all();
    pendingRows = Array.isArray(rows?.results) ? rows.results : [];
  } catch {
    return { reconciled: false };
  }
  if (pendingRows.length === 0)
    return { reconciled: true, activated: null, unconfirmed: false };
  const apiKey = env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN;
  let activated = null;
  let unconfirmed = false;
  const dropPending = async (rowId) => {
    try {
      await env.DB.prepare(`DELETE FROM subscriptions WHERE id=?`)
        .bind(rowId)
        .run();
    } catch {}
  };
  const retireSettled = async (rowId) => {
    try {
      await env.DB.prepare(`DELETE FROM subscriptions WHERE id=?`)
        .bind(rowId)
        .run();
    } catch {}
  };
  for (const row of pendingRows) {
    if (!row.ziina_payment_id) {
      await dropPending(row.id);
      continue;
    }
    if (!apiKey) {
      unconfirmed = true;
      continue;
    }
    let data;
    try {
      const ziinaRes = await fetch(
        `${ZIINA_BASE}/payment_intent/${encodeURIComponent(row.ziina_payment_id)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        },
      );
      if (!ziinaRes.ok) {
        unconfirmed = true;
        continue;
      }
      data = await ziinaRes.json().catch(() => ({}));
    } catch {
      unconfirmed = true;
      continue;
    }
    const inspection = inspectCompletedPayment(env, data, row.test_mode);
    if (!inspection.ok) {
      if (
        inspection.reason === "test_payment" ||
        inspection.reason === "currency_mismatch"
      ) {
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
      console.warn(
        "reconcilePendingSubscriptions settlement failed",
        safeErrorDetail(e),
      );
    }
  }
  return { reconciled: true, activated, unconfirmed };
}
