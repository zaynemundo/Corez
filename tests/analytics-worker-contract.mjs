// Contract test for the first-party analytics collector.
//
// Verifies against the real Worker entrypoint (not a stub) that:
//  - POST /api/analytics/collect works without a session, even when AUTH_SECRET
//    is configured, because consent is answered before anyone signs in;
//  - only the allowlisted event vocabulary is stored;
//  - aggregate counters are written, with no IP address, user agent, user id or
//    full URL anywhere in the row;
//  - a deployment without D1 answers honestly (202, stored: 0) instead of
//    claiming success, and ANALYTICS_DISABLED=1 stores nothing;
//  - non-POST methods and malformed bodies are rejected.

import assert from 'node:assert/strict';
import worker from '../worker/entry.js';

const COLLECT_URL = 'https://corez.test/api/analytics/collect';

function createFakeD1() {
  const rows = new Map();
  const sql = [];
  return {
    rows,
    sql,
    prepare(query) {
      sql.push(query);
      const statement = {
        async run() {
          return { success: true };
        },
        async all() {
          return { results: [...rows.values()] };
        },
        async first() {
          return null;
        },
        bind(...values) {
          return { ...statement, values };
        },
      };
      return statement;
    },
    async batch(statements) {
      for (const statement of statements) {
        const [day, name, path, country, device, count] = statement.values;
        const key = [day, name, path, country, device].join('|');
        rows.set(key, (rows.get(key) || 0) + count);
      }
      return statements.map(() => ({ success: true }));
    },
  };
}

function env(overrides = {}) {
  return {
    AUTH_SECRET: 'test-secret-that-must-not-be-required',
    ...overrides,
  };
}

async function post(body, environment = env(), headers = {}) {
  return worker.fetch(
    new Request(COLLECT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    environment,
  );
}

async function run() {
  // --- Public route: no session cookie, AUTH_SECRET configured, still 202/200.
  const noStorage = await post(
    { sid: 'session_abcdef123456', events: [{ name: 'page_view', props: { path: '/pricing' }, ts: Date.now() }] },
    env({ AUTH_SECRET: 'configured' }),
  );
  assert.equal(noStorage.status, 202, 'without D1 the endpoint must not claim storage');
  const noStorageBody = await noStorage.json();
  assert.equal(noStorageBody.ok, true);
  assert.equal(noStorageBody.accepted, 1);
  assert.equal(noStorageBody.stored, 0);
  assert.match(noStorageBody.reason, /not configured/i);

  // --- Real storage path with D1.
  const db = createFakeD1();
  const now = Date.now();
  const stored = await post(
    {
      sid: 'session_abcdef123456',
      events: [
        { name: 'page_view', props: { path: '/pricing', plan: 'standard' }, ts: now },
        { name: 'page_view', props: { path: '/pricing' }, ts: now },
        { name: 'creation_started', props: { intent: 'game', email: 'someone@corez.pro' }, ts: now },
        { name: 'page_view', props: { path: '/pricing?token=leak' }, ts: now },
      ],
    },
    env({ DB: db, AUTH_SECRET: 'configured' }),
    { 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36' },
  );
  assert.equal(stored.status, 200);
  const storedBody = await stored.json();
  assert.equal(storedBody.ok, true);
  assert.equal(storedBody.accepted, 4);

  const rowKeys = [...db.rows.keys()];
  // Three counters: two page_view rows (one with a usable path, one whose
  // hostile path was rejected outright) and one creation_started row.
  assert.equal(rowKeys.length, 3, 'aggregate by day/event/path/country/device');
  const joined = rowKeys.join('\n');
  assert.ok(!joined.includes('token=leak'), 'query strings must never be stored');
  assert.ok(!joined.includes('someone@corez.pro'), 'emails must never be stored');
  assert.ok(!joined.includes('203.0.113.7'), 'IP addresses must never be stored');
  assert.ok(!joined.includes('Mozilla'), 'user agents must never be stored');
  assert.ok(joined.includes('/pricing'), 'pathname is kept for aggregation');
  assert.ok(joined.includes('creation_started'));
  const pricingKey = rowKeys.find((key) => key.includes('/pricing'));
  assert.equal(db.rows.get(pricingKey), 2, 'identical events aggregate into one counter');

  // Country comes from the Cloudflare edge and is two letters at most.
  assert.ok(/(^|\|)unknown(\||$)/.test(pricingKey) || /[A-Z]{2}/.test(pricingKey));

  // --- Unknown event names are refused; a known event with a bad field is
  //     kept but the field is dropped, never stored.
  const db2 = createFakeD1();
  const refused = await post(
    {
      events: [
        { name: 'steal_credentials', props: { path: '/admin' } },
        { name: 'page_view', props: { path: 'not-a-path' } },
        { name: '../../etc/passwd' },
      ],
    },
    env({ DB: db2 }),
  );
  assert.equal(refused.status, 200);
  const refusedBody = await refused.json();
  assert.equal(refusedBody.accepted, 1, 'only the well-formed event survives');
  assert.equal(db2.rows.size, 1);
  const refusedKey = [...db2.rows.keys()][0];
  assert.ok(!refusedKey.includes('not-a-path'), 'invalid path must not be stored');
  assert.ok(!refusedKey.includes('admin'), 'rejected events must not be stored');

  // --- ANALYTICS_DISABLED accepts and discards without storing.
  const db3 = createFakeD1();
  const disabled = await post(
    { events: [{ name: 'page_view', props: { path: '/' }, ts: now }] },
    env({ DB: db3, ANALYTICS_DISABLED: '1' }),
  );
  assert.equal(disabled.status, 200);
  const disabledBody = await disabled.json();
  assert.equal(disabledBody.stored, 0);
  assert.equal(disabledBody.reason, 'disabled');
  assert.equal(db3.rows.size, 0);

  // --- Bots are never counted.
  const db4 = createFakeD1();
  const bot = await post(
    { events: [{ name: 'page_view', props: { path: '/' }, ts: now }] },
    env({ DB: db4 }),
    { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
  );
  assert.equal((await bot.json()).reason, 'bot');
  assert.equal(db4.rows.size, 0);

  // --- Method and body validation.
  const wrongMethod = await worker.fetch(
    new Request(COLLECT_URL, { method: 'GET' }),
    env({ DB: createFakeD1() }),
  );
  assert.equal(wrongMethod.status, 405);

  const badBody = await post('{not json', env({ DB: createFakeD1() }));
  assert.equal(badBody.status, 400);

  // --- Batches are bounded, and a huge batch cannot fan out into unbounded work.
  const db5 = createFakeD1();
  const many = await post(
    {
      events: Array.from({ length: 200 }, () => ({
        name: 'page_view',
        props: { path: '/' },
        ts: now,
      })),
    },
    env({ DB: db5 }),
  );
  const manyBody = await many.json();
  assert.ok(manyBody.accepted <= 20, `accepted ${manyBody.accepted} events, expected at most 20`);

  console.log('Analytics worker contract checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
