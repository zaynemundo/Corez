import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DiskTaskStore, MemoryTaskStore } from '../packages/agent-core/persistence/index.js';
import { TASK_STATUSES } from '../packages/agent-core/harness/TaskState.js';

describe('task persistence', () => {
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-persist-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('a task resumes after a process restart (disk store)', async () => {
    const root = path.join(tmp, 'tasks');
    const storeA = new DiskTaskStore({ rootDir: root });
    const task = {
      taskId: 'task_restart_1',
      userId: 'alice',
      sessionId: 's1',
      workspaceId: tmp,
      status: TASK_STATUSES.RUNNING,
      prompt: 'finish this work',
      messages: [{ role: 'user', content: 'finish this work' }],
      currentStep: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await storeA.createTask(task);
    await storeA.appendEvent('task_restart_1', { type: 'tool.started', taskId: 'task_restart_1', tool: 'read_file' });

    // "Restart": a brand-new store instance over the same directory.
    const storeB = new DiskTaskStore({ rootDir: root });
    const restored = await storeB.getTask('task_restart_1');
    expect(restored.prompt).toBe('finish this work');
    expect(restored.currentStep).toBe(3);
    const events = await storeB.listEvents('task_restart_1');
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('tool.started');

    // Updates from the "new process" are visible to a third instance.
    await storeB.updateTask('task_restart_1', { status: TASK_STATUSES.COMPLETED, result: 'done' });
    const storeC = new DiskTaskStore({ rootDir: root });
    expect((await storeC.getTask('task_restart_1')).status).toBe(TASK_STATUSES.COMPLETED);
  });

  it('a durable lease prevents duplicate execution and expires', async () => {
    const store = new MemoryTaskStore();
    const first = await store.acquireLease('task-lease-1', 'holder-a', 200);
    expect(first.acquired).toBe(true);
    const second = await store.acquireLease('task-lease-1', 'holder-b', 200);
    expect(second.acquired).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 250));
    const afterExpiry = await store.acquireLease('task-lease-1', 'holder-b', 200);
    expect(afterExpiry.acquired).toBe(true);
    expect(await store.releaseLease('task-lease-1', 'holder-a')).toBe(false);
    expect(await store.releaseLease('task-lease-1', 'holder-b')).toBe(true);
  });

  it('events are ordered and replayable with sinceId', async () => {
    const store = new MemoryTaskStore();
    await store.appendEvent('task-e', { type: 'a', taskId: 'task-e' });
    await store.appendEvent('task-e', { type: 'b', taskId: 'task-e' });
    await store.appendEvent('task-e', { type: 'c', taskId: 'task-e' });
    const after = await store.listEvents('task-e', { sinceId: 1 });
    expect(after.map((e) => e.type)).toEqual(['b', 'c']);
  });
});
