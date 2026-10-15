// Pinning chats over the real worker entrypoint and a real SQLite D1
// (node:sqlite through tests/helpers/sqliteD1.js).
//
// The rules pinned here are the ones the sidebar's Pinned section depends on:
//  - a pin is private to its owner, on every route;
//  - a pin is reported on the chat list AND on the single chat read;
//  - unpinning clears it;
//  - pinning never rewrites the title and never moves the chat in Recents
//    (updated_at is the Recents order and must stay untouched).
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker/entry.js';
import { createSqliteD1 } from './helpers/sqliteD1.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';

const SECRET = 'test-secret-pin';
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
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT,
        provider TEXT DEFAULT 'local', google_id TEXT, created_at INTEGER NOT NULL,
        plan TEXT DEFAULT 'free', password_changed_at INTEGER DEFAULT 0
      )`,
    )
    .run();
  for (const id of ids) {
    await db
      .prepare(
        'INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?,?,?)',
      )
      .bind(id, `${id}@test.dev`, Date.now())
      .run();
  }
}

describe('chat pinning API', () => {
  let db;
  let env;
  let aliceCookie;
  let bobCookie;

  beforeEach(async () => {
    db = createSqliteD1();
    env = { AUTH_SECRET: SECRET, DB: db, ENVIRONMENT: 'development' };
    await seedUsers(db, ['alice', 'bob']);
    aliceCookie = await cookieFor('alice');
    bobCookie = await cookieFor('bob');
  });

  const call = (path, { method = 'GET', cookie = null, body = null } = {}) =>
    worker.fetch(
      new Request(BASE + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    );

  const createChat = async (title, cookie = aliceCookie) => {
    const res = await call('/api/chats', {
      method: 'POST',
      cookie,
      body: { title },
    });
    expect(res.status).toBe(201);
    return await res.json();
  };

  it('pins and unpins a chat, and both reads carry the flag', async () => {
    const chat = await createChat('Quarterly plan');

    const pinned = await call(`/api/chats/${chat.id}`, {
      method: 'PATCH',
      cookie: aliceCookie,
      body: { pinned: true },
    });
    expect(pinned.status).toBe(200);
    const pinnedBody = await pinned.json();
    expect(pinnedBody.pinned).toBe(true);
    expect(typeof pinnedBody.pinnedAt).toBe('number');

    const list = await call('/api/chats', { cookie: aliceCookie });
    const listed = (await list.json()).chats.find((c) => c.id === chat.id);
    expect(listed.pinnedAt).toBe(pinnedBody.pinnedAt);

    const single = await call(`/api/chats/${chat.id}`, { cookie: aliceCookie });
    expect((await single.json()).pinnedAt).toBe(pinnedBody.pinnedAt);

    const unpinned = await call(`/api/chats/${chat.id}`, {
      method: 'PATCH',
      cookie: aliceCookie,
      body: { pinned: false },
    });
    expect(unpinned.status).toBe(200);
    expect((await unpinned.json()).pinnedAt).toBe(null);

    const after = await call('/api/chats', { cookie: aliceCookie });
    expect(
      (await after.json()).chats.find((c) => c.id === chat.id).pinnedAt,
    ).toBe(null);
  });

  it('pinning never rewrites the title or moves the chat in Recents', async () => {
    const chat = await createChat('Keep my name');
    const before = await (
      await call(`/api/chats/${chat.id}`, { cookie: aliceCookie })
    ).json();

    const pinned = await call(`/api/chats/${chat.id}`, {
      method: 'PATCH',
      cookie: aliceCookie,
      body: { pinned: true },
    });
    expect(pinned.status).toBe(200);

    const after = await (
      await call(`/api/chats/${chat.id}`, { cookie: aliceCookie })
    ).json();
    expect(after.title).toBe('Keep my name');
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.pinnedAt).toBeGreaterThan(0);
  });

  it('still renames through the same PATCH', async () => {
    const chat = await createChat('Old name');
    const renamed = await call(`/api/chats/${chat.id}`, {
      method: 'PATCH',
      cookie: aliceCookie,
      body: { title: 'New name' },
    });
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).title).toBe('New name');
  });

  it('rejects a PATCH that changes nothing', async () => {
    const chat = await createChat('Untouched');
    const res = await call(`/api/chats/${chat.id}`, {
      method: 'PATCH',
      cookie: aliceCookie,
      body: {},
    });
    expect(res.status).toBe(400);
  });

  it('never lets another account pin a chat it does not own', async () => {
    const chat = await createChat('Alice only');
    const hijack = await call(`/api/chats/${chat.id}`, {
      method: 'PATCH',
      cookie: bobCookie,
      body: { pinned: true },
    });
    expect(hijack.status).toBe(403);

    const aliceList = await call('/api/chats', { cookie: aliceCookie });
    expect(
      (await aliceList.json()).chats.find((c) => c.id === chat.id).pinnedAt,
    ).toBe(null);
  });
});
