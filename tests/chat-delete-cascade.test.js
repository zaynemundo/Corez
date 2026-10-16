// Deleting a chat deletes everything that belongs to it: the D1 rows plus
// the R2 state — apps, uploaded assets (images, docs), generated images
// referenced by its messages, and the per-session context index.
//
// The rules pinned here:
//  - DELETE /api/chats/:id removes the chat's R2 apps (both locations),
//    its context index (both locations), and every asset referenced by its
//    messages (attachment assetKey/assetUrl + /api/assets/* URLs in text),
//    including pre-move flat keys;
//  - assets belonging to other chats are kept;
//  - assets still referenced by a published page (asset-pub marker) are kept;
//  - DELETE /api/chats (clear history) cascades for every chat;
//  - without a bucket the delete still succeeds.
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker/entry.js';
import { createSqliteD1 } from './helpers/sqliteD1.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';

const SECRET = 'test-secret-chat-cascade';
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

function createBucket() {
  const store = new Map();
  return {
    store,
    put: async (key, val, opts) => {
      store.set(key, { val, opts });
    },
    get: async (key) => {
      if (!store.has(key)) return null;
      return { text: async () => 'marker' };
    },
    head: async (key) => {
      if (!store.has(key)) return null;
      return { key };
    },
    list: async ({ prefix }) => {
      const objects = [];
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) objects.push({ key: k });
      }
      return { objects };
    },
    delete: async (key) => {
      store.delete(key);
    },
  };
}

describe('chat delete storage cascade', () => {
  let db;
  let env;
  let bucket;
  let aliceCookie;

  beforeEach(async () => {
    db = createSqliteD1();
    bucket = createBucket();
    env = { AUTH_SECRET: SECRET, DB: db, ENVIRONMENT: 'development', ASSET_BUCKET: bucket };
    await seedUsers(db, ['alice', 'bob']);
    aliceCookie = await cookieFor('alice');
  });

  const call = (path, { method = 'GET', cookie = aliceCookie, body = null } = {}) =>
    worker.fetch(
      new Request(BASE + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    );

  const createChat = async (title) => {
    const res = await call('/api/chats', { method: 'POST', body: { title } });
    expect(res.status).toBe(201);
    return await res.json();
  };

  const postMessage = async (chatId, message) => {
    const res = await call(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: message,
    });
    expect(res.status).toBe(201);
  };

  const seedChatStorage = async (chatId, uid = 'alice') => {
    // R2 apps (both locations), context index (both locations).
    await bucket.put(`users/${uid}/apps/${chatId}/app-1.json`, '{}');
    await bucket.put(`apps/${uid}/${chatId}/app-legacy.json`, '{}');
    await bucket.put(`users/${uid}/context-index/${chatId}.json`, '{}');
    await bucket.put(`context-index/${uid}/${chatId}.json`, '{}');
  };

  it('deletes a single chat with its apps, assets, generated images and context index', async () => {
    const chat = await createChat('photo help');
    await postMessage(chat.id, {
      role: 'user',
      content: 'look at this photo',
      attachments: [
        { name: 'me.jpg', type: 'image/jpeg', assetKey: 'user-upload_1.jpg', assetUrl: '/api/assets/user-upload_1.jpg' },
        { name: 'notes.pdf', type: 'application/pdf', assetKey: 'user-upload_2.pdf', assetUrl: 'https://corez.pro/api/assets/user-upload_2.pdf' },
      ],
    });
    await postMessage(chat.id, {
      role: 'assistant',
      content: 'Here it is\n\n![](https://corez.pro/api/assets/image_111_aa.png)',
    });
    await seedChatStorage(chat.id);
    await bucket.put('users/alice/assets/user-upload_1.jpg', 'img');
    await bucket.put('users/alice/assets/user-upload_2.pdf', 'pdf');
    await bucket.put('users/alice/assets/image_111_aa.png', 'gen');

    // Another chat's asset, app and context index must survive.
    const other = await createChat('other');
    await postMessage(other.id, {
      role: 'user',
      content: 'hi',
      attachments: [{ name: 'keep.jpg', type: 'image/jpeg', assetKey: 'keep-me.jpg' }],
    });
    await seedChatStorage(other.id);
    await bucket.put('users/alice/assets/keep-me.jpg', 'img');

    const res = await call(`/api/chats/${chat.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    // D1 rows are gone.
    const gone = await call(`/api/chats/${chat.id}`);
    expect(gone.status).toBe(404);
    // The other chat is untouched.
    expect((await call(`/api/chats/${other.id}`)).status).toBe(200);

    // The deleted chat's R2 state is gone.
    expect(bucket.store.has(`users/alice/apps/${chat.id}/app-1.json`)).toBe(false);
    expect(bucket.store.has(`apps/alice/${chat.id}/app-legacy.json`)).toBe(false);
    expect(bucket.store.has(`users/alice/context-index/${chat.id}.json`)).toBe(false);
    expect(bucket.store.has(`context-index/alice/${chat.id}.json`)).toBe(false);
    expect(bucket.store.has('users/alice/assets/user-upload_1.jpg')).toBe(false);
    expect(bucket.store.has('users/alice/assets/user-upload_2.pdf')).toBe(false);
    expect(bucket.store.has('users/alice/assets/image_111_aa.png')).toBe(false);

    // The other chat's R2 state survives.
    expect(bucket.store.has('users/alice/assets/keep-me.jpg')).toBe(true);
    expect(bucket.store.has(`users/alice/apps/${other.id}/app-1.json`)).toBe(true);
    expect(bucket.store.has(`users/alice/context-index/${other.id}.json`)).toBe(true);
  });

  it('keeps assets still referenced by a published page and sweeps pre-move flat keys', async () => {
    const chat = await createChat('site with photo');
    await postMessage(chat.id, {
      role: 'user',
      content: 'use this',
      attachments: [{ name: 'hero.jpg', type: 'image/jpeg', assetKey: 'hero.jpg' }],
    });
    await postMessage(chat.id, {
      role: 'user',
      content: 'old upload',
      attachments: [{ name: 'old.jpg', type: 'image/jpeg', assetKey: 'old-flat.jpg' }],
    });
    await seedChatStorage(chat.id);
    await bucket.put('users/alice/assets/hero.jpg', 'img');
    await bucket.put('asset-pub/hero.jpg', 'alice');
    // Pre-move object at the flat key with no users/ copy.
    await bucket.put('old-flat.jpg', 'img');

    const res = await call(`/api/chats/${chat.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    // Published asset kept (marker + bytes), flat pre-move key swept.
    expect(bucket.store.has('users/alice/assets/hero.jpg')).toBe(true);
    expect(bucket.store.has('asset-pub/hero.jpg')).toBe(true);
    expect(bucket.store.has('old-flat.jpg')).toBe(false);
    expect(bucket.store.has(`users/alice/apps/${chat.id}/app-1.json`)).toBe(false);
  });

  it('clear-history deletes every chat with its R2 state', async () => {
    const first = await createChat('first');
    await postMessage(first.id, {
      role: 'user',
      content: 'pic',
      attachments: [{ name: 'a.jpg', type: 'image/jpeg', assetKey: 'chat-a.jpg' }],
    });
    await seedChatStorage(first.id);
    await bucket.put('users/alice/assets/chat-a.jpg', 'img');

    const second = await createChat('second');
    await postMessage(second.id, {
      role: 'assistant',
      content: '![]( /api/assets/image_222_bb.png )'.replace(/ /g, ''),
    });
    await seedChatStorage(second.id);
    await bucket.put('users/alice/assets/image_222_bb.png', 'gen');

    // Bob's data is out of scope.
    await bucket.put('users/bob/assets/chat-a.jpg', 'img');

    const res = await call('/api/chats', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const list = await call('/api/chats');
    expect((await list.json()).chats).toEqual([]);

    for (const chat of [first, second]) {
      expect(bucket.store.has(`users/alice/apps/${chat.id}/app-1.json`)).toBe(false);
      expect(bucket.store.has(`users/alice/context-index/${chat.id}.json`)).toBe(false);
    }
    expect(bucket.store.has('users/alice/assets/chat-a.jpg')).toBe(false);
    expect(bucket.store.has('users/alice/assets/image_222_bb.png')).toBe(false);
    expect(bucket.store.has('users/bob/assets/chat-a.jpg')).toBe(true);
  });

  it('deletes a chat with no bucket configured', async () => {
    const chat = await createChat('no bucket');
    await postMessage(chat.id, { role: 'user', content: 'hello' });
    const noBucketEnv = { AUTH_SECRET: SECRET, DB: db, ENVIRONMENT: 'development' };
    const res = await worker.fetch(
      new Request(BASE + `/api/chats/${chat.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      }),
      noBucketEnv,
    );
    expect(res.status).toBe(200);
    expect((await call(`/api/chats/${chat.id}`)).status).toBe(404);
  });
});
