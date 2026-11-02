import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../worker/entry.js';
import {
  extractFirstHttpUrl,
  normalizeBrowseUrl,
  resolveUrlContext,
} from '../worker/browse.js';
import { createSqliteD1 } from './helpers/sqliteD1.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';

const SECRET = 'test-secret-browse';
const BASE = 'https://corez.test';

async function cookieFor(uid) {
  const token = await createJWT(
    { uid, email: `${uid}@test.dev`, exp: Math.floor(Date.now() / 1000) + 3600 },
    SECRET,
  );
  return `${SESSION_COOKIE}=${token}`;
}

async function seedUser(db, id) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT,
        provider TEXT DEFAULT 'local', google_id TEXT, created_at INTEGER NOT NULL,
        plan TEXT DEFAULT 'free', password_changed_at INTEGER DEFAULT 0
      )`,
    )
    .run();
  await db
    .prepare('INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?,?,?)')
    .bind(id, `${id}@test.dev`, Date.now())
    .run();
}

function memoryBucket() {
  const store = new Map();
  return {
    store,
    async get(key) {
      if (!store.has(key)) return null;
      const value = store.get(key);
      return {
        async json() {
          return JSON.parse(value);
        },
        async text() {
          return value;
        },
      };
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

describe('URL to Markdown Quick Action', () => {
  let db;
  let env;
  let cookie;
  let quickAction;
  let bucket;

  beforeEach(async () => {
    db = createSqliteD1();
    quickAction = vi.fn(async () =>
      Response.json({
        success: true,
        result:
          '---\ntitle: "Example Domain"\n---\n\n# Example Domain\n\nThis domain is for examples.',
      }),
    );
    bucket = memoryBucket();
    env = {
      DB: db,
      AUTH_SECRET: SECRET,
      ENVIRONMENT: 'test',
      BROWSER: { quickAction },
      ASSET_BUCKET: bucket,
    };
    await seedUser(db, 'alice');
    cookie = await cookieFor('alice');
  });

  it('returns cleaned Markdown and caches repeated reads', async () => {
    const first = await worker.fetch(
      new Request(`${BASE}/api/browse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ url: 'https://example.com' }),
      }),
      env,
    );
    expect(first.status).toBe(200);
    const page = await first.json();
    expect(page.markdown).toContain('Example Domain');
    expect(page.title).toBe('Example Domain');
    expect(page.cached).toBe(false);
    expect(quickAction).toHaveBeenCalledTimes(1);

    const second = await worker.fetch(
      new Request(`${BASE}/api/browse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ url: 'https://example.com' }),
      }),
      env,
    );
    const cached = await second.json();
    expect(cached.cached).toBe(true);
    expect(quickAction).toHaveBeenCalledTimes(1);
  });

  it('requires a signed-in user', async () => {
    const response = await worker.fetch(
      new Request(`${BASE}/api/browse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
      }),
      env,
    );
    expect(response.status).toBe(401);
    expect(quickAction).not.toHaveBeenCalled();
  });

  it('rejects private and non-HTTP URLs before Browser Run', async () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://localhost/',
      'http://10.0.0.1/',
      'file:///etc/passwd',
      'https://user:pass@example.com/',
    ]) {
      const response = await worker.fetch(
        new Request(`${BASE}/api/browse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie },
          body: JSON.stringify({ url }),
        }),
        env,
      );
      expect(response.status).toBe(400);
    }
    expect(quickAction).not.toHaveBeenCalled();
  });

  it('turns the first URL in a chat prompt into prompt context', async () => {
    const context = await resolveUrlContext({
      text: 'Please summarize https://example.com for me.',
      request: new Request(`${BASE}/api/ai`, { method: 'POST' }),
      env,
    });
    expect(context?.promptMarkdown).toContain('This domain is for examples');
    expect(context?.url).toBe('https://example.com/');
    expect(quickAction).toHaveBeenCalledTimes(1);
  });

  it('normalizes only public HTTP(S) URLs', () => {
    expect(normalizeBrowseUrl('https://example.com/page#x')).toBe(
      'https://example.com/page',
    );
    expect(extractFirstHttpUrl('read https://example.com/a.')).toBe(
      'https://example.com/a',
    );
    expect(normalizeBrowseUrl('https://localhost/a')).toBeNull();
    expect(normalizeBrowseUrl('https://192.168.1.1/a')).toBeNull();
    expect(normalizeBrowseUrl('mailto:test@example.com')).toBeNull();
  });
});
