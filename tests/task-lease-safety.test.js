// Lease-safety regression tests for the task harness.
//
// The execution lock is not advisory: without a confirmed lease the harness
// must not run at all, a renewal failure must stop a running task before it
// calls the provider again, and progress writes are fenced so a runner that
// lost the lease can never overwrite the new owner's state.
import { describe, it, expect } from 'vitest';
import { AgentHarness } from '../packages/agent-core/harness/AgentHarness.js';
import { MemoryTaskStore } from '../packages/agent-core/persistence/TaskStore.js';
import { R2TaskStore } from '../packages/agent-core/persistence/R2TaskStore.js';
import { D1TaskStore } from '../packages/agent-core/persistence/D1TaskStore.js';
import { TASK_STATUSES } from '../packages/agent-core/harness/TaskState.js';
import { createSqliteD1 } from './helpers/sqliteD1.js';

function completed(content) {
  return { status: 'completed', content, toolCalls: [], provider: 'test', model: 'm' };
}

function makeHarness(store, generate, options = {}) {
  return new AgentHarness({
    taskStore: store,
    providerChain: { generate },
    defaultModel: 'm',
    maxRetryWaitMs: 0,
    ...options
  });
}

async function newDeferredTask(harness, prompt = 'work') {
  return harness.startTask({
    userId: 'u1',
    sessionId: 's1',
    prompt,
    mode: 'conversation',
    deferExecution: true
  });
}

describe('task execution lease safety', () => {
  it('a thrown acquisition error causes zero provider calls', async () => {
    class BrokenLeaseStore extends MemoryTaskStore {
      async acquireLease() {
        throw new Error('lease backend unavailable');
      }
    }
    const store = new BrokenLeaseStore();
    let calls = 0;
    const harness = makeHarness(store, async () => {
      calls += 1;
      return completed('must not run');
    });

    const task = await newDeferredTask(harness, 'never runs');
    const outcome = await harness.executeTask(task.taskId);
    expect(outcome.outcome).toBe('lease-unavailable');
    expect(outcome.executed).toBe(false);
    expect(outcome.retryAfterSeconds).toBeGreaterThan(0);
    expect(calls).toBe(0);

    // Ownership was never confirmed: the stored task is untouched and still
    // runnable by a later delivery, not failed and not completed.
    const stored = await store.getTask(task.taskId);
    expect(stored.status).toBe(TASK_STATUSES.RUNNING);
    expect(stored.result ?? null).toBeNull();

    // The inline path fails the same way instead of running without a lock.
    const inline = await harness.runTask({
      userId: 'u1',
      sessionId: 's2',
      prompt: 'also never runs',
      mode: 'conversation'
    });
    expect(inline.status).toBe(TASK_STATUSES.RUNNING);
    expect(calls).toBe(0);
  });

  it('a worker that loses its lease stops before another worker takes over', async () => {
    class RenewalFailingStore extends MemoryTaskStore {
      constructor() {
        super();
        this.failRenew = false;
      }
      async renewLease(taskId, holder, ttlMs = 30_000) {
        if (this.failRenew) return false;
        return super.renewLease(taskId, holder, ttlMs);
      }
    }
    const store = new RenewalFailingStore();
    let calls = 0;
    const harnessA = makeHarness(
      store,
      async () => {
        calls += 1;
        // The lease moves on while the provider is answering.
        store.failRenew = true;
        return { status: 'retry-scheduled', retryAfterSeconds: 0.01, provider: 'test', error: 'busy' };
      },
      { maxRetryWaitMs: 10 }
    );

    const task = await newDeferredTask(harnessA, 'lose the lease');
    const lost = await harnessA.executeTask(task.taskId);
    expect(lost.outcome).toBe('lease-lost');
    expect(lost.executed).toBe(false);
    // The loop stopped at the failed renewal: no second provider call.
    expect(calls).toBe(1);

    // Lease loss is not cancellation and not failure: the task stays running
    // for the next owner instead of being marked terminal.
    expect((await store.getTask(task.taskId)).status).toBe(TASK_STATUSES.RUNNING);

    // Simulate the handover once the old lease has expired.
    store.leases.delete(task.taskId);
    store.failRenew = false; // renewal works again for the new owner
    let callsB = 0;
    const harnessB = makeHarness(store, async () => {
      callsB += 1;
      return completed('owned by B');
    });
    const takenOver = await harnessB.executeTask(task.taskId);
    expect(takenOver.outcome).toBe('terminal');
    expect(takenOver.executed).toBe(true);
    expect(callsB).toBe(1);

    const finished = await store.getTask(task.taskId);
    expect(finished.status).toBe(TASK_STATUSES.COMPLETED);
    expect(finished.result).toBe('owned by B');
  });

  it('a previous owner cannot overwrite the new owner after handover', async () => {
    const store = new MemoryTaskStore();
    let releaseStarted;
    const started = new Promise((resolve) => { releaseStarted = resolve; });
    let resumeProvider;
    const gate = new Promise((resolve) => { resumeProvider = resolve; });
    let callsA = 0;
    const harnessA = makeHarness(store, async () => {
      callsA += 1;
      releaseStarted();
      await gate;
      return completed('A result');
    });

    const task = await newDeferredTask(harnessA, 'stale owner');
    const runningA = harnessA.executeTask(task.taskId);
    await started;

    // Worker A's lease is gone; worker B wins the task and completes it.
    store.leases.delete(task.taskId);
    let callsB = 0;
    const harnessB = makeHarness(store, async () => {
      callsB += 1;
      return completed('B result');
    });
    const outcomeB = await harnessB.executeTask(task.taskId);
    expect(outcomeB.outcome).toBe('terminal');
    expect(callsB).toBe(1);

    // Worker A finishes its provider call late. Its terminal write is fenced
    // by the lease token and must be rejected, not applied over B's result.
    resumeProvider();
    const outcomeA = await runningA;
    expect(outcomeA.outcome).toBe('lease-lost');
    expect(outcomeA.executed).toBe(false);

    const stored = await store.getTask(task.taskId);
    expect(stored.status).toBe(TASK_STATUSES.COMPLETED);
    expect(stored.result).toBe('B result');
    expect(callsA).toBe(1);
  });

  it('R2 also rejects fenced writes without the live lease token', async () => {
    const map = new Map();
    const bucket = {
      async get(key) {
        return map.has(key) ? { async text() { return map.get(key); } } : null;
      },
      async put(key, value) {
        map.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      },
      async delete(key) {
        map.delete(key);
      },
      async list({ prefix = '' } = {}) {
        return { objects: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
      }
    };
    const store = new R2TaskStore({ bucket });
    const taskId = 'r2-fenced';
    await store.createTask({
      taskId,
      userId: 'u1',
      status: TASK_STATUSES.RUNNING,
      prompt: 'fenced',
      currentStep: 0
    });

    expect((await store.acquireLease(taskId, 'holder-a', 60_000)).acquired).toBe(true);
    expect(await store.updateTaskFenced(taskId, { currentStep: 2 }, 'holder-a')).not.toBeNull();
    expect((await store.getTask(taskId)).currentStep).toBe(2);
    expect(await store.updateTaskFenced(taskId, { currentStep: 99 }, 'holder-b')).toBeNull();
    await store.releaseLease(taskId, 'holder-a');
    expect(await store.updateTaskFenced(taskId, { currentStep: 100 }, 'holder-a')).toBeNull();
    expect((await store.getTask(taskId)).currentStep).toBe(2);
  });

  it('D1 rejects fenced writes without the live lease token', async () => {
    const db = createSqliteD1();
    const store = new D1TaskStore({ db });
    const taskId = 'lease-fenced';
    await store.createTask({
      taskId,
      userId: 'u1',
      sessionId: 's1',
      workspaceId: null,
      status: TASK_STATUSES.RUNNING,
      prompt: 'fenced',
      messages: [],
      currentStep: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    expect((await store.acquireLease(taskId, 'holder-a', 60_000)).acquired).toBe(true);
    expect(await store.updateTaskFenced(taskId, { currentStep: 2 }, 'holder-a')).not.toBeNull();
    expect((await store.getTask(taskId)).currentStep).toBe(2);

    // A foreign token is rejected.
    expect(await store.updateTaskFenced(taskId, { currentStep: 99 }, 'holder-b')).toBeNull();

    // After the lease is released, even the previous holder is rejected.
    await store.releaseLease(taskId, 'holder-a');
    expect(await store.updateTaskFenced(taskId, { currentStep: 100 }, 'holder-a')).toBeNull();
    expect((await store.getTask(taskId)).currentStep).toBe(2);

    // An expired lease cannot fence a write either.
    expect((await store.acquireLease(taskId, 'holder-c', 30)).acquired).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await store.updateTaskFenced(taskId, { currentStep: 101 }, 'holder-c')).toBeNull();
    expect((await store.getTask(taskId)).currentStep).toBe(2);
  });
});
