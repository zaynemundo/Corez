import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createContextClient,
  memoryContextStore,
  getContextClient,
  setContextClient
} from '../src/services/contextStoreClient.js';
import { persistAndSummarize, retrieveContextRecord } from '../src/services/contextStore.js';
import { handleContextStore, handleContextGet } from '../worker/contextRecords.js';
import {
  resumeSwarmTask,
  getStoredSwarmTaskId,
  clearStoredSwarmTaskId,
  getLastCompletedSwarmResult,
  generateAIResponse
} from '../src/services/aiService.js';

const META_KEY = 'corez_context_metadata';
const RECORD_ID = 'ctx-integration-0001';

function createMemoryBucket() {
  const values = new Map();
  return {
    put: async (key, value, options) => {
      values.set(key, {
        value: String(value),
        contentType: options?.httpMetadata?.contentType || 'application/octet-stream'
      });
    },
    get: async (key) => (values.has(key) ? {
      text: async () => values.get(key).value,
      arrayBuffer: async () => new TextEncoder().encode(values.get(key).value).buffer,
      writeHttpMetadata: (headers) => { headers.set('Content-Type', values.get(key).contentType); },
      httpEtag: 'mock-etag'
    } : null),
    delete: async (key) => { values.delete(key); },
    list: async ({ prefix }) => ({
      objects: [...values.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key }))
    })
  };
}

// Routes browser-style fetches to the worker record handlers over a fake R2
// bucket, exactly like a deployed /api/context/records endpoint would. Node's
// Request constructor requires absolute URLs, so paths are resolved against a
// test origin (the worker handlers only read the pathname).
function makeRoutedFetch(bucket) {
  const BASE = 'https://corez.test';
  return async (input, init = {}) => {
    const path = String(input);
    const method = String(init.method || 'GET').toUpperCase();
    if (path === '/api/context/records' && method === 'POST') {
      return handleContextStore(new Request(BASE + path, {
        method,
        headers: init.headers,
        body: init.body
      }), { ASSET_BUCKET: bucket });
    }
    if (path.startsWith('/api/context/records/')) {
      return handleContextGet(new Request(BASE + path, { method }), { ASSET_BUCKET: bucket });
    }
    throw new Error(`Unexpected request: ${path}`);
  };
}

describe('context storage integration', () => {
  beforeEach(() => {
    memoryContextStore.clear();
    setContextClient(createContextClient());
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.removeItem(META_KEY);
      globalThis.localStorage.removeItem('corez_swarm_task');
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    clearStoredSwarmTaskId();
  });

  const codeBlock = '```js\nfunction preserve() { return "exact"; }\n```';

  // (a) memory client: persistence + exact retrieval
  it('persists and retrieves exact messages through the memory client', async () => {
    const client = createContextClient({ backend: 'memory', storage: globalThis.localStorage });
    const messages = [
      { role: 'user', content: 'Requirement: keep the auth flow intact.' },
      { role: 'assistant', content: codeBlock }
    ];
    const result = await client.saveRecord({
      id: RECORD_ID,
      createdAt: 7,
      messages
    });

    expect(result).toEqual({ ok: true, recordId: RECORD_ID, backend: 'memory' });
    expect(client.available()).toBe(true);

    const record = await client.getRecord(RECORD_ID);
    expect(record.id).toBe(RECORD_ID);
    expect(record.messages).toEqual(messages);

    const batch = await client.getRecords([RECORD_ID, 'ctx-missing-0001']);
    expect(batch[0].messages).toEqual(messages);
    expect(batch[1]).toBeNull();

    await client.deleteRecord(RECORD_ID);
    expect(await client.getRecord(RECORD_ID)).toBeNull();
  });

  // (b) server-side durability via the worker handlers on a fake R2 bucket
  it('durably stores and retrieves records through the worker endpoints', async () => {
    const bucket = createMemoryBucket();
    const env = { ASSET_BUCKET: bucket };
    const messages = [
      { role: 'user', content: 'Second requirement: preserve the dashboard.' },
      { role: 'assistant', content: '```ts\nconst keep = true;\n```' }
    ];

    const post = await handleContextStore(new Request('https://corez.test/api/context/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: RECORD_ID, createdAt: 42, messages })
    }), env);
    expect(post.status).toBe(200);
    const postData = await post.json();
    expect(postData.ok).toBe(true);
    expect(postData.recordId).toBe(RECORD_ID);
    expect(postData.key).toBe(`context-records/${RECORD_ID}.json`);

    const get = await handleContextGet(new Request(`https://corez.test/api/context/records/${RECORD_ID}`), env);
    expect(get.status).toBe(200);
    const record = await get.json();
    expect(record).toEqual({ id: RECORD_ID, createdAt: 42, messages });

    // The DELETE endpoint removes the durable record.
    const del = await handleContextGet(new Request(`https://corez.test/api/context/records/${RECORD_ID}`, { method: 'DELETE' }), env);
    expect(del.status).toBe(200);
    const missing = await handleContextGet(new Request(`https://corez.test/api/context/records/${RECORD_ID}`), env);
    expect(missing.status).toBe(404);
  });

  // (c) browser refresh recovery: metadata-only localStorage + R2 round trip
  it('recovers exact records after a simulated browser refresh', async () => {
    const bucket = createMemoryBucket();
    const routedFetch = makeRoutedFetch(bucket);
    const messages = [
      { role: 'user', content: 'Do not remove the offline cache.' },
      { role: 'assistant', content: '```html\n<div>keep</div>\n```' }
    ];

    const firstSession = createContextClient({
      backend: 'server',
      storage: globalThis.localStorage,
      store: new Map(),
      fetchImpl: routedFetch
    });
    const saved = await firstSession.saveRecord({ id: RECORD_ID, createdAt: 5, messages });
    expect(saved.ok).toBe(true);
    expect(saved.backend).toBe('server');

    // Only lightweight metadata lives in localStorage — never the messages.
    const metadata = JSON.parse(globalThis.localStorage.getItem(META_KEY));
    expect(metadata[RECORD_ID].recordId).toBe(RECORD_ID);
    expect(metadata[RECORD_ID].messages).toBeUndefined();

    // New page load: fresh client instance, fresh session store, same storage.
    const refreshed = createContextClient({
      backend: 'server',
      storage: globalThis.localStorage,
      store: new Map(),
      fetchImpl: routedFetch
    });
    const recovered = await refreshed.getRecord(RECORD_ID);
    expect(recovered).not.toBeNull();
    expect(recovered.messages).toEqual(messages);
  });

  // (d) localStorage quota failure: request keeps working, no persistence claim
  it('does not claim persistence when localStorage quota is exceeded', async () => {
    const originalSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage);
    globalThis.localStorage.setItem = () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    };
    try {
      const client = createContextClient({ backend: 'memory', storage: globalThis.localStorage });
      const messages = [{ role: 'user', content: 'Requirement: keep working offline.' }];
      const result = await client.saveRecord({ id: RECORD_ID, createdAt: 1, messages });
      expect(result.ok).toBe(false);
      expect(result.recordId).toBe(RECORD_ID);

      // The request still worked: the record is retrievable in-session.
      const session = await client.getRecord(RECORD_ID);
      expect(session.messages).toEqual(messages);

      // persistAndSummarize must not claim persistence either.
      const { persisted, summaryMessage } = persistAndSummarize(messages);
      expect(persisted).toBe(false);
      expect(summaryMessage.content).toContain('persisted: false');
      expect(summaryMessage.content).not.toContain('Full records: retrieve by key');
    } finally {
      globalThis.localStorage.setItem = originalSetItem;
    }
  });

  // (e) large code block preservation (>= 1 MB)
  it('preserves a large code block exactly through the worker endpoints', async () => {
    const bucket = createMemoryBucket();
    const env = { ASSET_BUCKET: bucket };
    const code = '```js\n' + 'x'.repeat(1024 * 1024) + '\n```';
    const messages = [{ role: 'assistant', content: code }];

    const post = await handleContextStore(new Request('https://corez.test/api/context/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: RECORD_ID, createdAt: 1, messages })
    }), env);
    expect(post.status).toBe(200);

    const get = await handleContextGet(new Request(`https://corez.test/api/context/records/${RECORD_ID}`), env);
    expect(get.status).toBe(200);
    const record = await get.json();
    expect(record.messages[0].content).toBe(code);
    expect(record.messages[0].content.length).toBeGreaterThan(1024 * 1024);
    expect(record.messages[0].content.startsWith('```js')).toBe(true);
    expect(record.messages[0].content.endsWith('```')).toBe(true);
  });

  // (f) negative-requirement preservation
  it('preserves negative requirements exactly', async () => {
    const bucket = createMemoryBucket();
    const env = { ASSET_BUCKET: bucket };
    const negative = 'Must not change the payment gateway integration.';
    const messages = [{ role: 'user', content: negative }];

    await handleContextStore(new Request('https://corez.test/api/context/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: RECORD_ID, createdAt: 1, messages })
    }), env);
    const get = await handleContextGet(new Request(`https://corez.test/api/context/records/${RECORD_ID}`), env);
    expect((await get.json()).messages[0].content).toBe(negative);
  });

  // (g) error preservation
  it('preserves exact errors verbatim', async () => {
    const bucket = createMemoryBucket();
    const env = { ASSET_BUCKET: bucket };
    const errorText = 'TypeError: Cannot read properties of undefined (reading "config") at eval (<anonymous>:17:5)';
    const messages = [{ role: 'assistant', content: errorText }];

    await handleContextStore(new Request('https://corez.test/api/context/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: RECORD_ID, createdAt: 1, messages })
    }), env);
    const get = await handleContextGet(new Request(`https://corez.test/api/context/records/${RECORD_ID}`), env);
    expect((await get.json()).messages[0].content).toBe(errorText);
  });

  // (h) multiple compacted records stay individually retrievable
  it('keeps every compacted record individually retrievable', async () => {
    const first = [{ role: 'user', content: 'Requirement A: keep the auth flow intact.' }];
    const second = [{ role: 'assistant', content: '```js\nfunction b() {}\n```' }];
    const third = [{ role: 'user', content: 'Must not remove the dashboard.' }];

    const { recordId: firstId } = persistAndSummarize(first);
    const { recordId: secondId } = persistAndSummarize(second);
    const { recordId: thirdId } = persistAndSummarize(third);

    expect(retrieveContextRecord(firstId).messages).toEqual(first);
    expect(retrieveContextRecord(secondId).messages).toEqual(second);
    expect(retrieveContextRecord(thirdId).messages).toEqual(third);
    expect(retrieveContextRecord(firstId)).not.toEqual(retrieveContextRecord(secondId));
  });

  // (i) retrieval by record id across the shared interface
  it('retrieves exact records by id through the client and the worker', async () => {
    const bucket = createMemoryBucket();
    const routedFetch = makeRoutedFetch(bucket);
    const client = createContextClient({
      backend: 'server',
      storage: globalThis.localStorage,
      fetchImpl: routedFetch
    });
    const messages = [{ role: 'user', content: 'Requirement: keep the retry loop bounded.' }];
    await client.saveRecord({ id: RECORD_ID, createdAt: 9, messages });

    const viaClient = await client.getRecord(RECORD_ID);
    expect(viaClient.messages).toEqual(messages);

    const viaWorker = await handleContextGet(
      new Request(`https://corez.test/api/context/records/${RECORD_ID}`),
      { ASSET_BUCKET: bucket }
    );
    expect(viaWorker.status).toBe(200);
    expect((await viaWorker.json()).messages).toEqual(messages);
  });

  // (j) no false claim of persistence (persisted:false path)
  it('never claims persistence when the backend is unavailable', async () => {
    // No durable backend at all: client and summary both refuse to claim.
    setContextClient(createContextClient({ backend: 'none', storage: null }));
    const unavailable = getContextClient();
    expect(unavailable.available()).toBe(false);

    const messages = [{ role: 'user', content: 'Requirement: honest availability reporting.' }];
    const save = await unavailable.saveRecord({ id: RECORD_ID, createdAt: 1, messages });
    expect(save.ok).toBe(false);
    expect(save.backend).toBe('none');

    const { persisted, summaryMessage } = persistAndSummarize(messages);
    expect(persisted).toBe(false);
    expect(summaryMessage.content).toContain('persisted: false');
    expect(summaryMessage.content).not.toContain('Full records: retrieve by key');

    // Network failure on a server backend: saveRecord reports ok:false.
    const failingFetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const broken = createContextClient({
      backend: 'server',
      storage: globalThis.localStorage,
      fetchImpl: failingFetch
    });
    const networkSave = await broken.saveRecord({ id: RECORD_ID, createdAt: 1, messages });
    expect(networkSave.ok).toBe(false);
    expect(networkSave.reason).toContain('Failed to fetch');
  });

  // (k) invalid record ids are rejected with 400
  it('rejects invalid record ids on every endpoint with 400', async () => {
    const env = { ASSET_BUCKET: createMemoryBucket() };

    for (const badId of ['bad-id', 'ctx-', 'ctx-!!invalid!!', '', 'ctx-' + 'x'.repeat(65)]) {
      const post = await handleContextStore(new Request('https://corez.test/api/context/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: badId, createdAt: 1, messages: [] })
      }), env);
      expect(post.status).toBe(400);

      const get = await handleContextGet(new Request(`https://corez.test/api/context/records/${encodeURIComponent(badId)}`), env);
      expect(get.status).toBe(400);
    }
  });

  // (l) unknown record ids return 404
  it('returns 404 for a valid-format but unknown record id', async () => {
    const env = { ASSET_BUCKET: createMemoryBucket() };
    const get = await handleContextGet(
      new Request('https://corez.test/api/context/records/ctx-missing-0001'),
      env
    );
    expect(get.status).toBe(404);
    expect((await get.json()).error).toContain('not found');
  });
});

describe('resumable swarm status client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    clearStoredSwarmTaskId();
  });

  it('completes a swarm task with adaptive polling and no fixed ceiling', async () => {
    let polls = 0;
    const fetchMock = vi.fn(async (url) => {
      expect(url).toBe('/api/swarm/status/ctx-swarm-live');
      polls += 1;
      if (polls < 3) {
        return Response.json({ taskId: 'ctx-swarm-live', status: 'processing', waveCount: polls, completed: polls - 1, remaining: 1 });
      }
      return Response.json({ taskId: 'ctx-swarm-live', status: 'completed', completed: 2, content: 'All waves done.', model: 'deepseek-v4-flash' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await resumeSwarmTask('ctx-swarm-live', null, { startDelayMs: 1, minDelayMs: 1, maxDelayMs: 5 });
    expect(result).toEqual({ content: 'All waves done.', model: 'deepseek-v4-flash', taskId: 'ctx-swarm-live' });
    expect(polls).toBe(3);
    expect(getLastCompletedSwarmResult()?.content).toBe('All waves done.');
  });

  it('persists the task id, survives a simulated refresh, and clears it on completion', async () => {
    const taskId = 'ctx-swarm-task1';
    let statusCalls = 0;
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/ai') {
        return Response.json({ taskId, status: 'processing' }, { status: 202 });
      }
      if (url === `/api/swarm/status/${taskId}`) {
        statusCalls += 1;
        if (statusCalls === 1) {
          return Response.json({ taskId, status: 'processing', waveCount: 1, completed: 0, remaining: 2 });
        }
        return Response.json({ taskId, status: 'completed', completed: 2, content: 'Final swarm result.', model: 'opencode-go:swarm' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    clearStoredSwarmTaskId();

    vi.useFakeTimers();
    try {
      const generation = generateAIResponse('Orchestrate a multi-agent swarm deployment', []);
      await vi.advanceTimersByTimeAsync(50);
      expect(getStoredSwarmTaskId()).toBe(taskId);

      await vi.runAllTimersAsync();
      const content = await generation;
      expect(content).toBe('Final swarm result.');
      expect(getStoredSwarmTaskId()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops immediately on abort with AbortError and never polls after it', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn(async () => Response.json({ taskId: 'ctx-swarm-abort', status: 'processing' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resumeSwarmTask('ctx-swarm-abort', controller.signal, { startDelayMs: 5000, minDelayMs: 5000, maxDelayMs: 5000 }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();

    // Abort mid-wait also throws AbortError.
    const midWait = new AbortController();
    const pending = resumeSwarmTask('ctx-swarm-abort', midWait.signal, { startDelayMs: 5000, minDelayMs: 5000, maxDelayMs: 5000 });
    midWait.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries transient network failures a few times before an honest error', async () => {
    const failing = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    vi.stubGlobal('fetch', failing);

    await expect(resumeSwarmTask('ctx-swarm-net', null, { startDelayMs: 1, minDelayMs: 1, maxDelayMs: 4 }))
      .rejects.toThrow(/network retries/);
    expect(failing).toHaveBeenCalledTimes(3);
  });

  it('reports terminal HTTP statuses and task states honestly', async () => {
    const notFound = vi.fn(async () => Response.json({ error: 'Unknown swarm task.' }, { status: 404 }));
    vi.stubGlobal('fetch', notFound);
    await expect(resumeSwarmTask('ctx-swarm-missing', null, { startDelayMs: 1, minDelayMs: 1, maxDelayMs: 2 }))
      .rejects.toThrow(/HTTP 404/);

    const cancelled = vi.fn(async () => Response.json({ taskId: 'ctx-swarm-cancel', status: 'cancelled' }));
    vi.stubGlobal('fetch', cancelled);
    await expect(resumeSwarmTask('ctx-swarm-cancel', null, { startDelayMs: 1, minDelayMs: 1, maxDelayMs: 2 }))
      .rejects.toThrow(/was cancelled/);

    const blocked = vi.fn(async () => Response.json({ taskId: 'ctx-swarm-blocked', status: 'blocked' }));
    vi.stubGlobal('fetch', blocked);
    await expect(resumeSwarmTask('ctx-swarm-blocked', null, { startDelayMs: 1, minDelayMs: 1, maxDelayMs: 2 }))
      .rejects.toThrow(/blocked/);
  });

  it('round-trips the stored swarm task id through localStorage', () => {
    clearStoredSwarmTaskId();
    expect(getStoredSwarmTaskId()).toBeNull();

    globalThis.localStorage.setItem('corez_swarm_task', JSON.stringify({ taskId: 'ctx-swarm-seed', storedAt: 1 }));
    expect(getStoredSwarmTaskId()).toBe('ctx-swarm-seed');

    clearStoredSwarmTaskId();
    expect(getStoredSwarmTaskId()).toBeNull();
  });
});
