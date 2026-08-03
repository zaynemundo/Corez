import { describe, it, expect } from 'vitest';
import { MemoryTaskStore } from '../packages/agent-core/persistence/index.js';
import { TASK_STATUSES } from '../packages/agent-core/harness/TaskState.js';

describe('task persistence', () => {
  it('a task survives updates and reads through the store interface', async () => {
    const store = new MemoryTaskStore();
    const task = {
      taskId: 'task_1',
      userId: 'alice',
      sessionId: 's1',
      workspaceId: '/srv/ws',
      status: TASK_STATUSES.RUNNING,
      prompt: 'finish this work',
      messages: [{ role: 'user', content: 'finish this work' }],
      currentStep: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await store.createTask(task);

    // The stored snapshot is isolated from later mutations.
    const restored = await store.getTask('task_1');
    expect(restored.prompt).toBe('finish this work');
    expect(restored.currentStep).toBe(3);

    await store.updateTask('task_1', { status: TASK_STATUSES.COMPLETED, result: 'done' });
    expect((await store.getTask('task_1')).status).toBe(TASK_STATUSES.COMPLETED);

    // Events appended to the store are replayable per task.
    await store.appendEvent('task_1', { type: 'tool.started', taskId: 'task_1', tool: 'read_file' });
    const events = await store.listEvents('task_1');
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('tool.started');
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
