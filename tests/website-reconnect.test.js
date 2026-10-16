import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import worker from '../worker/entry.js';
import { R2TaskStore } from '../packages/agent-core/persistence/R2TaskStore.js';

function memoryBucket({ failGets = 0, failGet = null } = {}) {
  const map = new Map();
  let getFailures = failGets;
  let getFailure = failGet;
  return {
    /** Fail every read whose key matches the predicate (until reset). */
    setFailGet(predicate) {
      getFailure = predicate;
    },
    async get(key) {
      if (getFailure && getFailure(key)) {
        throw new Error('simulated R2 read failure');
      }
      if (getFailures > 0) {
        getFailures -= 1;
        throw new Error(`simulated R2 read failure (${getFailures} left)`);
      }
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

function fetchRequest(url, init = {}) {
  return new Request(url, {
    ...init,
    headers: { 'x-corez-user': 'alice', 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
}

async function readStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

// Reads a response for a bounded time and returns exactly what the client saw.
// A stream that stays open (the disclosure behavior this suite guards against)
// is aborted at the deadline, so leaked bytes surface in the assertion instead
// of wedging the test until the harness timeout.
async function collectWithin(env, request, timeoutMs = 1500) {
  const controller = new AbortController();
  const bounded = new Request(request, { signal: controller.signal });
  const response = await worker.fetch(bounded, env);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const timer = setTimeout(() => {
    controller.abort();
    reader.cancel().catch(() => {});
  }, timeoutMs);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    // Deadline abort or cancel: keep the bytes already collected.
  } finally {
    clearTimeout(timer);
  }
  return { status: response.status, body: text };
}

function parseSse(text) {
  const events = [];
  let current = {};
  for (const line of text.split('\n')) {
    if (line === '') {
      if (current.id) events.push(current);
      current = {};
      continue;
    }
    const [field, ...rest] = line.split(': ');
    const value = rest.join(': ');
    if (field === 'id') current.id = Number(value);
    else if (field === 'event') current.type = value;
    else if (field === 'data') current.data = JSON.parse(value);
  }
  return events;
}

describe('website task API + SSE reconnection', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function startTask(env, prompt = 'hello task') {
    globalThis.fetch = async (url, init) => {
      const payload = JSON.parse(init.body);
      const content = (payload.input || payload.messages)[(payload.input || payload.messages).length - 1].content === prompt
        ? `answer to ${prompt}`
        : 'continuation answer';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };
    const response = await worker.fetch(fetchRequest('https://corez.test/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt, sessionId: 'site-session' })
    }), env);
    expect(response.status).toBe(202);
    const body = await response.json();
    return body.taskId;
  }

  it('starts a task, streams events over SSE, and supports Last-Event-ID reconnect', async () => {
    // R2-only test deployment: no queue binding, so inline execution must be
    // opted in explicitly (taskRunner's TASK_INLINE_FALLBACK).
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      OPENCODE_GO_API_KEY: 'test-key',
      TASK_INLINE_FALLBACK: 'true'
    });
    const taskId = await startTask(env, 'build me something');

    // First connection: wait for the terminal state and collect events.
    const first = await worker.fetch(fetchRequest(`https://corez.test/api/tasks/${taskId}/events`), env);
    expect(first.status).toBe(200);
    const firstEvents = parseSse(await readStream(first));
    const firstTypes = firstEvents.map((e) => e.type);
    expect(firstTypes).toContain('task.started');
    expect(firstTypes).toContain('task.completed');

    const completed = firstEvents.find((e) => e.type === 'task.completed');
    expect(completed.data.response).toContain('build me something');

    // Ownership: another user cannot read the stream.
    const forbidden = await worker.fetch(new Request(`https://corez.test/api/tasks/${taskId}/events`, {
      headers: { 'x-corez-user': 'bob' }
    }), env);
    expect(forbidden.status).toBe(403);

    // Reconnect with Last-Event-ID: only events after the last seen id flow.
    const lastId = firstEvents[firstEvents.length - 1].id;
    const second = await worker.fetch(fetchRequest(`https://corez.test/api/tasks/${taskId}/events`, {
      headers: { 'x-corez-user': 'alice', 'Last-Event-ID': String(lastId) }
    }), env);
    const secondEvents = parseSse(await readStream(second));
    expect(secondEvents.every((e) => e.id > lastId)).toBe(true);

    // GET /api/tasks/:id returns the terminal state.
    const getResponse = await worker.fetch(fetchRequest(`https://corez.test/api/tasks/${taskId}`), env);
    expect(getResponse.status).toBe(200);
    const task = await getResponse.json();
    expect(task.status).toBe('completed');
    expect(task.userId).toBe('alice');

    // Artifacts endpoint lists evidence.
    const artifacts = await worker.fetch(fetchRequest(`https://corez.test/api/tasks/${taskId}/artifacts`), env);
    expect(artifacts.status).toBe(200);
  });

  it('keeps recovering through more than three transient read failures', async () => {
    const env = environment({
      ASSET_BUCKET: memoryBucket({ failGets: 6 }), // six transient failures
      OPENCODE_GO_API_KEY: 'test-key',
      TASK_INLINE_FALLBACK: 'true'
    });
    const taskId = await startTask(env, 'recover from network failures');

    const response = await worker.fetch(fetchRequest(`https://corez.test/api/tasks/${taskId}/events`), env);
    const events = parseSse(await readStream(response));
    const completed = events.find((e) => e.type === 'task.completed');
    expect(completed).toBeDefined();
    expect(completed.data.response).toContain('recover from network failures');
  });

  // Security regression: ownership is a precondition of the stream. When the
  // task metadata cannot be read, ownership is unverifiable and the event log
  // must not be disclosed — even though it is perfectly readable.
  it('delivers zero task events when metadata is unreadable but the event log is readable', async () => {
    const bucket = memoryBucket();
    const env = environment({ ASSET_BUCKET: bucket, OPENCODE_GO_API_KEY: 'test-key' });
    const store = new R2TaskStore({ bucket });
    const taskId = 'task_unreadable_metadata';
    const secret = 'EVENT-LOG-PAYLOAD-ALICE-ONLY';
    await store.createTask({
      taskId,
      userId: 'alice',
      sessionId: 's',
      workspaceId: null,
      status: 'running',
      prompt: 'owner only',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await store.appendEvent(taskId, { type: 'task.started', taskId });
    await store.appendEvent(taskId, { type: 'task.completed', taskId, response: secret });

    // The event log stays readable; every task-metadata read fails, in both
    // the per-user folder and the legacy flat location (but never the
    // event log itself).
    bucket.setFailGet((key) => key.includes(taskId) && !key.includes('.events'));

    const owner = await collectWithin(env, fetchRequest(`https://corez.test/api/tasks/${taskId}/events`));
    expect(owner.status).toBe(503);
    expect(owner.body).not.toContain(secret);
    expect(owner.body).not.toContain('task.started');

    // Another account must never receive the log either.
    const stranger = await collectWithin(env, new Request(`https://corez.test/api/tasks/${taskId}/events`, {
      headers: { 'x-corez-user': 'bob' }
    }));
    expect(stranger.status).toBe(503);
    expect(stranger.body).not.toContain(secret);
    expect(stranger.body).not.toContain('task.started');
  });

  it('rejects a stream when the task record is gone but its event log remains', async () => {
    const bucket = memoryBucket();
    const env = environment({ ASSET_BUCKET: bucket, OPENCODE_GO_API_KEY: 'test-key' });
    const store = new R2TaskStore({ bucket });
    const taskId = 'task_deleted_record';
    const secret = 'ORPHANED-EVENT-PAYLOAD';
    await store.createTask({
      taskId,
      userId: 'alice',
      sessionId: 's',
      workspaceId: null,
      status: 'completed',
      prompt: 'owner only',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await store.appendEvent(taskId, { type: 'task.completed', taskId, response: secret });

    // The metadata record is gone (partially deleted task); the log survives.
    // Delete from both the per-user folder and the legacy flat location.
    await bucket.delete(`users/alice/tasks/${taskId}.json`);
    await bucket.delete(`tasks/${taskId}.json`);

    const response = await collectWithin(env, fetchRequest(`https://corez.test/api/tasks/${taskId}/events`));
    expect(response.status).toBe(404);
    expect(response.body).not.toContain(secret);
    expect(response.body).not.toContain('task.completed');
  });

  it('does not open an event stream when task storage is not configured', async () => {
    const env = environment({ OPENCODE_GO_API_KEY: 'test-key' });
    const response = await collectWithin(env, fetchRequest('https://corez.test/api/tasks/task_no_storage/events'));
    expect(response.status).toBe(503);
    expect(response.body).not.toContain('event:');
  });

  it('cancel aborts the running task and exposes the cancelled terminal state', async () => {
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      OPENCODE_GO_API_KEY: 'test-key',
      TASK_INLINE_FALLBACK: 'true'
    });
    let release;
    const started = new Promise((resolve) => { release = resolve; });
    globalThis.fetch = async (url, init) => {
      const payload = JSON.parse(init.body);
      if ((payload.input || payload.messages).some((m) => m.content === 'long running task')) {
        release();
        return new Promise((resolve) => {
          const timer = setTimeout(() => resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'late' } }] }), { status: 200 })), 10_000);
          // The worker harness passes the request signal through to fetch:
          // aborting the task aborts this in-flight fetch.
          const signal = init.signal;
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            const error = new Error('aborted');
            error.name = 'AbortError';
            resolve(Promise.reject(error));
          }, { once: true });
        });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 });
    };

    const postResponse = await worker.fetch(fetchRequest('https://corez.test/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'long running task', sessionId: 'cancel-session' })
    }), env);
    expect(postResponse.status).toBe(202);
    const { taskId } = await postResponse.json();
    await started;

    const cancelResponse = await worker.fetch(fetchRequest(`https://corez.test/api/tasks/${taskId}/cancel`, { method: 'POST' }), env);
    expect(cancelResponse.status).toBe(200);
    const cancelled = await cancelResponse.json();
    expect(cancelled.status).toBe('cancelled');

    // Wait for the terminal state via the event stream.
    const events = parseSse(await readStream(await worker.fetch(fetchRequest(`https://corez.test/api/tasks/${taskId}/events`), env)));
    const cancelledEvent = events.find((e) => e.type === 'task.cancelled');
    expect(cancelledEvent).toBeDefined();
  });

  it('repository tasks are honestly rejected: the public deployment never executes workspaces', async () => {
    // Even with remote-runner env vars configured, repository tasks are
    // blocked — corez.pro is public and never executes or delegates to a
    // repository workspace.
    const env = environment({
      ASSET_BUCKET: memoryBucket(),
      OPENCODE_GO_API_KEY: 'test-key',
      COREZ_REMOTE_RUNNER_URL: 'https://runner.example.com',
      COREZ_REMOTE_RUNNER_TOKEN: 'runner-secret',
      COREZ_REMOTE_WORKSPACES: '/srv/checkouts/corez'
    });
    const response = await worker.fetch(fetchRequest('https://corez.test/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'edit repo', workspaceId: '/srv/checkouts/corez' })
    }), env);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('public deployment');
  });
});
