// Contract test for per-plan usage metering against the real Worker entrypoint.
//
// Proves the wall exists and is honest:
//   - a free account is refused (402) once a monthly budget is spent
//   - the refusal names the metric, the limit, the plan and when it resets
//   - counters are per account and per UTC month
//   - Standard/Premium budgets are larger, Premium is unlimited
//   - admission is atomic: with one generation left, two simultaneous requests
//     admit exactly one, for direct AI turns AND queued task creation
//   - an unavailable accounting database refuses retryably (503) and starts no
//     provider work
//   - title generation has its own bounded allowance instead of an exemption
//   - a deployment without D1 never blocks anybody
//
// Requests carry a distinct CF-Connecting-IP because entry.js rate-limits AI
// calls per client; sharing one IP would produce 429s and hide the 402s.

import assert from 'node:assert/strict';
import entryWorker from '../worker/entry.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';
import { PLAN_LIMITS, periodKey } from '../worker/usage.js';

const SECRET = 'usage-metering-test-secret';
const BASE = 'https://corez.test';
const CURRENT_PERIOD = periodKey();

function createD1({ plan = 'free', status = 'active' } = {}) {
  const counters = new Map(); // `${user}|${period}|${metric}` -> count
  const receipts = new Set(); // settlement receipt keys applied once
  const keyOf = (userId, period, metric) => `${userId}|${period}|${metric}`;
  return {
    counters,
    receipts,
    prepare(query) {
      const statement = {
        __sql: query,
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          const values = statement.values;
          if (/CREATE TABLE|CREATE INDEX/i.test(query)) {
            return { success: true, meta: { changes: 0 } };
          }
          if (/INSERT INTO usage_receipts/i.test(query)) {
            const [receiptKey] = values;
            if (receipts.has(receiptKey)) {
              return { success: true, meta: { changes: 0 } };
            }
            receipts.add(receiptKey);
            return { success: true, meta: { changes: 1 } };
          }
          if (/INSERT INTO usage_counters/i.test(query)) {
            const [userId, period, metric, amount] = values;
            const key = keyOf(userId, period, metric);
            if (/receipt_key/i.test(query)) {
              // Reconciliation is receipt-guarded: a replay changes nothing.
              const receiptKey = values[5];
              if (receipts.has(receiptKey)) {
                return { success: true, meta: { changes: 0 } };
              }
              counters.set(key, (counters.get(key) || 0) + Number(amount));
              return { success: true, meta: { changes: 1 } };
            }
            // Guarded charge: values[5] is the plan limit (null = unlimited).
            const limit = values[5];
            const next = (counters.get(key) || 0) + Number(amount);
            if (limit !== null && next > Number(limit)) {
              return { success: true, meta: { changes: 0 } };
            }
            counters.set(key, next);
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE usage_counters/i.test(query)) {
            const [amount, , userId, period, metric] = values;
            const key = keyOf(userId, period, metric);
            counters.set(key, Math.max(0, (counters.get(key) || 0) - Number(amount)));
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        async all() {
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
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
}

// The accounting store is the part of D1 that is unavailable: auth and
// subscription reads still answer, every usage_* statement fails. This is the
// real failure mode the review calls out — the balance cannot be read or
// charged — and the API must refuse retryably instead of starting work.
function accountingOutageD1(options) {
  const base = createD1(options);
  const fail = async () => {
    throw new Error('simulated accounting outage');
  };
  const failingStatement = () => {
    const statement = { __sql: '', bind() { return statement; }, run: fail, all: fail, first: fail };
    return statement;
  };
  return {
    ...base,
    counters: base.counters,
    receipts: base.receipts,
    prepare(query) {
      if (/usage_/i.test(query)) return failingStatement();
      return base.prepare(query);
    },
    async batch(statements) {
      if (statements.some((statement) => /usage_/i.test(String(statement?.__sql || '')))) {
        return fail();
      }
      return base.batch(statements);
    },
  };
}

// Run `fn` with the provider endpoint mocked, counting provider calls.
async function withMockProvider(fn) {
  const original = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    return { result: await fn(), providerCalls };
  } finally {
    globalThis.fetch = original;
  }
}

function memoryBucket() {
  const store = new Map();
  return {
    store,
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      return { key };
    },
    async get(key) {
      if (!store.has(key)) return null;
      const entry = store.get(key);
      return { text: async () => entry, customMetadata: {} };
    },
    async head(key) {
      return store.has(key) ? { customMetadata: {} } : null;
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return {
        objects: [...store.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
      };
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

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.${Math.floor(ipCounter / 250)}.${ipCounter % 250}.7`;
}

async function call(env, path, { method = 'POST', cookie = null, body = null, ip = nextIp() } = {}) {
  return entryWorker.fetch(
    new Request(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': ip,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );
}

const aiTurn = (env, cookie, extra = {}) =>
  call(env, '/api/ai', { env, cookie, body: { prompt: 'hello there', stream: false, ...extra } });

async function run() {
  const alice = await cookieFor('alice-uid');
  const premiumUser = await cookieFor('premium-uid');

  // ---------------------------------------------------------------- messages
  {
    const db = createD1({ plan: 'free' });
    const env = { AUTH_SECRET: SECRET, DB: db };
    const limit = PLAN_LIMITS.free.messages;

    for (let i = 0; i < limit; i += 1) {
      const response = await aiTurn(env, alice);
      assert.notEqual(response.status, 402, `turn ${i + 1} of ${limit} must still be allowed`);
    }
    assert.equal(
      db.counters.get(`alice-uid|${CURRENT_PERIOD}|messages`),
      limit,
      'each turn is counted once',
    );

    const blocked = await aiTurn(env, alice);
    assert.equal(blocked.status, 402, 'the turn after the limit is refused');
    const payload = await blocked.json();
    assert.equal(payload.code, 'plan_limit');
    assert.equal(payload.metric, 'messages');
    assert.equal(payload.limit, limit);
    assert.equal(payload.used, limit);
    assert.equal(payload.plan, 'free');
    assert.equal(payload.upgradeUrl, '/pricing');
    assert.ok(payload.resetsAt > Date.now(), 'the refusal says when it comes back');
    assert.match(payload.error, /used all 20 generations/i);
    assert.match(payload.error, /upgrade/i, 'the refusal tells the user what to do');

    // Another account is unaffected: the counter is per account.
    const bob = await cookieFor('bob-uid');
    const bobTurn = await aiTurn(env, bob);
    assert.notEqual(bobTurn.status, 402, 'a different account keeps its own budget');
    assert.equal(db.counters.get(`bob-uid|${CURRENT_PERIOD}|messages`), 1);

    // A title request is not a generation (it names a chat), so it must not be
    // refused — otherwise creating chats would stop working at the wall.
    const title = await aiTurn(env, alice, { titleOnly: true });
    assert.notEqual(title.status, 402, 'title requests are not generations');
    assert.equal(
      db.counters.get(`alice-uid|${CURRENT_PERIOD}|messages`),
      limit,
      'a title request does not consume a generation',
    );

    // Tokens were metered for the turns that ran.
    assert.ok(
      (db.counters.get(`alice-uid|${CURRENT_PERIOD}|tokens`) || 0) > 0,
      'tokens are metered even when the provider never answered',
    );
  }

  // ------------------------------------------------------- title allowance
  {
    const db = createD1({ plan: 'free' });
    const env = { AUTH_SECRET: SECRET, DB: db };
    const limit = PLAN_LIMITS.free.titles;
    for (let i = 0; i < limit; i += 1) {
      const response = await aiTurn(env, alice, { titleOnly: true });
      assert.equal(response.status, 200, `title ${i + 1} of ${limit} is served`);
    }
    assert.equal(
      db.counters.get(`alice-uid|${CURRENT_PERIOD}|titles`),
      limit,
      'title generation has its own bounded allowance',
    );
    assert.equal(
      db.counters.get(`alice-uid|${CURRENT_PERIOD}|messages`) || 0,
      0,
      'titles never consume a generation',
    );

    // At the wall the title call is skipped entirely (no provider work) and
    // the client falls back to its deterministic heuristic naming.
    const blocked = await aiTurn(env, alice, { titleOnly: true });
    assert.equal(blocked.status, 200);
    const payload = await blocked.json();
    assert.equal(payload.title, null);
    assert.equal(payload.code, 'plan_limit');
    assert.equal(payload.metric, 'titles');
    assert.equal(
      db.counters.get(`alice-uid|${CURRENT_PERIOD}|titles`),
      limit,
      'a refused title does not increment the counter',
    );
  }

  // ------------------------------------ simultaneous admission (direct AI)
  {
    const db = createD1({ plan: 'free' });
    const env = { AUTH_SECRET: SECRET, DB: db, OPENCODE_GO_API_KEY: 'test-key' };
    db.counters.set(`alice-uid|${CURRENT_PERIOD}|messages`, PLAN_LIMITS.free.messages - 1);

    const { result: responses } = await withMockProvider(() =>
      Promise.all([aiTurn(env, alice), aiTurn(env, alice)]),
    );
    const statuses = responses.map((response) => response.status).sort((a, b) => a - b);
    assert.deepEqual(
      statuses,
      [200, 402],
      'with one generation left, exactly one of two simultaneous requests is admitted',
    );
    assert.equal(
      db.counters.get(`alice-uid|${CURRENT_PERIOD}|messages`),
      PLAN_LIMITS.free.messages,
      'the budget is spent exactly once',
    );
    const refused = responses.find((response) => response.status === 402);
    assert.equal((await refused.json()).metric, 'messages');
  }

  // -------------------------------------------- accounting outage (direct AI)
  {
    const env = { AUTH_SECRET: SECRET, DB: accountingOutageD1({ plan: 'free' }) };
    const { result: response, providerCalls } = await withMockProvider(() => aiTurn(env, alice));
    assert.equal(response.status, 503, 'an unavailable accounting store is refused');
    const payload = await response.json();
    assert.equal(payload.code, 'usage_unavailable');
    assert.equal(payload.retryable, true);
    assert.equal(response.headers.get('Retry-After'), '5');
    assert.equal(providerCalls, 0, 'a database outage starts no provider work');

    const usage = await call(env, '/api/usage', { method: 'GET', cookie: alice });
    assert.equal(usage.status, 503, 'the usage panel never reports fabricated zeros');
  }

  // --------------------------------------------------- queued task admission
  {
    const db = createD1({ plan: 'free' });
    const queue = { sent: [], async send(body) { this.sent.push(body); } };
    const env = { AUTH_SECRET: SECRET, DB: db, ASSET_BUCKET: memoryBucket(), TASKS_QUEUE: queue };
    const limit = PLAN_LIMITS.free.messages;
    db.counters.set(`alice-uid|${CURRENT_PERIOD}|messages`, limit - 1);

    const { result: responses } = await withMockProvider(() =>
      Promise.all([
        call(env, '/api/tasks', { cookie: alice, body: { prompt: 'first queued task' } }),
        call(env, '/api/tasks', { cookie: alice, body: { prompt: 'second queued task' } }),
      ]),
    );
    const statuses = responses.map((response) => response.status).sort((a, b) => a - b);
    assert.deepEqual(
      statuses,
      [202, 402],
      'with one generation left, exactly one of two simultaneous task creations is admitted',
    );
    assert.equal(queue.sent.length, 1, 'only the admitted task is dispatched');
    assert.equal(
      db.counters.get(`alice-uid|${CURRENT_PERIOD}|messages`),
      limit,
      'the task budget is spent exactly once',
    );
    assert.ok(
      (db.counters.get(`alice-uid|${CURRENT_PERIOD}|tokens`) || 0) > 0,
      'queued tasks charge their prompt token estimate up front',
    );
  }

  // ----------------------------------------------- accounting outage (tasks)
  {
    const queue = { sent: [], async send(body) { this.sent.push(body); } };
    const env = {
      AUTH_SECRET: SECRET,
      DB: accountingOutageD1({ plan: 'free' }),
      ASSET_BUCKET: memoryBucket(),
      TASKS_QUEUE: queue,
    };
    const { result: response, providerCalls } = await withMockProvider(() =>
      call(env, '/api/tasks', { cookie: alice, body: { prompt: 'unaccounted task' } }),
    );
    assert.equal(response.status, 503, 'a task cannot start without accounting');
    assert.equal((await response.json()).code, 'usage_unavailable');
    assert.equal(queue.sent.length, 0, 'no task is dispatched during an outage');
    assert.equal(providerCalls, 0, 'a task outage starts no provider work');
  }

  // -------------------------------------------------------------- new month
  {
    const db = createD1({ plan: 'free' });
    const env = { AUTH_SECRET: SECRET, DB: db };
    // Spend the whole budget in an earlier month: this month starts clean.
    db.counters.set(`alice-uid|2026-01|messages`, PLAN_LIMITS.free.messages);
    const response = await aiTurn(env, alice);
    assert.notEqual(response.status, 402, 'a new month starts with a fresh budget');
  }

  // ---------------------------------------------------------------- premium
  {
    const db = createD1({ plan: 'premium' });
    const env = { AUTH_SECRET: SECRET, DB: db };
    for (let i = 0; i < PLAN_LIMITS.free.messages + 5; i += 1) {
      const response = await aiTurn(env, premiumUser);
      assert.notEqual(response.status, 402, `premium turn ${i + 1} is unlimited`);
    }
  }

  // ---------------------------------------------------------------- standard
  {
    const db = createD1({ plan: 'standard' });
    const env = { AUTH_SECRET: SECRET, DB: db };
    // Sitting exactly on the free limit is fine on Standard.
    db.counters.set(`alice-uid|${CURRENT_PERIOD}|messages`, PLAN_LIMITS.free.messages);
    const response = await aiTurn(env, alice);
    assert.notEqual(response.status, 402, 'Standard allows more than Free');
    // ...and the token budget is the larger one.
    assert.equal(PLAN_LIMITS.standard.tokens > PLAN_LIMITS.free.tokens, true);
  }

  // -------------------------------------------------------------- build runs
  {
    const db = createD1({ plan: 'free' });
    const env = { AUTH_SECRET: SECRET, DB: db };
    const buildLimit = PLAN_LIMITS.free.swarm_runs;
    for (let i = 0; i < buildLimit; i += 1) {
      const response = await aiTurn(env, alice, { harness: true });
      assert.notEqual(response.status, 402, `build ${i + 1} of ${buildLimit} is allowed`);
    }
    assert.equal(db.counters.get(`alice-uid|${CURRENT_PERIOD}|swarm_runs`), buildLimit);

    const blocked = await aiTurn(env, alice, { harness: true });
    assert.equal(blocked.status, 402);
    const payload = await blocked.json();
    assert.equal(payload.metric, 'swarm_runs', 'the build budget is its own wall');
    assert.match(payload.error, /build runs/i);
  }

  // ------------------------------------------------------------------ images
  {
    const db = createD1({ plan: 'free' });
    // No provider key on purpose: the gate runs before the provider call, so the
    // refusals are tested without making real network requests.
    const env = { AUTH_SECRET: SECRET, DB: db };
    const limit = PLAN_LIMITS.free.images;
    for (let i = 0; i < limit; i += 1) {
      const response = await call(env, '/api/image', { cookie: alice, body: { prompt: 'a cat' } });
      assert.notEqual(response.status, 402, `image ${i + 1} of ${limit} is allowed`);
    }
    const blocked = await call(env, '/api/image', { cookie: alice, body: { prompt: 'a cat' } });
    assert.equal(blocked.status, 402);
    assert.equal((await blocked.json()).metric, 'images');

    // The Workers AI route shares the same image budget.
    const workersAi = await call(env, '/api/image/cf', {
      cookie: alice,
      body: { prompt: 'a dog' },
    });
    assert.equal(workersAi.status, 402, 'both image routes draw on one budget');
  }

  // --------------------------------------------------------------- publishes
  {
    const db = createD1({ plan: 'free' });
    const bucket = memoryBucket();
    const env = { AUTH_SECRET: SECRET, DB: db, ASSET_BUCKET: bucket };
    const limit = PLAN_LIMITS.free.publishes;
    for (let i = 0; i < limit; i += 1) {
      const response = await call(env, '/api/publish', {
        cookie: alice,
        body: { title: `Page ${i}`, html: `<html><body>${i}</body></html>` },
      });
      assert.equal(response.status, 200, `publish ${i + 1} of ${limit} succeeds`);
    }
    const blocked = await call(env, '/api/publish', {
      cookie: alice,
      body: { title: 'One too many', html: '<html><body>nope</body></html>' },
    });
    assert.equal(blocked.status, 402);
    assert.equal((await blocked.json()).metric, 'publishes');
  }

  // ------------------------------------------------------------- usage panel
  {
    const db = createD1({ plan: 'standard' });
    const bucket = memoryBucket();
    await bucket.put(
      'publish/alice-shop.json',
      JSON.stringify({ slug: 'alice-shop', ownerUserId: 'alice-uid', html: '<html></html>' }),
    );
    const env = { AUTH_SECRET: SECRET, DB: db, ASSET_BUCKET: bucket };
    const nearLimitMessages = Math.ceil(PLAN_LIMITS.standard.messages * 0.8);
    db.counters.set(`alice-uid|${CURRENT_PERIOD}|messages`, nearLimitMessages);
    db.counters.set(`alice-uid|${CURRENT_PERIOD}|images`, PLAN_LIMITS.standard.images);

    const anonymous = await call(env, '/api/usage', { method: 'GET', cookie: null });
    assert.equal(anonymous.status, 401, 'usage is owner-only');

    const response = await call(env, '/api/usage', { method: 'GET', cookie: alice });
    assert.equal(response.status, 200);
    const summary = await response.json();
    assert.equal(summary.period, CURRENT_PERIOD);
    assert.equal(summary.plan, 'standard');
    assert.equal(summary.meteringEnabled, true);
    assert.equal(summary.usage.messages, nearLimitMessages);
    assert.equal(summary.metrics.messages.limit, PLAN_LIMITS.standard.messages);
    assert.equal(
      summary.metrics.messages.remaining,
      PLAN_LIMITS.standard.messages - nearLimitMessages,
    );
    assert.deepEqual(summary.exceeded, ['images'], 'a spent metric is reported as exceeded');
    assert.ok(summary.nearLimit.includes('messages'), 'four fifths of the way is near the limit');
    assert.equal(summary.metrics.publishedPages.used, 1, 'published pages are counted live');
    assert.equal(summary.metrics.publishedPages.limit, PLAN_LIMITS.standard.publishedPages);
    assert.ok(summary.resetsAt > Date.now());
  }

  // ------------------------------------------------------- no D1, no blocking
  {
    const env = { AUTH_SECRET: SECRET };
    for (let i = 0; i < PLAN_LIMITS.free.messages + 3; i += 1) {
      const response = await aiTurn(env, alice);
      assert.notEqual(response.status, 402, 'without a database nothing is metered or blocked');
    }
    const usage = await call(env, '/api/usage', { method: 'GET', cookie: alice });
    assert.equal(usage.status, 200);
    const summary = await usage.json();
    assert.equal(summary.meteringEnabled, false);
    assert.equal(summary.usage.messages, 0, 'nothing is claimed to have been counted');
  }

  // ------------------------------------------------------- metering can be off
  {
    const db = createD1({ plan: 'free' });
    const env = { AUTH_SECRET: SECRET, DB: db, USAGE_METERING_DISABLED: '1' };
    for (let i = 0; i < PLAN_LIMITS.free.messages + 2; i += 1) {
      await aiTurn(env, alice);
    }
    assert.equal(db.counters.size, 0, 'the kill switch records nothing');
  }

  console.log('Usage metering contract checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
