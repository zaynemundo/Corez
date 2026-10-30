import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildProviderChain, runProviderChain, runStreamingChain, TASK_STATUS_STORE_PREFIX } from '../worker/providerChain.js';
import {
  parseResponsesStore,
  rejectsReasoningTransport,
  resolveApiMode,
  resolveOpencodeSessionId,
  streamChatEndpoint,
  toGatewayReasoning,
  wantsResponsesReasoning,
  withResponsesReasoningPayload,
} from '../worker/opencodeClient.js';
import { createTaskStateStore } from '../worker/utils.js';

const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/responses';
const _DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const _OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

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
  it('chat chain is OpenCode Go only (no DeepSeek/OpenRouter fallback)', () => {
    const chain = buildProviderChain(providerEnv());
    expect(chain.map((p) => p.id)).toEqual(['opencode-go']);
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
    expect(result.model).toBe('opencode:deepseek-v4.1-flash');
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

  it('chat has no fallback: permanent failure on OpenCode Go fails honestly', async () => {
    const captured = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const payload = JSON.parse(init.body);
      captured.push({ url, payload });
      return errorResponse(401, 'unauthorized');
    }));

    const messages = [{ role: 'user', content: 'same task for every provider' }];
    const result = await runProviderChain(messages, {
      env: providerEnv(),
      sleep: async () => {},
      jitter: () => 0
    });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/opencode/);
    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(OPENCODE_URL);
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
      return errorResponse(401, 'unauthorized');
    }));

    const result = await runProviderChain([{ role: 'user', content: 'no caps' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      sleep: async () => {},
      jitter: () => 0
    });

    expect(result.status).toBe('failed');
    expect(payloads).toHaveLength(1);
    expect(payloads[0].url).toBe(OPENCODE_URL);
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
      return errorResponse(401, 'unauthorized');
    }));

    const result = await runProviderChain([{ role: 'user', content: 'hi' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      sleep: async () => {},
      jitter: () => 0
    });

    expect(result.status).toBe('failed');
    expect(payloads).toHaveLength(1);
    for (const { payload } of payloads) {
      expect(payload.max_tokens).toBeUndefined();
      expect(payload.max_completion_tokens).toBeUndefined();
    }
  });

  it('chat has no fallback: disabling OpenCode Go leaves no provider', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      urls.push(url);
      return okResponse('should not be called');
    }));

    const result = await runProviderChain([{ role: 'user', content: 'chain' }], {
      env: providerEnv({ OPENCODE_GO_DISABLED: '1' }),
      sleep: async () => {},
      jitter: () => 0
    });

    expect(result.status).toBe('failed');
    expect(urls).toEqual([]);
  });

  it('records which provider completed each request in the model label', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse('via opencode')));
    const opencodeResult = await runProviderChain([{ role: 'user', content: 'label' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      sleep: async () => {},
      jitter: () => 0
    });
    expect(opencodeResult.model).toBe('opencode:deepseek-v4.1-flash');

    vi.stubGlobal('fetch', vi.fn(async () => errorResponse(401, 'unauthorized')));
    const noFallbackResult = await runProviderChain([{ role: 'user', content: 'label' }], {
      env: { OPENROUTER_API_KEY: 'sk-openrouter' },
      sleep: async () => {},
      jitter: () => 0
    });
    expect(noFallbackResult.status).toBe('failed');
  });
});

describe('runStreamingChain empty-stream behavior', () => {
  function sseChunks(pieces) {
    let body = '';
    for (const piece of pieces) {
      if (piece === 'done') {
        body += 'data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":5,"output_tokens":1}}}\n\ndata: [DONE]\n\n';
      } else {
        body += `data: {"type":"response.output_text.delta","delta":${JSON.stringify(piece)}}\n\n`;
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

  it('chat has no fallback: empty stream on OpenCode Go fails retryable 503', async () => {
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
    expect(errors[0].status).toBe(503);
    expect(events.some((e) => e.type === 'done')).toBe(false);
    expect(calls).toBe(3);
  });

  it('retries transient 500s in-stream, then fails honest non-retryable 502', async () => {
    // Transient provider errors ride through inside the open stream: an
    // upstream blip is retried with backoff (bounded by attempts), and only
    // a persistent outage surfaces — still as non-retryable 502.
    // Frozen clock so the attempts cap (not the time budget) binds: exactly
    // 1 initial attempt + 7 retries.
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return errorResponse(500, 'upstream exploded');
    }));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'build a game' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      signal: null,
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0,
    })) {
      events.push(event);
    }

    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].status).toBe(502);
    expect(errors[0].retryable).toBeUndefined();
    expect(errors[0].message).toMatch(/upstream exploded/);
    expect(events.some((e) => e.type === 'done')).toBe(false);
    // Bounded: initial attempt + retries up to the transient-attempts cap.
    expect(calls).toBe(8);
  });

  it('never retries permanent 401 failures in-stream', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return errorResponse(401, 'unauthorized');
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
    expect(errors[0].status).toBe(502);
    expect(errors[0].retryable).toBeUndefined();
    expect(calls).toBe(1);
  });

  it('recovers in-stream after transient 429 rate limits', async () => {
    const { clock, sleep } = fakeClock();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return calls <= 2
        ? errorResponse(429, 'rate limited')
        : sseChunks(['recovered', 'done']);
    }));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'hello' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      signal: null,
      sleep,
      clock,
      jitter: () => 0,
    })) {
      events.push(event);
    }

    const deltas = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
    expect(deltas).toBe('recovered');
    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(events.filter((e) => e.type === 'error')).toHaveLength(0);
    expect(calls).toBe(3);
  });

  it('honours Retry-After on streaming 429 responses', async () => {
    const { clock, sleep, state } = fakeClock();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? errorResponse(429, 'slow down', { 'Retry-After': '2' })
        : sseChunks(['ok now', 'done']);
    }));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'hello' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      signal: null,
      sleep,
      clock,
      jitter: () => 0,
    })) {
      events.push(event);
    }

    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(calls).toBe(2);
    expect(state.now).toBeGreaterThanOrEqual(2000);
  });

  it('fails retryable 429 with a short message when the limit outlasts the budget', async () => {
    // Frozen clock so the attempts cap binds deterministically.
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return errorResponse(429, '{"error":{"code":"rate_limit_exceeded"}}');
    }));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'hello' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      signal: null,
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0,
    })) {
      events.push(event);
    }

    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].status).toBe(429);
    expect(errors[0].retryable).toBe(true);
    expect(errors[0].message).toMatch(/rate-limited/);
    // Never a raw provider JSON dump in the user-facing message.
    expect(errors[0].message).not.toContain('rate_limit_exceeded');
    expect(errors[0].message).not.toMatch(/HTTP 429/);
    expect(events.some((e) => e.type === 'done')).toBe(false);
    expect(calls).toBe(8);
  });

  it('does not retry a failure that arrives after partial content streamed', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      const enc = new TextEncoder();
      let errored = false;
      return new Response(new ReadableStream({
        start(c) {
          c.enqueue(enc.encode('data: {"type":"response.output_text.delta","delta":"partial "}\n\n'));
        },
        pull(c) {
          // Fail on the second read, after the delta was delivered.
          if (!errored) {
            errored = true;
            c.error(new Error('connection reset'));
          } else {
            c.close();
          }
        }
      }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'hello' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      signal: null,
      ...fast
    })) {
      events.push(event);
    }

    // Already-sent content is preserved exactly once; the failure breaks
    // instead of retrying (a retry would duplicate the partial text).
    expect(events.filter((e) => e.type === 'delta').map((e) => e.text).join('')).toBe('partial ');
    expect(events.filter((e) => e.type === 'error')).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it('sends x-opencode-session on every opencode request, stable across retries', async () => {
    const { clock, sleep } = fakeClock();
    const sessions = [];
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      sessions.push(init?.headers?.['x-opencode-session']);
      attempts += 1;
      return attempts <= 2 ? errorResponse(429, 'rate limited') : okResponse('recovered');
    }));

    const result = await runProviderChain([{ role: 'user', content: 'retry me' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      sleep,
      clock,
      jitter: () => 0,
      maxRequestRetryMs: 300_000
    });

    expect(result.content).toBe('recovered');
    expect(attempts).toBe(3);
    // The gateway rejects requests without the header (HTTP 400
    // MissingSessionID); every attempt — including retries — carries one id.
    expect(sessions).toHaveLength(3);
    for (const s of sessions) expect(typeof s).toBe('string');
    expect(new Set(sessions).size).toBe(1);
  });

  it('honours an explicit sessionId for the whole run', async () => {
    const sessions = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      sessions.push(init?.headers?.['x-opencode-session']);
      return okResponse('hello');
    }));

    const result = await runProviderChain([{ role: 'user', content: 'hi' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      sessionId: 'user-abc-123',
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0
    });

    expect(result.content).toBe('hello');
    expect(sessions).toEqual(['ses_user-abc-123']);
  });
});

describe('OpenCode gateway client behavior', () => {
  it('prefers the explicit API mode and falls back to the endpoint shape', () => {
    expect(
      resolveApiMode({ endpoint: 'https://opencode.ai/zen/go/v1/chat/completions' })
    ).toBe('chat');
    expect(resolveApiMode({ endpoint: 'https://opencode.ai/zen/go/v1/responses' })).toBe('responses');
    expect(resolveApiMode({ endpoint: 'https://x/v1/responses', api: 'chat' })).toBe('chat');
    expect(resolveApiMode({ endpoint: 'https://x/v1/chat/completions', api: 'responses' })).toBe('responses');
  });

  it('maps the canonical reasoning shape to the Responses wire shape', () => {
    // Hidden: effort only — no `exclude` (invalid on Responses) and no
    // summary, so zero reasoning bytes ship.
    expect(toGatewayReasoning({ effort: 'high', exclude: true }, 'responses')).toEqual({ effort: 'high' });
    // Visible: summaries stream back as reasoning deltas for the thinking panel.
    expect(toGatewayReasoning({ effort: 'medium', exclude: false }, 'responses')).toEqual({ effort: 'medium', summary: 'auto' });
    // Chat-completions keeps the OpenRouter-style shape untouched.
    expect(toGatewayReasoning({ effort: 'high', exclude: true }, 'chat')).toEqual({ effort: 'high', exclude: true });
    expect(toGatewayReasoning({ effort: 'high', exclude: false }, 'chat')).toEqual({ effort: 'high', exclude: false });
    // Non-objects pass through for the caller to shape.
    expect(toGatewayReasoning(undefined, 'responses')).toBeUndefined();
    expect(toGatewayReasoning(null, 'responses')).toBeNull();
  });

  it('sends the responses body shape when OPENCODE_API_MODE=responses', async () => {
    let payload;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      payload = JSON.parse(init.body);
      return Response.json({
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'legacy ok' }]
          }
        ]
      });
    }));

    const result = await runProviderChain([{ role: 'user', content: 'hi' }], {
      env: {
        OPENCODE_GO_API_KEY: 'sk-opencode',
        OPENCODE_ENDPOINT: 'https://opencode.test/custom',
        OPENCODE_API_MODE: 'responses'
      },
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0
    });

    expect(result.content).toBe('legacy ok');
    expect(payload.input).toEqual([{ role: 'user', content: 'hi' }]);
    expect(payload.messages).toBeUndefined();
  });

  it('reuses the persisted session id when a retry-scheduled task resumes', async () => {
    const bucket = mockBucket();
    const bucketEnv = { ...providerEnv(), ASSET_BUCKET: bucket.env };
    const { clock, sleep, state } = fakeClock();
    const sessions = [];
    let failing = true;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      sessions.push(init?.headers?.['x-opencode-session']);
      return failing ? errorResponse(503, 'gateway hiccup') : okResponse('resumed with affinity');
    }));

    const store1 = createTaskStateStore(bucketEnv);
    const first = await runProviderChain([{ role: 'user', content: 'affinity' }], {
      env: bucketEnv,
      store: store1,
      sleep,
      clock,
      jitter: () => 0,
      maxRequestRetryMs: 0
    });
    expect(first.status).toBe('retry-scheduled');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatch(/^ses_/);

    // A later invocation resumes the task and must keep the same affinity id
    // so the gateway can reuse the original backend's token cache.
    failing = false;
    state.now = 60_000;
    const store2 = createTaskStateStore(bucketEnv);
    const second = await runProviderChain([{ role: 'user', content: 'affinity' }], {
      env: bucketEnv,
      store: store2,
      sleep,
      clock,
      jitter: () => 0,
      maxRequestRetryMs: 300_000
    });
    expect(second.content).toBe('resumed with affinity');
    expect(second.resumed).toBe(true);
    expect(sessions).toHaveLength(2);
    expect(sessions[1]).toBe(sessions[0]);
  });

  it('omits the reasoning field when OPENCODE_REASONING_DISABLED is set', async () => {
    let payload;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      payload = JSON.parse(init.body);
      return okResponse('no reasoning');
    }));

    const result = await runProviderChain([{ role: 'user', content: 'hello' }], {
      env: {
        OPENCODE_GO_API_KEY: 'sk-opencode',
        OPENCODE_REASONING_DISABLED: 'true'
      },
      reasoning: { effort: 'high', exclude: true },
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0
    });

    expect(result.content).toBe('no reasoning');
    expect(payload.reasoning).toBeUndefined();
  });

  it('replaces the vision-only MiMo model and clamps oversized session ids', async () => {
    let payload;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      payload = JSON.parse(init.body);
      return okResponse('text answer');
    }));

    await runProviderChain([{ role: 'user', content: 'hi' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode', OPENCODE_MODEL: ' xiaomi/mimo-v2.5 ' },
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0
    });
    expect(payload.model).toBe('deepseek-v4.1-flash');

    const oversized = 'a'.repeat(128);
    expect(resolveOpencodeSessionId(oversized)).toMatch(/^ses_[A-Za-z0-9]{26}$/);
    expect(resolveOpencodeSessionId('user-abc-123')).toBe('ses_user-abc-123');
    const prefixed = `ses_${'b'.repeat(120)}`;
    expect(resolveOpencodeSessionId(prefixed)).toBe(prefixed);
    expect(resolveOpencodeSessionId(`ses_${'b'.repeat(125)}`)).toMatch(/^ses_[A-Za-z0-9]{26}$/);
  });

  it('filters inline thinking blocks out of streamed content, even split across chunks', async () => {
    const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      sse({ type: 'response.output_text.delta', delta: 'Hello <thi' })
      + sse({ type: 'response.output_text.delta', delta: 'nk>secret</thi' })
      + sse({ type: 'response.output_text.delta', delta: 'nk>world' })
      + sse({
        type: 'response.completed',
        response: { status: 'completed', usage: { input_tokens: 3, output_tokens: 2 } }
      })
      + 'data: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    )));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'hello' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0
    })) {
      events.push(event);
    }

    const text = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
    expect(text).toBe('Hello world');
    expect(text).not.toContain('secret');
    expect(events.find((e) => e.type === 'done')).toBeTruthy();
    expect(events.find((e) => e.type === 'error')).toBeUndefined();
  });

  it('requests the reasoning transport fields only for visible Responses reasoning', async () => {
    // Hidden (internal) reasoning: effort only — no summary, no transport
    // fields, so zero reasoning bytes and no stored response are requested.
    expect(wantsResponsesReasoning({ effort: 'high', exclude: true })).toBe(false);
    const hidden = withResponsesReasoningPayload(
      { model: 'm', reasoning: { effort: 'high' } },
      { effort: 'high', exclude: true }
    );
    expect(hidden).toEqual({ model: 'm', reasoning: { effort: 'high' } });
    expect(hidden.store).toBeUndefined();
    expect(hidden.include).toBeUndefined();

    // Visible (live thinking panel): store + encrypted reasoning content.
    expect(wantsResponsesReasoning({ effort: 'medium', exclude: false })).toBe(true);
    const visible = withResponsesReasoningPayload(
      { model: 'm', reasoning: { effort: 'medium', summary: 'auto' } },
      { effort: 'medium', exclude: false }
    );
    expect(visible).toEqual({
      model: 'm',
      reasoning: { effort: 'medium', summary: 'auto' },
      store: true,
      include: ['reasoning.encrypted_content'],
    });

    // A deployment or caller can opt out of storing responses: the opt-out is
    // an EXPLICIT `store: false` (never an omitted field the gateway could
    // default back to true), and the encrypted-content include is dropped.
    const unStore = withResponsesReasoningPayload(
      { model: 'm', reasoning: { effort: 'medium', summary: 'auto' } },
      { effort: 'medium', exclude: false },
      { storeEnabled: false }
    );
    expect(unStore.store).toBe(false);
    expect(unStore.include).toBeUndefined();

    // An explicit caller value wins (never overridden by the transport layer).
    const explicit = withResponsesReasoningPayload(
      { model: 'm', store: false, include: ['custom.path'] },
      { effort: 'medium', exclude: false }
    );
    expect(explicit.store).toBe(false);
    expect(explicit.include).toEqual(['custom.path', 'reasoning.encrypted_content']);
  });

  it('sends the visible reasoning transport on the streaming Responses request', async () => {
    let payload;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      payload = JSON.parse(init.body);
      return new Response(
        'data: {"type":"response.output_text.delta","delta":"answer"}\n\n' +
          'data: {"type":"response.completed","response":{"status":"completed"}}\n\n' +
          'data: [DONE]\n\n',
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    }));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'hi' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      reasoning: { effort: 'medium', exclude: false },
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0
    })) {
      events.push(event);
    }

    expect(payload.reasoning).toEqual({ effort: 'medium', summary: 'auto' });
    expect(payload.store).toBe(true);
    expect(payload.include).toEqual(['reasoning.encrypted_content']);
    expect(events.filter((e) => e.type === 'delta').map((e) => e.text).join('')).toBe('answer');
  });

  it('carries the storage opt-out on every attempt, including the plain fallback', async () => {
    // Regression: only the requests that asked for a visible reasoning summary
    // carried `store: false`. The plain fallback attempt and every request
    // without visible reasoning sent NO store field at all, so a deployment
    // that opted out of retention had the opt-out silently dropped and left the
    // decision to the gateway's default. These assertions inspect every
    // outgoing body, not just the first one.
    const bodies = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      // Reject the optional reasoning transport fields so the whole fallback
      // chain runs, and answer the final attempt.
      if (bodies.length < 3) {
        return new Response('unsupported parameter: include', { status: 400 });
      }
      return new Response(
        'data: {"type":"response.output_text.delta","delta":"answer"}\n\n' +
          'data: {"type":"response.completed","response":{"status":"completed"}}\n\n' +
          'data: [DONE]\n\n',
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    }));
    const env = { OPENCODE_GO_API_KEY: 'sk-opencode', OPENCODE_RESPONSES_STORE: 'false' };
    for await (const _event of runStreamingChain([{ role: 'user', content: 'hi' }], {
      env,
      reasoning: { effort: 'medium', exclude: false },
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0
    })) {
      // drain the stream
    }

    expect(bodies.length).toBeGreaterThanOrEqual(3);
    for (const [index, body] of bodies.entries()) {
      expect(body.store, `attempt ${index + 1} dropped the storage opt-out`).toBe(false);
    }
  });

  it('carries the storage opt-out even when no reasoning is requested', async () => {
    // The opt-out is a transport requirement, not part of the optional reasoning
    // payload: a request with hidden reasoning is a single attempt with no
    // reasoning fields, and it used to send no `store` at all.
    let visiblePayload = null;
    let hiddenPayload = null;
    const respond = (capture) => vi.fn(async (_url, init) => {
      capture(JSON.parse(init.body));
      return new Response(
        'data: {"type":"response.output_text.delta","delta":"answer"}\n\n' +
          'data: {"type":"response.completed","response":{"status":"completed"}}\n\n' +
          'data: [DONE]\n\n',
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    });

    vi.stubGlobal('fetch', respond((p) => { visiblePayload = p; }));
    for await (const _event of runStreamingChain([{ role: 'user', content: 'hi' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode', OPENCODE_RESPONSES_STORE: 'false' },
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0
    })) {
      // no reasoning option at all: nothing to make visible
    }
    expect(visiblePayload.store).toBe(false);
    expect(visiblePayload.reasoning).toBeUndefined();

    vi.stubGlobal('fetch', respond((p) => { hiddenPayload = p; }));
    for await (const _event of runStreamingChain([{ role: 'user', content: 'hi' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode', OPENCODE_RESPONSES_STORE: 'false' },
      reasoning: { effort: 'medium', exclude: true },
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0
    })) {
      // internal reasoning stays hidden
    }
    expect(hiddenPayload.store).toBe(false);
    expect(hiddenPayload.include).toBeUndefined();
    expect(hiddenPayload.reasoning).toEqual({ effort: 'medium' });
  });

  it('honours OPENCODE_RESPONSES_STORE as a positive storage setting on the wire', async () => {
    // Regression: the setting was parsed with a "feature disabled" helper and
    // negated, so `false` (the documented opt-out) ENABLED storage. These
    // assertions inspect the actual outgoing JSON, not the helper's return.
    const capture = async (rawValue) => {
      let payload = null;
      vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
        payload = JSON.parse(init.body);
        return new Response(
          'data: {"type":"response.output_text.delta","delta":"answer"}\n\n' +
            'data: {"type":"response.completed","response":{"status":"completed"}}\n\n' +
            'data: [DONE]\n\n',
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        );
      }));
      const env = { OPENCODE_GO_API_KEY: 'sk-opencode' };
      if (rawValue !== undefined) env.OPENCODE_RESPONSES_STORE = rawValue;
      for await (const _event of runStreamingChain([{ role: 'user', content: 'hi' }], {
        env,
        reasoning: { effort: 'medium', exclude: false },
        sleep: async () => {},
        clock: () => 0,
        jitter: () => 0
      })) {
        // drain the stream
      }
      return payload;
    };

    const disabled = ['false', '0', 'no', 'off'];
    for (const value of disabled) {
      const payload = await capture(value);
      expect(payload.store, `OPENCODE_RESPONSES_STORE=${value}`).toBe(false);
      expect(payload.include, `OPENCODE_RESPONSES_STORE=${value}`).toBeUndefined();
      expect(payload.reasoning).toEqual({ effort: 'medium', summary: 'auto' });
    }
    const enabled = ['true', '1', 'yes', 'on', 'bogus', '', undefined];
    for (const value of enabled) {
      const payload = await capture(value);
      expect(payload.store, `OPENCODE_RESPONSES_STORE=${value}`).toBe(true);
      expect(payload.include, `OPENCODE_RESPONSES_STORE=${value}`).toEqual([
        'reasoning.encrypted_content'
      ]);
    }
    // Hidden/internal reasoning never requests storage or carries reasoning
    // bytes, whatever the setting says.
    let hiddenPayload = null;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      hiddenPayload = JSON.parse(init.body);
      return okResponse('plain answer');
    }));
    await runProviderChain([{ role: 'user', content: 'hi' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode', OPENCODE_RESPONSES_STORE: 'true' },
      reasoning: { effort: 'medium', exclude: true },
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0
    });
    expect(hiddenPayload.store).toBeUndefined();
    expect(hiddenPayload.include).toBeUndefined();
    expect(hiddenPayload.reasoning).toEqual({ effort: 'medium' });
  });

  it('parses OPENCODE_RESPONSES_STORE-like values with a strict true/false contract', () => {
    // The positive setting must not be run through a "disabled" parser.
    expect(parseResponsesStore(undefined)).toBe(true);
    expect(parseResponsesStore(null)).toBe(true);
    expect(parseResponsesStore('')).toBe(true);
    expect(parseResponsesStore('true')).toBe(true);
    expect(parseResponsesStore('TRUE')).toBe(true);
    expect(parseResponsesStore('1')).toBe(true);
    expect(parseResponsesStore('yes')).toBe(true);
    expect(parseResponsesStore('on')).toBe(true);
    expect(parseResponsesStore('false')).toBe(false);
    expect(parseResponsesStore('FALSE')).toBe(false);
    expect(parseResponsesStore('0')).toBe(false);
    expect(parseResponsesStore('no')).toBe(false);
    expect(parseResponsesStore('off')).toBe(false);
    // Unknown values fall back to the documented default (enabled).
    expect(parseResponsesStore('bogus')).toBe(true);
    // A 400 is only a transport rejection when it names the fields.
    expect(rejectsReasoningTransport(400, 'Unknown parameter: include')).toBe(true);
    expect(rejectsReasoningTransport(400, 'store is not supported')).toBe(true);
    expect(rejectsReasoningTransport(400, 'bad model')).toBe(false);
    expect(rejectsReasoningTransport(500, 'store exploded')).toBe(false);
  });

  it('falls back through the reasoning transport ladder when the gateway rejects those fields', async () => {
    const payloads = [];
    const streamOk = () =>
      new Response(
        'data: {"type":"response.reasoning_summary_text.delta","delta":"thinking out loud"}\n\n' +
          'data: {"type":"response.output_text.delta","delta":"answer"}\n\n' +
          'data: {"type":"response.completed","response":{"status":"completed"}}\n\n' +
          'data: [DONE]\n\n',
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      payloads.push(JSON.parse(init.body));
      // Tier 1 (store: true + include): rejected naming `include`.
      if (payloads.length === 1) {
        return Response.json(
          { error: { message: 'Unknown parameter: include' } },
          { status: 400 }
        );
      }
      // Tier 2 (store: false): this gateway rejects any `store` field.
      if (payloads.length === 2) {
        return Response.json(
          { error: { message: 'Unknown parameter: store' } },
          { status: 400 }
        );
      }
      // Tier 3 (plain body): accepted.
      return streamOk();
    }));

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'hi' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      reasoning: { effort: 'medium', exclude: false },
      sleep: async () => {},
      clock: () => 0,
      jitter: () => 0
    })) {
      events.push(event);
    }

    // Every attempt kept the summary request; the transport fields stepped
    // down until the gateway accepted the call.
    expect(payloads).toHaveLength(3);
    expect(payloads[0].store).toBe(true);
    expect(payloads[0].include).toEqual(['reasoning.encrypted_content']);
    expect(payloads[1].store).toBe(false);
    expect(payloads[1].include).toEqual(['reasoning.encrypted_content']);
    expect(payloads[2].store).toBeUndefined();
    expect(payloads[2].include).toBeUndefined();
    for (const payload of payloads) {
      expect(payload.reasoning).toEqual({ effort: 'medium', summary: 'auto' });
    }
    const thinking = events.filter((e) => e.type === 'thinking');
    expect(thinking.map((e) => e.text).join('')).toContain('thinking out loud');
    const answer = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
    expect(answer).toBe('answer');
    expect(events.find((e) => e.type === 'error')).toBeUndefined();
  });

  it('streams reasoning segments delivered as done events or output items', async () => {
    const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      sse({ type: 'response.reasoning_summary_text.done', text: 'first thought. ' })
      + sse({
        type: 'response.output_item.done',
        item: {
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: 'second thought.' }],
        },
      })
      + sse({
        type: 'response.output_item.done',
        item: {
          type: 'reasoning',
          encrypted_content: 'ENCRYPTED-BLOB-MUST-NOT-LEAK',
        },
      })
      + sse({ type: 'response.output_text.delta', delta: 'answer' })
      + sse({ type: 'response.completed', response: { status: 'completed' } })
      + 'data: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    )));

    const events = [];
    for await (const event of streamChatEndpoint({
      endpoint: OPENCODE_URL,
      api: 'responses',
      key: 'sk-opencode',
      model: 'deepseek-v4.1-flash',
      label: 'opencode',
      messages: [{ role: 'user', content: 'hi' }],
      signal: null,
    })) {
      events.push(event);
    }

    const thinking = events.filter((e) => e.reasoning).map((e) => e.reasoning).join('');
    expect(thinking).toBe('first thought. second thought.');
    expect(thinking).not.toContain('ENCRYPTED');
    const answer = events.filter((e) => e.text).map((e) => e.text).join('');
    expect(answer).toBe('answer');
    expect(thinking).not.toContain('answer');
  });

  it('returns cancelled without calling the provider when the signal is already aborted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();

    const result = await runProviderChain([{ role: 'user', content: 'stop' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      signal: controller.signal
    });

    expect(result.status).toBe('cancelled');
    expect(result.taskId).toMatch(/^rt-[0-9a-f]{8}$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('emits a cancellation event without calling the provider when already aborted (streaming)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();

    const events = [];
    for await (const event of runStreamingChain([{ role: 'user', content: 'stop' }], {
      env: { OPENCODE_GO_API_KEY: 'sk-opencode' },
      signal: controller.signal
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'error', message: 'AI request cancelled.', status: 499 }
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
