// Durable task execution contract tests against the real Worker entrypoint.
//
// Proves the reported failure modes are fixed:
//   - POST /api/tasks with a Queue binding enqueues the task instead of
//     running it inside the HTTP invocation (an evicted isolate can no longer
//     kill the work, and a browser disconnect is not cancellation).
//   - The Queue consumer runs the task to a terminal state through the real
//     harness + D1 coordination store, and duplicate deliveries are no-ops.
//   - Provider retry schedules become queue redeliveries; cancelled tasks are
//     acked, never redelivered.
//   - A failed queue send does NOT silently downgrade to inline execution:
//     with D1 it persists a durable dispatch record and answers `deferred`
//     (the sweeper re-sends it); with no durable record it answers a
//     retryable 503. Inline execution only happens with an explicit
//     TASK_INLINE_FALLBACK=true.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import entryWorker from '../worker/entry.js';
import { AgentHarness } from '../packages/agent-core/harness/AgentHarness.js';
import { MemoryTaskStore } from '../packages/agent-core/persistence/TaskStore.js';
import { D1TaskStore } from '../packages/agent-core/persistence/D1TaskStore.js';
import { TASK_STATUSES } from '../packages/agent-core/harness/TaskState.js';
import { createSqliteD1 } from './helpers/sqliteD1.js';

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
      const keys = Array.from(map.keys()).filter((key) => key.startsWith(prefix));
      return { objects: keys.map((key) => ({ key })) };
    },
    map
  };
}

function createQueue() {
  return {
    sent: [],
    async send(body) {
      this.sent.push(JSON.parse(JSON.stringify(body)));
      return { id: `msg-${this.sent.length}` };
    }
  };
}

function fakeMessage(taskId, attempts = 1) {
  return {
    body: { taskId },
    attempts,
    acked: false,
    retries: [],
    ack() {
      this.acked = true;
    },
    retry(options = {}) {
      this.retries.push(options);
    }
  };
}

function environment(overrides = {}) {
  return {
    ASSETS: {
      async fetch() {
        return new Response('asset');
      }
    },
    ...overrides
  };
}

function fetchRequest(url, init = {}) {
  return new Request(url, {
    ...init,
    headers: { 'x-corez-user': 'alice', 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
}

function providerResponse(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function rateLimitedResponse(retryAfterSeconds = 60) {
  return new Response('provider busy', {
    status: 429,
    headers: { 'Content-Type': 'text/plain', 'retry-after': String(retryAfterSeconds) }
  });
}

// A D1 whose terminal task write can be failed on demand, so the window between
// "the provider succeeded" and "the task is completed" is reproducible: the
// write that records the completed task is exactly the one that fails.
function createFaultyD1(faults) {
  const d1 = createSqliteD1();
  return {
    __sqlite: d1.__sqlite,
    prepare(sql) {
      const inner = d1.prepare(sql);
      let values = [];
      return {
        bind(...args) {
          values = args;
          inner.bind(...args);
          return this;
        },
        async run() {
          if (faults(sql, values)) throw new Error('injected storage failure');
          return inner.run();
        },
        async all() {
          return inner.all();
        },
        async first() {
          return inner.first();
        }
      };
    },
    batch(statements) {
      return d1.batch(statements);
    }
  };
}

// The terminal task write: an UPDATE of harness_tasks carrying a document whose
// status is already completed. Bind order is (user_id, session_id, status, doc).
function isCompletedTaskWrite(sql, values) {
  if (!/^\s*UPDATE\s+harness_tasks/i.test(sql)) return false;
  const doc = values?.[3];
  if (typeof doc !== 'string') return false;
  try {
    return JSON.parse(doc).status === TASK_STATUSES.COMPLETED;
  } catch {
    return false;
  }
}

async function postTask(env, prompt, ctx = undefined) {
  return entryWorker.fetch(
    fetchRequest('https://corez.test/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt, sessionId: 'durable-session' })
    }),
    env,
    ctx
  );
}

async function getTask(env, taskId) {
  const response = await entryWorker.fetch(fetchRequest(`https://corez.test/api/tasks/${taskId}`), env);
  return response.json();
}

describe('durable task execution', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('enqueues new tasks instead of executing them in the HTTP invocation', async () => {
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      DB: createSqliteD1(),
      TASKS_QUEUE: createQueue(),
      OPENCODE_GO_API_KEY: 'test-key'
    });
    let providerCalls = 0;
    globalThis.fetch = async () => {
      providerCalls += 1;
      return providerResponse('durable answer');
    };

    const response = await postTask(env, 'durable hello');
    expect(response.status).toBe(202);
    const task = await response.json();

    // The HTTP invocation neither ran the model nor owns the work: the task
    // was persisted to D1 and handed to the queue.
    expect(providerCalls).toBe(0);
    expect(env.TASKS_QUEUE.sent).toEqual([{ taskId: task.taskId }]);
    const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM harness_tasks').first();
    expect(Number(row.count)).toBe(1);
    expect((await getTask(env, task.taskId)).status).toBe(TASK_STATUSES.RUNNING);

    // The consumer invocation runs it to completion.
    const message = fakeMessage(task.taskId);
    await entryWorker.queue({ messages: [message] }, env);
    expect(message.acked).toBe(true);
    expect(message.retries).toEqual([]);
    expect(providerCalls).toBe(1);

    const completed = await getTask(env, task.taskId);
    expect(completed.status).toBe(TASK_STATUSES.COMPLETED);
    expect(completed.result).toContain('durable answer');
    expect(completed.userId).toBe('alice');
  });

  it('treats a duplicate queue delivery as a no-op', async () => {
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      DB: createSqliteD1(),
      TASKS_QUEUE: createQueue(),
      OPENCODE_GO_API_KEY: 'test-key'
    });
    let providerCalls = 0;
    globalThis.fetch = async () => {
      providerCalls += 1;
      return providerResponse('only once');
    };

    const { taskId } = await (await postTask(env, 'deliver me twice')).json();
    const first = fakeMessage(taskId);
    await entryWorker.queue({ messages: [first] }, env);
    expect(providerCalls).toBe(1);

    // At-least-once delivery: the same task arrives again. It must not run
    // the model again or append a second terminal event.
    const second = fakeMessage(taskId, 2);
    await entryWorker.queue({ messages: [second] }, env);
    expect(second.acked).toBe(true);
    expect(second.retries).toEqual([]);
    expect(providerCalls).toBe(1);

    const store = new D1TaskStore({ db: env.DB, bucket: env.ASSET_BUCKET });
    const completions = (await store.listEvents(taskId)).filter((event) => event.type === 'task.completed');
    expect(completions).toHaveLength(1);
    expect((await getTask(env, taskId)).status).toBe(TASK_STATUSES.COMPLETED);
  });

  it('acks cancelled tasks without executing them again', async () => {
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      DB: createSqliteD1(),
      TASKS_QUEUE: createQueue(),
      OPENCODE_GO_API_KEY: 'test-key'
    });
    let providerCalls = 0;
    globalThis.fetch = async () => {
      providerCalls += 1;
      return providerResponse('should never run');
    };

    const { taskId } = await (await postTask(env, 'cancel before the consumer runs')).json();
    const cancel = await entryWorker.fetch(
      fetchRequest(`https://corez.test/api/tasks/${taskId}/cancel`, { method: 'POST' }),
      env
    );
    expect(cancel.status).toBe(200);
    expect((await cancel.json()).status).toBe(TASK_STATUSES.CANCELLED);

    const message = fakeMessage(taskId);
    await entryWorker.queue({ messages: [message] }, env);
    expect(message.acked).toBe(true);
    expect(message.retries).toEqual([]);
    expect(providerCalls).toBe(0);
    expect((await getTask(env, taskId)).status).toBe(TASK_STATUSES.CANCELLED);
  });

  it('schedules provider backoff as a queue redelivery and resumes on recovery', async () => {
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      DB: createSqliteD1(),
      TASKS_QUEUE: createQueue(),
      OPENCODE_GO_API_KEY: 'test-key'
    });
    globalThis.fetch = async () => rateLimitedResponse(60);

    const { taskId } = await (await postTask(env, 'survive provider throttling')).json();
    const throttled = fakeMessage(taskId);
    await entryWorker.queue({ messages: [throttled] }, env);
    expect(throttled.acked).toBe(false);
    expect(throttled.retries).toHaveLength(1);
    expect(throttled.retries[0].delaySeconds).toBeGreaterThanOrEqual(60);

    const pending = await getTask(env, taskId);
    expect(pending.status).toBe(TASK_STATUSES.RUNNING);
    expect(pending.retryState.provider).toBe('opencode-go');

    // Provider recovered: the next delivery completes the same task.
    globalThis.fetch = async () => providerResponse('recovered answer');
    const retry = fakeMessage(taskId, 2);
    await entryWorker.queue({ messages: [retry] }, env);
    expect(retry.acked).toBe(true);
    expect((await getTask(env, taskId)).status).toBe(TASK_STATUSES.COMPLETED);
  });

  it('fails the stored task honestly when the delivery budget is spent', async () => {
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      DB: createSqliteD1(),
      TASKS_QUEUE: createQueue(),
      TASKS_QUEUE_MAX_ATTEMPTS: '3',
      OPENCODE_GO_API_KEY: 'test-key'
    });
    globalThis.fetch = async () => rateLimitedResponse(60);

    const { taskId } = await (await postTask(env, 'exhaust the retries')).json();
    const exhausted = fakeMessage(taskId, 3);
    await entryWorker.queue({ messages: [exhausted] }, env);
    expect(exhausted.acked).toBe(true);
    expect(exhausted.retries).toEqual([]);

    const failed = await getTask(env, taskId);
    expect(failed.status).toBe(TASK_STATUSES.FAILED);
    expect(failed.error).toMatch(/retries exhausted/i);

    const store = new D1TaskStore({ db: env.DB, bucket: env.ASSET_BUCKET });
    const failureEvents = (await store.listEvents(taskId)).filter((event) => event.type === 'task.failed');
    expect(failureEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('does not ack a completed task until its result is durable, then recovers it without a second generation', async () => {
    let failTerminalWrite = true;
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      DB: createFaultyD1((sql, values) => failTerminalWrite && isCompletedTaskWrite(sql, values)),
      TASKS_QUEUE: createQueue(),
      OPENCODE_GO_API_KEY: 'test-key'
    });
    let providerCalls = 0;
    globalThis.fetch = async () => {
      providerCalls += 1;
      return providerResponse('durable answer');
    };

    const { taskId } = await (await postTask(env, 'store the result before acknowledging')).json();

    // The provider succeeds but the terminal write fails. The message must not
    // be acknowledged: acknowledging work whose outcome was never stored is how
    // a finished task is lost.
    const first = fakeMessage(taskId);
    await entryWorker.queue({ messages: [first] }, env);
    expect(providerCalls).toBe(1);
    expect(first.acked).toBe(false);
    expect(first.retries).toHaveLength(1);

    // The generated answer survived the failure: it is staged on the document,
    // while the stored status deliberately stays non-terminal.
    const store = new D1TaskStore({ db: env.DB, bucket: env.ASSET_BUCKET });
    const staged = await store.getTask(taskId);
    expect(staged.status).toBe(TASK_STATUSES.RUNNING);
    expect(staged.pendingCompletion.result).toBe('durable answer');

    // Storage recovered: the redelivery completes the task from the stage. No
    // second provider call means no second charge for the same generation.
    failTerminalWrite = false;
    const second = fakeMessage(taskId, 2);
    await entryWorker.queue({ messages: [second] }, env);
    expect(second.acked).toBe(true);
    expect(providerCalls).toBe(1);

    const finished = await getTask(env, taskId);
    expect(finished.status).toBe(TASK_STATUSES.COMPLETED);
    expect(finished.result).toBe('durable answer');
    expect((await store.getTask(taskId)).pendingCompletion ?? null).toBe(null);
  });

  it('re-dispatches resumed tasks through the queue', async () => {
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      DB: createSqliteD1(),
      TASKS_QUEUE: createQueue(),
      OPENCODE_GO_API_KEY: 'test-key'
    });
    globalThis.fetch = async () => providerResponse('resumed answer');

    const { taskId } = await (await postTask(env, 'resume me')).json();
    expect(env.TASKS_QUEUE.sent).toHaveLength(1);

    const resume = await entryWorker.fetch(
      fetchRequest(`https://corez.test/api/tasks/${taskId}/resume`, { method: 'POST' }),
      env
    );
    expect(resume.status).toBe(200);
    expect(env.TASKS_QUEUE.sent).toHaveLength(2);
    expect(env.TASKS_QUEUE.sent[1]).toEqual({ taskId });

    const message = fakeMessage(taskId);
    await entryWorker.queue({ messages: [message] }, env);
    expect(message.acked).toBe(true);
    expect((await getTask(env, taskId)).status).toBe(TASK_STATUSES.COMPLETED);
  });

  it('rejects dispatch when neither the queue nor a durable record is available', async () => {
    // R2-only deployment (no D1 outbox) with no queue binding and no explicit
    // inline opt-in: the API must fail retryably instead of executing inside
    // the HTTP invocation, so it never promises durability it cannot keep.
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      OPENCODE_GO_API_KEY: 'test-key'
    });
    let providerCalls = 0;
    globalThis.fetch = async () => {
      providerCalls += 1;
      return providerResponse('must not run');
    };

    const waits = [];
    const ctx = { waitUntil: (promise) => waits.push(promise) };
    const response = await postTask(env, 'no durable dispatch', ctx);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).not.toHaveProperty('taskId');
    expect(body.retryable).toBe(true);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(providerCalls).toBe(0);
    expect(waits).toHaveLength(0);
  });

  it('records a durable dispatch and reports deferred when the queue send fails', async () => {
    // The regression: a failed queue submission must not silently downgrade
    // to inline execution. With D1 present the dispatch intent is persisted
    // before the send, so the accepted task has a recoverable record.
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      DB: createSqliteD1(),
      TASKS_QUEUE: {
        async send() {
          throw new Error('queue unavailable');
        }
      },
      TASK_DISPATCH_RETRY_DELAY_SECONDS: '1',
      OPENCODE_GO_API_KEY: 'test-key'
    });
    let providerCalls = 0;
    globalThis.fetch = async () => {
      providerCalls += 1;
      return providerResponse('deferred answer');
    };

    const waits = [];
    const ctx = { waitUntil: (promise) => waits.push(promise) };
    const response = await postTask(env, 'queue down', ctx);
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.taskId).toBeTruthy();
    expect(body.dispatch).toBe('deferred');
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    // Nothing ran inline: the HTTP invocation does not own the work.
    expect(providerCalls).toBe(0);
    expect(waits).toHaveLength(0);

    // The record is durable: a later sweep re-sends it through the queue.
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM harness_task_dispatches WHERE task_id = ?'
    ).bind(body.taskId).first();
    expect(Number(row.count)).toBe(1);

    // Queue recovered: the sweep re-sends, the record is cleared, and the
    // consumer completes the task through the normal path.
    const queue = createQueue();
    env.TASKS_QUEUE = queue;
    await entryWorker.scheduled({}, env, {});
    expect(queue.sent).toEqual([{ taskId: body.taskId }]);
    const cleared = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM harness_task_dispatches WHERE task_id = ?'
    ).bind(body.taskId).first();
    expect(Number(cleared.count)).toBe(0);

    const message = fakeMessage(body.taskId);
    await entryWorker.queue({ messages: [message] }, env);
    expect(message.acked).toBe(true);
    expect(providerCalls).toBe(1);
    expect((await getTask(env, body.taskId)).status).toBe(TASK_STATUSES.COMPLETED);
  });

  it('runs inline only with an explicit TASK_INLINE_FALLBACK opt-in', async () => {
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      TASK_INLINE_FALLBACK: 'true',
      OPENCODE_GO_API_KEY: 'test-key'
    });
    globalThis.fetch = async () => providerResponse('inline answer');

    const waits = [];
    const ctx = { waitUntil: (promise) => waits.push(promise) };
    const response = await postTask(env, 'inline fallback', ctx);
    expect(response.status).toBe(202);
    expect(waits).toHaveLength(1);

    await waits[0];
    const { taskId } = await response.json();
    expect((await getTask(env, taskId)).status).toBe(TASK_STATUSES.COMPLETED);
  });

  it('uses the explicit inline fallback on a failed send only when opted in', async () => {
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      DB: createSqliteD1(),
      TASK_INLINE_FALLBACK: 'true',
      TASKS_QUEUE: {
        async send() {
          throw new Error('queue unavailable');
        }
      },
      OPENCODE_GO_API_KEY: 'test-key'
    });
    globalThis.fetch = async () => providerResponse('fallback answer');

    const waits = [];
    const ctx = { waitUntil: (promise) => waits.push(promise) };
    const response = await postTask(env, 'queue down', ctx);
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.dispatch).toBe('inline');
    expect(waits).toHaveLength(1);

    await waits[0];
    expect((await getTask(env, body.taskId)).status).toBe(TASK_STATUSES.COMPLETED);

    // The explicit fallback owns the work now: the pre-send dispatch record
    // must not be left behind for the sweeper to re-dispatch it.
    const leftover = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM harness_task_dispatches'
    ).first();
    expect(Number(leftover.count)).toBe(0);
  });

  it('persists a deferred task without executing until a runner calls executeTask', async () => {
    const store = new MemoryTaskStore();
    let calls = 0;
    const harness = new AgentHarness({
      taskStore: store,
      providerChain: {
        async generate() {
          calls += 1;
          return { status: 'completed', content: 'once', toolCalls: [], provider: 'test', model: 'm' };
        }
      },
      defaultModel: 'm',
      maxRetryWaitMs: 0
    });

    const task = await harness.startTask({
      userId: 'u1',
      sessionId: 's1',
      prompt: 'deferred work',
      mode: 'conversation',
      deferExecution: true
    });
    expect(task.status).toBe(TASK_STATUSES.RUNNING);
    expect((await store.getTask(task.taskId)).currentStep).toBe(0);
    expect(calls).toBe(0);

    const first = await harness.executeTask(task.taskId);
    expect(first.outcome).toBe('terminal');
    expect(first.executed).toBe(true);
    expect(calls).toBe(1);

    // Idempotent: a redelivered execution does not run the model again.
    const second = await harness.executeTask(task.taskId);
    expect(second.outcome).toBe('terminal');
    expect(second.executed).toBe(false);
    expect(calls).toBe(1);

    const missing = await harness.executeTask('task_missing');
    expect(missing.outcome).toBe('not-found');
  });

  it('reports lease-held instead of running a duplicate concurrent execution', async () => {
    const store = new MemoryTaskStore();
    let releaseStarted;
    const started = new Promise((resolve) => { releaseStarted = resolve; });
    let calls = 0;
    const harness = new AgentHarness({
      taskStore: store,
      providerChain: {
        async generate({ signal }) {
          calls += 1;
          releaseStarted();
          return new Promise((resolve) => {
            const timer = setTimeout(
              () => resolve({ status: 'completed', content: 'late', toolCalls: [], provider: 't', model: 'm' }),
              10_000
            );
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              resolve({ status: 'cancelled', error: 'aborted' });
            }, { once: true });
          });
        }
      },
      defaultModel: 'm',
      maxRetryWaitMs: 0
    });

    const task = await harness.startTask({
      userId: 'u1',
      sessionId: 's1',
      prompt: 'race',
      mode: 'conversation',
      deferExecution: true
    });

    const running = harness.executeTask(task.taskId);
    await started;
    const blocked = await harness.executeTask(task.taskId);
    expect(blocked.outcome).toBe('lease-held');
    expect(blocked.executed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(calls).toBe(1);

    await harness.cancelTask(task.taskId, 'u1');
    const finished = await running;
    expect(finished.outcome).toBe('cancelled');
  });
});
