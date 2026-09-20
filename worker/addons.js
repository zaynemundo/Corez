// Metered add-on SKUs: deep research packs, image packs, video packs.
//
// Add-ons are consumables bought on top of a plan. They exist so a limit is
// never a dead end: when a plan's monthly budget for something runs out, the
// request can spend an add-on credit instead of failing, and the customer only
// pays for what they actually use.
//
// Storage (D1):
//   addon_balances   one row per (user, sku): remaining + lifetime purchased
//   addon_purchases  the ledger: one row per checkout, with the Ziina payment
//                    id and the status, so a credit can only ever be granted
//                    once and a payment can always be traced
//
// Settlement mirrors subscriptions: there is no public webhook to trust, so a
// purchase is reconciled against Ziina on read (GET /api/addons) and on the
// explicit verify call the success page makes. Credits are granted only when
// Ziina reports the intent completed, and the grant is idempotent because the
// ledger row moves out of 'pending' in the same step.
//
// Honesty rules:
//  - A SKU that has no pipeline behind it is not sellable: video generation is
//    not shipped yet, so its pack is listed as unavailable and checkout refuses
//    it rather than taking money for something that cannot be delivered.
//  - Without D1 or without the Ziina key nothing is bought or spent, and the
//    call says so.

import { jsonResponse } from "./utils.js";
import { verifySession } from "./auth.js";

const ZIINA_BASE = "https://api-v2.ziina.com/api";
const ADDON_PURCHASE_PREFIX = "addon_";

/**
 * The catalogue. `metric` is the usage metric a pack tops up, `credits` is how
 * many units one purchase grants, and `amount` is in fils (AED x 100), the unit
 * Ziina takes.
 */
export const ADDON_SKUS = Object.freeze({
  research_pack: Object.freeze({
    id: "research_pack",
    label: "Deep research reports",
    unitLabel: "reports",
    metric: "research_reports",
    credits: 10,
    amount: 3672, // 36.72 AED
    aed: "36.72",
    available: true,
    blurb:
      "Ten full research runs: live web search through Exa, a cited report and a downloadable PDF.",
  }),
  image_pack: Object.freeze({
    id: "image_pack",
    label: "Image pack",
    unitLabel: "images",
    metric: "images",
    credits: 50,
    amount: 2754, // 27.54 AED
    aed: "27.54",
    available: true,
    blurb: "Fifty extra generated images, spendable on any plan.",
  }),
  video_pack: Object.freeze({
    id: "video_pack",
    label: "Video pack",
    unitLabel: "videos",
    metric: "videos",
    credits: 10,
    amount: 9180, // 91.80 AED
    aed: "91.80",
    available: false,
    blurb:
      "Ten short generated clips. Video generation has not shipped yet, so this pack cannot be bought.",
  }),
});

export const ADDON_METRICS = Object.freeze(
  Object.values(ADDON_SKUS).map((sku) => sku.metric),
);

export function getSku(skuId) {
  const key = String(skuId || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ADDON_SKUS, key) ? ADDON_SKUS[key] : null;
}

/** The pack that can extend a usage metric, if one exists. */
export function skuForMetric(metric) {
  return Object.values(ADDON_SKUS).find((sku) => sku.metric === metric) || null;
}

export function publicSku(sku) {
  return {
    id: sku.id,
    label: sku.label,
    unitLabel: sku.unitLabel,
    metric: sku.metric,
    credits: sku.credits,
    amount: sku.amount,
    aed: sku.aed,
    currency: "AED",
    available: sku.available,
    blurb: sku.blurb,
  };
}

async function resolveUid(request, env) {
  const session = await verifySession(request, env).catch(() => null);
  if (session?.uid) return session.uid;
  if (!env?.AUTH_SECRET) return "dev";
  return null;
}

export function addonsEnabled(env) {
  if (env?.ADDONS_DISABLED === "1") return false;
  return Boolean(env?.DB);
}

function paymentsConfigured(env) {
  return Boolean(env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN);
}

let tablesReady = false;

export async function ensureAddonTables(env) {
  if (tablesReady || !env?.DB) return tablesReady;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS addon_balances (user_id TEXT NOT NULL, sku TEXT NOT NULL, remaining INTEGER NOT NULL DEFAULT 0, purchased INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, sku))`,
    ).run();
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS addon_purchases (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, sku TEXT NOT NULL, credits INTEGER NOT NULL, amount INTEGER NOT NULL, currency_code TEXT NOT NULL DEFAULT 'AED', status TEXT NOT NULL, ziina_payment_id TEXT, created_at INTEGER NOT NULL, completed_at INTEGER, updated_at INTEGER NOT NULL)`,
    ).run();
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_addon_purchases_user ON addon_purchases(user_id, created_at DESC)`,
    ).run().catch(() => null);
    tablesReady = true;
  } catch {
    tablesReady = false;
  }
  return tablesReady;
}

/** Current balances, keyed by sku. Missing rows read as zero. */
export async function getAddonBalances(env, uid) {
  const balances = {};
  for (const sku of Object.values(ADDON_SKUS)) {
    balances[sku.id] = { remaining: 0, purchased: 0 };
  }
  if (!addonsEnabled(env) || !uid) return balances;
  try {
    if (!(await ensureAddonTables(env))) return balances;
    const result = await env.DB.prepare(
      "SELECT sku, remaining, purchased FROM addon_balances WHERE user_id=?",
    )
      .bind(uid)
      .all();
    for (const row of Array.isArray(result?.results) ? result.results : []) {
      const sku = getSku(row?.sku);
      if (!sku) continue;
      balances[sku.id] = {
        remaining: Math.max(0, Number(row.remaining) || 0),
        purchased: Math.max(0, Number(row.purchased) || 0),
      };
    }
  } catch {
    // A read failure reports zeros rather than inventing credits.
  }
  return balances;
}

/** Grant credits. Only called for a settled payment. */
export async function grantAddonCredits(env, uid, skuId, credits, { now = Date.now() } = {}) {
  const sku = getSku(skuId);
  const amount = Math.trunc(Number(credits) || 0);
  if (!addonsEnabled(env) || !uid || !sku || amount <= 0) return false;
  try {
    if (!(await ensureAddonTables(env))) return false;
    await env.DB.prepare(
      `INSERT INTO addon_balances (user_id, sku, remaining, purchased, updated_at) VALUES (?,?,?,?,?) ON CONFLICT (user_id, sku) DO UPDATE SET remaining = remaining + excluded.remaining, purchased = purchased + excluded.purchased, updated_at = excluded.updated_at`,
    )
      .bind(uid, sku.id, amount, amount, now)
      .run();
    return true;
  } catch {
    return false;
  }
}

function changedRows(result) {
  const meta = result?.meta;
  if (meta && Number.isFinite(Number(meta.changes))) return Number(meta.changes);
  if (Number.isFinite(Number(result?.changes))) return Number(result.changes);
  return null;
}

/**
 * Spend one add-on credit for a metric, if the account has one.
 * The decrement is conditional on `remaining > 0`, so two concurrent requests
 * cannot both spend the last credit.
 */
export async function spendAddonCredit(env, uid, metric, { now = Date.now() } = {}) {
  const sku = skuForMetric(metric);
  if (!sku || !addonsEnabled(env) || !uid) return { spent: false, reason: "no_pack" };
  try {
    if (!(await ensureAddonTables(env))) return { spent: false, reason: "unavailable" };
    const result = await env.DB.prepare(
      `UPDATE addon_balances SET remaining = remaining - 1, updated_at = ? WHERE user_id = ? AND sku = ? AND remaining > 0`,
    )
      .bind(now, uid, sku.id)
      .run();
    const changes = changedRows(result);
    if (changes === 0) return { spent: false, reason: "empty", sku: sku.id };
    if (changes === null) {
      // Driver did not report changes: confirm by reading the balance back.
      const balances = await getAddonBalances(env, uid);
      if ((balances[sku.id]?.remaining ?? 0) <= 0) {
        return { spent: false, reason: "empty", sku: sku.id };
      }
    }
    return { spent: true, sku: sku.id, metric };
  } catch {
    return { spent: false, reason: "error", sku: sku.id };
  }
}

async function readPurchase(env, uid, purchaseId) {
  if (!env?.DB) return null;
  try {
    if (!(await ensureAddonTables(env))) return null;
    const row = await env.DB.prepare(
      "SELECT * FROM addon_purchases WHERE id=? AND user_id=?",
    )
      .bind(purchaseId, uid)
      .first();
    return row || null;
  } catch {
    return null;
  }
}

async function listPurchases(env, uid, { limit = 20 } = {}) {
  if (!env?.DB) return [];
  try {
    if (!(await ensureAddonTables(env))) return [];
    const result = await env.DB.prepare(
      "SELECT * FROM addon_purchases WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
    )
      .bind(uid, limit)
      .all();
    return Array.isArray(result?.results) ? result.results : [];
  } catch {
    return [];
  }
}

async function markPurchase(env, purchaseId, status, { now = Date.now() } = {}) {
  try {
    await env.DB.prepare(
      "UPDATE addon_purchases SET status=?, completed_at=?, updated_at=? WHERE id=?",
    )
      .bind(status, status === "completed" ? now : null, now, purchaseId)
      .run();
    return true;
  } catch {
    return false;
  }
}

export function publicPurchase(row) {
  const sku = getSku(row?.sku);
  return {
    id: row?.id || null,
    sku: row?.sku || null,
    label: sku?.label || row?.sku || null,
    unitLabel: sku?.unitLabel || "units",
    credits: Number(row?.credits) || 0,
    amount: Number(row?.amount) || 0,
    currency: row?.currency_code || "AED",
    status: row?.status || "pending",
    createdAt: Number(row?.created_at) || null,
    completedAt: Number(row?.completed_at) || null,
  };
}

async function fetchZiinaIntent(env, paymentId) {
  const apiKey = env?.ZIINA_API_KEY || env?.ZIINA_API_TOKEN;
  if (!apiKey || !paymentId) return { ok: false, status: 0, data: null };
  try {
    const response = await fetch(
      `${ZIINA_BASE}/payment_intent/${encodeURIComponent(paymentId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      },
    );
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function isSettled(intent) {
  const status = String(intent?.status || "").toLowerCase();
  return status === "completed" || status === "paid" || status === "succeeded";
}

/**
 * Settle a pending purchase: ask Ziina, grant the credits once, move the ledger
 * row out of 'pending'. Safe to call repeatedly (that is the whole point: the
 * success page, a refresh, and the next settings open all call it).
 */
export async function settleAddonPurchase(env, uid, purchaseId, { now = Date.now() } = {}) {
  const row = await readPurchase(env, uid, purchaseId);
  if (!row) return { ok: false, status: 404, error: "Purchase not found." };
  if (row.status === "completed") {
    return { ok: true, granted: false, alreadySettled: true, purchase: publicPurchase(row) };
  }
  if (!paymentsConfigured(env)) {
    return { ok: false, status: 503, error: "Payments are not configured on this deployment." };
  }
  const intent = await fetchZiinaIntent(env, row.ziina_payment_id);
  if (!intent.ok || !intent.data) {
    return { ok: false, status: 502, error: "Could not reach the payment provider." };
  }
  if (!isSettled(intent.data)) {
    return {
      ok: true,
      granted: false,
      pending: true,
      purchase: publicPurchase(row),
      paymentStatus: String(intent.data?.status || "unknown").toLowerCase(),
    };
  }
  // Grant first, then close the ledger row: a crash in between re-runs the
  // grant on the next settle, which is the safe direction for the customer.
  const granted = await grantAddonCredits(env, uid, row.sku, row.credits, { now });
  await markPurchase(env, purchaseId, "completed", { now });
  const sku = getSku(row.sku);
  return {
    ok: true,
    granted,
    alreadySettled: false,
    purchase: { ...publicPurchase(row), status: "completed", completedAt: now },
    balance: (await getAddonBalances(env, uid))[sku?.id] || null,
  };
}

async function reconcilePending(env, uid) {
  const purchases = await listPurchases(env, uid, { limit: 10 });
  const settled = [];
  for (const row of purchases) {
    if (row.status !== "pending" || !row.ziina_payment_id) continue;
    const result = await settleAddonPurchase(env, uid, row.id);
    if (result.ok && result.granted) settled.push(publicPurchase({ ...row, status: "completed" }));
  }
  return settled;
}

/**
 * /api/addons
 *   GET  /api/addons            catalogue, balances, recent purchases
 *   POST /api/addons/checkout   { sku } -> Ziina intent + redirect URL
 *   POST /api/addons/verify     { purchaseId } -> settle after payment
 */
export async function handleAddonsApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/addons")) return null;

  const uid = await resolveUid(request, env);
  if (!uid) return jsonResponse(401, { error: "Authentication required." });

  const catalog = Object.values(ADDON_SKUS).map(publicSku);

  if (url.pathname === "/api/addons" && request.method === "GET") {
    if (!addonsEnabled(env)) {
      return jsonResponse(200, {
        skus: catalog,
        balances: Object.fromEntries(catalog.map((sku) => [sku.id, { remaining: 0, purchased: 0 }])),
        purchases: [],
        paymentsConfigured: paymentsConfigured(env),
        enabled: false,
        reason: env?.ADDONS_DISABLED === "1" ? "addons_disabled" : "no_database",
      });
    }
    // Opening the panel is also when a payment that completed elsewhere gets
    // picked up, so credits appear without the customer doing anything.
    const settled = await reconcilePending(env, uid);
    return jsonResponse(200, {
      skus: catalog,
      balances: await getAddonBalances(env, uid),
      purchases: (await listPurchases(env, uid)).map(publicPurchase),
      settledNow: settled,
      paymentsConfigured: paymentsConfigured(env),
      enabled: true,
      currency: "AED",
    });
  }

  if (url.pathname === "/api/addons/checkout" && request.method === "POST") {
    if (!addonsEnabled(env)) {
      return jsonResponse(503, {
        error: "Add-ons are not configured on this deployment.",
        code: env?.ADDONS_DISABLED === "1" ? "addons_disabled" : "no_database",
      });
    }
    if (!paymentsConfigured(env)) {
      return jsonResponse(503, {
        error: "Payments are not configured on this deployment (ZIINA_API_KEY missing).",
        code: "payments_not_configured",
      });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }
    const sku = getSku(body?.sku);
    if (!sku) {
      return jsonResponse(400, { error: "Unknown add-on." });
    }
    if (!sku.available) {
      return jsonResponse(409, {
        error: `${sku.label} is not available yet, so it cannot be bought.`,
        code: "sku_unavailable",
      });
    }

    let origin = "https://corez.pro";
    try {
      const candidate = new URL(request.url).origin;
      if (/^https?:\/\//.test(candidate)) origin = candidate;
    } catch {
      /* keep the default */
    }
    const successUrl = `${origin}/payment/success?addon=${encodeURIComponent(sku.id)}`;
    const cancelUrl = `${origin}/pricing`;
    const testFlag = body?.test === true;

    let intent;
    try {
      const response = await fetch(`${ZIINA_BASE}/payment_intent`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.ZIINA_API_KEY || env.ZIINA_API_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          amount: sku.amount,
          currency_code: "AED",
          message: `Corez ${sku.label} — ${sku.credits} ${sku.unitLabel} (${sku.aed} AED)`,
          success_url: successUrl,
          cancel_url: cancelUrl,
          test: testFlag,
        }),
      });
      intent = await response.json().catch(() => null);
      if (!response.ok || !intent?.id) {
        return jsonResponse(502, {
          error: "The payment provider rejected the checkout.",
          detail: intent?.message || null,
        });
      }
    } catch (error) {
      return jsonResponse(502, {
        error: `Could not reach the payment provider: ${error?.message || "network error"}.`,
      });
    }

    const purchaseId = `${ADDON_PURCHASE_PREFIX}${crypto.randomUUID()}`;
    const now = Date.now();
    try {
      await ensureAddonTables(env);
      await env.DB.prepare(
        `INSERT INTO addon_purchases (id, user_id, sku, credits, amount, currency_code, status, ziina_payment_id, created_at, completed_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          purchaseId,
          uid,
          sku.id,
          sku.credits,
          sku.amount,
          "AED",
          "pending",
          intent.id,
          now,
          null,
          now,
        )
        .run();
    } catch {
      return jsonResponse(500, {
        error: "Could not record the purchase, so nothing was charged. Please try again.",
      });
    }

    return jsonResponse(201, {
      purchaseId,
      sku: publicSku(sku),
      redirect_url: intent.redirect_url || intent.url || null,
      intentId: intent.id,
    });
  }

  if (url.pathname === "/api/addons/verify" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }
    const purchaseId =
      typeof body?.purchaseId === "string"
        ? body.purchaseId
        : typeof body?.purchase_id === "string"
          ? body.purchase_id
          : null;
    let resolvedId = purchaseId;
    if (!resolvedId && typeof body?.payment_id === "string") {
      // The payment provider returns its own id on the success URL; map it back
      // to the ledger row rather than trusting a client-supplied credit count.
      const purchases = await listPurchases(env, uid);
      resolvedId =
        purchases.find((row) => row.ziina_payment_id === body.payment_id)?.id || null;
    }
    if (!resolvedId) {
      return jsonResponse(400, { error: "A purchaseId or payment_id is required." });
    }
    const result = await settleAddonPurchase(env, uid, resolvedId);
    if (!result.ok) {
      return jsonResponse(result.status || 500, { error: result.error });
    }
    return jsonResponse(200, {
      success: true,
      granted: Boolean(result.granted),
      alreadySettled: Boolean(result.alreadySettled),
      purchase: result.purchase,
      balance: result.balance || null,
      message: result.granted
        ? "Credits added to your account."
        : result.alreadySettled
          ? "These credits were already added."
          : "Payment is not completed yet.",
    });
  }

  return jsonResponse(405, { error: "Method not allowed." });
}
