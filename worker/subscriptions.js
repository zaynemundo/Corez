import { jsonResponse, readBoundedJson, safeErrorDetail } from "./utils.js";
import { ZIINA_PLANS } from "./ziina.js";

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

export async function getActiveSubscription(env, userId) {
  if (!env?.DB || !userId) return null;
  try {
    // Latest pending (abandoned or in-flight upgrade) — reported but never current
    const pending = await env.DB.prepare(
      "SELECT plan, ziina_payment_id FROM subscriptions WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1",
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

export async function activateSubscription(
  env,
  userId,
  plan,
  ziinaPaymentId,
  amount,
  interval = "month",
) {
  const now = Date.now();
  const isFree = plan === "free" || plan === FREE_PLAN;
  const isYearly = String(interval).toLowerCase() === "year" || String(interval).toLowerCase() === "yearly" || String(interval).toLowerCase() === "annual";
  const periodDays = isYearly ? YEAR_DAYS : MONTH_DAYS;
  const periodEnd = isFree ? null : now + periodDays * DAY_MS;
  const id = crypto.randomUUID();
  const meta = ZIINA_PLANS[plan] || ZIINA_PLANS["standard"];
  // For yearly, use yearly amount if not explicitly passed
  let finalAmount = isFree ? 0 : amount || meta.amount;
  if (isYearly && !amount) {
    const yearlyMeta = ZIINA_PLANS[`${plan}_yearly`] || ZIINA_PLANS_YEARLY?.[plan];
    if (yearlyMeta) finalAmount = yearlyMeta.amount;
  }

  try {
    // Mark any previous ACTIVE rows as completed (one true current plan) and drop
    // abandoned/finished pending rows so they can never activate later.
    try {
      await env.DB.prepare(
        `UPDATE subscriptions SET status='completed', updated_at=? WHERE user_id=? AND status='active'`,
      )
        .bind(now, userId)
        .run();
    } catch {}
    try {
      await env.DB.prepare(
        `DELETE FROM subscriptions WHERE user_id=? AND status='pending'`,
      )
        .bind(userId)
        .run();
    } catch {}
    // Insert subscription record
    await env.DB.prepare(
      `INSERT INTO subscriptions (id, user_id, plan, amount, currency_code, status, period_start, period_end, ziina_payment_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
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
      )
      .run();
  } catch (e) {
    console.warn("activateSubscription insert failed", safeErrorDetail(e));
  }
  try {
    // Update users table — clear any scheduled downgrade on activation
    await env.DB.prepare(
      `UPDATE users SET plan=?, subscription_plan=?, subscription_status=?, subscription_period_end=?, subscription_ziina_id=?, downgrade_plan=NULL, downgrade_scheduled_at=NULL WHERE id=?`,
    )
      .bind(plan, plan, "active", periodEnd, ziinaPaymentId || null, userId)
      .run();
  } catch {
    // Fallback for old schema without new cols
    try {
      await env.DB.prepare(`UPDATE users SET plan=? WHERE id=?`)
        .bind(plan, userId)
        .run();
    } catch {}
    // Try to clear downgrade if columns exist
    try {
      await env.DB.prepare(
        `UPDATE users SET downgrade_plan=NULL, downgrade_scheduled_at=NULL WHERE id=?`,
      )
        .bind(userId)
        .run();
    } catch {}
  }
  return {
    id,
    plan,
    amount: finalAmount,
    period_start: now,
    period_end: periodEnd,
    ziina_payment_id: ziinaPaymentId,
  };
}

// Reconcile pending (in-flight / abandoned) checkouts against Ziina.
// Any pending that was actually completed activates immediately — money is
// never silently discarded. Everything else is dropped so a stale pending
// can never overwrite the user's real current plan later.
export async function reconcilePendingSubscriptions(env, userId) {
  let pendingRows = [];
  try {
    const rows = await env.DB.prepare(
      "SELECT id, plan, ziina_payment_id FROM subscriptions WHERE user_id=? AND status='pending'",
    )
      .bind(userId).all();
    pendingRows = Array.isArray(rows?.results) ? rows.results : [];
  } catch {
    return { reconciled: false };
  }
  if (pendingRows.length === 0) return { reconciled: true, activated: null };
  const apiKey = env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN;
  let activated = null;
  for (const row of pendingRows) {
    if (!row.ziina_payment_id || !apiKey) {
      try { await env.DB.prepare(`DELETE FROM subscriptions WHERE id=?`).bind(row.id).run(); } catch {}
      continue;
    }
    try {
      const ziinaRes = await fetch(
        `${ZIINA_BASE}/payment_intent/${encodeURIComponent(row.ziina_payment_id)}`,
        { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
      );
      const data = ziinaRes.ok ? await ziinaRes.json().catch(() => ({})) : {};
      if (String(data?.status || "").toLowerCase() === "completed") {
        activated = await activateSubscription(env, userId, row.plan, row.ziina_payment_id, Number(data?.amount) || ZIINA_PLANS[row.plan]?.amount);
        // activateSubscription deleted all pending rows already
        break;
      }
      await env.DB.prepare(`DELETE FROM subscriptions WHERE id=?`).bind(row.id).run();
    } catch {
      try { await env.DB.prepare(`DELETE FROM subscriptions WHERE id=?`).bind(row.id).run(); } catch {}
    }
  }
  return { reconciled: true, activated };
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
        "SELECT plan, ziina_payment_id FROM subscriptions WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1",
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

  // POST /api/subscriptions/abandon -> drop an unfinished checkout (cancel upgrade)
  // Body: { plan? } — omit to abandon every pending checkout for this user.
  if (pathname === "/api/subscriptions/abandon" && request.method === "POST") {
    let body;
    try { body = await readBoundedJson(request); } catch { body = {}; }
    if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
    const plan = String(body.plan || "").trim().toLowerCase();
    // Reconcile first: if the "abandoned" payment actually completed on Ziina,
    // it must activate — abandoning must never lose a captured payment.
    const reconciled = await reconcilePendingSubscriptions(env, userId);
    if (!reconciled?.activated) {
      try {
        if (plan && ZIINA_PLANS[plan]) {
          await env.DB.prepare(
            `DELETE FROM subscriptions WHERE user_id=? AND status='pending' AND lower(plan)=?`,
          )
            .bind(userId, plan)
            .run();
        } else {
          await env.DB.prepare(
            `DELETE FROM subscriptions WHERE user_id=? AND status='pending'`,
          )
            .bind(userId)
            .run();
        }
      } catch {}
    }
    const sub = await getActiveSubscription(env, userId);
    return jsonResponse(200, {
      ok: true,
      plan: sub?.plan || "free",
      activated: Boolean(reconciled?.activated),
      message: reconciled?.activated ? "Payment completed — plan activated" : "Pending checkout removed",
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
      // Free needs no payment — just activate
      await activateSubscription(env, userId, "free", null, 0, "month");
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
    try {
      const existing = await env.DB.prepare(
        "SELECT ziina_payment_id, amount FROM subscriptions WHERE user_id=? AND status='pending' AND lower(plan)=? AND amount=? ORDER BY created_at DESC LIMIT 1",
      )
        .bind(userId, plan, pendingAmount)
        .first();
      if (existing?.ziina_payment_id) {
        const r = await fetch(
          `${ZIINA_BASE}/payment_intent/${encodeURIComponent(existing.ziina_payment_id)}`,
          { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
        );
        const data = r.ok ? await r.json().catch(() => ({})) : {};
        if (r.ok && data?.id && !["completed", "failed", "canceled"].includes(String(data.status || "").toLowerCase())) {
          return jsonResponse(200, {
            plan,
            amount: meta.amount,
            aed: meta.aed,
            interval: intervalLabel,
            resumed: true,
            ziina_id: data.id,
            redirect_url: data.redirect_url,
            embedded_url: data.embedded_url,
            success_url: data.success_url,
            cancel_url: data.cancel_url,
            status: data.status,
            raw: data,
          });
        }
        // Completed but unverified → activate now; failed/canceled → drop and create fresh.
        if (r.ok && String(data?.status || "").toLowerCase() === "completed") {
          const activated = await activateSubscription(env, userId, plan, data.id, Number(data?.amount) || meta.amount, interval);
          return jsonResponse(200, {
            plan,
            verified: true,
            status: "completed",
            period_end: activated.period_end,
            aed: meta.aed,
            interval: intervalLabel,
            message: `Subscription activated — ${meta.label} valid for ${periodLabel}`,
          });
        }
        try {
          await env.DB.prepare(
            `DELETE FROM subscriptions WHERE user_id=? AND status='pending' AND lower(plan)=? AND amount=?`,
          )
            .bind(userId, plan, pendingAmount)
            .run();
        } catch {}
      }
    } catch {}

    const origin = url.origin;
    const successUrl =
      body.success_url ||
      body.successUrl ||
      `${origin}/payment/success?plan=${plan}`;
    const cancelUrl =
      body.cancel_url ||
      body.cancelUrl ||
      `${origin}/pricing`;
    const testFlag = body.test ?? false; // default live for subscriptions

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
      test: Boolean(testFlag),
    };
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
      // Store pending subscription
      const pendingId = crypto.randomUUID();
      const now = Date.now();
      try {
        await env.DB.prepare(
          `INSERT INTO subscriptions (id, user_id, plan, amount, currency_code, status, period_start, period_end, ziina_payment_id, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
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
            now,
            now,
          )
          .run();
      } catch {}

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

  // POST /api/subscriptions/verify  -> verify Ziina payment and activate monthly subscription
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
    const planHint = String(body.plan || "")
      .trim()
      .toLowerCase();
    // If no id supplied, try latest pending for this user
    if (!paymentId) {
      try {
        const pending = await env.DB.prepare(
          `SELECT ziina_payment_id, plan FROM subscriptions WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1`,
        )
          .bind(userId)
          .first();
        if (pending && pending.ziina_payment_id) {
          paymentId = String(pending.ziina_payment_id).trim();
          // Use pending plan if no hint
          if (!planHint && pending.plan) body.plan = pending.plan;
        }
      } catch {}
    }
    if (!paymentId)
      return jsonResponse(400, {
        error:
          "payment_id (Ziina payment intent id) is required — no pending payment found",
      });

    const apiKey = env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN;
    if (!apiKey) return jsonResponse(500, { error: "Ziina not configured" });

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
      const status = String(data.status || "").toLowerCase();
      // Ziina statuses: requires_payment_instrument, requires_user_action, pending, completed, failed, canceled
      if (status !== "completed") {
        return jsonResponse(200, {
          verified: false,
          status: data.status,
          message: `Payment not completed yet (status: ${data.status}). Complete it on Ziina first.`,
          raw: data,
        });
      }
      // Payment completed — activate subscription (monthly or yearly)
      const amount = Number(data.amount);
      // Infer plan and interval from amount if not provided
      let plan = planHint;
      let interval = String(body.interval || body.billing || "").toLowerCase();
      if (!interval || (interval !== "year" && interval !== "yearly" && interval !== "annual")) {
        // Infer interval from amount
        if (amount === 17628 || amount === 26436) interval = "year";
        else interval = "month";
      } else {
        interval = interval === "year" || interval === "yearly" || interval === "annual" ? "year" : "month";
      }
      // Normalize plan for yearly amounts
      if (amount === 17628) plan = "standard";
      else if (amount === 26436) plan = "premium";
      else if (!plan || !ZIINA_PLANS[plan] || ZIINA_PLANS[plan].amount !== amount) {
        // Handle yearly suffix or fallback
        const yearlyKey = plan ? `${plan}_yearly` : null;
        if (yearlyKey && ZIINA_PLANS[yearlyKey] && ZIINA_PLANS[yearlyKey].amount === amount) {
          // keep plan as base (standard/premium) and interval yearly
          // plan already correct
        } else {
          // Infer by amount
          for (const [k, v] of Object.entries(ZIINA_PLANS)) {
            if (v.amount === amount) {
              // If yearly, map back to base plan
              if (k.endsWith("_yearly")) plan = k.replace("_yearly", "");
              else plan = k;
              break;
            }
          }
        }
      }
      // Handle yearly suffix
      if (plan && plan.endsWith("_yearly")) plan = plan.replace("_yearly", "");
      if (!plan || plan === "free") {
        // If free, just set free
        await activateSubscription(env, userId, "free", paymentId, 0, "month");
        return jsonResponse(200, {
          verified: true,
          plan: "free",
          status: "completed",
          raw: data,
        });
      }
      if (!ZIINA_PLANS[plan]) plan = amount === 2754 || amount === 26436 ? "premium" : "standard";
      // Determine yearly from amount if not already set
      if (amount === 17628 || amount === 26436) interval = "year";
      const isYearly = interval === "year";
      const activated = await activateSubscription(
        env,
        userId,
        plan,
        paymentId,
        amount,
        interval,
      );
      const periodLabel = isYearly ? "365 days" : "30 days";
      return jsonResponse(200, {
        verified: true,
        plan,
        status: "completed",
        period_start: activated.period_start,
        period_end: activated.period_end,
        amount: activated.amount,
        aed: ZIINA_PLANS[plan]?.aed ? (isYearly ? ZIINA_PLANS[`${plan}_yearly`]?.aed || ZIINA_PLANS[plan].aed : ZIINA_PLANS[plan].aed) : String((amount/100).toFixed(2)),
        interval,
        message: `Subscription activated — ${ZIINA_PLANS[plan].label} valid for ${periodLabel}`,
        raw: data,
      });
    } catch (err) {
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
    // Any cancel action means abandoned pending checkouts must not survive as
    // phantom "pending" plans: reconcile them against Ziina first (a completed
    // payment activates — money is never silently discarded), drop the rest.
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

    // If no active period or already expired, downgrade immediately
    if (!periodEnd || periodEnd <= now || current?.isExpired) {
      await activateSubscription(env, userId, targetPlan, null, ZIINA_PLANS[targetPlan].amount);
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
    } catch (e) {
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
