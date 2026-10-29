import { jsonResponse, readBoundedJson, safeErrorDetail } from "./utils.js";
import {
  COLUMN_USERS_DOWNGRADE_PLAN,
  COLUMN_USERS_DOWNGRADE_SCHEDULED_AT,
} from "./dbSchema.js";
import { ZIINA_PLANS, isZiinaTestMode } from "./ziina.js";
import {
  ZIINA_BASE,
  ensureSubscriptionTables,
  PLAN_RANK,
  isDowngrade,
  derivePlanFromAmount,
  inspectCompletedPayment,
  getActiveSubscription,
  activateSubscription,
  settleVerifiedPayment,
  reconcilePendingSubscriptions,
} from "./subscriptionSettlement.js";

export {
  ensureSubscriptionTables,
  PLAN_RANK,
  isDowngrade,
  derivePlanFromAmount,
  inspectCompletedPayment,
  getActiveSubscription,
  activateSubscription,
  settleVerifiedPayment,
  reconcilePendingSubscriptions,
};

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
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: "application/json",
            },
          },
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
      return jsonResponse(502, {
        error: "Failed to load pending checkout",
        detail: safeErrorDetail(e),
      });
    }
  }

  // POST /api/subscriptions/abandon -> stop an unfinished checkout (cancel upgrade)
  if (pathname === "/api/subscriptions/abandon" && request.method === "POST") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      body = {};
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
    const plan = String(body.plan || "")
      .trim()
      .toLowerCase();
    const reconciled = await reconcilePendingSubscriptions(env, userId);
    if (reconciled?.reconciled === false) {
      return jsonResponse(503, {
        ok: false,
        code: "reconcile_unavailable",
        error:
          "Could not read the pending checkout right now. Try again shortly.",
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
          error:
            "Could not abandon the pending checkout right now. Try again shortly.",
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

  // POST /api/subscriptions/checkout  -> create Ziina payment intent for plan
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

    const rawInterval = String(
      body.interval || body.billing || body.billing_interval || body.period || "",
    )
      .trim()
      .toLowerCase();
    const isYearly =
      rawInterval === "yearly" ||
      rawInterval === "year" ||
      rawInterval === "annual" ||
      rawInterval === "annually";
    const interval = isYearly ? "year" : "month";
    const yearlyKey = `${plan}_yearly`;
    const meta =
      isYearly && ZIINA_PLANS[yearlyKey]
        ? ZIINA_PLANS[yearlyKey]
        : ZIINA_PLANS[plan];
    if (!meta) return jsonResponse(400, { error: "Unknown plan" });
    const periodLabel = isYearly ? "365 days" : "30 days";
    const intervalLabel = isYearly ? "year" : "month";

    const apiKey = env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN;
    if (!apiKey) return jsonResponse(500, { error: "Ziina not configured" });

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
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: "application/json",
            },
          },
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
      if (
        fetchOk &&
        String(existingPayment?.status || "").toLowerCase() === "completed"
      ) {
        const inspection = inspectCompletedPayment(
          env,
          existingPayment,
          existing.test_mode,
        );
        if (!inspection.ok) {
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
          return jsonResponse(502, {
            error:
              "Payment completed but activation failed. Please retry verification.",
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
            message:
              "Verification is already in progress. Check your subscription in a moment.",
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
      body.cancel_url || body.cancelUrl || `${origin}/pricing`;
    const testMode = isZiinaTestMode(env);

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

    const ziinaPayload = {
      amount: meta.amount,
      currency_code: "AED",
      message:
        body.message || `Corez ${meta.label} — ${meta.aed} AED / ${interval}`,
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
        console.warn(
          "checkout: failed to record pending subscription",
          safeErrorDetail(err),
        );
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
          if (settled?.ziina_payment_id)
            paymentId = String(settled.ziina_payment_id).trim();
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
      const inspection = inspectCompletedPayment(env, data, checkout.test_mode);
      if (!inspection.ok) {
        const messages = {
          not_completed: `Payment not completed yet (status: ${data?.status}). Complete it on Ziina first.`,
          currency_mismatch: `Payment was made in ${inspection.currency || "an unsupported currency"}, not AED — subscriptions are priced in AED.`,
          test_payment:
            "Test payments do not grant a subscription on this deployment.",
        };
        const rejectionStatus =
          inspection.reason === "not_completed"
            ? 200
            : inspection.reason === "test_payment"
              ? 403
              : 400;
        return jsonResponse(rejectionStatus, {
          verified: false,
          code: inspection.reason,
          status: data?.status,
          message:
            messages[inspection.reason] ||
            "Payment cannot activate a subscription.",
          raw: data,
        });
      }

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
          error:
            "This payment is already linked to another account and cannot be verified here.",
        });
      }
      if (settlement.inProgress) {
        return jsonResponse(202, {
          verified: false,
          pending: true,
          code: "settlement_in_progress",
          message:
            "Verification is already in progress. Check your subscription in a moment.",
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
      return jsonResponse(502, {
        error: "Verification failed",
        detail: safeErrorDetail(err),
      });
    }
  }

  // POST /api/subscriptions/cancel  -> schedule cancel/downgrade after period_end
  if (pathname === "/api/subscriptions/cancel" && request.method === "POST") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      body = {};
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
    await reconcilePendingSubscriptions(env, userId);
    if (
      body.undo === true ||
      body.keep === true ||
      body.undo_downgrade === true
    ) {
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

    const rawTarget = String(
      body.plan || body.target_plan || body.downgrade_plan || "free",
    )
      .trim()
      .toLowerCase();
    const targetPlan = ZIINA_PLANS[rawTarget] ? rawTarget : "free";

    const current = await getActiveSubscription(env, userId);
    const currentPlan = current?.plan || "free";
    const periodEnd = current?.period_end ? Number(current.period_end) : null;
    const now = Date.now();

    if (currentPlan === targetPlan && !current?.isScheduledDowngrade) {
      return jsonResponse(200, {
        ok: true,
        plan: currentPlan,
        message: `Already on ${targetPlan} plan`,
        subscription: current,
      });
    }

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

    if (!isDowngrade(currentPlan, targetPlan)) {
      return jsonResponse(400, {
        error:
          "Cancel only downgrades an existing plan. To move to a higher plan, complete checkout on the pricing page.",
        code: "not_a_downgrade",
        current_plan: currentPlan,
        requested_plan: targetPlan,
      });
    }

    if (!periodEnd || periodEnd <= now || current?.isExpired) {
      try {
        await activateSubscription(
          env,
          userId,
          targetPlan,
          null,
          ZIINA_PLANS[targetPlan].amount,
        );
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

    try {
      await env.DB.prepare(
        `UPDATE users SET downgrade_plan=?, downgrade_scheduled_at=?, subscription_status='canceled' WHERE id=?`,
      )
        .bind(targetPlan, now, userId)
        .run();
    } catch {
      try {
        await env.DB.prepare(COLUMN_USERS_DOWNGRADE_PLAN).run();
      } catch {}
      try {
        await env.DB.prepare(COLUMN_USERS_DOWNGRADE_SCHEDULED_AT).run();
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
