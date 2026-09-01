import { jsonResponse, readBoundedJson, safeErrorDetail } from './utils.js';
import { ZIINA_PLANS } from './ziina.js';

const ZIINA_BASE = 'https://api-v2.ziina.com/api';
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_DAYS = 30;
const FREE_PLAN = 'free';

export async function ensureSubscriptionTables(env) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS subscriptions (
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
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, created_at DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`).run();
    // Ensure users has subscription fields
    try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN subscription_plan TEXT DEFAULT 'free'`).run(); } catch {}
    try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'active'`).run(); } catch {}
    try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN subscription_period_end INTEGER`).run(); } catch {}
    try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN subscription_ziina_id TEXT`).run(); } catch {}
  } catch (e) {
    console.warn('ensureSubscriptionTables failed', safeErrorDetail(e));
  }
}

export function getPlanOrFree(plan) {
  const key = String(plan || '').trim().toLowerCase();
  if (ZIINA_PLANS[key]) return { key, meta: ZIINA_PLANS[key] };
  // fallback to free
  return { key: 'free', meta: ZIINA_PLANS['free'] };
}

export async function getActiveSubscription(env, userId) {
  if (!env?.DB || !userId) return null;
  try {
    // Get user plan first
    const user = await env.DB.prepare('SELECT plan, subscription_plan, subscription_status, subscription_period_end FROM users WHERE id=?').bind(userId).first();
    const plan = user?.plan || user?.subscription_plan || 'free';
    const periodEnd = user?.subscription_period_end;
    const status = user?.subscription_status || 'active';
    
    // If free, always active
    if (plan === 'free' || plan === FREE_PLAN) {
      return { plan: 'free', status: 'active', period_end: null, isFree: true };
    }
    
    // For paid, check expiry
    const now = Date.now();
    if (periodEnd && Number(periodEnd) < now) {
      return { plan, status: 'expired', period_end: Number(periodEnd), isExpired: true, isFree: false };
    }
    if (status === 'expired' || status === 'canceled') {
      return { plan, status, period_end: periodEnd ? Number(periodEnd) : null, isFree: false };
    }
    // Try to get latest subscription record
    const sub = await env.DB.prepare('SELECT * FROM subscriptions WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(userId).first().catch(() => null);
    if (sub) {
      const isExpired = sub.period_end && Number(sub.period_end) < now && sub.status === 'active';
      return {
        plan: sub.plan,
        status: isExpired ? 'expired' : sub.status,
        period_start: sub.period_start ? Number(sub.period_start) : null,
        period_end: sub.period_end ? Number(sub.period_end) : periodEnd ? Number(periodEnd) : null,
        ziina_payment_id: sub.ziina_payment_id,
        isExpired: !!isExpired,
        isFree: false,
        subscription: sub
      };
    }
    return { plan, status, period_end: periodEnd ? Number(periodEnd) : null, isFree: false };
  } catch {
    return null;
  }
}

export async function activateSubscription(env, userId, plan, ziinaPaymentId, amount) {
  const now = Date.now();
  const periodEnd = now + MONTH_DAYS * DAY_MS;
  const id = crypto.randomUUID();
  const meta = ZIINA_PLANS[plan] || ZIINA_PLANS['standard'];
  const finalAmount = amount || meta.amount;
  
  try {
    // Insert subscription record
    await env.DB.prepare(
      `INSERT INTO subscriptions (id, user_id, plan, amount, currency_code, status, period_start, period_end, ziina_payment_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, userId, plan, finalAmount, 'AED', 'active', now, periodEnd, ziinaPaymentId || null, now, now).run();
  } catch (e) {
    console.warn('activateSubscription insert failed', safeErrorDetail(e));
  }
  try {
    // Update users table
    await env.DB.prepare(
      `UPDATE users SET plan=?, subscription_plan=?, subscription_status=?, subscription_period_end=?, subscription_ziina_id=? WHERE id=?`
    ).bind(plan, plan, 'active', periodEnd, ziinaPaymentId || null, userId).run();
  } catch {
    // Fallback for old schema without new cols
    try { await env.DB.prepare(`UPDATE users SET plan=? WHERE id=?`).bind(plan, userId).run(); } catch {}
  }
  return { id, plan, amount: finalAmount, period_start: now, period_end: periodEnd, ziina_payment_id: ziinaPaymentId };
}

export async function handleSubscriptions(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Only handle subscription routes
  if (!pathname.startsWith('/api/subscriptions')) return null;

  // Ensure tables exist
  await ensureSubscriptionTables(env);

  // Auth required for all subscription routes
  const authSecret = env?.AUTH_SECRET;
  if (authSecret) {
    const { verifySession } = await import('./auth.js');
    const sess = await verifySession(request, env);
    if (!sess) {
      return jsonResponse(401, { error: 'Authentication required. Please log in.' });
    }
    // Attach user to request for handlers
    request._corez_user = sess;
  }

  const user = request._corez_user || { uid: 'dev', email: 'dev@corez.pro' };
  const userId = user.uid;

  // GET /api/subscriptions/me  -> current subscription
  if (pathname === '/api/subscriptions/me' && request.method === 'GET') {
    const sub = await getActiveSubscription(env, userId);
    if (!sub) return jsonResponse(200, { plan: 'free', status: 'active', isFree: true });
    return jsonResponse(200, sub);
  }

  // GET /api/subscriptions/plans  -> list plans
  if (pathname === '/api/subscriptions/plans' && request.method === 'GET') {
    return jsonResponse(200, {
      plans: [
        { id: 'free', name: 'Free', price: '0 AED', amount: 0, interval: 'forever', features: ['Limited generations', 'Community support'], popular: false },
        { id: 'standard', name: 'Standard', price: '18.36 AED', amount: 1836, interval: 'month', currency: 'AED', fils: 1836, features: ['More builds & publish', 'Priority queue', 'Standard support'], popular: true },
        { id: 'premium', name: 'Premium', price: '27.54 AED', amount: 2754, interval: 'month', currency: 'AED', fils: 2754, features: ['Unlimited builds', 'Priority support', 'Early features'], popular: false },
      ],
      currency: 'AED',
      interval: 'month'
    });
  }

  // POST /api/subscriptions/checkout  -> create Ziina payment intent for plan (monthly)
  if (pathname === '/api/subscriptions/checkout' && request.method === 'POST') {
    let body;
    try { body = await readBoundedJson(request); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
    const rawPlan = String(body.plan || body.tier || 'standard').trim().toLowerCase();
    const allowed = new Set(['free', 'standard', 'premium']);
    const plan = allowed.has(rawPlan) ? rawPlan : null;
    if (!plan) return jsonResponse(400, { error: 'Invalid plan. Use free, standard (18.36 AED/month) or premium (27.54 AED/month)' });

    if (plan === 'free') {
      // Free needs no payment — just activate
      await activateSubscription(env, userId, 'free', null, 0);
      return jsonResponse(200, { free: true, plan: 'free', message: 'Free plan activated — no payment required' });
    }

    const meta = ZIINA_PLANS[plan];
    if (!meta) return jsonResponse(400, { error: 'Unknown plan' });

    const apiKey = env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN;
    if (!apiKey) return jsonResponse(500, { error: 'Ziina not configured' });

    const origin = url.origin;
    const successUrl = body.success_url || body.successUrl || `${origin}/payment/success?plan=${plan}`;
    const cancelUrl = body.cancel_url || body.cancelUrl || `${origin}/payment/cancel?plan=${plan}`;
    const testFlag = body.test ?? false; // default live for subscriptions

    // Validate URLs
    const isValidHttps = (v) => { try { return new URL(v).protocol === 'https:'; } catch { return false; } };
    if (!isValidHttps(successUrl) || !isValidHttps(cancelUrl)) {
      return jsonResponse(400, { error: 'success_url and cancel_url must be valid https URLs' });
    }

    // Create Ziina intent
    const ziinaPayload = {
      amount: meta.amount,
      currency_code: 'AED',
      message: body.message || `Corez ${meta.label} — ${meta.aed} AED / month`,
      success_url: successUrl,
      cancel_url: cancelUrl,
      test: Boolean(testFlag),
    };
    if (body.failure_url) ziinaPayload.failure_url = body.failure_url;

    try {
      const ziinaRes = await fetch(`${ZIINA_BASE}/payment_intent`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(ziinaPayload)
      });
      const text = await ziinaRes.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!ziinaRes.ok) {
        return jsonResponse(ziinaRes.status, { error: data?.message || 'Ziina checkout failed', detail: data });
      }
      // Store pending subscription
      const pendingId = crypto.randomUUID();
      const now = Date.now();
      try {
        await env.DB.prepare(
          `INSERT INTO subscriptions (id, user_id, plan, amount, currency_code, status, period_start, period_end, ziina_payment_id, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(pendingId, userId, plan, meta.amount, 'AED', 'pending', null, null, data.id || null, now, now).run();
      } catch {}

      return jsonResponse(200, {
        plan,
        amount: meta.amount,
        aed: meta.aed,
        interval: 'month',
        ziina_id: data.id,
        redirect_url: data.redirect_url,
        embedded_url: data.embedded_url,
        success_url: data.success_url,
        cancel_url: data.cancel_url,
        status: data.status,
        raw: data
      });
    } catch (err) {
      return jsonResponse(502, { error: 'Failed to create checkout', detail: safeErrorDetail(err) });
    }
  }

  // POST /api/subscriptions/verify  -> verify Ziina payment and activate monthly subscription
  if (pathname === '/api/subscriptions/verify' && request.method === 'POST') {
    let body;
    try { body = await readBoundedJson(request); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
    let paymentId = String(body.payment_id || body.paymentId || body.ziina_id || body.id || '').trim();
    const planHint = String(body.plan || '').trim().toLowerCase();
    // If no id supplied, try latest pending for this user
    if (!paymentId) {
      try {
        const pending = await env.DB.prepare(
          `SELECT ziina_payment_id, plan FROM subscriptions WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1`
        ).bind(userId).first();
        if (pending && pending.ziina_payment_id) {
          paymentId = String(pending.ziina_payment_id).trim();
          // Use pending plan if no hint
          if (!planHint && pending.plan) body.plan = pending.plan;
        }
      } catch {}
    }
    if (!paymentId) return jsonResponse(400, { error: 'payment_id (Ziina payment intent id) is required — no pending payment found' });

    const apiKey = env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN;
    if (!apiKey) return jsonResponse(500, { error: 'Ziina not configured' });

    try {
      const ziinaRes = await fetch(`${ZIINA_BASE}/payment_intent/${encodeURIComponent(paymentId)}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      });
      const text = await ziinaRes.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!ziinaRes.ok) {
        return jsonResponse(ziinaRes.status, { error: data?.message || 'Failed to fetch payment', detail: data });
      }
      const status = String(data.status || '').toLowerCase();
      // Ziina statuses: requires_payment_instrument, requires_user_action, pending, completed, failed, canceled
      if (status !== 'completed') {
        return jsonResponse(200, { verified: false, status: data.status, message: `Payment not completed yet (status: ${data.status}). Complete it on Ziina first.`, raw: data });
      }
      // Payment completed — activate monthly subscription
      const amount = Number(data.amount);
      // Infer plan from amount if not provided
      let plan = planHint;
      if (!plan || !ZIINA_PLANS[plan] || ZIINA_PLANS[plan].amount !== amount) {
        // Infer by amount
        for (const [k, v] of Object.entries(ZIINA_PLANS)) {
          if (v.amount === amount) { plan = k; break; }
        }
      }
      if (!plan || plan === 'free') {
        // If free, just set free
        await activateSubscription(env, userId, 'free', paymentId, 0);
        return jsonResponse(200, { verified: true, plan: 'free', status: 'completed', raw: data });
      }
      if (!ZIINA_PLANS[plan]) plan = amount === 2754 ? 'premium' : 'standard';
      const activated = await activateSubscription(env, userId, plan, paymentId, amount);
      return jsonResponse(200, {
        verified: true,
        plan,
        status: 'completed',
        period_start: activated.period_start,
        period_end: activated.period_end,
        amount: activated.amount,
        aed: ZIINA_PLANS[plan].aed,
        interval: 'month',
        message: `Subscription activated — ${ZIINA_PLANS[plan].label} valid for 30 days`,
        raw: data
      });
    } catch (err) {
      return jsonResponse(502, { error: 'Verification failed', detail: safeErrorDetail(err) });
    }
  }

  // POST /api/subscriptions/cancel  -> cancel / downgrade to free
  if (pathname === '/api/subscriptions/cancel' && request.method === 'POST') {
    try {
      await env.DB.prepare(`UPDATE users SET plan='free', subscription_plan='free', subscription_status='canceled', subscription_period_end=? WHERE id=?`).bind(Date.now(), userId).run();
    } catch {
      try { await env.DB.prepare(`UPDATE users SET plan='free' WHERE id=?`).bind(userId).run(); } catch {}
    }
    // Also mark active subscriptions as canceled
    try {
      await env.DB.prepare(`UPDATE subscriptions SET status='canceled', updated_at=? WHERE user_id=? AND status='active'`).bind(Date.now(), userId).run();
    } catch {}
    return jsonResponse(200, { ok: true, plan: 'free', message: 'Subscription canceled — downgraded to Free' });
  }

  return jsonResponse(404, { error: 'Subscription route not found' });
}
