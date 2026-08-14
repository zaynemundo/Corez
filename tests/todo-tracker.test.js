import { describe, it, expect } from 'vitest';
import { TodoTracker, createTodoTool } from '../packages/agent-core/todos/TodoTracker.js';
import { ToolRegistry } from '../packages/agent-core/tools/index.js';
import { EventBus } from '../packages/agent-core/harness/EventBus.js';

describe('TodoTracker & todo_write Tool', () => {
  it('manages task checklists with statistics', () => {
    const tracker = new TodoTracker();
    tracker.setTodos('task-1', [
      { id: 'step-1', title: 'Inspect files', status: 'completed' },
      { id: 'step-2', title: 'Apply code changes', status: 'in_progress' },
      { id: 'step-3', title: 'Run tests', status: 'todo' }
    ]);

    const res = tracker.getTodos('task-1');
    expect(res.stats.total).toBe(3);
    expect(res.stats.completed).toBe(1);
    expect(res.stats.inProgress).toBe(1);
    expect(res.stats.pending).toBe(1);
    expect(res.stats.percentComplete).toBe(33);
  });

  it('emits todo.updated event on EventBus when checklist changes', () => {
    const eventBus = new EventBus();
    const emitted = [];
    eventBus.subscribe(e => emitted.push(e));

    const tracker = new TodoTracker({ eventBus });
    tracker.addTodo('task-2', { title: 'Implement feature' });

    expect(emitted.some(e => e.type === 'todo.updated')).toBe(true);
  });

  it('updates specific todo status and attributes', () => {
    const tracker = new TodoTracker();
    tracker.setTodos('task-3', [
      { id: 't1', title: 'Write tests', status: 'todo' }
    ]);

    const updated = tracker.updateTodo('task-3', 't1', { status: 'completed', notes: 'All 15 tests passed' });
    expect(updated.status).toBe('completed');
    expect(updated.notes).toBe('All 15 tests passed');

    const res = tracker.getTodos('task-3');
    expect(res.stats.percentComplete).toBe(100);
  });

  it('executes todo_write tool cleanly via ToolRegistry', async () => {
    const tracker = new TodoTracker();
    const todoTool = createTodoTool(tracker);
    const registry = new ToolRegistry();
    registry.registerTool(todoTool);

    // Set action
    const setRes = await registry.executeTool('todo_write', {
      action: 'set',
      todos: [
        { id: 'db-1', title: 'Create migrations', status: 'completed' },
        { id: 'db-2', title: 'Seed initial records', status: 'todo' }
      ]
    }, { taskId: 'db-setup', autoApprove: true });

    expect(setRes.success).toBe(true);
    expect(setRes.stats.total).toBe(2);

    // Update action
    const updateRes = await registry.executeTool('todo_write', {
      action: 'update',
      update: { id: 'db-2', status: 'completed' }
    }, { taskId: 'db-setup', autoApprove: true });

    expect(updateRes.success).toBe(true);
    expect(updateRes.stats.percentComplete).toBe(100);

    // List action
    const listRes = await registry.executeTool('todo_write', { action: 'list' }, { taskId: 'db-setup', autoApprove: true });
    expect(listRes.success).toBe(true);
    expect(listRes.todos.length).toBe(2);
  });
});
