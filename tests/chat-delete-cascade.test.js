// Deleting a chat deletes everything that belongs to it: the D1 rows plus
// the R2 state — apps, uploaded assets (images, docs), generated images
// referenced by its messages, the per-session context index, and the pages the
// chat published.
//
// The rules pinned here:
//  - DELETE /api/chats/:id removes the chat's R2 apps (both locations),
//    its context index (both locations), and every asset referenced by its
//    messages (attachment assetKey/assetUrl + /api/assets/* URLs in text),
//    including pre-move flat keys;
//  - published pages that came from the deleted chat are unpublished: the
//    public URL stops working, and the images only that page was keeping
//    public are released to the same sweep;
//  - pages published from another chat keep serving;
//  - a page published before the lineage was recorded carries no session id
//    and is left alone (the browser that published it still knows the slug);
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
      const entry = store.get(key);
      // Stored strings are returned as they are (publish records have to be
      // readable); anything else reads as an opaque marker.
      return {
        text: async () => (typeof entry.val === 'string' ? entry.val : 'marker'),
      };
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

  // ---------------------------------------------------------------- publishing
  // A published page is one of a chat's artifacts: deleting the conversation
  // has to take the public URL down with it, instead of leaving the deleted
  // work served to anyone holding the link.

  const publishPage = async (html, sessionId, cookie = aliceCookie) => {
    const res = await call('/api/publish', {
      method: 'POST',
      cookie,
      body: { title: 'Published from a chat', html, sessionId },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.slug).toBeTruthy();
    return data.slug;
  };

  const servePage = (slug) =>
    worker.fetch(new Request(`${BASE}/${slug}`, { method: 'GET' }), env);

  it('unpublishes the page a deleted chat published, and releases its images', async () => {
    const chat = await createChat('portfolio build');
    await postMessage(chat.id, {
      role: 'user',
      content: 'here is the photo to use',
      attachments: [{ name: 'hero.jpg', type: 'image/jpeg', assetKey: 'hero.jpg' }],
    });
    await bucket.put('users/alice/assets/hero.jpg', 'img');

    const slug = await publishPage(
      '<!DOCTYPE html><html><body><img src="/api/assets/hero.jpg"></body></html>',
      chat.id,
    );
    // The publish flow pins the image public for anonymous visitors, and the
    // record remembers which chat it came from.
    expect(bucket.store.has('asset-pub/hero.jpg')).toBe(true);
    expect(
      JSON.parse(bucket.store.get(`users/alice/publish/${slug}.json`).val).sessionId,
    ).toBe(chat.id);
    expect((await servePage(slug)).status).toBe(200);

    const res = await call(`/api/chats/${chat.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()).unpublishedSlugs).toEqual([slug]);

    // The link is dead: no owned record, no public pointer, 404 to a visitor.
    expect(bucket.store.has(`users/alice/publish/${slug}.json`)).toBe(false);
    expect(bucket.store.has(`publish/${slug}.json`)).toBe(false);
    expect((await servePage(slug)).status).toBe(404);

    // The image was public only for that page, so the same delete releases it.
    expect(bucket.store.has('asset-pub/hero.jpg')).toBe(false);
    expect(bucket.store.has('users/alice/assets/hero.jpg')).toBe(false);
  });

  it('keeps a page published from another chat', async () => {
    const deleted = await createChat('throwaway');
    const kept = await createChat('keep this one');
    const goneSlug = await publishPage('<html><body>one</body></html>', deleted.id);
    const keptSlug = await publishPage('<html><body>two</body></html>', kept.id);

    const res = await call(`/api/chats/${deleted.id}`, { method: 'DELETE' });
    expect((await res.json()).unpublishedSlugs).toEqual([goneSlug]);

    expect((await servePage(goneSlug)).status).toBe(404);
    expect((await servePage(keptSlug)).status).toBe(200);
  });

  it('leaves a page that predates the recorded lineage alone', async () => {
    // Published without a session id (every page published before the lineage
    // was stored). The server cannot attribute it, so it is not deleted here —
    // the browser that published it still knows the slug and removes it when
    // the chat is deleted from that browser.
    const chat = await createChat('legacy publish');
    const res = await call('/api/publish', {
      method: 'POST',
      body: { title: 'Legacy', html: '<html><body>legacy</body></html>' },
    });
    const { slug } = await res.json();

    const del = await call(`/api/chats/${chat.id}`, { method: 'DELETE' });
    expect((await del.json()).unpublishedSlugs).toEqual([]);
    expect((await servePage(slug)).status).toBe(200);
  });

  it('clear-history unpublishes every chat it deletes', async () => {
    const first = await createChat('first publish');
    const second = await createChat('second publish');
    const firstSlug = await publishPage('<html><body>first</body></html>', first.id);
    const secondSlug = await publishPage('<html><body>second</body></html>', second.id);

    const res = await call('/api/chats', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.unpublishedSlugs.sort()).toEqual([firstSlug, secondSlug].sort());

    for (const slug of [firstSlug, secondSlug]) {
      expect((await servePage(slug)).status).toBe(404);
      expect(bucket.store.has(`users/alice/publish/${slug}.json`)).toBe(false);
    }
  });

  it('never unpublishes another account\'s page', async () => {
    // Bob publishes from his own chat; Alice clearing her history must not
    // touch it.
    const bobCookie = await cookieFor('bob');
    const bobChatRes = await call('/api/chats', {
      method: 'POST',
      cookie: bobCookie,
      body: { title: 'bob build' },
    });
    const bobChat = await bobChatRes.json();
    const bobSlug = await publishPage(
      '<html><body>bob</body></html>',
      bobChat.id,
      bobCookie,
    );

    await call('/api/chats', { method: 'DELETE' });

    expect(bucket.store.has(`users/bob/publish/${bobSlug}.json`)).toBe(true);
    expect((await servePage(bobSlug)).status).toBe(200);
  });
});
