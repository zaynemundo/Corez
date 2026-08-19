import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildProviderChain, runProviderChain, runStreamingChain, TASK_STATUS_STORE_PREFIX } from '../worker/providerChain.js';
import { createTaskStateStore } from '../worker/utils.js';

const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/chat/completions';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function providerEnv(overrides = {}) {
  return {
    OPENCODE_GO_API_KEY: 'sk-opencode',
    DEEPSEEK_API_KEY: 'sk-deepseek',
    OPENROUTER_API_KEY: 'sk-openrouter',
    ...overrides
  };
}

function fakeClock() {
  const state = { now: 0 };
  return {
    clock: () => state.now,
    sleep: async (ms) => { state.now += ms; },
    state
  };
}

function okResponse(content, status = 200, extraHeaders = {}) {
  return Response.json(
    { choices: [{ message: { content } }] },
    { status, headers: { 'Content-Type': 'application/json', ...extraHeaders } }
  );
}

function errorResponse(status, message = 'provider error', extraHeaders = {}) {
  return Response.json(
    { error: message },
    { status, headers: { 'Content-Type': 'application/json', ...extraHeaders } }
  );
}

function mockBucket() {
  const store = new Map();
  return {
    store,
    env: {
      put: async (key, value) => { store.set(key, value); },
      get: async (key) => (store.has(key) ? { text: async () => store.get(key) } : null),
      delete: async (key) => { store.delete(key); }
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('provider fallback chain recovery', () => {
  it('orders providers OpenCode Go -> DeepSeek -> OpenRouter', () => {
    const chain = buildProviderChain(providerEnv());
    expect(chain.map((p) => p.id)).toEqual(['opencode-go', 'deepseek', 'openrouter']);
  });

  it('recovers after more than three transient failures (5x429 then 200)', async () => {
    const { clock, sleep } = fakeClock();
    let attempts = 0;
    const fetchMock = vi.fn(async (url) => {
      expect(url).toBe(OPENCODE_URL);
      attempts += 1;
      return attempts <= 5 ? errorResponse(429, 'rate limited') : okResponse('finally recovered');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runProviderChain([{ role: 'user', content: 'retry me' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      sleep,
      clock,
      jitter: () => 0,
      maxRequestRetryMs: 300_000
    });

    expect(result.content).toBe('finally recovered');
    expect(result.model).toBe('opencode:muse-spark-1.2');
    expect(attempts).toBe(6);
  });

  it('recovers after more than 60 seconds of simulated retry time', async () => {
    const { clock, sleep, state } = fakeClock();
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      attempts += 1;
      return attempts <= 7 ? errorResponse(503, 'gateway hiccup') : okResponse('back after the long outage');
    }));

    const result = await runProviderChain([{ role: 'user', content: 'long outage' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      sleep,
      clock,
      jitter: () => 0,
      maxRequestRetryMs: 300_000
    });

    expect(result.content).toBe('back after the long outage');
    expect(attempts).toBe(8);
    expect(state.now).toBeGreaterThan(60_000);
  });

  it('honours Retry-After on 429 responses', async () => {
    const { clock, sleep, state } = fakeClock();
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? errorResponse(429, 'slow down', { 'Retry-After': '2' })
        : okResponse('ok now');
    }));

    const result = await runProviderChain([{ role: 'user', content: 'retry-after' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      sleep,
      clock,
      jitter: () => 0,
      maxRequestRetryMs: 300_000
    });

    expect(result.content).toBe('ok now');
    expect(attempts).toBe(2);
    expect(state.now).toBeGreaterThanOrEqual(2000);
  });

  it('does not retry permanent 401 authentication failures', async () => {
    const fetchMock = vi.fn(async () => errorResponse(401, 'unauthorized'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runProviderChain([{ role: 'user', content: 'auth' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      sleep: async () => {},
      jitter: () => 0
    });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/opencode/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry permanent 400 invalid-request failures', async () => {
    const fetchMock = vi.fn(async () => errorResponse(400, 'invalid params'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runProviderChain([{ role: 'user', content: 'bad' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      sleep: async () => {},
      jitter: () => 0
    });

    expect(result.status).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the next provider with the same messages after a permanent failure', async () => {
    const captured = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const payload = JSON.parse(init.body);
      captured.push({ url, payload });
      if (url === OPENCODE_URL) return errorResponse(401, 'unauthorized');
      return okResponse('deepseek answered');
    }));

    const messages = [{ role: 'user', content: 'same task for every provider' }];
    const result = await runProviderChain(messages, {
      env: providerEnv(),
      sleep: async () => {},
      jitter: () => 0
    });

    expect(result.content).toBe('deepseek answered');
    expect(result.provider).toBe('deepseek');
    expect(result.model).toBe('deepseek:muse-spark-1.2');
    const deepseekCall = captured.find((c) => c.url === DEEPSEEK_URL);
    expect(deepseekCall.payload.messages).toEqual(messages);
    expect(captured.filter((c) => c.url === OPENCODE_URL)).toHaveLength(1);
  });

  it('cancels during backoff when the client signal fires', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => errorResponse(429, 'busy'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runProviderChain([{ role: 'user', content: 'cancel me' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      signal: controller.signal,
      sleep: async () => { controller.abort(); },
      jitter: () => 0,
      maxRequestRetryMs: 300_000
    });

    expect(result.status).toBe('cancelled');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reloads a persisted retry schedule on a restarted invocation', async () => {
    const bucket = mockBucket();
    const bucketEnv = { ...providerEnv(), ASSET_BUCKET: bucket.env };
    const { clock, sleep, state } = fakeClock();
    let failuresRemaining = 2;
    const attempts = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      attempts.push({ url, payload: JSON.parse(init.body) });
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        return errorResponse(429, 'busy');
      }
      return okResponse('resumed answer');
    }));

    const store1 = createTaskStateStore(bucketEnv);
    const first = await runProviderChain([{ role: 'user', content: 'resumable' }], {
      env: bucketEnv,
      store: store1,
      sleep,
      clock,
      jitter: () => 0,
      maxRequestRetryMs: 1200
    });

    expect(first.status).toBe('retry-scheduled');
    expect(first.taskId).toMatch(/^rt-[0-9a-f]{8}$/);
    expect(first.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect([...bucket.store.keys()].some((key) => key.includes('retry_'))).toBe(true);

    // A restarted invocation with a fresh store (same bucket) resumes the
    // persisted schedule instead of starting over.
    state.now = 4000;
    const store2 = createTaskStateStore(bucketEnv);
    const second = await runProviderChain([{ role: 'user', content: 'resumable' }], {
      env: bucketEnv,
      store: store2,
      sleep,
      clock,
      jitter: () => 0,
      maxRequestRetryMs: 1200
    });

    expect(second.content).toBe('resumed answer');
    expect(second.resumed).toBe(true);
    expect(attempts).toHaveLength(3);
    // The retry schedule is cleared once the task completes.
    expect([...bucket.store.keys()].some((key) => key.includes('retry_'))).toBe(false);
  });

  it('mirrors the retry schedule under task-status/<taskId> and clears it on completion', async () => {
    const bucket = mockBucket();
    const bucketEnv = { ...providerEnv(), ASSET_BUCKET: bucket.env };
    const { clock, sleep, state } = fakeClock();
    let failuresRemaining = 2;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        return errorResponse(429, 'busy');
      }
      return okResponse('status answer');
    }));

    const store1 = createTaskStateStore(bucketEnv);
    const first = await runProviderChain([{ role: 'user', content: 'status task' }], {
      env: bucketEnv,
      store: store1,
      sleep,
      clock,
      jitter: () => 0,
      maxRequestRetryMs: 1200
    });
    expect(first.status).toBe('retry-scheduled');
    expect(first.taskId).toMatch(/^rt-[0-9a-f]{8}$/);

    // The task-status record mirrors the schedule under a deterministic key
    // that the public /api/task/<taskId> endpoint can load.
    const mirrored = await store1.load(`${TASK_STATUS_STORE_PREFIX}${first.taskId}`);
    expect(mirrored).not.toBe(null);
    expect(mirrored.status).toBe('retry-scheduled');
    expect(mirrored.retryKey).toContain('retry/');
    expect(mirrored.taskId).toBe(first.taskId);
    expect(Number(mirrored.nextEligibleAt)).toBeGreaterThan(0);

    // A fresh store reading the same bucket sees the mirror too.
    const freshStore = createTaskStateStore(bucketEnv);
    expect(await freshStore.load(`${TASK_STATUS_STORE_PREFIX}${first.taskId}`)).not.toBe(null);

    // After the resume succeeds, both the retry record and its mirror are gone.
    state.now = 4000;
    const store2 = createTaskStateStore(bucketEnv);
    const second = await runProviderChain([{ role: 'user', content: 'status task' }], {
      env: bucketEnv,
      store: store2,
      sleep,
      clock,
      jitter: () => 0,
      maxRequestRetryMs: 1200
    });
    expect(second.content).toBe('status answer');
    expect(await store2.load(`${TASK_STATUS_STORE_PREFIX}${first.taskId}`)).toBe(null);
    expect([...bucket.store.keys()].some((key) => key.includes('task-status_'))).toBe(false);
  });

  it('never sends max_tokens or max_completion_tokens to any provider', async () => {
    const payloads = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const payload = JSON.parse(init.body);
      payloads.push({ url, payload });
      if (url === OPENCODE_URL) return errorResponse(401, 'unauthorized');
      if (url === DEEPSEEK_URL) return errorResponse(400, 'invalid params');
      return okResponse('final answer');
    }));

    const result = await runProviderChain([{ role: 'user', content: 'no caps' }], {
      env: providerEnv(),
      sleep: async () => {},
      jitter: () => 0
    });

    expect(result.content).toBe('final answer');
    expect(payloads.map((p) => p.url)).toEqual([OPENCODE_URL, DEEPSEEK_URL, OPENROUTER_URL]);
    for (const { payload } of payloads) {
      expect(payload.max_tokens).toBeUndefined();
      expect(payload.max_completion_tokens).toBeUndefined();
    }
  });

  it('never sends max_tokens to any provider (uncapped by contract)', async () => {
    const payloads = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const payload = JSON.parse(init.body);
      payloads.push({ url, payload });
      if (url === OPENCODE_URL) return errorResponse(401, 'unauthorized');
      return okResponse('quick answer');
    }));

    const result = await runProviderChain([{ role: 'user', content: 'hi' }], {
      env: providerEnv(),
      sleep: async () => {},
      jitter: () => 0
    });

    expect(result.content).toBe('quick answer');
    for (const { payload } of payloads) {
      expect(payload.max_tokens).toBeUndefined();
      expect(payload.max_completion_tokens).toBeUndefined();
    }
  });

  it('skips providers disabled by configuration', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      urls.push(url);
      return okResponse('deepseek only');
    }));

    const result = await runProviderChain([{ role: 'user', content: 'chain' }], {
      env: providerEnv({ OPENCODE_GO_DISABLED: '1', OPENROUTER_DISABLED: 'true' }),
      sleep: async () => {},
      jitter: () => 0
    });

    expect(result.provider).toBe('deepseek');
    expect(urls).toEqual([DEEPSEEK_URL]);
  });

  it('records which provider completed each request in the model label', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse('via opencode')));
    const opencodeResult = await runProviderChain([{ role: 'user', content: 'label' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      sleep: async () => {},
      jitter: () => 0
    });
    expect(opencodeResult.model).toBe('opencode:muse-spark-1.2');

    vi.stubGlobal('fetch', vi.fn(async (url) => (
      url === OPENROUTER_URL ? okResponse('via openrouter') : errorResponse(401, 'unauthorized')
    )));
    const openrouterResult = await runProviderChain([{ role: 'user', content: 'label' }], {
      env: { OPENROUTER_API_KEY: 'sk-openrouter' },
      sleep: async () => {},
      jitter: () => 0
    });
    expect(openrouterResult.model).toBe('openrouter:muse-spark-1.2');
  });
});

describe('runStreamingChain empty-stream behavior', () => {
  function sseChunks(pieces) {
    let body = '';
    for (const piece of pieces) {
      if (piece === 'done') {
        body += 'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6}}\n\ndata: [DONE]\n\n';
      } else {
        body += `data: {"choices":[{"delta":{"content":${JSON.stringify(piece)}},"finish_reason":null}]}\n\n`;
      }
    }
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  // Empty streams are retried on the SAME provider (short backoff) before
  // falling through, and when every provider fails empty the error is
  // retryable 503 so the client's harness auto-resume re-issues the request.
  const fast = { sleep: async () => {} };

  it('retries an empty stream up to 3 times on the same provider, then fails retryable 503', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return sseChunks(['done']);
    }));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'build a game' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      signal: null,
      ...fast
    })) {
      events.push(event);
    }

    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    // Empty/reasoning-only on every provider is transient: retryable 503.
    expect(errors[0].status).toBe(503);
    expect(errors[0].retryable).toBe(true);
    expect(errors[0].message).toMatch(/empty or reasoning-only/);
    expect(events.some((e) => e.type === 'done')).toBe(false);
    // Bounded retry: the provider is called exactly MAX_EMPTY_ATTEMPTS times.
    expect(calls).toBe(3);
  });

  it('treats a whitespace-only stream as empty and retries before failing honestly', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return sseChunks(['\n', '  ', 'done']);
    }));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'build a game' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      signal: null,
      ...fast
    })) {
      events.push(event);
    }

    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].status).toBe(503);
    expect(errors[0].retryable).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(false);
    expect(calls).toBe(3);
  });

  it('recovers when a later retry of the same provider yields content', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      if (calls < 2) return sseChunks(['done']);
      return sseChunks(['The ', 'game ', 'works', 'done']);
    }));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'build a game' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      signal: null,
      ...fast
    })) {
      events.push(event);
    }

    const deltas = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
    expect(deltas).toBe('The game works');
    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(events.filter((e) => e.type === 'error')).toHaveLength(0);
    expect(calls).toBe(2);
  });

  it('falls through to the next provider when the preferred one streams nothing three times', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls += 1;
      if (String(url).includes(OPENCODE_URL)) return sseChunks(['done']);
      return sseChunks(['The ', 'game ', 'works', 'done']);
    }));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'build a game' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode', DEEPSEEK_API_KEY: 'sk-deepseek' },
      signal: null,
      ...fast
    })) {
      events.push(event);
    }

    const deltas = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
    expect(deltas).toBe('The game works');
    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(events.filter((e) => e.type === 'error')).toHaveLength(0);
    // 3 empty retries on opencode-go, then deepseek answered.
    expect(calls).toBe(4);
  });

  it('stays non-retryable 502 when a hard provider failure is mixed in', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls += 1;
      if (String(url).includes(OPENCODE_URL)) return errorResponse(500, 'upstream exploded');
      return sseChunks(['done']);
    }));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'build a game' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode', DEEPSEEK_API_KEY: 'sk-deepseek' },
      signal: null,
      ...fast
    })) {
      events.push(event);
    }

    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].status).toBe(502);
    expect(errors[0].retryable).toBeUndefined();
    expect(errors[0].message).toMatch(/upstream exploded/);
    expect(events.some((e) => e.type === 'done')).toBe(false);
    // 1 hard failure + 3 empty retries on deepseek.
    expect(calls).toBe(4);
  });
});
