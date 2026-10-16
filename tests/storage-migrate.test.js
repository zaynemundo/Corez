// Storage rearrangement migration contract:
// legacy flat R2 keys move into users/<uid>/ folders via
// POST /api/admin/storage-migrate (dry-run -> copy -> verify ->
// cleanup+confirm), without touching pointers, markers, ephemeral state
// or unattributable records.
import { describe, it, expect, beforeEach, vi } from 'vitest';

function mockBucket() {
  const store = new Map();
  const toBytes = (value) => {
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  };
  const entry = (key) => {
    if (!store.has(key)) return null;
    const e = store.get(key);
    return {
      text: async () => new TextDecoder().decode(e.bytes),
      arrayBuffer: async () => e.bytes.buffer.slice(e.bytes.byteOffset, e.bytes.byteOffset + e.bytes.byteLength),
      customMetadata: e.customMetadata || {},
      httpMetadata: { contentType: e.contentType || 'application/octet-stream' },
    };
  };
  return {
    store,
    async put(key, value, opts = {}) {
      const prev = store.get(key);
      store.set(key, {
        bytes: toBytes(value),
        contentType: opts?.httpMetadata?.contentType || prev?.contentType || 'application/octet-stream',
        customMetadata: opts?.customMetadata || prev?.customMetadata || {},
      });
      return { key };
    },
    async get(key) {
      return entry(key);
    },
    async head(key) {
      if (!store.has(key)) return null;
      return { customMetadata: store.get(key).customMetadata || {} };
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix = '', limit, cursor } = {}) {
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) || 0 : 0;
      const capped = typeof limit === 'number' ? keys.slice(start, start + limit) : keys.slice(start);
      const end = start + capped.length;
      return {
        objects: capped.map((key) => ({ key })),
        truncated: end < keys.length,
        cursor: end < keys.length ? String(end) : null,
      };
    },
  };
}

const J = (v) => JSON.stringify(v);

function seed(bucket) {
  const put = (k, v, opts) => bucket.put(k, v, opts);
  put('apps/dev/s1/a1.json', J({ sessionId: 's1', appId: 'a1', title: 'A' }));
  put('memory/dev/k1.json', J({ userId: 'dev', key: 'k1', text: 'hi', category: 'general', tags: [], metadata: {} }));
  put('context/ctx_abc.json', J({ recordId: 'ctx_abc', userId: 'alice', messages: [] }));
  put('context-index/alice/s1.json', J({ recordIds: ['ctx_abc'] }));
  put('tasks/t1.json', J({ taskId: 't1', userId: 'bob', status: 'running' }));
  put('tasks/t1.events.json', J([{ id: 1, type: 'task.started' }]));
  put('tasks/t1.lease.json', J({ holder: 'h', expiresAt: Date.now() + 60000 }));
  put('tasks/t1.session.json', J({ log: true }));
  put('tasks/orphan.events.json', J([{ id: 1 }]));
  put('publish/my-page.json', J({ slug: 'my-page', title: 'M', html: '<h1>M</h1>', ownerUserId: 'carol', createdAt: '2026-01-01T00:00:00.000Z' }));
  put('publish/ptr-page.json', J({ ownerUid: 'carol', slug: 'ptr-page', pointer: true }));
  put('publish/legacy.json', J({ slug: 'legacy', html: '<h1>old</h1>' }));
  put('domains/example.com.json', J({ hostname: 'example.com', slug: 'my-page', ownerUserId: 'carol' }));
  put('domains/ptr.com.json', J({ ownerUid: 'carol', hostname: 'ptr.com', pointer: true }));
  put('pic.png', new TextEncoder().encode([1, 2, 3]), { httpMetadata: { contentType: 'image/png' }, customMetadata: { ownerId: 'dave' } });
  put('orphan.png', 'img', { httpMetadata: { contentType: 'image/png' } });
  put('asset-pub/pic.png', 'dave');
  put('corez-tasks/task-status_x.json', J({ status: 'retry-scheduled' }));
  put('users/eve/apps/s9/a9.json', J({ sessionId: 's9', appId: 'a9' }));
}

function call(worker, bucket, body) {
  return worker.fetch(
    new Request('https://corez.test/api/admin/storage-migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { ASSET_BUCKET: bucket },
  );
}

async function migratePrefix(worker, bucket, mode, prefix, extra = {}) {
  let cursor = null;
  const combined = { scanned: 0, copied: 0, verified: 0, deleted: 0, errorsCount: 0 };
  for (;;) {
    const res = await call(worker, bucket, { mode, prefix, cursor, limit: 50, ...extra });
    expect(res.status).toBe(200);
    const data = await res.json();
    for (const k of Object.keys(combined)) combined[k] += data.stats[k] || 0;
    if (data.done) break;
    cursor = data.cursor;
    expect(cursor).toBeTruthy();
  }
  return combined;
}

describe('storage rearrangement migration', () => {
  let bucket;
  let worker;
  beforeEach(async () => {
    // Fresh module registry per test: rate limiters and schema caches are
    // per-isolate state that must not leak between tests.
    vi.resetModules();
    worker = (await import('../worker/index.js')).default;
    bucket = mockBucket();
    seed(bucket);
  });

  it('returns the plan when no prefix is given and writes nothing', async () => {
    const before = bucket.store.size;
    const res = await call(worker, bucket, { mode: 'dry-run' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mode).toBe('plan');
    expect(data.prefixes).toContain('tasks/');
    expect(data.prefixes).toContain('root');
    expect(bucket.store.size).toBe(before);
  });

  it('rejects unknown prefixes and cleanup without confirm', async () => {
    expect((await call(worker, bucket, { mode: 'copy', prefix: 'nope/' })).status).toBe(400);
    const res = await call(worker, bucket, { mode: 'cleanup', prefix: 'apps/', confirm: false });
    expect(res.status).toBe(400);
  });

  it('dry-run classifies without writing', async () => {
    const before = new Map(bucket.store);
    const stats = await migratePrefix(worker, bucket, 'dry-run', 'apps/');
    expect(stats.copied).toBe(1);
    expect(bucket.store.size).toBe(before.size);
    const root = await migratePrefix(worker, bucket, 'dry-run', 'root');
    expect(root.copied).toBe(1); // pic.png; orphan.png unattributable
  });

  it('copies legacy keys, writes pointers, leaves legacy in place', async () => {
    for (const prefix of ['apps/', 'memory/', 'context/', 'context-index/', 'tasks/', 'publish/', 'domains/', 'root']) {
      await migratePrefix(worker, bucket, 'copy', prefix);
    }
    // New homes exist with identical bytes.
    for (const key of [
      'users/dev/apps/s1/a1.json',
      'users/dev/memory/k1.json',
      'users/alice/context/ctx_abc.json',
      'users/alice/context-index/s1.json',
      'users/bob/tasks/t1.json',
      'users/bob/tasks/t1.events.json',
      'users/bob/tasks/t1.lease.json',
      'users/bob/tasks/t1.session.json',
      'users/carol/publish/my-page.json',
      'users/carol/domains/example.com.json',
      'users/dave/assets/pic.png',
    ]) {
      expect(bucket.store.has(key), key).toBe(true);
    }
    // Legacy keys untouched by copy.
    expect(bucket.store.has('tasks/t1.json')).toBe(true);
    expect(bucket.store.has('pic.png')).toBe(true);
    // Publish/domain legacy locations now hold pointers; full docs moved.
    const ptr = JSON.parse(new TextDecoder().decode(bucket.store.get('publish/my-page.json').bytes));
    expect(ptr.ownerUid).toBe('carol');
    const dptr = JSON.parse(new TextDecoder().decode(bucket.store.get('domains/example.com.json').bytes));
    expect(dptr.ownerUid).toBe('carol');
    // Untouched by design: markers, ephemeral state, ownerless records.
    expect(bucket.store.has('asset-pub/pic.png')).toBe(true);
    expect(bucket.store.has('corez-tasks/task-status_x.json')).toBe(true);
    expect(bucket.store.has('publish/legacy.json')).toBe(true);
    expect(bucket.store.has('orphan.png')).toBe(true);
    expect(bucket.store.has('tasks/orphan.events.json')).toBe(true);
  });

  it('verifies clean after copy, then cleanup removes only verified legacy keys', async () => {
    for (const prefix of ['apps/', 'memory/', 'context/', 'context-index/', 'tasks/', 'publish/', 'domains/', 'root']) {
      await migratePrefix(worker, bucket, 'copy', prefix);
    }
    let errors = 0;
    for (const prefix of ['apps/', 'memory/', 'context/', 'context-index/', 'tasks/', 'publish/', 'domains/', 'root']) {
      const stats = await migratePrefix(worker, bucket, 'verify', prefix);
      errors += stats.errorsCount;
    }
    expect(errors).toBe(0);

    for (const prefix of ['apps/', 'memory/', 'context/', 'context-index/', 'tasks/', 'publish/', 'domains/', 'root']) {
      await migratePrefix(worker, bucket, 'cleanup', prefix, { confirm: true });
    }
    // Legacy data keys gone...
    for (const key of [
      'apps/dev/s1/a1.json', 'memory/dev/k1.json', 'context/ctx_abc.json',
      'context-index/alice/s1.json', 'tasks/t1.json', 'tasks/t1.events.json',
      'pic.png',
    ]) {
      expect(bucket.store.has(key), key).toBe(false);
    }
    // ...but pointers, markers, ephemeral and unattributable keys remain.
    for (const key of [
      'publish/my-page.json', 'domains/example.com.json', 'asset-pub/pic.png',
      'corez-tasks/task-status_x.json', 'publish/legacy.json', 'orphan.png',
      'tasks/orphan.events.json', 'publish/ptr-page.json', 'domains/ptr.com.json',
    ]) {
      expect(bucket.store.has(key), key).toBe(true);
    }
    // New homes survive cleanup.
    expect(bucket.store.has('users/bob/tasks/t1.json')).toBe(true);
    expect(bucket.store.has('users/dave/assets/pic.png')).toBe(true);
  });

  it('paginates with cursors on large prefixes', async () => {
    // 5 tasks/ keys at limit 2 -> three pages.
    const pages = [];
    let cursor = null;
    for (;;) {
      const res = await call(worker, bucket, { mode: 'dry-run', prefix: 'tasks/', limit: 2, cursor });
      expect(res.status).toBe(200);
      const data = await res.json();
      pages.push(data);
      if (data.done) break;
      expect(data.cursor).toBeTruthy();
      cursor = data.cursor;
    }
    expect(pages.length).toBe(3);
    expect(pages.reduce((n, p) => n + p.stats.scanned, 0)).toBe(5);
  });
});
