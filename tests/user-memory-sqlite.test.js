import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker/index.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';

// Per-user memory in SQLite (D1) with R2 fallback:
// - with env.DB, all CRUD hits SQLite namespaced by session uid
// - without env.DB, the legacy R2 JSON layout is used unchanged
// - legacy R2 records are imported into SQLite exactly once per user

const SECRET = 'test-secret-memory-sqlite';
const BASE = 'https://corez.test';

// Minimal in-memory D1 shim: supports exactly the statement shapes issued
// by worker/memory.js (CREATE no-ops, user_memories upsert/select/delete,
// memory_migrations flag) with LIKE backslash-escape semantics.
function createMockD1() {
  const rows = new Map(); // `${userId} ${key}` -> row
  const migrated = new Set();
  const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim().toUpperCase();

  function likeMatch(value, pattern) {
    let p = String(pattern);
    if (p.startsWith('%')) p = p.slice(1);
    if (p.endsWith('%')) p = p.slice(0, -1);
    let lit = '';
    for (let i = 0; i < p.length; i += 1) {
      if (p[i] === '\\' && i + 1 < p.length) {
        lit += p[i + 1];
        i += 1;
      } else {
        lit += p[i];
      }
    }
    return String(value).includes(lit);
  }

  async function doRun(n, sql, params) {
    if (n.startsWith('CREATE')) return { success: true };
    if (n.startsWith('INSERT INTO USER_MEMORIES')) {
      const [user_id, key, category, text, tags, metadata, created_at, updated_at] = params;
      rows.set(`${user_id} ${key}`, { user_id, key, category, text, tags, metadata, created_at, updated_at });
      return { success: true };
    }
    if (n.startsWith('INSERT OR IGNORE INTO USER_MEMORIES')) {
      const [user_id, key, category, text, tags, metadata, created_at, updated_at] = params;
      const k = `${user_id} ${key}`;
      if (!rows.has(k)) {
        rows.set(k, { user_id, key, category, text, tags, metadata, created_at, updated_at });
      }
      return { success: true };
    }
    if (n.startsWith('INSERT OR IGNORE INTO MEMORY_MIGRATIONS')) {
      migrated.add(params[0]);
      return { success: true };
    }
    if (n.startsWith('DELETE FROM USER_MEMORIES')) {
      rows.delete(`${params[0]} ${params[1]}`);
      return { success: true };
    }
    throw new Error(`mock D1 run: unsupported SQL: ${sql}`);
  }

  async function doAll(n, sql, params) {
    if (!n.startsWith('SELECT USER_ID, KEY, CATEGORY')) {
      throw new Error(`mock D1 all: unsupported SQL: ${sql}`);
    }
    const userId = params[0];
    let rest = params.slice(1);
    let categoryFilter = '';
    if (n.includes('LOWER(CATEGORY) = LOWER(?)')) {
      categoryFilter = String(rest[0] ?? '').toLowerCase();
      rest = rest.slice(1);
    }
    const likeParams = rest; // [textLike, keyLike, catLike] or []
    const results = [];
    for (const row of rows.values()) {
      if (row.user_id !== userId) continue;
      if (categoryFilter && String(row.category).toLowerCase() !== categoryFilter) continue;
      if (likeParams.length === 3) {
        const [tLike, kLike, cLike] = likeParams;
        const ok =
          likeMatch(String(row.text).toLowerCase(), tLike) ||
          likeMatch(String(row.key).toLowerCase(), kLike) ||
          likeMatch(String(row.category).toLowerCase(), cLike);
        if (!ok) continue;
      }
      results.push({ ...row });
    }
    return { results };
  }

  async function doFirst(n, sql, params) {
    if (n.startsWith('SELECT CREATED_AT FROM USER_MEMORIES')) {
      const row = rows.get(`${params[0]} ${params[1]}`);
      return row ? { created_at: row.created_at } : null;
    }
    if (n.startsWith('SELECT USER_ID FROM MEMORY_MIGRATIONS')) {
      return migrated.has(params[0]) ? { user_id: params[0] } : null;
    }
    // verifySession checks the users table when env.DB exists; every test
    // uid exists, mirroring a provisioned account.
    if (n.startsWith('SELECT * FROM USERS WHERE ID=')) {
      return { id: params[0], email: `${params[0]}@test.dev` };
    }
    throw new Error(`mock D1 first: unsupported SQL: ${sql}`);
  }

  return {
    rows,
    migrated,
    prepare(sql) {
      const n = norm(sql);
      const exec = {
        run: (params = []) => doRun(n, sql, params),
        all: (params = []) => doAll(n, sql, params),
        first: (params = []) => doFirst(n, sql, params),
      };
      return {
        ...exec,
        bind: (...params) => ({
          run: () => exec.run(params),
          all: () => exec.all(params),
          first: () => exec.first(params),
        }),
      };
    },
  };
}

function createMockBucket() {
  const store = new Map();
  return {
    store,
    put: async (key, val) => { store.set(key, String(val)); },
    get: async (key) => {
      if (!store.has(key)) return null;
      const val = store.get(key);
      return { text: async () => val };
    },
    list: async ({ prefix }) => ({
      objects: [...store.keys()].filter((k) => k.startsWith(prefix || '')).map((key) => ({ key })),
    }),
    delete: async (key) => { store.delete(key); },
  };
}

async function cookieFor(uid) {
  const token = await createJWT(
    { uid, email: `${uid}@test.dev`, exp: Math.floor(Date.now() / 1000) + 3600 },
    SECRET,
  );
  return `${SESSION_COOKIE}=${token}`;
}

let aliceCookie;
let bobCookie;

describe('user memory in SQLite (D1)', () => {
  let db;
  let bucket;
  let env;

  beforeEach(async () => {
    db = createMockD1();
    bucket = createMockBucket();
    env = { AUTH_SECRET: SECRET, DB: db, ASSET_BUCKET: bucket };
    aliceCookie = await cookieFor('alice-uid');
    bobCookie = await cookieFor('bob-uid');
  });

  const call = (path, { method = 'GET', cookie = null, body = null } = {}) =>
    worker.fetch(
      new Request(BASE + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    );

  it('stores each user perspective in SQLite, isolated per session uid', async () => {
    const store = await call('/api/memory/store', {
      method: 'POST',
      cookie: aliceCookie,
      body: { userId: 'bob-uid', key: 'role', category: 'identity', text: 'User is a marketer in the UAE' },
    });
    expect(store.status).toBe(200);
    const data = await store.json();
    expect(data.success).toBe(true);
    expect(data.userId).toBe('alice-uid');
    expect(data.storage).toBe('d1');
    expect(data.r2Key).toBe(null);
    expect(data.embeddingStored).toBe(false);
    expect(data.record.text).toBe('User is a marketer in the UAE');

    // Landed in SQLite, not R2
    expect(db.rows.size).toBe(1);
    expect([...bucket.store.keys()].filter((k) => k.startsWith('memory/'))).toEqual([]);

    // Bob cannot see Alice's memory; Alice can
    const bobList = await (await call('/api/memory/anyone', { cookie: bobCookie })).json();
    expect(bobList.memories).toEqual([]);
    const aliceList = await (await call('/api/memory/anyone', { cookie: aliceCookie })).json();
    expect(aliceList.memories.some((m) => m.text === 'User is a marketer in the UAE')).toBe(true);
  });

  it('searches by keyword with literal LIKE semantics and category filter', async () => {
    const post = (body) => call('/api/memory/search', { method: 'POST', cookie: aliceCookie, body });
    await call('/api/memory/store', { method: 'POST', cookie: aliceCookie, body: { key: 'a', text: 'User prefers 100% dark themes.' } });
    await call('/api/memory/store', { method: 'POST', cookie: aliceCookie, body: { key: 'b', text: 'User prefers 100X bright themes.' } });
    await call('/api/memory/store', { method: 'POST', cookie: aliceCookie, body: { key: 'c', category: 'work', text: 'User works with Fantoni.' } });

    const pct = await (await post({ query: '100%' })).json();
    expect(pct.source).toBe('keyword');
    expect(pct.matches.map((m) => m.key)).toEqual(['a']);

    const work = await (await post({ query: '', category: 'work' })).json();
    expect(work.matches.map((m) => m.key)).toEqual(['c']);

    const all = await (await post({ query: '' })).json();
    expect(all.matches.length).toBe(3);

    const none = await (await post({ query: 'quantum physics' })).json();
    expect(none.matches).toEqual([]);
  });

  it('updates in place preserving createdAt and deletes cleanly', async () => {
    await call('/api/memory/store', { method: 'POST', cookie: aliceCookie, body: { key: 'role', text: 'v1' } });
    const before = (await (await call('/api/memory/x', { cookie: aliceCookie })).json()).memories[0];
    await call('/api/memory/store', { method: 'POST', cookie: aliceCookie, body: { key: 'role', text: 'v2' } });
    const after = (await (await call('/api/memory/x', { cookie: aliceCookie })).json()).memories;
    expect(after.length).toBe(1);
    expect(after[0].text).toBe('v2');
    expect(after[0].createdAt).toBe(before.createdAt);

    const del = await call('/api/memory/x/role', { method: 'DELETE', cookie: aliceCookie });
    expect(del.status).toBe(200);
    expect((await del.json()).success).toBe(true);
    expect((await (await call('/api/memory/x', { cookie: aliceCookie })).json()).memories).toEqual([]);

    // Deleting a missing key still succeeds (no existence oracle)
    const delMissing = await call('/api/memory/x/nope', { method: 'DELETE', cookie: aliceCookie });
    expect(delMissing.status).toBe(200);
  });

  it('rejects invalid payloads exactly like the R2 path', async () => {
    const noText = await call('/api/memory/store', { method: 'POST', cookie: aliceCookie, body: { key: 'k' } });
    expect(noText.status).toBe(400);
    const badKey = await call('/api/memory/store', { method: 'POST', cookie: aliceCookie, body: { key: 'a/b', text: 'x' } });
    expect(badKey.status).toBe(400);
    const badPath = await call('/api/memory/x/a%2Fb', { method: 'DELETE', cookie: aliceCookie });
    expect(badPath.status).toBe(400);
  });

  it('imports legacy R2 records into SQLite exactly once', async () => {
    bucket.store.set(
      'memory/alice-uid/legacy1.json',
      JSON.stringify({
        userId: 'alice-uid', key: 'legacy1', category: 'fact', text: 'Legacy fact',
        tags: [], metadata: {}, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      }),
    );
    bucket.store.set('memory/alice-uid/bad.json', '{not json');

    const first = await (await call('/api/memory/x', { cookie: aliceCookie })).json();
    expect(first.memories.length).toBe(1);
    expect(first.memories[0].key).toBe('legacy1');
    expect(first.memories[0].createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(db.migrated.has('alice-uid')).toBe(true);
    // Migrated R2 twins are cleaned up; corrupt files are left untouched
    expect(bucket.store.has('memory/alice-uid/legacy1.json')).toBe(false);
    expect(bucket.store.has('memory/alice-uid/bad.json')).toBe(true);

    const second = await (await call('/api/memory/x', { cookie: aliceCookie })).json();
    expect(second.memories.length).toBe(1);
    expect(db.rows.size).toBe(1);
  });

  it('keeps the newer SQLite row when R2 holds a stale same-key twin', async () => {
    await call('/api/memory/store', { method: 'POST', cookie: aliceCookie, body: { key: 'role', text: 'SQLite v2' } });
    bucket.store.set(
      'memory/alice-uid/role.json',
      JSON.stringify({ userId: 'alice-uid', key: 'role', category: 'general', text: 'R2 v1' }),
    );
    const list = await (await call('/api/memory/x', { cookie: aliceCookie })).json();
    expect(list.memories.length).toBe(1);
    expect(list.memories[0].text).toBe('SQLite v2');
  });

  it('falls back to R2 unchanged when D1 is unavailable', async () => {
    const r2Env = { AUTH_SECRET: SECRET, ASSET_BUCKET: bucket };
    const r2Call = (path, opts = {}) =>
      worker.fetch(
        new Request(BASE + path, {
          method: opts.method || 'GET',
          headers: { 'Content-Type': 'application/json', ...(opts.cookie ? { Cookie: opts.cookie } : {}) },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
        }),
        r2Env,
      );
    const store = await r2Call('/api/memory/store', { method: 'POST', cookie: aliceCookie, body: { key: 'k1', text: 'R2 fact' } });
    const data = await store.json();
    expect(data.storage).toBe('r2');
    expect(typeof data.r2Key).toBe('string');
    expect(bucket.store.has('memory/alice-uid/k1.json')).toBe(true);
    const list = await (await r2Call('/api/memory/x', { cookie: aliceCookie })).json();
    expect(list.memories.length).toBe(1);
    const search = await (await r2Call('/api/memory/search', { method: 'POST', cookie: aliceCookie, body: { query: 'fact' } })).json();
    expect(search.matches.length).toBe(1);
    await r2Call('/api/memory/x/k1', { method: 'DELETE', cookie: aliceCookie });
    expect((await (await r2Call('/api/memory/x', { cookie: aliceCookie })).json()).memories).toEqual([]);
  });

  it('fails closed with 530 when neither SQLite nor R2 is configured', async () => {
    const res = await worker.fetch(
      new Request(`${BASE}/api/memory/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ key: 'k', text: 'x' }),
      }),
      { AUTH_SECRET: SECRET },
    );
    expect(res.status).toBe(530);
  });
});
