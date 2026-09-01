import { jsonResponse, readBoundedJson, safeErrorDetail } from './utils.js';

const ZIINA_BASE = 'https://api-v2.ziina.com/api';
const MIN_FILS = 200; // 2 AED

// Corez product pricing — Free (0), Standard 18.36 AED, Premium 27.54 AED
export const ZIINA_PLANS = {
  free: { amount: 0, label: 'Free', aed: '0.00' },
  standard: { amount: 1836, label: 'Standard', aed: '18.36' },
  premium: { amount: 2754, label: 'Premium', aed: '27.54' },
  basic: { amount: 1836, label: 'Standard', aed: '18.36' }, // alias
};

export function resolvePlanAmount(plan, fallbackAmount) {
  if (typeof plan === 'string') {
    const key = plan.trim().toLowerCase();
    if (ZIINA_PLANS[key]) return ZIINA_PLANS[key].amount;
  }
  return fallbackAmount;
}

function isValidHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateUrls({ success_url, cancel_url, failure_url }) {
  const errors = [];
  if (success_url !== undefined && success_url !== null && String(success_url).trim() !== '') {
    if (!isValidHttpsUrl(success_url)) errors.push('success_url must be a valid https URL');
  }
  if (cancel_url !== undefined && cancel_url !== null && String(cancel_url).trim() !== '') {
    if (!isValidHttpsUrl(cancel_url)) errors.push('cancel_url must be a valid https URL');
  }
  if (failure_url !== undefined && failure_url !== null && String(failure_url).trim() !== '') {
    if (!isValidHttpsUrl(failure_url)) errors.push('failure_url must be a valid https URL');
  }
  return errors;
}

export async function handleZiina(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Only handle Ziina routes
  const isCreate = (pathname === '/api/ziina/payment_intent' || pathname === '/api/ziina/payment-intent' || pathname === '/api/payments/ziina/create-intent' || pathname === '/api/payments/ziina/create' || pathname === '/api/payments/ziina/payment_intent') && request.method === 'POST';
  const isGetById = pathname.startsWith('/api/ziina/payment_intent/') || pathname.startsWith('/api/ziina/payment-intent/');
  const isGetByIdAlt = pathname.startsWith('/api/payments/ziina/');

  if (!isCreate && !isGetById && !isGetByIdAlt) return null;

  // Auth check for Ziina endpoints — require ZIINA_API_KEY
  const apiKey = env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN;
  if (!apiKey) {
    return jsonResponse(500, { error: 'Ziina payment gateway not configured: ZIINA_API_KEY missing' });
  }

  // CORS preflight already handled in entry; but handle OPTIONS here too
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  // GET /api/ziina/payment_intent/{id}  or  /api/payments/ziina/{id}
  if (request.method === 'GET' && (isGetById || isGetByIdAlt)) {
    let id = null;
    if (pathname.startsWith('/api/ziina/payment_intent/')) id = decodeURIComponent(pathname.slice('/api/ziina/payment_intent/'.length));
    else if (pathname.startsWith('/api/ziina/payment-intent/')) id = decodeURIComponent(pathname.slice('/api/ziina/payment-intent/'.length));
    else if (pathname.startsWith('/api/payments/ziina/')) {
      // /api/payments/ziina/{id}  — but not /api/payments/ziina/create*
      const suffix = pathname.slice('/api/payments/ziina/'.length);
      if (suffix.startsWith('create')) return null;
      id = decodeURIComponent(suffix.split('/')[0]);
    }
    if (!id || !/^[A-Za-z0-9._-]{1,128}$/.test(id)) {
      return jsonResponse(400, { error: 'Invalid payment intent id' });
    }
    try {
      const ziinaRes = await fetch(`${ZIINA_BASE}/payment_intent/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      const bodyText = await ziinaRes.text();
      let data;
      try { data = JSON.parse(bodyText); } catch { data = { raw: bodyText }; }
      if (!ziinaRes.ok) {
        return jsonResponse(ziinaRes.status, { error: data?.message || data?.error || 'Ziina fetch failed', detail: data, ziinaStatus: ziinaRes.status });
      }
      return jsonResponse(200, data);
    } catch (err) {
      return jsonResponse(502, { error: 'Failed to fetch Ziina payment intent', detail: safeErrorDetail(err) });
    }
  }

  // POST create
  if (isCreate) {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch (e) {
      return jsonResponse(400, { error: `Invalid JSON: ${e?.message || 'parse error'}` });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};

    // Plan shortcut: { plan: 'standard' | 'premium' } → fixed pricing (18.36 / 27.54 AED)
    // Also accepts tier / product as alias
    const planKey = body.plan || body.tier || body.product || body.package;
    let planMeta = null;
    if (typeof planKey === 'string' && planKey.trim()) {
      const k = planKey.trim().toLowerCase();
      if (ZIINA_PLANS[k]) {
        planMeta = ZIINA_PLANS[k];
      } else if (k) {
        return jsonResponse(400, { error: `Unknown plan '${planKey}'. Use 'standard' (18.36 AED) or 'premium' (27.54 AED).` });
      }
    }

    // Normalize amount: support amount (fils), amount_fils, amountInFils, amount_aed, amountAed
    // If plan is set, its fixed amount wins (ignore any amount sent)
    let amount;
    if (planMeta) {
      amount = planMeta.amount;
    } else {
      amount = body.amount;
      if (amount === undefined && body.amount_fils !== undefined) amount = body.amount_fils;
      if (amount === undefined && body.amountInFils !== undefined) amount = body.amountInFils;
      if (amount === undefined && body.amount_aed !== undefined) amount = Number(body.amount_aed) * 100;
      if (amount === undefined && body.amountAed !== undefined) amount = Number(body.amountAed) * 100;
      if (amount === undefined && body.amountAED !== undefined) amount = Number(body.amountAED) * 100;
      amount = Number(amount);
    }

    // Free plan needs no payment
    if (planMeta && planMeta.amount === 0) {
      return jsonResponse(200, { free: true, plan: 'free', amount: 0, currency_code: 'AED', message: 'Free plan — no payment required', redirect_url: null });
    }

    if (!Number.isFinite(amount)) {
      return jsonResponse(400, { error: 'amount or plan is required. Use plan: "free" (0 AED), "standard" (1836 fils = 18.36 AED) or "premium" (2754 fils = 27.54 AED), or amount in fils (100 AED = 10000 fils). Minimum 200 fils (2 AED).' });
    }
    // If user passed AED value like 100 and we already multiplied? The above handles amount_aed, but if they pass amount=100 expecting AED, they'd get 100 fils which is below min. We detect likely AED vs fils: if amount < 200 and amount is integer and they passed amount without fils suffix, we could hint. But spec says fils, so enforce.
    if (!Number.isInteger(amount)) {
      // allow but round
      amount = Math.round(amount);
    }
    if (amount < MIN_FILS) {
      return jsonResponse(400, { error: `amount must be at least ${MIN_FILS} fils (2 AED). Got ${amount} fils. Remember: 100 AED = 10000 fils.` });
    }
    if (amount > 10000000) { // 100,000 AED cap sanity
      return jsonResponse(400, { error: 'amount exceeds maximum (10000000 fils = 100000 AED)' });
    }

    const currency_code = String(body.currency_code || body.currencyCode || body.currency || 'AED').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency_code)) {
      return jsonResponse(400, { error: 'currency_code must be a 3-letter ISO code, e.g. AED' });
    }

    const success_url = body.success_url || body.successUrl || body.successURL;
    const cancel_url = body.cancel_url || body.cancelUrl || body.cancelURL;
    const failure_url = body.failure_url || body.failureUrl || body.failureURL;
    const urlErrors = validateUrls({ success_url, cancel_url, failure_url });
    if (urlErrors.length) {
      return jsonResponse(400, { error: urlErrors.join('; ') });
    }

    // Build Ziina payload
    const ziinaPayload = {
      amount,
      currency_code,
    };
    if (typeof body.message === 'string' && body.message.trim()) {
      ziinaPayload.message = body.message.trim().slice(0, 500);
    } else if (planMeta) {
      ziinaPayload.message = `Corez ${planMeta.label} — ${planMeta.aed} AED`;
    }
    if (success_url) ziinaPayload.success_url = String(success_url).trim();
    if (cancel_url) ziinaPayload.cancel_url = String(cancel_url).trim();
    if (failure_url) ziinaPayload.failure_url = String(failure_url).trim();
    // test flag: accept test, is_test, testMode
    const testFlag = body.test ?? body.is_test ?? body.isTest ?? body.test_mode ?? body.testMode;
    if (testFlag !== undefined) ziinaPayload.test = Boolean(testFlag);
    if (body.expiry) ziinaPayload.expiry = String(body.expiry).trim();
    if (body.allow_tips !== undefined || body.allowTips !== undefined) {
      const at = body.allow_tips ?? body.allowTips;
      ziinaPayload.allow_tips = Boolean(at);
    }
    // support operation_id passthrough
    if (body.operation_id || body.operationId) ziinaPayload.operation_id = String(body.operation_id || body.operationId).trim();

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
        // Ziina returns error with message/code
        const msg = data?.message || data?.error || text.slice(0, 500) || 'Ziina create failed';
        return jsonResponse(ziinaRes.status, { error: msg, detail: data, ziinaStatus: ziinaRes.status });
      }
      // Success: return as-is plus convenience
      // data should contain id, redirect_url, embedded_url, etc.
      return jsonResponse(200, data);
    } catch (err) {
      return jsonResponse(502, { error: 'Failed to create Ziina payment intent', detail: safeErrorDetail(err) });
    }
  }

  return null;
}
