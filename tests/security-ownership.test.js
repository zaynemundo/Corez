import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker/index.js';
import entryWorker from '../worker/entry.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';

// Security regression tests for the ownership fixes:
// - /api/assets, /api/apps, /api/memory, /api/publish are bound to the
//   verified session identity (uid); cross-user access must fail.
// - /api/tasks + /api/context are behind the auth gate.
// Run with AUTH_SECRET set so identity comes from the session cookie, never
// from client-supplied identifiers.

const SECRET = 'test-secret-abc123';
const BASE = 'https://corez.test';

function mockBucketFactory() {
  const store = new Map();
  return {
    store,
    put: async (key, val, opts = {}) => { store.set(key, { val, opts }); },
    get: async (key) => {
      if (!store.has(key)) return null;
      const entry = store.get(key);
      return {
        text: async () => typeof entry.val === 'string' ? entry.val : new TextDecoder().decode(entry.val),
        writeHttpMetadata: (headers) => { headers.set('content-type', entry.opts?.httpMetadata?.contentType || 'application/octet-stream'); },
        customMetadata: entry.opts?.customMetadata || null,
        httpEtag: 'mock-etag'
      };
    },
    head: async (key) => {
      if (!store.has(key)) return null;
      const entry = store.get(key);
      return { customMetadata: entry.opts?.customMetadata || null };
    },
    list: async ({ prefix }) => {
      const objects = [];
      for (const k of store.keys()) if (k.startsWith(prefix)) objects.push({ key: k });
      return { objects };
    },
    delete: async (key) => { store.delete(key); }
  };
}

async function cookieFor(uid) {
  const token = await createJWT({ uid, email: `${uid}@test.dev`, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
  return `${SESSION_COOKIE}=${token}`;
}

// createJWT is async; build cookies up-front in beforeEach instead.
let aliceCookie;
let bobCookie;

describe('Ownership security (assets/apps/memory/publish/tasks)', () => {
  let bucket;
  let env;

  beforeEach(async () => {
    bucket = mockBucketFactory();
    env = { AUTH_SECRET: SECRET, ASSET_BUCKET: bucket };
    aliceCookie = await cookieFor('alice-uid');
    bobCookie = await cookieFor('bob-uid');
  });

  const call = (w, path, { method = 'GET', cookie = null, body = null } = {}) =>
    w.fetch(new Request(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    }), env);

  it('assets: only the uploading session can read or delete', async () => {
    const up = await call(worker, '/api/assets/upload', {
      method: 'POST', cookie: aliceCookie,
      body: { key: 'alice-pic.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }
    });
    expect(up.status).toBe(200);
    const { key } = await up.json();

    // Bob cannot read Alice's asset
    const bobGet = await call(worker, `/api/assets/${key}`, { cookie: bobCookie });
    expect(bobGet.status).toBe(403);
    // Bob cannot delete Alice's asset
    const bobDel = await call(worker, `/api/assets/${key}`, { method: 'DELETE', cookie: bobCookie });
    expect(bobDel.status).toBe(403);
    // Alice can read and delete her own
    const aliceGet = await call(worker, `/api/assets/${key}`, { cookie: aliceCookie });
    expect(aliceGet.status).toBe(200);
    const aliceDel = await call(worker, `/api/assets/${key}`, { method: 'DELETE', cookie: aliceCookie });
    expect(aliceDel.status).toBe(200);
  });

  it('assets: no session cookie in production mode -> 401', async () => {
    const res = await call(worker, '/api/assets/upload', {
      method: 'POST',
      body: { key: 'anon.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }
    });
    expect(res.status).toBe(401);
  });

  it('apps: cross-user sessionId reads fail closed (404), owner succeeds', async () => {
    const store = await call(worker, '/api/apps/store', {
      method: 'POST', cookie: aliceCookie,
      body: { sessionId: 's1', appId: 'a1', html: '<h1>Alice</h1>' }
    });
    expect(store.status).toBe(200);

    // Bob asking for Alice's sessionId must NOT see her app
    const bobGet = await call(worker, '/api/apps/s1/a1', { cookie: bobCookie });
    expect(bobGet.status).toBe(404);
    const bobList = await call(worker, '/api/apps/s1', { cookie: bobCookie });
    expect((await bobList.json()).apps).toHaveLength(0);

    const aliceGet = await call(worker, '/api/apps/s1/a1', { cookie: aliceCookie });
    expect(aliceGet.status).toBe(200);
  });

  it('memory: client-supplied userId is ignored; namespaces are per session', async () => {
    const store = await call(worker, '/api/memory/store', {
      method: 'POST', cookie: aliceCookie,
      body: { userId: 'bob-uid', key: 'secret-note', text: 'alice private memory' }
    });
    expect(store.status).toBe(200);

    // Bob searching under his own uid (or Alice's) must not see Alice's memory
    const bobSearch = await call(worker, '/api/memory/search', {
      method: 'POST', cookie: bobCookie, body: { userId: 'alice-uid', query: '' }
    });
    expect(bobSearch.status).toBe(200);
    const bobMatches = (await bobSearch.json()).matches || [];
    expect(bobMatches.some((m) => m.text === 'alice private memory')).toBe(false);

    // Bob listing Alice's path returns Bob's (empty) namespace
    const bobList = await call(worker, '/api/memory/alice-uid', { cookie: bobCookie });
    expect((await bobList.json()).memories).toHaveLength(0);

    // Alice sees her own memory regardless of the userId she passes
    const aliceList = await call(worker, '/api/memory/whoever', { cookie: aliceCookie });
    expect((await aliceList.json()).memories.some((m) => m.text === 'alice private memory')).toBe(true);
  });

  it('publish: a slug can only be overwritten by its owner', async () => {
    const alicePub = await call(worker, '/api/publish', {
      method: 'POST', cookie: aliceCookie,
      body: { slug: 'shared-slug', html: '<h1>Alice page</h1>' }
    });
    expect(alicePub.status).toBe(200);

    // Bob cannot take over the slug
    const bobPub = await call(worker, '/api/publish', {
      method: 'POST', cookie: bobCookie,
      body: { slug: 'shared-slug', html: '<h1>Defaced</h1>' }
    });
    expect(bobPub.status).toBe(403);

    // Alice can republish her own slug
    const aliceRepub = await call(worker, '/api/publish', {
      method: 'POST', cookie: aliceCookie,
      body: { slug: 'shared-slug', html: '<h1>Alice v2</h1>' }
    });
    expect(aliceRepub.status).toBe(200);
  });

  it('tasks/context are behind the auth gate when AUTH_SECRET is set', async () => {
    // No cookie -> 401 at the gate (entry.js authPaths now includes /api/tasks)
    const anon = await call(entryWorker, '/api/tasks', { method: 'POST', body: { prompt: 'hi' } });
    expect(anon.status).toBe(401);

    // Alice with a valid cookie passes the gate and reaches the handler
    const alice = await call(entryWorker, '/api/tasks', { method: 'POST', cookie: aliceCookie, body: { prompt: 'hi' } });
    expect(alice.status).not.toBe(401);

    const anonCtx = await call(entryWorker, '/api/context/records/whatever', {});
    expect(anonCtx.status).toBe(401);
  });
});
