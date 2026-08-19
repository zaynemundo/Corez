import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderChain } from '../packages/agent-core/providers/providerChain.js';
import { RetryScheduler } from '../packages/agent-core/providers/retryScheduler.js';
import {
  OpenCodeGoAdapter,
  DeepSeekAdapter,
  OpenRouterAdapter,
  classifyProviderFailure,
  parseRetryAfter
} from '../packages/agent-core/providers/adapters.js';

function memoryScheduler() {
  const state = new Map();
  return {
    scheduler: new RetryScheduler({
      load: async (taskId) => state.get(taskId) ?? null,
      save: async (taskId, value) => {
        if (value === null) state.delete(taskId);
        else state.set(taskId, value);
      }
    }),
    state
  };
}

function makeAdapters({ opencode, deepseek, openrouter }) {
  return [
    new OpenCodeGoAdapter({ opencodeApiKey: opencode ?? null, ...(opencode ? { endpoint: 'https://opencode.test/v1' } : {}) }),
    new DeepSeekAdapter({ deepseekApiKey: deepseek ?? null, ...(deepseek ? { endpoint: 'https://deepseek.test/v1' } : {}) }),
    new OpenRouterAdapter({ openrouterApiKey: openrouter ?? null, ...(openrouter ? { endpoint: 'https://openrouter.test/v1' } : {}) })
  ];
}

function completionResponse(content, toolCalls) {
  return new Response(JSON.stringify({
    choices: [{ message: { content, tool_calls: toolCalls ?? [] } }]
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('ProviderChain', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({}), { status: 500 });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('uses OpenCode Go -> DeepSeek -> OpenRouter order with the same messages and tools', async () => {
    const calls = [];
    const opencode = new OpenCodeGoAdapter({
      opencodeApiKey: 'oc-key',
      endpoint: 'https://opencode.test/v1'
    });
    const deepseek = new DeepSeekAdapter({
      deepseekApiKey: 'ds-key',
      endpoint: 'https://deepseek.test/v1'
    });
    const openrouter = new OpenRouterAdapter({
      openrouterApiKey: 'or-key',
      endpoint: 'https://openrouter.test/v1'
    });

    const chain = new ProviderChain({
      adapters: [opencode, deepseek, openrouter],
      waitBudgetMs: 5
    });

    fetchSpy.mockImplementation(async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body, auth: init.headers.Authorization });
      if (String(url).includes('opencode.test')) return completionResponse('from opencode');
      return completionResponse('unexpected');
    });

    const messages = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' }
    ];
    const tools = [{ name: 'read_file', description: 'Read a file' }];

    const result = await chain.generate({ model: 'muse-spark-1.2', messages, tools });

    expect(result.status).toBe('completed');
    expect(result.content).toBe('from opencode');
    expect(result.provider).toBe('opencode-go');
    expect(calls).toHaveLength(1);
    // Same messages and tools are preserved verbatim on every provider.
    expect(calls[0].body.messages).toEqual(messages);
    expect(calls[0].body.tools).toEqual(tools);
    // Each provider only ever sees its own key.
    expect(calls[0].auth).toBe('Bearer oc-key');
  });

  it('falls back immediately when the preferred provider fails transiently and persists a retry schedule', async () => {
    const { scheduler, state } = memoryScheduler();
    const chain = new ProviderChain({
      adapters: makeAdapters({ opencode: 'oc', deepseek: 'ds', openrouter: 'or' }),
      retryScheduler: scheduler,
      waitBudgetMs: 5
    });

    const events = [];
    chain.onEvent = (e) => events.push(e);

    fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('opencode.test')) {
        return new Response('gateway down', { status: 503, headers: { 'Retry-After': '2' } });
      }
      return completionResponse('deepseek answer');
    });

    const start = Date.now();
    const result = await chain.generate({ taskId: 'task-1', messages: [{ role: 'user', content: 'x' }] });
    const elapsed = Date.now() - start;

    expect(result.status).toBe('completed');
    expect(result.content).toBe('deepseek answer');
    expect(result.provider).toBe('deepseek');
    expect(elapsed).toBeLessThan(500); // fell back immediately, no backoff wait
    // A schedule for opencode-go was persisted, honoring Retry-After: 2s.
    expect(state.get('task-1')).toBeDefined();
    expect(state.get('task-1').provider).toBe('opencode-go');
    expect(state.get('task-1').nextRetryAt).toBeGreaterThanOrEqual(Date.now() + 1500);
    expect(events.some((e) => e.type === 'provider.retry_scheduled' && e.provider === 'opencode-go')).toBe(true);
    expect(events.some((e) => e.type === 'provider.fallback' && e.from === 'opencode-go' && e.to === 'deepseek')).toBe(true);
  });

  it('resumes a persisted retry schedule when it is due', async () => {
    const { scheduler, state } = memoryScheduler();
    // Simulate a schedule persisted >60s ago that is now due.
    state.set('task-due', {
      provider: 'opencode-go',
      attempt: 5,
      nextRetryAt: Date.now() - 1000,
      lastError: 'previous 503'
    });

    const chain = new ProviderChain({
      adapters: makeAdapters({ opencode: 'oc', deepseek: 'ds' }),
      retryScheduler: scheduler,
      waitBudgetMs: 5
    });

    fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('opencode.test')) return completionResponse('recovered');
      return completionResponse('deepseek');
    });

    const result = await chain.generate({ taskId: 'task-due', messages: [{ role: 'user', content: 'x' }] });

    expect(result.status).toBe('completed');
    expect(result.provider).toBe('opencode-go');
    // Success clears the persisted schedule.
    expect(state.get('task-due')).toBeUndefined();
  });

  it('returns retry-scheduled when the only provider is still within its Retry-After window', async () => {
    const { scheduler, state } = memoryScheduler();
    state.set('task-wait', {
      provider: 'opencode-go',
      attempt: 1,
      nextRetryAt: Date.now() + 61_000,
      lastError: 'rate limited'
    });

    const chain = new ProviderChain({
      adapters: makeAdapters({ opencode: 'oc' }),
      retryScheduler: scheduler,
      waitBudgetMs: 5
    });

    const result = await chain.generate({ taskId: 'task-wait', messages: [{ role: 'user', content: 'x' }] });

    expect(result.status).toBe('retry-scheduled');
    expect(result.provider).toBe('opencode-go');
    expect(result.retryAfterSeconds).toBeGreaterThan(55);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('recovers after more than three transient failures via the persisted schedule', async () => {
    const { scheduler, state } = memoryScheduler();
    const chain = new ProviderChain({
      adapters: makeAdapters({ opencode: 'oc' }),
      retryScheduler: scheduler,
      waitBudgetMs: 5
    });

    // Simulate four previously persisted failures; each grew the attempt count.
    state.set('task-many', {
      provider: 'opencode-go',
      attempt: 4,
      nextRetryAt: Date.now() - 1,
      lastError: '503'
    });

    fetchSpy.mockImplementation(async () => completionResponse('finally up'));
    const result = await chain.generate({ taskId: 'task-many', messages: [{ role: 'user', content: 'x' }] });

    expect(result.status).toBe('completed');
    expect(result.provider).toBe('opencode-go');
  });

  it('honors Retry-After from a 429 on the final provider in stateless mode', async () => {
    const chain = new ProviderChain({
      adapters: makeAdapters({ opencode: 'oc' }),
      waitBudgetMs: 3000
    });

    const seenBodies = [];
    fetchSpy.mockImplementation(async (url, init) => {
      seenBodies.push(JSON.parse(init.body));
      return new Response('slow down', { status: 429, headers: { 'Retry-After': '0.5' } });
    });

    const start = Date.now();
    const result = await chain.generate({ messages: [{ role: 'user', content: 'x' }] });
    const elapsed = Date.now() - start;

    expect(result.status).toBe('failed');
    expect(seenBodies.length).toBeGreaterThanOrEqual(2); // retried at least once
    expect(elapsed).toBeGreaterThanOrEqual(450); // honored the 0.5s Retry-After
    // No max_tokens ever sent.
    for (const body of seenBodies) {
      expect(body.max_tokens).toBeUndefined();
      expect(body.max_completion_tokens).toBeUndefined();
    }
  });

  it('does not retry a permanent 401 or 400', async () => {
    const chain = new ProviderChain({
      adapters: makeAdapters({ opencode: 'oc' }),
      waitBudgetMs: 8000
    });

    let calls = 0;
    fetchSpy.mockImplementation(async () => {
      calls += 1;
      return new Response('invalid key', { status: 401 });
    });

    const result = await chain.generate({ messages: [{ role: 'user', content: 'x' }] });
    expect(result.status).toBe('failed');
    expect(calls).toBe(1);
    expect(result.error).toContain('permanently');

    calls = 0;
    fetchSpy.mockImplementation(async () => {
      calls += 1;
      return new Response('bad request', { status: 400 });
    });
    const result400 = await chain.generate({ messages: [{ role: 'user', content: 'x' }] });
    expect(result400.status).toBe('failed');
    expect(calls).toBe(1);
  });

  it('cancels during backoff in stateless mode', async () => {
    const chain = new ProviderChain({
      adapters: makeAdapters({ opencode: 'oc' }),
      waitBudgetMs: 60_000,
      baseBackoffMs: 5000
    });

    fetchSpy.mockImplementation(async () => new Response('down', { status: 503 }));

    const controller = new AbortController();
    const promise = chain.generate({
      messages: [{ role: 'user', content: 'x' }],
      signal: controller.signal
    });

    await new Promise((r) => setTimeout(r, 50));
    controller.abort();

    const result = await promise;
    expect(result.status).toBe('cancelled');
  });

  it('does not claim resumability when the retry schedule cannot be persisted', async () => {
    const failingScheduler = new RetryScheduler({
      load: async () => null,
      save: async () => {
        throw new Error('storage unavailable');
      }
    });

    const chain = new ProviderChain({
      adapters: makeAdapters({ opencode: 'oc' }),
      retryScheduler: failingScheduler,
      waitBudgetMs: 5
    });

    fetchSpy.mockImplementation(async () => new Response('down', { status: 503 }));

    const result = await chain.generate({ taskId: 'task-storage-fail', messages: [{ role: 'user', content: 'x' }] });

    expect(result.status).toBe('failed');
    expect(result.resumable).toBe(false);
    expect(result.retryAfterSeconds).toBeNull();
  });

  it('returns an honest offline failure when no provider is configured', async () => {
    const chain = new ProviderChain({
      adapters: makeAdapters({}),
      waitBudgetMs: 5
    });

    const result = await chain.generate({ messages: [{ role: 'user', content: 'x' }] });

    expect(result.status).toBe('failed');
    expect(result.offline).toBe(true);
    expect(result.toolCalls).toEqual([]);
    expect(result.error).toContain('No AI provider is configured');
  });

  it('preserves assistant tool-call ids and tool-result messages across fallback', async () => {
    const opencode = new OpenCodeGoAdapter({ opencodeApiKey: 'oc', endpoint: 'https://opencode.test/v1' });
    const openrouter = new OpenRouterAdapter({ openrouterApiKey: 'or', endpoint: 'https://openrouter.test/v1' });

    const chain = new ProviderChain({
      adapters: [opencode, openrouter],
      waitBudgetMs: 5
    });

    const toolMessages = [
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_abc123', type: 'function', function: { name: 'read_file', arguments: '{"filePath":"a.js"}' } }] },
      { role: 'tool', tool_call_id: 'call_abc123', content: '{"content":"file body"}' }
    ];

    let openrouterBody = null;
    fetchSpy.mockImplementation(async (url, init) => {
      const body = JSON.parse(init.body);
      if (String(url).includes('opencode.test')) return new Response('down', { status: 502 });
      openrouterBody = body;
      return completionResponse('synthesized');
    });

    const result = await chain.generate({
      model: 'muse-spark-1.2',
      messages: [...toolMessages, { role: 'user', content: 'continue' }]
    });

    expect(result.status).toBe('completed');
    expect(result.provider).toBe('openrouter');
    // The exact assistant tool-call id and tool result survived the fallback.
    const assistant = openrouterBody.messages.find((m) => m.tool_calls);
    expect(assistant.tool_calls[0].id).toBe('call_abc123');
    const toolResult = openrouterBody.messages.find((m) => m.role === 'tool');
    expect(toolResult.tool_call_id).toBe('call_abc123');
    expect(toolResult.content).toBe('{"content":"file body"}');
  });
});

describe('provider failure helpers', () => {
  it('classifies statuses correctly', () => {
    expect(classifyProviderFailure(400)).toBe('permanent');
    expect(classifyProviderFailure(401)).toBe('permanent');
    expect(classifyProviderFailure(403)).toBe('permanent');
    expect(classifyProviderFailure(404)).toBe('permanent');
    expect(classifyProviderFailure(408)).toBe('transient');
    expect(classifyProviderFailure(409)).toBe('transient');
    expect(classifyProviderFailure(429)).toBe('transient');
    expect(classifyProviderFailure(500)).toBe('transient');
    expect(classifyProviderFailure(502)).toBe('transient');
    expect(classifyProviderFailure(503)).toBe('transient');
    expect(classifyProviderFailure(504)).toBe('transient');
    expect(classifyProviderFailure(null)).toBe('transient');
  });

  it('parses Retry-After seconds and dates', () => {
    expect(parseRetryAfter('5')).toBe(5);
    expect(parseRetryAfter(3)).toBe(3);
    const future = new Date(Date.now() + 10_000).toUTCString();
    const parsed = parseRetryAfter(future);
    expect(parsed).toBeGreaterThan(8);
    expect(parseRetryAfter('garbage')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});
