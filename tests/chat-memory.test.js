// COREZ user-memory chat pipeline tests — remember / recall / forget /
// who-am-I are answered deterministically from D1 (verified-session uid
// namespace) with no LLM round-trip, and remembered facts are injected as
// private grounding on normal requests.
//
// Uses an in-memory mock D1 behind the real worker entrypoint; the provider
// fetch is stubbed and tests assert it is never hit for memory commands.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import swarmWorker from '../worker/entry.js';

function makeMockDb() {
  const users = new Map();
  const memories = [];
  return {
    users,
    memories,
    prepare(sql) {
      const runNoop = async () => ({ success: true });
      return {
        // Real D1 statements support .run() without .bind().
        run: runNoop,
        bind(...args) {
          return {
            async first() {
              if (/FROM users/i.test(sql)) return users.get(args[0]) || null;
              if (/created_at FROM user_memories/i.test(sql)) {
                const row = memories.find(
                  (m) => m.user_id === args[0] && m.key === args[1],
                );
                return row ? { created_at: row.created_at } : null;
              }
              return null;
            },
            async all() {
              if (/FROM user_memories/i.test(sql)) {
                const rows = memories
                  .filter((m) => m.user_id === args[0])
                  .slice()
                  .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
                return { results: rows };
              }
              return { results: [] };
            },
            async run() {
              if (/INSERT INTO user_memories/i.test(sql)) {
                const [
                  user_id,
                  key,
                  category,
                  text,
                  tags,
                  metadata,
                  created,
                  now,
                ] = args;
                const rec = {
                  user_id,
                  key,
                  category,
                  text,
                  tags,
                  metadata,
                  created_at: created,
                  updated_at: now,
                };
                const ix = memories.findIndex(
                  (m) => m.user_id === user_id && m.key === key,
                );
                if (ix >= 0) memories[ix] = rec;
                else memories.push(rec);
              } else if (/DELETE FROM user_memories/i.test(sql)) {
                const [user_id, key] = args;
                const ix = memories.findIndex(
                  (m) => m.user_id === user_id && m.key === key,
                );
                if (ix >= 0) memories.splice(ix, 1);
              }
              // CREATE TABLE / CREATE INDEX are no-ops on the mock.
              return { success: true };
            },
          };
        },
      };
    },
  };
}

function mockOpenAI(content) {
  return Response.json({
    choices: [{ message: { content, role: 'assistant' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 120, completion_tokens: 340 },
  });
}

describe('User memory chat pipeline', () => {
  let db;
  let env;

  beforeEach(() => {
    vi.restoreAllMocks();
    db = makeMockDb();
    db.users.set('dev', {
      id: 'dev',
      email: 'zayne.mayo@gmail.com',
      plan: 'premium',
    });
    env = { OPENCODE_GO_API_KEY: 'sk-test', DB: db, __COREZ_RETRY_SLEEP_MS: '0' };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function post(body) {
    return swarmWorker.fetch(
      new Request('https://corez.test/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env,
    );
  }

  it('stores an explicit "remember" command without hitting the provider', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('provider must not be called for memory commands');
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await post({ prompt: 'remember that my name is Zayne' });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.content).toContain("I'll remember that");
    expect(data.content).toContain('Zayne');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.memories.length).toBe(1);
    expect(db.memories[0].key).toBe('identity.name');
  });

  it('answers "who am I" from account + stored facts', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('provider must not be called for memory commands');
    });
    vi.stubGlobal('fetch', fetchMock);

    await post({ prompt: 'remember that my name is Zayne' });
    const response = await post({ prompt: 'who am I?' });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.content).toContain('zayne.mayo@gmail.com');
    expect(data.content).toContain('Zayne');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers "what do you know about me" and admits an empty memory honestly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOpenAI('unrelated')));
    const empty = await post({ prompt: 'what do you know about me' });
    expect((await empty.json()).content).toContain("don't have anything memorized");

    await post({ prompt: 'remember that I prefer dark mode' });
    const full = await post({ prompt: 'what do you know about me' });
    expect((await full.json()).content).toContain('dark mode');
  });

  it('injects remembered facts as private grounding on normal requests', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOpenAI('ok')));
    await post({ prompt: 'remember that my name is Zayne' });

    let sentBody = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        sentBody = JSON.parse(init.body);
        return mockOpenAI(
          'This is a complete answer about testing that covers the question fully and finally.',
        );
      }),
    );
    await post({ prompt: 'Explain unit testing in two sentences.' });
    const msgs = sentBody.input || sentBody.messages;
    const systems = msgs.filter((m) => m.role === 'system').map((m) => m.content);
    expect(systems.some((c) => c.includes("User's name is Zayne"))).toBe(true);
    expect(systems.some((c) => c.includes('zayne.mayo@gmail.com'))).toBe(true);
  });

  it('forgets a single fact by keyword and everything on request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOpenAI('unrelated')));
    await post({ prompt: 'remember that my name is Zayne' });
    await post({ prompt: 'remember that I prefer dark mode' });
    expect(db.memories.length).toBe(2);

    const one = await post({ prompt: 'forget dark mode' });
    expect((await one.json()).content).toContain('Forgot');
    expect(db.memories.length).toBe(1);

    const all = await post({ prompt: 'forget everything you know about me' });
    expect((await all.json()).content).toContain('forgot everything');
    expect(db.memories.length).toBe(0);
  });

  it('refuses to store likely secrets', async () => {
    const fetchMock = vi.fn(async () => mockOpenAI('unrelated'));
    vi.stubGlobal('fetch', fetchMock);
    const response = await post({ prompt: 'remember that my password is hunter2' });
    const data = await response.json();
    expect(data.content).toContain("can't store that");
    expect(db.memories.length).toBe(0);
  });

  it('streams deterministic memory replies as SSE, not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOpenAI('unrelated')));
    await post({ prompt: 'remember that my name is Zayne' });
    const response = await post({ prompt: 'who am I?', stream: true });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await response.text();
    expect(text).toContain('"type":"delta"');
    expect(text).toContain('zayne.mayo@gmail.com');
  });
});
