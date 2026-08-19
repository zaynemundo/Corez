import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentHarness } from '../packages/agent-core/harness/AgentHarness.js';
import { MemoryTaskStore } from '../packages/agent-core/persistence/TaskStore.js';
import { ToolRegistry } from '../packages/agent-core/tools/index.js';
import { ContextEngine } from '../packages/agent-core/context/index.js';
import { PermissionManager } from '../packages/agent-core/permissions/index.js';
import { TASK_STATUSES } from '../packages/agent-core/harness/TaskState.js';

function makeWorkspace(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `corez-iso-${name}-`));
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\n`);
  return dir;
}

function immediateProvider(content) {
  return {
    async generate() {
      return { status: 'completed', content, toolCalls: [], provider: 'test', model: 'muse-spark-1.2' };
    }
  };
}

describe('multi-user isolation', () => {
  let wsA;
  let wsB;
  let store;

  beforeEach(() => {
    wsA = makeWorkspace('a');
    wsB = makeWorkspace('b');
    store = new MemoryTaskStore();
  });

  afterEach(() => {
    fs.rmSync(wsA, { recursive: true, force: true });
    fs.rmSync(wsB, { recursive: true, force: true });
  });

  function harnessFor(provider, overrides = {}) {
    return new AgentHarness({
      taskStore: store,
      toolRegistry: new ToolRegistry(),
      permissionManager: new PermissionManager(),
      contextEngineFactory: (cwd) => new ContextEngine(cwd),
      providerChain: provider,
      ...overrides
    });
  }

  it('two users run concurrent tasks with never-crossing messages and workspaces', async () => {
    const harness = harnessFor({
      async generate({ messages }) {
        // Echo the last user message as the completed response so each task's
        // conversation content is observable.
        const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content);
        return { status: 'completed', content: userMessages[userMessages.length - 1] || '', toolCalls: [], provider: 'test', model: 'muse-spark-1.2' };
      }
    });

    const [taskA, taskB] = await Promise.all([
      harness.runTask({ userId: 'alice', sessionId: 'alice-session', workspaceId: wsA, prompt: 'alice request', mode: 'conversation' }),
      harness.runTask({ userId: 'bob', sessionId: 'bob-session', workspaceId: wsB, prompt: 'bob request', mode: 'conversation' })
    ]);

    expect(taskA.status).toBe(TASK_STATUSES.COMPLETED);
    expect(taskB.status).toBe(TASK_STATUSES.COMPLETED);
    expect(taskA.result).toContain('alice request');
    expect(taskA.result).not.toContain('bob request');
    expect(taskB.result).toContain('bob request');
    expect(taskB.result).not.toContain('alice request');
    // Workspace paths never cross users.
    expect(taskA.workspaceId).toBe(wsA);
    expect(taskB.workspaceId).toBe(wsB);
    // Sessions stay separate.
    expect(taskA.sessionId).toBe('alice-session');
    expect(taskB.sessionId).toBe('bob-session');
  });

  it('cancelling one task never cancels another', async () => {
    let releaseFirst;
    const firstStarted = new Promise((resolve) => { releaseFirst = resolve; });
    const harness = harnessFor({
      async generate({ messages, signal }) {
        if (messages.some((m) => m.content === 'cancel-me')) {
          releaseFirst();
          return new Promise((resolve) => {
            const timer = setTimeout(() => resolve({ status: 'completed', content: 'done', toolCalls: [], provider: 't', model: 'm' }), 10_000);
            signal?.addEventListener('abort', () => { clearTimeout(timer); resolve({ status: 'cancelled', error: 'aborted' }); }, { once: true });
          });
        }
        return { status: 'completed', content: 'other task done', toolCalls: [], provider: 't', model: 'm' };
      }
    });

    const firstTask = await harness.startTask({ userId: 'alice', sessionId: 's1', workspaceId: wsA, prompt: 'cancel-me', mode: 'conversation' });
    await firstStarted;
    // The second task runs and completes while the first is still pending.
    const second = await harness.runTask({ userId: 'bob', sessionId: 's2', workspaceId: wsB, prompt: 'other', mode: 'conversation' });
    expect(second.status).toBe(TASK_STATUSES.COMPLETED);

    const cancelled = await harness.cancelTask(firstTask.taskId, 'alice');
    expect(cancelled.status).toBe(TASK_STATUSES.CANCELLED);
    const firstDone = await firstTask; // startTask resolves with the initial task; the loop runs in the background
    void firstDone;
    const storedFirst = await harness.getTask(firstTask.taskId, 'alice');
    expect(storedFirst.status).toBe(TASK_STATUSES.CANCELLED);
    // Bob's task was unaffected by Alice's cancellation.
    const bobTask = await harness.getTask(second.taskId, 'bob');
    expect(bobTask.status).toBe(TASK_STATUSES.COMPLETED);
  });

  it('enforces task ownership on every read', async () => {
    const harness = harnessFor(immediateProvider('secret answer'));
    const task = await harness.runTask({ userId: 'alice', sessionId: 's1', workspaceId: wsA, prompt: 'alice secret', mode: 'conversation' });

    await expect(harness.getTask(task.taskId, 'bob')).rejects.toThrow(/another user/);
    await expect(harness.cancelTask(task.taskId, 'bob')).rejects.toThrow(/another user/);
    await expect(harness.resumeTask(task.taskId, 'bob')).rejects.toThrow(/another user/);
    const aliceRead = await harness.getTask(task.taskId, 'alice');
    expect(aliceRead.taskId).toBe(task.taskId);
  });

  it('provider throttling on one task does not block another task', async () => {
    let releaseSlow;
    const slowStarted = new Promise((resolve) => { releaseSlow = resolve; });
    const harness = harnessFor({
      async generate({ messages }) {
        if (messages.some((m) => m.content === 'slow-task')) {
          releaseSlow();
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return { status: 'completed', content: 'slow done', toolCalls: [], provider: 't', model: 'm' };
        }
        return { status: 'completed', content: 'fast done', toolCalls: [], provider: 't', model: 'm' };
      }
    });

    const slowPromise = harness.runTask({ userId: 'alice', sessionId: 's1', workspaceId: wsA, prompt: 'slow-task', mode: 'conversation' });
    await slowStarted;
    const startedAt = Date.now();
    const fast = await harness.runTask({ userId: 'bob', sessionId: 's2', workspaceId: wsB, prompt: 'fast-task', mode: 'conversation' });
    const fastElapsed = Date.now() - startedAt;

    expect(fast.status).toBe(TASK_STATUSES.COMPLETED);
    expect(fastElapsed).toBeLessThan(1000); // completed while the slow task was throttled
    const slow = await slowPromise;
    expect(slow.status).toBe(TASK_STATUSES.COMPLETED);
  });

  it('tasks never share conversation state even on the same store', async () => {
    const harness = harnessFor(immediateProvider('shared answer'));
    const taskA = await harness.runTask({ userId: 'alice', sessionId: 's1', workspaceId: wsA, prompt: 'A', mode: 'conversation' });
    const taskB = await harness.runTask({ userId: 'bob', sessionId: 's2', workspaceId: wsB, prompt: 'B', mode: 'conversation' });

    const rawA = await store.getTask(taskA.taskId);
    const rawB = await store.getTask(taskB.taskId);
    expect(rawA.userId).toBe('alice');
    expect(rawB.userId).toBe('bob');
    expect(rawA.messages.filter((m) => m.role === 'user').length).toBe(1);
    expect(rawA.messages.filter((m) => m.role === 'user')[0].content).toBe('A');
    expect(rawB.messages.filter((m) => m.role === 'user')[0].content).toBe('B');
  });
});
