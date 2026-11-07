// A published page keeps ONE public URL for the life of its chat session.
//
// The bug this pins: the browser remembers the slug in localStorage
// (`corez_publish_lineage`), but that memory is per device and capped at 50
// entries. Republish from another device — or after the entry is evicted — and
// the client sent no slug, so the server invented a new one and the user's
// existing link (shared, printed, linked from a QR code) went stale.
//
// The fix resolves the slug from the publish record's own `sessionId`, so the
// URL survives a lost client state:
//  - slug-less republish of the same session returns the same slug;
//  - a customised (renamed) slug survives a later slug-less republish;
//  - a different session still gets its own URL;
//  - another account reusing the same session id is isolated;
//  - records without a session id (legacy) keep the old generate-a-slug path.
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker/entry.js';
import { createSqliteD1 } from './helpers/sqliteD1.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';

const SECRET = 'test-secret-publish-slug-stability';
const BASE = 'https://corez.test';

async function cookieFor(uid) {
  const token = await createJWT(
    { uid, email: `${uid}@test.dev`, exp: Math.floor(Date.now() / 1000) + 3600 },
    SECRET,
  );
  return `${SESSION_COOKIE}=${token}`;
}

async function seedUsers(db, ids) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash,
        provider TEXT DEFAULT 'local', google_id, created_at INTEGER NOT NULL,
        plan TEXT DEFAULT 'free', password_changed_at INTEGER DEFAULT 0
      )`,
    )
    .run();
  for (const id of ids) {
    await db
      .prepare('INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?,?,?)')
      .bind(id, `${id}@test.dev`, Date.now())
      .run();
  }
}

function createBucket() {
  const store = new Map();
  return {
    store,
    put: async (key, val) => {
      store.set(key, { val });
    },
    get: async (key) => {
      if (!store.has(key)) return null;
      const entry = store.get(key);
      return {
        text: async () => (typeof entry.val === 'string' ? entry.val : 'marker'),
      };
    },
    head: async (key) => (store.has(key) ? { key } : null),
    list: async ({ prefix }) => {
      const objects = [];
      for (const k of store.keys()) if (k.startsWith(prefix)) objects.push({ key: k });
      return { objects };
    },
    delete: async (key) => {
      store.delete(key);
    },
  };
}

describe('publish slug stability across devices', () => {
  let db;
  let env;
  let bucket;
  let aliceCookie;
  let bobCookie;

  beforeEach(async () => {
    db = createSqliteD1();
    bucket = createBucket();
    env = { AUTH_SECRET: SECRET, DB: db, ENVIRONMENT: 'development', ASSET_BUCKET: bucket };
    await seedUsers(db, ['alice', 'bob']);
    aliceCookie = await cookieFor('alice');
    bobCookie = await cookieFor('bob');
  });

  const publish = async (body, cookie = aliceCookie) => {
    const res = await worker.fetch(
      new Request(`${BASE}/api/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(200);
    return res.json();
  };

  const serve = async (slug) =>
    worker.fetch(new Request(`${BASE}/${slug}`, { method: 'GET' }), env);

  it('republishes to the same URL when the client no longer knows the slug', async () => {
    const first = await publish({
      title: 'Portfolio',
      html: '<!DOCTYPE html><html><body>v1</body></html>',
      sessionId: 'chat-1',
    });
    expect(first.slug).toBeTruthy();

    // Another device: localStorage lineage is empty, so no slug/title state is
    // sent — only the chat id the revision belongs to.
    const second = await publish({
      title: 'Portfolio revised',
      html: '<!DOCTYPE html><html><body>v2</body></html>',
      sessionId: 'chat-1',
    });

    expect(second.slug).toBe(first.slug);
    expect(second.url).toBe(`/${first.slug}`);

    const served = await serve(first.slug);
    expect(served.status).toBe(200);
    expect(await served.text()).toContain('v2');

    // Exactly one owned record and one pointer for that slug — no orphan copy
    // was created under a new slug.
    expect(bucket.store.has(`users/alice/publish/${first.slug}.json`)).toBe(true);
    expect(bucket.store.has(`publish/${first.slug}.json`)).toBe(true);
  });

  it('keeps a customised slug when a later revision arrives without a slug', async () => {
    const first = await publish({
      title: 'Portfolio',
      html: '<!DOCTYPE html><html><body>v1</body></html>',
      sessionId: 'chat-2',
    });

    const renamed = await publish({
      title: 'Portfolio',
      html: '<!DOCTYPE html><html><body>v2</body></html>',
      slug: 'my-portfolio',
      previousSlug: first.slug,
      sessionId: 'chat-2',
    });
    expect(renamed.slug).toBe('my-portfolio');
    expect(renamed.customized).toBe(true);

    const revised = await publish({
      title: 'Portfolio again',
      html: '<!DOCTYPE html><html><body>v3</body></html>',
      sessionId: 'chat-2',
    });

    expect(revised.slug).toBe('my-portfolio');
    expect(revised.customized).toBe(true);

    // The old generated URL is gone; the custom one serves the revision.
    expect((await serve(first.slug)).status).toBe(404);
    const served = await serve('my-portfolio');
    expect(served.status).toBe(200);
    expect(await served.text()).toContain('v3');
  });

  it('gives a different session its own URL', async () => {
    const first = await publish({
      html: '<html><body>one</body></html>',
      sessionId: 'chat-a',
    });
    const other = await publish({
      html: '<html><body>two</body></html>',
      sessionId: 'chat-b',
    });

    expect(other.slug).not.toBe(first.slug);
    expect((await serve(first.slug)).status).toBe(200);
    expect((await serve(other.slug)).status).toBe(200);
  });

  it('never reuses another account\'s page for the same session id', async () => {
    const alices = await publish({
      html: '<html><body>alice</body></html>',
      sessionId: 'shared-session-id',
    }, aliceCookie);

    const bobs = await publish({
      html: '<html><body>bob</body></html>',
      sessionId: 'shared-session-id',
    }, bobCookie);

    expect(bobs.slug).not.toBe(alices.slug);
    expect(bucket.store.has(`users/bob/publish/${bobs.slug}.json`)).toBe(true);
    expect(await (await serve(alices.slug)).text()).toContain('alice');
    expect(await (await serve(bobs.slug)).text()).toContain('bob');
  });

  it('still allocates a fresh slug when no session id is supplied (legacy clients)', async () => {
    const first = await publish({ html: '<html><body>a</body></html>' });
    const second = await publish({ html: '<html><body>b</body></html>' });

    expect(second.slug).not.toBe(first.slug);
  });
});
