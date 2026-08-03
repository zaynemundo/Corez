import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentHarness } from '../packages/agent-core/harness/AgentHarness.js';
import { MemoryTaskStore } from '../packages/agent-core/persistence/TaskStore.js';
import { TASK_STATUSES } from '../packages/agent-core/harness/TaskState.js';

function makeHarness({ provider, store, repositoryRunner, maxRetryWaitMs = 0 } = {}) {
  return new AgentHarness({
    taskStore: store || new MemoryTaskStore(),
    providerChain: provider || {
      async generate() {
        return { status: 'completed', content: 'answer', toolCalls: [], provider: 'test', model: 'deepseek-v4-flash' };
      }
    },
    defaultModel: 'deepseek-v4-flash',
    maxRetryWaitMs,
    repositoryRunner: repositoryRunner || null
  });
}

describe('AgentHarness', () => {
  let store;

  beforeEach(() => {
    store = new MemoryTaskStore();
  });

  afterEach(() => {
    // no workspace to clean up
  });

  it('completes a conversation task and emits a task.completed event', async () => {
    const harness = makeHarness({ store });
    const task = await harness.runTask({
      userId: 'u1',
      sessionId: 's1',
      workspaceId: null,
      prompt: 'hello',
      mode: 'conversation'
    });

    expect(task.status).toBe(TASK_STATUSES.COMPLETED);
    expect(task.result).toBe('answer');
    const completed = harness.eventBus.replay({ taskId: task.taskId }).filter((e) => e.type === 'task.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].response).toBe('answer');
    // Persisted for reconnect.
    const stored = await store.getTask(task.taskId);
    expect(stored.status).toBe(TASK_STATUSES.COMPLETED);
    expect(stored.messages.some((m) => m.role === 'assistant' && m.content === 'answer')).toBe(true);
  });

  it('does not create a fake completion when the provider fails', async () => {
    const harness = makeHarness({
      store,
      provider: {
        async generate() {
          return { status: 'failed', provider: 'opencode-go', error: 'All providers rejected the request permanently. opencode-go HTTP 401: invalid key' };
        }
      }
    });

    const task = await harness.runTask({ userId: 'u1', sessionId: 's1', prompt: 'do anything', mode: 'conversation' });

    expect(task.status).toBe(TASK_STATUSES.FAILED);
    expect(task.result).toBeNull();
    expect(task.error).toContain('401');
    const completed = harness.eventBus.replay({ taskId: task.taskId }).filter((e) => e.type === 'task.completed');
    expect(completed).toHaveLength(0);
  });

  it('cancels cleanly when the signal is aborted mid-generation', async () => {
    let release;
    const started = new Promise((resolve) => { release = resolve; });
    const harness = makeHarness({
      store,
      provider: {
        async generate({ signal }) {
          release();
          return new Promise((resolve) => {
            const timer = setTimeout(() => resolve({ status: 'completed', content: 'late', toolCalls: [], provider: 't', model: 'm' }), 10_000);
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              resolve({ status: 'cancelled', error: 'aborted' });
            }, { once: true });
          });
        }
      }
    });

    const controller = new AbortController();
    const promise = harness.runTask({
      userId: 'u1',
      sessionId: 's1',
      prompt: 'do anything',
      mode: 'conversation',
      signal: controller.signal
    });

    await started;
    controller.abort();
    const task = await promise;

    expect(task.status).toBe(TASK_STATUSES.CANCELLED);
    const cancelled = harness.eventBus.replay({ taskId: task.taskId }).filter((e) => e.type === 'task.cancelled');
    expect(cancelled.length).toBeGreaterThan(0);
  });

  it('stays resumable when the provider schedules a retry and no in-process wait is allowed', async () => {
    let calls = 0;
    const harness = makeHarness({
      store,
      maxRetryWaitMs: 0,
      provider: {
        async generate() {
          calls += 1;
          if (calls === 1) {
            return { status: 'retry-scheduled', provider: 'opencode-go', retryAfterSeconds: 120, error: 'rate limited', content: '', toolCalls: [] };
          }
          return { status: 'completed', content: 'recovered answer', toolCalls: [], provider: 'opencode-go', model: 'deepseek-v4-flash' };
        }
      }
    });

    const task = await harness.runTask({ userId: 'u1', sessionId: 's1', prompt: 'hi', mode: 'conversation' });

    expect(task.status).toBe(TASK_STATUSES.RUNNING);
    expect(task.retryState.provider).toBe('opencode-go');
    const stored = await store.getTask(task.taskId);
    expect(stored.retryState.retryAfterSeconds).toBe(120);

    // Once the schedule is due, resume completes the task.
    await store.updateTask(task.taskId, { retryState: { provider: 'opencode-go', attempt: 1, nextRetryAt: Date.now() - 1, lastError: 'x' } });
    const resumed = await harness.resumeTask(task.taskId, 'u1');
    expect(resumed.status).toBe(TASK_STATUSES.COMPLETED);
    expect(resumed.result).toBe('recovered answer');
  });

  it('repository mode delegates to the repository runner', async () => {
    const runner = {
      async runTask(prompt, _options) {
        return { success: true, response: `implemented: ${prompt}` };
      }
    };
    const harness = makeHarness({ store, repositoryRunner: runner });
    const task = await harness.runTask({
      userId: 'u1',
      sessionId: 's1',
      workspaceId: '/tmp/ws',
      prompt: 'add login',
      mode: 'repository'
    });

    expect(task.status).toBe(TASK_STATUSES.COMPLETED);
    expect(task.result).toBe('implemented: add login');
    const completed = harness.eventBus.replay({ taskId: task.taskId }).filter((e) => e.type === 'task.completed');
    expect(completed).toHaveLength(1);
  });

  it('repository mode maps runner failures and blocks honestly without a runner', async () => {
    const failing = makeHarness({
      store,
      repositoryRunner: {
        async runTask() {
          return { success: false, blocked: true, blockedReason: 'Completion gate not satisfied: tests missing.' };
        }
      }
    });
    const blockedTask = await failing.runTask({ userId: 'u1', sessionId: 's1', prompt: 'x', mode: 'repository' });
    expect(blockedTask.status).toBe(TASK_STATUSES.BLOCKED);
    expect(blockedTask.error).toContain('tests missing');

    // Browser runtime: no runner -> honest block, never a fake completion.
    const browser = makeHarness({ store: new MemoryTaskStore() });
    const honest = await browser.runTask({ userId: 'u1', sessionId: 's1', prompt: 'x', mode: 'repository' });
    expect(honest.status).toBe(TASK_STATUSES.BLOCKED);
    expect(honest.error).toContain('browser runtime');
  });

  it('cancel works across harness instances via the shared store', async () => {
    const first = makeHarness({
      store,
      provider: {
        async generate({ signal }) {
          return new Promise((resolve) => {
            const timer = setTimeout(() => resolve({ status: 'completed', content: 'late', toolCalls: [], provider: 't', model: 'm' }), 10_000);
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              resolve({ status: 'cancelled', error: 'aborted' });
            }, { once: true });
          });
        }
      }
    });

    const task = await first.startTask({ userId: 'u1', sessionId: 's1', prompt: 'long', mode: 'conversation' });

    // A different harness instance (like a separate website API request)
    // cancels the task through the store; the running loop honors it.
    const second = makeHarness({ store });
    await second.cancelTask(task.taskId, 'u1');

    await new Promise((resolve) => setTimeout(resolve, 300));
    const stored = await store.getTask(task.taskId);
    expect(stored.status).toBe(TASK_STATUSES.CANCELLED);
  });

  it('enforces task ownership on every read', async () => {
    const harness = makeHarness({ store });
    const task = await harness.runTask({ userId: 'alice', sessionId: 's1', prompt: 'x', mode: 'conversation' });

    await expect(harness.getTask(task.taskId, 'bob')).rejects.toThrow(/another user/);
    await expect(harness.cancelTask(task.taskId, 'bob')).rejects.toThrow(/another user/);
    await expect(harness.resumeTask(task.taskId, 'bob')).rejects.toThrow(/another user/);
  });
});
