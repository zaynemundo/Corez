// Contract test for metered add-on SKUs (research packs, image packs, video
// packs) against the real Worker entrypoint, with Ziina stubbed at the fetch
// boundary so the money flow is exercised without a live payment.
//
// The claims worth proving:
//   - nothing is bought without a session, a configured payment provider, or an
//     available SKU ("video generation has not shipped" must not take money)
//   - a purchase is recorded before the customer is sent to pay, and credits are
//     granted only when Ziina reports the payment completed
//   - granting is idempotent: the success page, a refresh and the settings panel
//     can all settle the same purchase without double-crediting
//   - a purchased pack is spent before a plan wall refuses the work, and the
//     plan counter is not charged for work a credit paid for
//   - credits belong to one account

import assert from 'node:assert/strict';
import entryWorker from '../worker/entry.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';
import { ADDON_SKUS } from '../worker/addons.js';
import { PLAN_LIMITS, periodKey } from '../worker/usage.js';

const SECRET = 'addons-contract-secret';
const BASE = 'https://corez.test';
const CURRENT_PERIOD = periodKey();
const ZIINA_BASE = 'https://api-v2.ziina.com/api';

// --------------------------------------------------------------------- fakes

function createD1({ plan = 'free', status = 'active' } = {}) {
  const balances = new Map(); // `${user}|${sku}` -> {remaining, purchased}
  const purchases = new Map(); // id -> row
  const counters = new Map(); // `${user}|${period}|${metric}` -> count

  const balanceKey = (user, sku) => `${user}|${sku}`;

  return {
    balances,
    purchases,
    counters,
    prepare(query) {
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          if (/CREATE TABLE|CREATE INDEX/i.test(query)) return { success: true };

          if (/INSERT INTO addon_balances/i.test(query)) {
            const [user, sku, remaining, purchased] = statement.values;
            const key = balanceKey(user, sku);
            const current = balances.get(key) || { remaining: 0, purchased: 0 };
            balances.set(key, {
              remaining: current.remaining + Number(remaining),
              purchased: current.purchased + Number(purchased),
            });
            return { success: true };
          }

          if (/UPDATE addon_balances SET remaining = remaining - 1/i.test(query)) {
            const [updatedAt, user, sku] = statement.values;
            const key = balanceKey(user, sku);
            const current = balances.get(key) || { remaining: 0, purchased: 0 };
            if (current.remaining > 0) {
              balances.set(key, { ...current, remaining: current.remaining - 1, updatedAt });
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 0 } };
          }

          if (/INSERT INTO addon_purchases/i.test(query)) {
            const [
              id,
              userId,
              sku,
              credits,
              amount,
              currency,
              status,
              ziinaPaymentId,
              createdAt,
              completedAt,
              updatedAt,
            ] = statement.values;
            purchases.set(id, {
              id,
              user_id: userId,
              sku,
              credits,
              amount,
              currency_code: currency,
              status,
              ziina_payment_id: ziinaPaymentId,
              created_at: createdAt,
              completed_at: completedAt,
              updated_at: updatedAt,
            });
            return { success: true };
          }

          if (/UPDATE addon_purchases SET status=/i.test(query)) {
            const [status, completedAt, updatedAt, id] = statement.values;
            const row = purchases.get(id);
            if (row) purchases.set(id, { ...row, status, completed_at: completedAt, updated_at: updatedAt });
            return { success: true, meta: { changes: row ? 1 : 0 } };
          }

          if (/INSERT INTO usage_counters/i.test(query)) {
            const [userId, period, metric, amount] = statement.values;
            const key = `${userId}|${period}|${metric}`;
            counters.set(key, (counters.get(key) || 0) + Number(amount));
            return { success: true };
          }

          return { success: true };
        },
        async all() {
          if (/SELECT sku, remaining, purchased FROM addon_balances/i.test(query)) {
            const [userId] = statement.values;
            const results = [];
            for (const [key, value] of balances) {
              const [owner, sku] = key.split('|');
              if (owner === userId) results.push({ sku, remaining: value.remaining, purchased: value.purchased });
            }
            return { results };
          }
          if (/FROM addon_purchases WHERE user_id=\?/i.test(query)) {
            const [userId] = statement.values;
            const results = [...purchases.values()]
              .filter((row) => row.user_id === userId)
              .sort((a, b) => b.created_at - a.created_at);
            return { results };
          }
          if (/SELECT metric, count FROM usage_counters/i.test(query)) {
            const [userId, period] = statement.values;
            const results = [];
            for (const [key, count] of counters) {
              const [owner, rowPeriod, metric] = key.split('|');
              if (owner === userId && rowPeriod === period) results.push({ metric, count });
            }
            return { results };
          }
          return { results: [] };
        },
        async first() {
          if (/FROM addon_purchases WHERE id=\? AND user_id=\?/i.test(query)) {
            const [id, userId] = statement.values;
            const row = purchases.get(id);
            return row && row.user_id === userId ? row : null;
          }
          if (/status='pending'/i.test(query)) return null;
          if (/FROM users WHERE id=\?/i.test(query)) {
            return {
              plan,
              subscription_plan: plan,
              subscription_status: status,
              subscription_period_end: null,
              downgrade_plan: null,
              downgrade_scheduled_at: null,
            };
          }
          return null;
        },
      };
      return statement;
    },
    async batch(statements) {
      for (const statement of statements) await statement.run();
      return [];
    },
  };
}

/** Ziina stub: create intents, and let the test drive the payment status. */
function stubZiina() {
  const intents = new Map();
  let status = 'pending';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith(`${ZIINA_BASE}/payment_intent`)) {
      const id = target.split('/').pop();
      if (init.method === 'POST' || (!init.method && !target.match(/payment_intent\/.+/))) {
        const created = {
          id: `pi_${intents.size + 1}`,
          redirect_url: `https://pay.ziina.test/${intents.size + 1}`,
        };
        intents.set(created.id, { ...created, status: 'pending' });
        return new Response(JSON.stringify(created), { status: 200 });
      }
      const intent = intents.get(id) || { id, status: 'pending' };
      return new Response(JSON.stringify({ ...intent, status: intents.has(id) ? status : 'pending' }), {
        status: 200,
      });
    }
    return realFetch(url, init);
  };
  return {
    intents,
    setStatus(next) {
      status = next;
    },
    lastIntentId() {
      return [...intents.keys()].pop();
    },
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

async function cookieFor(uid) {
  const token = await createJWT(
    { uid, email: `${uid}@test.dev`, exp: Math.floor(Date.now() / 1000) + 3600 },
    SECRET,
  );
  return `${SESSION_COOKIE}=${token}`;
}

let ip = 0;
async function call(env, path, { method = 'POST', cookie = null, body = null } = {}) {
  ip += 1;
  return entryWorker.fetch(
    new Request(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': `10.9.${Math.floor(ip / 250)}.${ip % 250}`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );
}

async function run() {
  const alice = await cookieFor('alice-uid');
  const bob = await cookieFor('bob-uid');
  const ziina = stubZiina();

  try {
    // ------------------------------------------------------------- catalogue
    {
      const db = createD1({ plan: 'free' });
      const env = { AUTH_SECRET: SECRET, DB: db, ZIINA_API_KEY: 'ziina-test-key' };
      assert.equal((await call(env, '/api/addons', { method: 'GET' })).status, 401, 'owner-only');

      const response = await call(env, '/api/addons', { method: 'GET', cookie: alice });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.enabled, true);
      assert.equal(data.currency, 'AED');
      const ids = data.skus.map((sku) => sku.id).sort();
      assert.deepEqual(ids, ['image_pack', 'research_pack', 'video_pack']);
      const video = data.skus.find((sku) => sku.id === 'video_pack');
      assert.equal(video.available, false, 'a SKU with no pipeline is not sellable');
      const research = data.skus.find((sku) => sku.id === 'research_pack');
      assert.equal(research.credits, ADDON_SKUS.research_pack.credits);
      assert.equal(research.currency, 'AED');
      assert.deepEqual(data.balances, {
        research_pack: { remaining: 0, purchased: 0 },
        image_pack: { remaining: 0, purchased: 0 },
        video_pack: { remaining: 0, purchased: 0 },
      });
    }

    // --------------------------------------------------- nothing without keys
    {
      const db = createD1();
      const env = { AUTH_SECRET: SECRET, DB: db };
      const response = await call(env, '/api/addons/checkout', {
        cookie: alice,
        body: { sku: 'image_pack' },
      });
      assert.equal(response.status, 503, 'no payment provider, no checkout');
      assert.equal((await response.json()).code, 'payments_not_configured');
      assert.equal(db.purchases.size, 0, 'and no purchase is recorded');
    }

    // ------------------------------- unavailable SKU is refused, not charged
    {
      const db = createD1();
      const env = { AUTH_SECRET: SECRET, DB: db, ZIINA_API_KEY: 'ziina-test-key' };
      const response = await call(env, '/api/addons/checkout', {
        cookie: alice,
        body: { sku: 'video_pack' },
      });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, 'sku_unavailable');
      assert.equal(db.purchases.size, 0, 'nothing was recorded for an unbuyable pack');
      assert.equal(ziina.intents.size, 0, 'and no payment intent was created');
    }

    // --------------------------------------- buy an image pack, then settle it
    let imagePurchaseId = null;
    {
      const db = createD1({ plan: 'free' });
      const env = { AUTH_SECRET: SECRET, DB: db, ZIINA_API_KEY: 'ziina-test-key' };

      const checkout = await call(env, '/api/addons/checkout', {
        cookie: alice,
        body: { sku: 'image_pack' },
      });
      assert.equal(checkout.status, 201);
      const created = await checkout.json();
      imagePurchaseId = created.purchaseId;
      assert.ok(imagePurchaseId, 'a purchase id is returned');
      assert.ok(created.redirect_url, 'and a redirect to pay');
      assert.equal(created.sku.credits, ADDON_SKUS.image_pack.credits);
      const row = db.purchases.get(imagePurchaseId);
      assert.equal(row.status, 'pending');
      assert.equal(row.amount, ADDON_SKUS.image_pack.amount, 'the price comes from the catalogue');

      // The customer has not paid yet: verifying must not hand out credits.
      const notYet = await call(env, '/api/addons/verify', {
        cookie: alice,
        body: { purchaseId: imagePurchaseId },
      });
      assert.equal(notYet.status, 200);
      const pending = await notYet.json();
      assert.equal(pending.granted, false);
      assert.match(pending.message, /not completed yet/i);
      assert.equal(db.balances.size, 0, 'and no balance is created');

      // Payment completes at Ziina.
      ziina.setStatus('completed');
      const verified = await call(env, '/api/addons/verify', {
        cookie: alice,
        body: { purchaseId: imagePurchaseId },
      });
      assert.equal(verified.status, 200);
      const settled = await verified.json();
      assert.equal(settled.granted, true);
      assert.match(settled.message, /credits added/i);
      assert.equal(settled.balance.remaining, ADDON_SKUS.image_pack.credits);
      assert.equal(db.purchases.get(imagePurchaseId).status, 'completed');

      // Idempotent: the success page, a refresh and the settings panel all call
      // this, and none of them may double-credit.
      const again = await call(env, '/api/addons/verify', {
        cookie: alice,
        body: { purchaseId: imagePurchaseId },
      });
      const second = await again.json();
      assert.equal(second.granted, false);
      assert.equal(second.alreadySettled, true);
      assert.match(second.message, /already added/i);
      assert.equal(
        db.balances.get('alice-uid|image_pack').remaining,
        ADDON_SKUS.image_pack.credits,
        'credits are granted exactly once',
      );

      // Another account cannot settle (or claim) somebody else's purchase.
      const stolen = await call(env, '/api/addons/verify', {
        cookie: bob,
        body: { purchaseId: imagePurchaseId },
      });
      assert.equal(stolen.status, 404, 'a purchase belongs to one account');
    }

    // ---------------------- an image pack carries the request past the plan wall
    {
      const db = createD1({ plan: 'free' });
      const env = { AUTH_SECRET: SECRET, DB: db, ZIINA_API_KEY: 'ziina-test-key' };
      // Plan images already spent.
      db.counters.set(`alice-uid|${CURRENT_PERIOD}|images`, PLAN_LIMITS.free.images);
      db.balances.set('alice-uid|image_pack', { remaining: 2, purchased: 2 });

      const first = await call(env, '/api/image', { cookie: alice, body: { prompt: 'a cat' } });
      assert.notEqual(first.status, 402, 'a purchased credit covers the request');
      assert.equal(
        db.balances.get('alice-uid|image_pack').remaining,
        1,
        'one credit is spent',
      );
      assert.equal(
        db.counters.get(`alice-uid|${CURRENT_PERIOD}|images`),
        PLAN_LIMITS.free.images,
        'the plan counter is untouched while a credit pays',
      );

      await call(env, '/api/image', { cookie: alice, body: { prompt: 'a dog' } });
      assert.equal(db.balances.get('alice-uid|image_pack').remaining, 0);

      const third = await call(env, '/api/image', { cookie: alice, body: { prompt: 'a bird' } });
      assert.equal(third.status, 402, 'with no credits left the plan wall applies');
      assert.equal((await third.json()).metric, 'images');
      assert.equal(
        db.balances.get('alice-uid|image_pack').remaining,
        0,
        'a credit balance never goes negative',
      );
    }

    // --------------------------- a research pack carries a report past the wall
    {
      const db = createD1({ plan: 'free' });
      const env = { AUTH_SECRET: SECRET, DB: db, ZIINA_API_KEY: 'ziina-test-key' };
      db.counters.set(`alice-uid|${CURRENT_PERIOD}|research_reports`, PLAN_LIMITS.free.research_reports);
      db.balances.set('alice-uid|research_pack', { remaining: 1, purchased: 1 });

      const research = await call(env, '/api/ai', {
        cookie: alice,
        body: { prompt: '@research the state of solar in the UAE', stream: false },
      });
      assert.notEqual(research.status, 402, 'a research credit covers the report');
      assert.equal(db.balances.get('alice-uid|research_pack').remaining, 0, 'the credit is spent');
      assert.equal(
        db.counters.get(`alice-uid|${CURRENT_PERIOD}|research_reports`),
        PLAN_LIMITS.free.research_reports,
        'the plan research counter is not charged for a credited report',
      );
      assert.equal(
        db.counters.get(`alice-uid|${CURRENT_PERIOD}|messages`),
        1,
        'the turn is still counted as a generation',
      );

      const next = await call(env, '/api/ai', {
        cookie: alice,
        body: { prompt: '@research offshore wind economics', stream: false },
      });
      assert.equal(next.status, 402, 'with no research credits left the research wall applies');
      const payload = await next.json();
      assert.equal(payload.metric, 'research_reports');
      assert.match(payload.error, /research reports/i);
    }

    // ---------------------- opening the panel settles a payment made elsewhere
    {
      const db = createD1({ plan: 'free' });
      const env = { AUTH_SECRET: SECRET, DB: db, ZIINA_API_KEY: 'ziina-test-key' };
      const checkout = await call(env, '/api/addons/checkout', {
        cookie: alice,
        body: { sku: 'research_pack' },
      });
      const created = await checkout.json();
      ziina.setStatus('completed');

      const listed = await call(env, '/api/addons', { method: 'GET', cookie: alice });
      const data = await listed.json();
      assert.equal(data.balances.research_pack.remaining, ADDON_SKUS.research_pack.credits);
      assert.equal(data.settledNow.length, 1, 'the completion is reported to the client');
      assert.equal(db.purchases.get(created.purchaseId).status, 'completed');
      const ledger = data.purchases.find((row) => row.id === created.purchaseId);
      assert.equal(ledger.status, 'completed');
      assert.equal(ledger.credits, ADDON_SKUS.research_pack.credits);
    }

    // -------------------------------------- a deployment without D1 is honest
    {
      const env = { AUTH_SECRET: SECRET, ZIINA_API_KEY: 'ziina-test-key' };
      const listed = await call(env, '/api/addons', { method: 'GET', cookie: alice });
      const data = await listed.json();
      assert.equal(data.enabled, false);
      assert.equal(data.reason, 'no_database');
      const checkout = await call(env, '/api/addons/checkout', {
        cookie: alice,
        body: { sku: 'image_pack' },
      });
      assert.equal(checkout.status, 503);
    }

    // -------------------------------------------------- the kill switch off
    {
      const db = createD1();
      const env = { AUTH_SECRET: SECRET, DB: db, ZIINA_API_KEY: 'ziina-test-key', ADDONS_DISABLED: '1' };
      const listed = await call(env, '/api/addons', { method: 'GET', cookie: alice });
      const data = await listed.json();
      assert.equal(data.enabled, false);
      assert.equal(data.reason, 'addons_disabled');
      const checkout = await call(env, '/api/addons/checkout', {
        cookie: alice,
        body: { sku: 'image_pack' },
      });
      assert.equal(checkout.status, 503);
      assert.equal(db.purchases.size, 0);
    }

    console.log('Add-on SKU contract checks passed.');
  } finally {
    ziina.restore();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
