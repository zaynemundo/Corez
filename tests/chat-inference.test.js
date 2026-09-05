// COREZ inferred-interest profiler tests — behavioral signals accumulate
// confidence silently (visible via recall), per plan: silent + visible,
// no decay, broad profiler (marketing, coding, design, writing, data,
// business, education, tech stack, org).
//
// Same mock-D1 harness pattern as chat-memory.test.js.

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
                let rows = memories.filter((m) => m.user_id === args[0]);
                // Honor the search helper's category + LIKE filters crudely:
                // tests use small sets, so apply category equality when the
                // SQL carries a category predicate.
                if (/lower\(category\) = lower\(\?\)/i.test(sql) && args[1]) {
                  rows = rows.filter(
                    (m) =>
                      String(m.category).toLowerCase() ===
                      String(args[1]).toLowerCase(),
                  );
                }
                rows = rows
                  .slice()
                  .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
                return {
                  results: rows.map((m) => ({
                    user_id: m.user_id,
                    key: m.key,
                    category: m.category,
                    text: m.text,
                    tags: m.tags,
                    metadata: m.metadata,
                    created_at: m.created_at,
                    updated_at: m.updated_at,
                  })),
                };
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

describe('Inferred-interest profiler', () => {
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

  function meta(key) {
    const row = db.memories.find((m) => m.key === key);
    return row ? JSON.parse(row.metadata) : null;
  }

  it("profiles the Office Inspirations marketing example from the plan", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOpenAI(
      'This is a complete caption answer that fully addresses the request with creative copy and hashtags.',
    )));
    const r1 = await post({ prompt: 'I need caption for Office Inspirations' });
    expect(r1.status).toBe(200);

    // Marketing signal + org signal, both low confidence after one sighting.
    expect(meta('interest.marketing')?.evidence_count).toBe(1);
    expect(meta('interest.marketing')?.confidence).toBeCloseTo(0.5, 5);
    const org = db.memories.find((m) => m.key === 'org.office-inspirations');
    expect(org?.text).toContain('Office Inspirations');
  });

  it('grows confidence with repeated marketing requests up to the cap', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOpenAI(
      'This is a complete caption answer that fully addresses the request with creative copy and hashtags.',
    )));
    for (let i = 0; i < 6; i++) {
      await post({ prompt: `Write Instagram caption number ${i} for our new campaign launch` });
    }
    const m = meta('interest.marketing');
    expect(m?.evidence_count).toBe(6);
    expect(m?.confidence).toBe(0.95);
  });

  it('surfaces high-confidence inferences in grounding and hedges in recall', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOpenAI(
      'This is a complete caption answer that fully addresses the request with creative copy and hashtags.',
    )));
    for (let i = 0; i < 3; i++) {
      await post({ prompt: `Draft newsletter ${i} announcing our brand campaign` });
    }
    // 3 sightings -> 0.35 + 3*0.15 = 0.8 -> strong tier.
    expect(meta('interest.marketing')?.confidence).toBeCloseTo(0.8, 5);

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
    expect(
      systems.some((c) => c.includes('Likely about the user') && c.includes('marketing')),
    ).toBe(true);

    const recall = await post({ prompt: 'who am I?' });
    const content = (await recall.json()).content;
    expect(content).toContain("What I've inferred");
    expect(content).toContain('seem to work in marketing');
  });

  it('does not profile code, questions, secrets, or sensitive topics', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOpenAI(
      'This is a complete code answer that fully addresses the request with runnable examples.',
    )));
    await post({ prompt: 'Who fixes the deploy pipeline at Acme Corp?' });
    await post({
      prompt: 'Explain this snippet:\n```js\nconst brand = "x";\nconsole.log(caption);\n```',
    });
    await post({ prompt: 'remember that my password is hunter2 for Github' });
    await post({ prompt: 'What are common flu symptoms and treatment?' });
    const inferences = db.memories.filter((m) => m.category === 'inference');
    expect(inferences).toEqual([]);
  });

  it('profiles tech stack mentions and clears inferences via forget', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOpenAI(
      'This is a complete coding answer that fully addresses the request with runnable examples.',
    )));
    await post({ prompt: 'How do I fetch data using React hooks?' });
    expect(meta('tech.react')?.evidence_count).toBe(1);

    // Explicit facts and inferences share forget-everything.
    await post({ prompt: 'remember that my name is Zayne' });
    const all = await post({ prompt: 'forget everything you know about me' });
    expect((await all.json()).content).toContain('forgot everything');
    expect(db.memories.length).toBe(0);
  });
});
