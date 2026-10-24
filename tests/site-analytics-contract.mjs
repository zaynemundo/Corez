// Contract test for published-site analytics, against the real Worker
// entrypoint and a small in-memory D1 that understands the handful of
// statements this feature emits.
//
// Pins the behaviour that matters:
//  - a real visit to /<slug> and /<slug>/<page>.html is counted exactly once,
//    with a visitor fingerprint but WITHOUT the IP address or user agent;
//  - bots, prefetches and the signed-in owner's own visits are not counted;
//  - DNT/GPC still count the view anonymously but create no visitor identity;
//  - the owner-only report needs a session and refuses another account;
//  - unpublishing removes the page's analytics with the page;
//  - without D1, the API answers "unavailable" instead of inventing zeroes.

import assert from 'node:assert/strict';
import entryWorker from '../worker/entry.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';

const SECRET = 'site-analytics-contract-secret';
const BASE = 'https://corez.test';
const SLUG = 'alice-site';
const alpha = 'alice-uid';
const beta = 'bob-uid';

function memoryBucket() {
  const store = new Map();
  return {
    store,
    async put(key, value) {
      store.set(key, { value: typeof value === 'string' ? value : JSON.stringify(value) });
      return { key };
    },
    async get(key) {
      if (!store.has(key)) return null;
      const entry = store.get(key);
      return {
        text: async () => entry.value,
        customMetadata: {},
        httpEtag: 'etag',
      };
    },
    async head(key) {
      return store.has(key) ? { customMetadata: {} } : null;
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix = '', cursor } = {}) {
      return {
        objects: [...store.keys()].filter((key) => key.startsWith(prefix)).sort().map((key) => ({ key })),
        truncated: false,
        cursor,
      };
    },
  };
}

/**
 * The feature's D1 slice: four tables, the exact counters it writes and the ten
 * reads the report issues. Anything else is recorded and ignored, which is
 * enough to prove the HTTP path end to end.
 */
function analyticsD1() {
  const daily = new Map();
  const breakdown = new Map();
  const visits = new Map();
  const visitors = new Map();
  const statements = [];
  const ddl = [];

  const inRange = (day, from, to) => day >= from && day <= to;

  function execute(sql, values) {
    statements.push({ sql, values });
    if (/CREATE (TABLE|INDEX)/i.test(sql)) {
      ddl.push(sql);
      return { success: true };
    }
    if (sql.includes('INSERT INTO site_analytics_daily')) {
      const [site, day, page] = values;
      const key = `${site}|${day}|${page}`;
      const row = daily.get(key) || { site, day, page, views: 0 };
      row.views += 1;
      daily.set(key, row);
      return { success: true };
    }
    if (sql.includes('INSERT INTO site_analytics_breakdown')) {
      const [site, day, dimension, value] = values;
      const key = `${site}|${day}|${dimension}|${value}`;
      const row = breakdown.get(key) || { site, day, dimension, value, views: 0 };
      row.views += 1;
      breakdown.set(key, row);
      return { success: true };
    }
    if (sql.includes('INSERT OR IGNORE INTO site_analytics_visits')) {
      const [site, key, day] = values;
      const id = `${site}|${key}|${day}`;
      if (!visits.has(id)) visits.set(id, { site, key, day });
      return { success: true };
    }
    if (sql.includes('INSERT INTO site_analytics_visitors')) {
      const [site, key, firstDay, lastDay] = values;
      const id = `${site}|${key}`;
      const row = visitors.get(id) || { site, key, first_day: firstDay, last_day: lastDay };
      row.last_day = lastDay;
      visitors.set(id, row);
      return { success: true };
    }
    if (sql.includes('DELETE FROM')) {
      const match = sql.match(/DELETE FROM (site_analytics_[a-z]+) WHERE (day|last_day|site_slug) =?\s*[<>]? ?\?/);
      if (match) {
        const [, , column] = match;
        for (const map of [daily, breakdown, visits, visitors]) {
          for (const [key, row] of map) {
            const field = column === 'site_slug' ? row.site : column === 'last_day' ? row.last_day : row.day;
            const matches = match[0].includes('<') ? field < values[0] : field === values[0];
            if (matches) map.delete(key);
          }
        }
      }
      return { success: true };
    }
    return { success: true };
  }

  function query(sql, values) {
    if (sql.includes('COUNT(DISTINCT visitor_key) AS visitors')) {
      const [site, from, to] = values;
      const keys = new Set(
        [...visits.values()]
          .filter((row) => row.site === site && inRange(row.day, from, to))
          .map((row) => row.key),
      );
      return [{ visitors: keys.size }];
    }
    if (sql.includes('COUNT(DISTINCT v.visitor_key) AS returning_visitors')) {
      const [site, from, to, before] = values;
      const seen = new Set();
      for (const row of visits.values()) {
        if (row.site !== site || !inRange(row.day, from, to)) continue;
        const visitor = visitors.get(`${row.site}|${row.key}`);
        if (visitor && (visitor.first_day < before || visitor.first_day < row.day)) {
          seen.add(row.key);
        }
      }
      return [{ returning_visitors: seen.size }];
    }
    if (sql.includes('COUNT(*) AS visitors') && sql.includes('GROUP BY day')) {
      const [site, from, to] = values;
      const counts = new Map();
      for (const row of visits.values()) {
        if (row.site !== site || !inRange(row.day, from, to)) continue;
        counts.set(row.day, (counts.get(row.day) || 0) + 1);
      }
      return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([day, visitors]) => ({ day, visitors }));
    }
    if (sql.includes('COUNT(*) AS returning_visitors') && sql.includes('GROUP BY v.day')) {
      const [site, from, to] = values;
      const counts = new Map();
      for (const row of visits.values()) {
        if (row.site !== site || !inRange(row.day, from, to)) continue;
        const visitor = visitors.get(`${row.site}|${row.key}`);
        if (visitor && visitor.first_day < row.day) {
          counts.set(row.day, (counts.get(row.day) || 0) + 1);
        }
      }
      return [...counts]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, returning_visitors]) => ({ day, returning_visitors }));
    }
    if (sql.includes('COALESCE(SUM(views), 0) AS views')) {
      const [site, from, to] = values;
      let views = 0;
      for (const row of daily.values()) {
        if (row.site === site && inRange(row.day, from, to)) views += row.views;
      }
      return [{ views }];
    }
    if (sql.includes('SELECT day, SUM(views) AS views') && sql.includes('GROUP BY day')) {
      const [site, from, to] = values;
      const sums = new Map();
      for (const row of daily.values()) {
        if (row.site === site && inRange(row.day, from, to)) {
          sums.set(row.day, (sums.get(row.day) || 0) + row.views);
        }
      }
      return [...sums].sort(([a], [b]) => a.localeCompare(b)).map(([day, views]) => ({ day, views }));
    }
    if (sql.includes('GROUP BY page')) {
      const [site, from, to] = values;
      const sums = new Map();
      for (const row of daily.values()) {
        if (row.site === site && inRange(row.day, from, to)) {
          sums.set(row.page, (sums.get(row.page) || 0) + row.views);
        }
      }
      return [...sums]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([page, views]) => ({ page, views }));
    }
    if (sql.includes('GROUP BY dimension, value')) {
      const [site, from, to] = values;
      const sums = new Map();
      for (const row of breakdown.values()) {
        if (row.site === site && inRange(row.day, from, to)) {
          const key = `${row.dimension}|${row.value}`;
          sums.set(key, (sums.get(key) || 0) + row.views);
        }
      }
      return [...sums]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 60)
        .map(([key, views]) => {
          const [dimension, value] = key.split('|');
          return { dimension, value, views };
        });
    }
    if (sql.includes('MIN(day) AS since')) {
      const [site] = values;
      const days = [...daily.values()].filter((row) => row.site === site).map((row) => row.day).sort();
      return [{ since: days[0] || null }];
    }
    return [];
  }

  return {
    daily,
    breakdown,
    visits,
    visitors,
    statements,
    ddl,
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          return execute(sql, statement.values);
        },
        async all() {
          return { results: query(sql, statement.values) };
        },
        async first() {
          if (/FROM users/i.test(sql)) {
            return { id: alpha, email: 'alice@test.dev', password_changed_at: 0 };
          }
          if (/^\s*SELECT/i.test(sql)) {
            const results = query(sql, statement.values);
            return results[0] || null;
          }
          return null;
        },
      };
      return statement;
    },
    async batch(items) {
      return items.map((statement) => {
        if (/^\s*SELECT/i.test(statement.sql)) {
          return { results: query(statement.sql, statement.values) };
        }
        return execute(statement.sql, statement.values);
      });
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

async function call(env, path, { method = 'GET', headers = {}, cookie = null } = {}) {
  return entryWorker.fetch(
    new Request(BASE + path, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
    }),
    env,
  );
}

function day() {
  return new Date().toISOString().slice(0, 10);
}

async function run() {
  const alice = await cookieFor(alpha);
  const bob = await cookieFor(beta);
  const bucket = memoryBucket();
  const db = analyticsD1();
  const record = JSON.stringify({
    slug: SLUG,
    title: 'Alice site',
    html: '<!doctype html><html><body><h1>alice-content</h1></body></html>',
    pages: { 'about.html': '<!doctype html><html><body><h1>about-content</h1></body></html>' },
    ownerUserId: alpha,
    createdAt: '2026-10-20T10:00:00.000Z',
  });
  await bucket.put(`publish/${SLUG}.json`, record);
  const env = { AUTH_SECRET: SECRET, ASSET_BUCKET: bucket, DB: db };

  // --- A real visit is served and counted. The IP and user agent must not
  //     appear anywhere in what was written.
  const visit = await call(env, `/${SLUG}/`, {
    headers: {
      'CF-Connecting-IP': '203.0.113.7',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      Referer: 'https://www.google.com/search?q=alice',
    },
  });
  assert.equal(visit.status, 200);
  assert.match(await visit.text(), /alice-content/);
  assert.equal(db.daily.size, 1, 'one daily counter row');
  assert.equal([...db.daily.values()][0].views, 1);
  const written = JSON.stringify(db.statements);
  assert.ok(!written.includes('203.0.113.7'), 'the IP address must never be stored');
  assert.ok(!written.includes('Mozilla'), 'the user agent must never be stored');
  assert.ok(written.includes('google.com'), 'the referrer host is kept');

  // --- A second page of the same site is a second view but the same visitor
  //     on the same day.
  const subpage = await call(env, `/${SLUG}/about.html`, {
    headers: {
      'CF-Connecting-IP': '203.0.113.7',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    },
  });
  assert.equal(subpage.status, 200);
  assert.match(await subpage.text(), /about-content/);
  assert.equal([...db.daily.values()].reduce((total, row) => total + row.views, 0), 2);
  assert.equal(db.visits.size, 1, 'the same fingerprint visits once per day');

  // --- Bots, prefetches and the owner's own visit are not counted.
  await call(env, `/${SLUG}/`, { headers: { 'User-Agent': 'Googlebot/2.1' } });
  await call(env, `/${SLUG}/`, { headers: { 'Sec-Purpose': 'prefetch' } });
  await call(env, `/${SLUG}/`, { cookie: alice });
  assert.equal([...db.daily.values()].reduce((total, row) => total + row.views, 0), 2);

  // --- DNT counts the view anonymously: views go up, visitors do not.
  await call(env, `/${SLUG}/`, {
    headers: { DNT: '1', 'CF-Connecting-IP': '198.51.100.9' },
  });
  assert.equal([...db.daily.values()].reduce((total, row) => total + row.views, 0), 3);
  assert.equal(db.visits.size, 1, 'DNT creates no visitor row');

  // --- The report is owner-only.
  assert.equal((await call(env, `/api/publish/${SLUG}/analytics`)).status, 401);
  assert.equal(
    (await call(env, `/api/publish/${SLUG}/analytics`, { cookie: bob })).status,
    403,
  );
  assert.equal((await call(env, '/api/publish/missing-site/analytics', { cookie: alice })).status, 404);

  const reportResponse = await call(env, `/api/publish/${SLUG}/analytics?days=30`, {
    cookie: alice,
  });
  assert.equal(reportResponse.status, 200);
  const report = await reportResponse.json();
  assert.equal(report.slug, SLUG);
  assert.equal(report.range.days, 30);
  assert.equal(report.totals.views, 3);
  assert.equal(report.totals.visitors, 1);
  assert.equal(report.totals.returning, 0);
  assert.equal(report.totals.newVisitors, 1);
  assert.equal(report.series.length, 30);
  const today = report.series.find((entry) => entry.day === day());
  assert.equal(today.views, 3);
  assert.equal(today.visitors, 1);
  assert.equal(report.pages.find((entry) => entry.page === 'index.html').views, 2);
  assert.equal(report.pages.find((entry) => entry.page === 'about.html').views, 1);
  assert.equal(report.source.find((entry) => entry.value === 'google.com').views, 1);
  assert.equal(report.hasData, true);
  assert.equal(report.collectionDisabled, false);
  assert.ok(!JSON.stringify(report).includes('203.0.113.7'));
  assert.ok(!JSON.stringify(report).includes('Mozilla'));

  // --- Ranges are validated, and the shorter window is honoured.
  assert.equal(
    (await call(env, `/api/publish/${SLUG}/analytics?days=14`, { cookie: alice })).status,
    400,
  );
  const week = await (await call(env, `/api/publish/${SLUG}/analytics?days=7`, { cookie: alice })).json();
  assert.equal(week.series.length, 7);
  assert.equal(week.range.days, 7);

  // --- A deployment without D1 answers honestly.
  const noDb = await call(
    { AUTH_SECRET: SECRET, ASSET_BUCKET: bucket },
    `/api/publish/${SLUG}/analytics`,
    { cookie: alice },
  );
  assert.equal(noDb.status, 503);
  assert.match((await noDb.json()).error, /not configured/i);

  // --- Unpublishing takes the traffic history with the page.
  const removed = await call(env, `/api/publish/${SLUG}`, { method: 'DELETE', cookie: alice });
  assert.equal(removed.status, 200);
  assert.equal(db.daily.size, 0, 'daily counters are deleted with the page');
  assert.equal(db.breakdown.size, 0, 'breakdown counters are deleted with the page');
  assert.equal(db.visits.size, 0, 'visitor visits are deleted with the page');
  assert.equal(db.visitors.size, 0, 'visitor fingerprints are deleted with the page');
  const after = await call(env, `/${SLUG}`);
  assert.ok(!(await after.text()).includes('alice-content'));

  console.log('Site analytics contract checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
