import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker/entry.js';
import { refreshConversationTitles } from '../worker/chats.js';
import { createSqliteD1 } from './helpers/sqliteD1.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';

const SECRET = 'test-secret-conversation';
const BASE = 'https://corez.test';
const HOUR = 60 * 60 * 1000;

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

async function call(env, path, init = {}) {
  return worker.fetch(new Request(`${BASE}${path}`, init), env);
}

describe('conversation chat API', () => {
  let db;
  let env;
  let cookie;

  beforeEach(async () => {
    db = createSqliteD1();
    env = { DB: db, AUTH_SECRET: SECRET, ENVIRONMENT: 'test' };
    await seedUser(db, 'alice');
    cookie = await cookieFor('alice');
  });

  it('creates a two-persona conversation and stores speaker metadata', async () => {
    const created = await call(env, '/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        title: 'Hello',
        chatMode: 'conversation',
        personas: [
          { name: 'Ryan', instructions: 'Dry and observant.' },
          { name: 'Scarlett', instructions: 'Bright and playful.' },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const chat = await created.json();
    expect(chat.chatMode).toBe('conversation');
    expect(chat.personas.map((persona) => persona.handle)).toEqual([
      'ryan',
      'scarlett',
    ]);

    const userMessage = await call(env, `/api/chats/${chat.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        role: 'user',
        content: '@ryan blue background color',
        turnId: 'turn-1',
        speakerId: 'user',
        speakerName: 'You',
      }),
    });
    expect(userMessage.status).toBe(201);

    const assistantMessage = await call(
      env,
      `/api/chats/${chat.id}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          role: 'assistant',
          content: 'I would keep the blue quiet.',
          turnId: 'turn-1',
          speakerId: 'p1',
          speakerName: 'Ryan',
          modelId: 'deepseek-v4.1-flash',
        }),
      },
    );
    expect(assistantMessage.status).toBe(201);

    const loaded = await call(env, `/api/chats/${chat.id}`, {
      headers: { Cookie: cookie },
    });
    expect(loaded.status).toBe(200);
    const body = await loaded.json();
    expect(body.chatMode).toBe('conversation');
    expect(body.personas).toHaveLength(2);
    expect(body.messages[1]).toMatchObject({
      role: 'assistant',
      speakerId: 'p1',
      speakerName: 'Ryan',
      turnId: 'turn-1',
      modelId: 'deepseek-v4.1-flash',
    });

    const list = await call(env, '/api/chats', { headers: { Cookie: cookie } });
    const listed = await list.json();
    const summary = listed.chats.find((item) => item.id === chat.id);
    expect(summary.chatMode).toBe('conversation');
    expect(summary.lastUserAt).toBeGreaterThan(0);
    expect(summary.active).toBe(true);
    expect(summary.personas[0].handle).toBe('ryan');
  });

  it('refreshes an active conversation title after 30 minutes and marks it inactive after four hours', async () => {
    const created = await call(env, '/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        title: 'Hello',
        chatMode: 'conversation',
        personas: [{ name: 'Ryan' }, { name: 'Scarlett' }],
      }),
    });
    const chat = await created.json();
    const now = Date.now();
    await call(env, `/api/chats/${chat.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        role: 'user',
        content: 'Let us plan the studio lighting for the showroom',
        turnId: 'turn-1',
      }),
    });

    const refreshed = await refreshConversationTitles(env, now + 31 * 60 * 1000);
    expect(refreshed).toBe(1);

    const list = await call(env, '/api/chats', { headers: { Cookie: cookie } });
    const summary = (await list.json()).chats.find((item) => item.id === chat.id);
    expect(summary.title).toContain('studio lighting');

    const later = await call(env, '/api/chats', { headers: { Cookie: cookie } });
    const current = (await later.json()).chats.find((item) => item.id === chat.id);
    expect(current.active).toBe(true);

    // Four hours after the last user message the conversation is inactive.
    await db
      .prepare('UPDATE chats SET last_user_at = ? WHERE id = ?')
      .bind(now - 5 * HOUR, chat.id)
      .run();
    const staleList = await call(env, '/api/chats', {
      headers: { Cookie: cookie },
    });
    const stale = (await staleList.json()).chats.find(
      (item) => item.id === chat.id,
    );
    expect(stale.active).toBe(false);
  });
});
