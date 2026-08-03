import { describe, it, expect, beforeEach } from 'vitest';
import { ContextStore, compactMessages, estimateTokens } from '../packages/agent-core/persistence/ContextStore.js';
import worker from '../worker/swarm-index.js';

function memoryBucket() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? { async text() { return map.get(key); } } : null;
    },
    async put(key, value) {
      map.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      return { key };
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix }) {
      const keys = Array.from(map.keys()).filter((k) => k.startsWith(prefix));
      return { objects: keys.map((key) => ({ key })) };
    }
  };
}

function environment(overrides = {}) {
  return {
    ASSETS: {
      async fetch(request) {
        return new Response(`asset:${new URL(request.url).pathname}`);
      }
    },
    ...overrides
  };
}

function post(pathname, body, env, headers = {}) {
  return worker.fetch(
    new Request(`https://corez.test${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-corez-user': 'alice', ...headers },
      body: JSON.stringify(body)
    }),
    env
  );
}

describe('context storage', () => {
  let bucket;

  beforeEach(() => {
    bucket = memoryBucket();
  });

  it('compacts by payload size/tokens, keeping the exact tail', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `message ${i} `.repeat(2000) }));
    const result = compactMessages(messages, { maxBytes: 5000, maxTokens: 10_000_000 });
    expect(result.compacted).toBe(true);
    expect(result.dropped.length).toBeGreaterThan(0);
    expect(result.kept.length).toBeGreaterThan(0);
    // Everything retained stays exact (nothing summarized).
    for (const kept of result.kept) {
      expect(kept.content.startsWith('message')).toBe(true);
    }
    // No compaction when within budget.
    const small = compactMessages([{ role: 'user', content: 'hi' }], { maxBytes: 5000, maxTokens: 1000 });
    expect(small.compacted).toBe(false);
  });

  it('awaits the server save before claiming persisted', async () => {
    const store = new ContextStore({ bucket });
    const result = await store.save({
      userId: 'alice',
      sessionId: 's1',
      messages: [{ role: 'user', content: 'exact message' }]
    });
    expect(result.persisted).toBe(true);
    expect(result.recordId).toBeTruthy();

    const record = await store.get(result.recordId, { userId: 'alice' });
    expect(record.messages[0].content).toBe('exact message');
    expect(record.messages[0].content).not.toContain('summary');
  });

  it('returns persisted: false when the server save fails', async () => {
    const failingBucket = {
      async get() {
        return null;
      },
      async put() {
        throw new Error('R2 unavailable');
      },
      async list() {
        return { objects: [] };
      }
    };
    const store = new ContextStore({ bucket: failingBucket });
    const result = await store.save({
      userId: 'alice',
      sessionId: 's1',
      messages: [{ role: 'user', content: 'x' }]
    });
    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('R2 unavailable');
  });

  it('retrieval by id enforces user ownership', async () => {
    const store = new ContextStore({ bucket });
    const saved = await store.save({
      userId: 'alice',
      sessionId: 's1',
      messages: [{ role: 'user', content: 'private' }]
    });
    const owned = await store.get(saved.recordId, { userId: 'alice' });
    expect(owned).not.toBeNull();
    await expect(store.get(saved.recordId, { userId: 'bob' })).rejects.toThrow(/another user/);
  });

  it('production Worker routes handle context records through the real entrypoint', async () => {
    const env = environment({ ASSET_BUCKET: bucket, OPENCODE_GO_API_KEY: 'test-key' });

    const savedResponse = await post('/api/context/records', {
      sessionId: 's1',
      messages: [
        { role: 'user', content: 'exact requirement' },
        { role: 'assistant', content: 'exact code' }
      ]
    }, env);
    expect(savedResponse.status).toBe(200);
    const saved = await savedResponse.json();
    expect(saved.persisted).toBe(true);
    expect(saved.recordId).toBeTruthy();

    const getResponse = await worker.fetch(
      new Request(`https://corez.test/api/context/records/${saved.recordId}`, {
        headers: { 'x-corez-user': 'alice' }
      }),
      env
    );
    expect(getResponse.status).toBe(200);
    const record = await getResponse.json();
    expect(record.messages).toHaveLength(2);
    expect(record.messages[1].content).toBe('exact code');

    // A different user cannot read Alice's record.
    const forbiddenResponse = await worker.fetch(
      new Request(`https://corez.test/api/context/records/${saved.recordId}`, {
        headers: { 'x-corez-user': 'bob' }
      }),
      env
    );
    expect(forbiddenResponse.status).toBe(403);
  });

  it('worker reports persisted:false when storage is unavailable', async () => {
    const env = environment({ OPENCODE_GO_API_KEY: 'test-key' }); // no ASSET_BUCKET
    const response = await post('/api/context/records', {
      messages: [{ role: 'user', content: 'x' }]
    }, env);
    expect(response.status).toBe(503);
  });

  it('estimateTokens is a cheap deterministic proxy', () => {
    expect(estimateTokens('abcdefghij')).toBe(4); // 10 chars / 3.2
    expect(estimateTokens('')).toBe(0);
  });
});
