// Chat persistence contract: the reasoning a turn carried must survive a
// reload. It used to live only in the client's memory (chat_messages had no
// thinking column), so refreshing silently dropped the "Show thinking"
// disclosure. These tests run the real SQL through the D1-shaped adapter.
import { describe, it, expect } from 'vitest';
import { handleChats } from '../worker/chats.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';
import { createSqliteD1 } from './helpers/sqliteD1.js';

const USER = 'u_thinking';
const TEST_SECRET = 'test-super-secret-key-32-characters-long!';

function env(db) {
  return { DB: db, AUTH_SECRET: TEST_SECRET };
}

// verifySession checks the account still exists, so the harness seeds the
// users table the way a real deployment has it.
async function seedUser(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT)`,
    )
    .run();
  await db
    .prepare(`INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)`)
    .bind(USER, 'thinking@corez.pro')
    .run();
}

async function sessionCookie() {
  const token = await createJWT(
    { uid: USER, email: 'thinking@corez.pro' },
    TEST_SECRET,
  );
  return `${SESSION_COOKIE}=${token}`;
}

async function request(path, method = 'GET', body = null) {
  const init = {
    method,
    headers: {
      Cookie: await sessionCookie(),
      'Content-Type': 'application/json',
    },
  };
  if (body) init.body = JSON.stringify(body);
  return new Request(`https://corez.test${path}`, init);
}

async function json(res) {
  return res.json();
}

async function createChat(db, firstMessage = null) {
  const res = await handleChats(
    await request('/api/chats', 'POST', firstMessage ? { firstMessage } : {}),
    env(db),
  );
  expect(res.status).toBe(201);
  return json(res);
}

describe('chat thinking persistence', () => {
  it('stores the reasoning with the assistant turn and returns it on reload', async () => {
    const db = createSqliteD1();
    await seedUser(db);
    const chat = await createChat(db);

    const append = await handleChats(
      await request(`/api/chats/${chat.id}/messages`, 'POST', {
        role: 'assistant',
        content: 'The answer.',
        thinking: 'Step one.\nStep two.',
        thinkingSeconds: 7,
      }),
      env(db),
    );
    expect(append.status).toBe(201);
    const appended = await json(append);
    expect(appended.thinking).toBe('Step one.\nStep two.');
    expect(appended.thinkingSeconds).toBe(7);

    // Reload path (both GET endpoints).
    for (const path of [
      `/api/chats/${chat.id}`,
      `/api/chats/${chat.id}/messages`,
    ]) {
      const loaded = await json(
      await handleChats(await request(path), env(db)),
    );
      const messages = loaded.messages || loaded;
      expect(messages).toHaveLength(1);
      expect(messages[0].thinking).toBe('Step one.\nStep two.');
      expect(messages[0].thinkingSeconds).toBe(7);
      // The reasoning is never mixed into the answer content.
      expect(messages[0].content).toBe('The answer.');
      expect(messages[0].content).not.toContain('Step one');
    }
  });

  it('stores no thinking for a turn without reasoning', async () => {
    const db = createSqliteD1();
    await seedUser(db);
    const chat = await createChat(db);
    await handleChats(
      await request(`/api/chats/${chat.id}/messages`, 'POST', {
        role: 'assistant',
        content: 'No reasoning here.',
      }),
      env(db),
    );
    const loaded = await json(
      await handleChats(await request(`/api/chats/${chat.id}`), env(db)),
    );
    expect(loaded.messages).toHaveLength(1);
    expect(loaded.messages[0].thinking).toBeUndefined();
    expect(loaded.messages[0].thinkingSeconds).toBeUndefined();
  });

  it('caps oversized reasoning instead of storing it unbounded', async () => {
    const db = createSqliteD1();
    await seedUser(db);
    const chat = await createChat(db);
    const huge = 'x'.repeat(50_000);
    await handleChats(
      await request(`/api/chats/${chat.id}/messages`, 'POST', {
        role: 'assistant',
        content: 'Answer.',
        thinking: huge,
      }),
      env(db),
    );
    const loaded = await json(
      await handleChats(await request(`/api/chats/${chat.id}`), env(db)),
    );
    expect(loaded.messages[0].thinking.length).toBeLessThanOrEqual(8000);
  });

  it('migrates an existing table that predates the thinking columns', async () => {
    // The pre-fix schema: no thinking columns. ensureChatsTables must ALTER
    // them in, or every insert after this change would fail.
    const db = createSqliteD1();
    await seedUser(db);
    await db
      .prepare(
        `CREATE TABLE chats (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      )
      .run();
    await db
      .prepare(
        `CREATE TABLE chat_messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, attachments TEXT, created_at INTEGER NOT NULL)`,
      )
      .run();

    const chat = await createChat(db);
    const append = await handleChats(
      await request(`/api/chats/${chat.id}/messages`, 'POST', {
        role: 'assistant',
        content: 'Migrated answer.',
        thinking: 'Reasoning after migration.',
        thinkingSeconds: 3,
      }),
      env(db),
    );
    expect(append.status).toBe(201);
    const loaded = await json(
      await handleChats(await request(`/api/chats/${chat.id}`), env(db)),
    );
    expect(loaded.messages[0].thinking).toBe('Reasoning after migration.');
    expect(loaded.messages[0].thinkingSeconds).toBe(3);
  });

  it('keeps the reasoning through the bulk sync used by migration', async () => {
    const db = createSqliteD1();
    await seedUser(db);
    const chat = await createChat(db);
    const sync = await handleChats(
      await request(`/api/chats/${chat.id}`, 'PUT', {
        messages: [
          { role: 'user', content: 'Question?' },
          {
            role: 'assistant',
            content: 'Answer.',
            thinking: 'Bulk-synced reasoning.',
            thinkingSeconds: 5,
          },
        ],
      }),
      env(db),
    );
    expect(sync.status).toBe(200);
    const loaded = await json(
      await handleChats(await request(`/api/chats/${chat.id}`), env(db)),
    );
    expect(loaded.messages).toHaveLength(2);
    expect(loaded.messages[1].thinking).toBe('Bulk-synced reasoning.');
    expect(loaded.messages[1].thinkingSeconds).toBe(5);
  });
});
