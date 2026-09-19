// Contract test for owner-facing publish management:
//   GET    /api/publish           → the caller's own published pages
//   DELETE /api/publish/<slug>    → unpublish one of them
//
// Verifies against the real entrypoint that a session is required, that only
// the owner's records are ever listed, that document bodies never travel in the
// list, that cross-account removal is refused, and that asset public markers
// are dropped only when no other published page still needs them.

import assert from 'node:assert/strict';
import entryWorker from '../worker/entry.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';

const SECRET = 'publish-management-test-secret';
const BASE = 'https://corez.test';
const MARKER_PREFIX = 'asset-pub/';

function memoryBucket() {
  const store = new Map();
  return {
    store,
    async put(key, value, options = {}) {
      store.set(key, {
        value: typeof value === 'string' ? value : JSON.stringify(value),
        contentType: options?.httpMetadata?.contentType || 'application/json',
      });
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
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).sort();
      const objects = keys.map((key) => ({ key }));
      // The real bucket paginates; the double returns one page like the
      // existing publish tests, with no cursor.
      return { objects, truncated: false, cursor };
    },
  };
}

function record({ slug, owner, html = '<html><body>hi</body></html>', pages = null, badge = true }) {
  return JSON.stringify({
    slug,
    title: `Page ${slug}`,
    html,
    badge,
    customized: false,
    ownerUserId: owner,
    createdAt: '2026-09-20T10:00:00.000Z',
    ...(pages ? { pages } : {}),
  });
}

async function cookieFor(uid) {
  const token = await createJWT(
    { uid, email: `${uid}@test.dev`, exp: Math.floor(Date.now() / 1000) + 3600 },
    SECRET,
  );
  return `${SESSION_COOKIE}=${token}`;
}

async function call(env, path, { method = 'GET', cookie = null } = {}) {
  return entryWorker.fetch(
    new Request(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }),
    env,
  );
}

async function run() {
  const alice = await cookieFor('alice-uid');
  const bob = await cookieFor('bob-uid');
  const bucket = memoryBucket();
  const env = { AUTH_SECRET: SECRET, ASSET_BUCKET: bucket };

  await bucket.put('publish/alice-portfolio.json', record({ slug: 'alice-portfolio', owner: 'alice-uid', html: '<html><h1>alice-portfolio-content</h1><img src="/api/assets/alice-pic.png"></html>' }));
  await bucket.put('publish/alice-shop.json', record({ slug: 'alice-shop', owner: 'alice-uid', pages: { 'about.html': '<html>about</html>' }, html: '<html><img src="/api/assets/alice-pic.png"></html>' }));
  await bucket.put('publish/bob-site.json', record({ slug: 'bob-site', owner: 'bob-uid' }));
  await bucket.put('publish/legacy.json', JSON.stringify({ slug: 'legacy', html: '<html>old</html>', badge: true, createdAt: '2025-01-01T00:00:00.000Z' }));
  await bucket.put(`${MARKER_PREFIX}alice-pic.png`, '1');

  // --- Auth required for both operations, even though the GET path used to be
  //     treated as a public page route.
  const anonList = await call(env, '/api/publish');
  assert.equal(anonList.status, 401, 'listing requires a session');
  const anonDelete = await call(env, '/api/publish/alice-shop', { method: 'DELETE' });
  assert.equal(anonDelete.status, 401, 'removing requires a session');

  // --- The owner sees only their own pages, newest first, without bodies.
  const listed = await call(env, '/api/publish', { cookie: alice });
  assert.equal(listed.status, 200);
  const body = await listed.json();
  assert.equal(body.pages.length, 2, `expected 2 owned pages, got ${body.pages.length}`);
  const slugs = body.pages.map((page) => page.slug).sort();
  assert.deepEqual(slugs, ['alice-portfolio', 'alice-shop']);
  assert.equal(body.truncated, false);
  const shop = body.pages.find((page) => page.slug === 'alice-shop');
  assert.equal(shop.url, '/alice-shop');
  assert.equal(shop.title, 'Page alice-shop');
  assert.equal(shop.pages, 1, 'multi-page count is reported');
  assert.equal(shop.badge, true);
  assert.ok(!('html' in shop), 'document bodies must not be listed');
  assert.ok(!JSON.stringify(body).includes('<html>'), 'no document body may travel in the list');

  const bobList = await (await call(env, '/api/publish', { cookie: bob })).json();
  assert.deepEqual(bobList.pages.map((page) => page.slug), ['bob-site']);

  // --- Cross-account removal is refused, and the record survives.
  const crossDelete = await call(env, '/api/publish/alice-shop', { method: 'DELETE', cookie: bob });
  assert.equal(crossDelete.status, 403);
  assert.ok(bucket.store.has('publish/alice-shop.json'), 'another account must not delete it');

  // --- Legacy records (no owner) cannot be removed through this route.
  const legacyDelete = await call(env, '/api/publish/legacy', { method: 'DELETE', cookie: alice });
  assert.equal(legacyDelete.status, 403);
  assert.ok(bucket.store.has('publish/legacy.json'));

  // --- Unknown slug is a 404; a slug that is not a valid slug shape is not
  //     even routed to the publish handler (it is not a resource path).
  assert.equal((await call(env, '/api/publish/does-not-exist', { method: 'DELETE', cookie: alice })).status, 404);
  assert.equal((await call(env, '/api/publish/Not%20ASlug', { method: 'DELETE', cookie: alice })).status, 404);

  // --- Removing the last page that referenced an asset clears its public
  //     marker; removing a page that still shares an asset keeps it.
  const removedShop = await call(env, '/api/publish/alice-shop', { method: 'DELETE', cookie: alice });
  assert.equal(removedShop.status, 200);
  const removedBody = await removedShop.json();
  assert.equal(removedBody.success, true);
  assert.equal(removedBody.slug, 'alice-shop');
  assert.ok(!bucket.store.has('publish/alice-shop.json'), 'record is gone');
  assert.ok(
    bucket.store.has(`${MARKER_PREFIX}alice-pic.png`),
    'the asset stays public while alice-portfolio still references it',
  );

  const removedPortfolio = await call(env, '/api/publish/alice-portfolio', { method: 'DELETE', cookie: alice });
  assert.equal(removedPortfolio.status, 200);
  assert.ok(
    !bucket.store.has(`${MARKER_PREFIX}alice-pic.png`),
    'the asset stops being public once no published page references it',
  );

  // --- The published document really stops being served. A custom slug that is
  //     not published falls back to the SPA shell (so client routes like
  //     /pricing keep working), which is why this checks the body, not 200.
  const afterRemoval = await entryWorker.fetch(
    new Request(`${BASE}/alice-portfolio`, { method: 'GET' }),
    { ...env, ASSETS: { async fetch() { return new Response('spa-shell', { status: 200 }); } } },
  );
  const afterText = await afterRemoval.text();
  assert.ok(
    !afterText.includes('alice-portfolio-content'),
    'the published document must no longer be served',
  );

  // --- The list is empty once everything is removed.
  const finalList = await (await call(env, '/api/publish', { cookie: alice })).json();
  assert.deepEqual(finalList.pages, []);

  // --- A deployment without R2 says so instead of pretending.
  const noStorage = await call({ AUTH_SECRET: SECRET }, '/api/publish', { cookie: alice });
  assert.equal(noStorage.status, 530);

  console.log('Publish management contract checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
