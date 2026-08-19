// TodoTracker: In-session task checklist and objective tracking for CoreZ AI.
// Inspired by DeepSeek Harness dsh-todo / todo_write.
// Provides structured, transparent progress tracking for multi-step agent workflows.

import { PERMISSION_CATEGORIES } from '../permissions/index.js';

export class TodoTracker {
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.scopes = new Map(); // scopeId -> Array<TodoItem>
  }

  getTodos(scopeId = 'default') {
    const todos = this.scopes.get(scopeId) || [];
    const total = todos.length;
    const completed = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    const cancelled = todos.filter(t => t.status === 'cancelled').length;
    const pending = todos.filter(t => !t.status || t.status === 'todo').length;
    const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 100;

    return {
      todos,
      stats: {
        total,
        completed,
        inProgress,
        pending,
        cancelled,
        percentComplete
      }
    };
  }

  setTodos(scopeId = 'default', todoList = []) {
    const normalized = todoList.map((t, idx) => ({
      id: t.id || `todo_${idx + 1}`,
      title: t.title || 'Untitled task',
      status: t.status || 'todo',
      priority: t.priority || 'medium',
      notes: t.notes || null,
      updatedAt: new Date().toISOString()
    }));

    this.scopes.set(scopeId, normalized);

    if (this.eventBus) {
      this.eventBus.emit({
        type: 'todo.updated',
        scopeId,
        todos: normalized,
        stats: this.getTodos(scopeId).stats
      });
    }

    return this.getTodos(scopeId);
  }

  addTodo(scopeId = 'default', item = {}) {
    const current = this.scopes.get(scopeId) || [];
    const id = item.id || `todo_${current.length + 1}`;
    const newTodo = {
      id,
      title: item.title || 'Untitled task',
      status: item.status || 'todo',
      priority: item.priority || 'medium',
      notes: item.notes || null,
      updatedAt: new Date().toISOString()
    };

    current.push(newTodo);
    this.scopes.set(scopeId, current);

    if (this.eventBus) {
      this.eventBus.emit({
        type: 'todo.updated',
        scopeId,
        todos: current,
        stats: this.getTodos(scopeId).stats
      });
    }

    return newTodo;
  }

  updateTodo(scopeId = 'default', id, updates = {}) {
    const current = this.scopes.get(scopeId) || [];
    const target = current.find(t => t.id === id);
    if (!target) {
      throw new Error(`Todo with id "${id}" not found in scope "${scopeId}".`);
    }

    if (updates.status !== undefined) target.status = updates.status;
    if (updates.title !== undefined) target.title = updates.title;
    if (updates.notes !== undefined) target.notes = updates.notes;
    if (updates.priority !== undefined) target.priority = updates.priority;
    target.updatedAt = new Date().toISOString();

    if (this.eventBus) {
      this.eventBus.emit({
        type: 'todo.updated',
        scopeId,
        todos: current,
        stats: this.getTodos(scopeId).stats
      });
    }

    return target;
  }

  clear(scopeId = 'default') {
    this.scopes.delete(scopeId);
  }
}

/**
 * Creates the `todo_write` tool for CoreZ ToolRegistry.
 */
export function createTodoTool(todoTracker) {
  return {
    name: 'todo_write',
    category: PERMISSION_CATEGORIES.READ,
    description: 'Record and update a structured task list for the current work. Send the ENTIRE list every call — it REPLACES the previous list (there are no partial updates, no per-item edits). For backward compat, action-based calls (set/add/update/list) are also accepted.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['set', 'add', 'update', 'list'],
          description: 'Legacy action: set full checklist, add a single task, update task status, or list todos. Omit for DSH whole-list mode.'
        },
        todos: {
          type: 'array',
          description: 'The COMPLETE task list, replacing any previous list. Each item has content + status.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              content: { type: 'string', description: 'What the task is — a short imperative line.' },
              title: { type: 'string', description: 'Alias for content (legacy)' },
              id: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'todo', 'cancelled'], description: 'pending (not started) | in_progress (now) | completed (done).' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'] }
            },
            required: []
          }
        },
        item: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'completed', 'cancelled'] }
          },
          required: ['title'],
          description: 'Single todo item to add (used when action is "add")'
        },
        update: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID of the todo to update' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'completed', 'cancelled'] },
            title: { type: 'string' },
            notes: { type: 'string' }
          },
          required: ['id'],
          description: 'Update fields for existing todo item (used when action is "update")'
        }
      },
      required: []
    },
    execute: async ({ action, todos, item, update }, runtimeOptions = {}) => {
      const scopeId = runtimeOptions.taskId || runtimeOptions.sessionId || 'default';

      // DSH whole-list mode: no action, just todos with content/status (last-write-wins, durable todo/write)
      const isDshWholeList = !action && Array.isArray(todos) && todos.length > 0 && todos.some((t) => t.content !== undefined || t.title === undefined);
      // also support DSH when action is undefined but todos is array of {content, status}
      if (isDshWholeList || (!action && Array.isArray(todos) && todos.length && todos[0]?.content !== undefined)) {
        // DSH validation: whole-list replacement, pending/in_progress/completed
        const normalized = [];
        const seen = new Set();
        for (const t of todos) {
          const content = String(t.content ?? t.title ?? '').trim();
          if (!content) return { success: false, error: 'invalid todo: content must be non-empty string' };
          if (seen.has(content)) return { success: false, error: `invalid todos: duplicate content ${JSON.stringify(content)}` };
          seen.add(content);
          const status = t.status || 'pending';
          if (!['pending', 'in_progress', 'completed', 'todo', 'cancelled'].includes(status)) {
            return { success: false, error: `invalid status ${status}` };
          }
          // map DSH to internal: pending->todo, in_progress stays, completed, cancelled
          const mapped = status === 'pending' ? 'todo' : status;
          normalized.push({ id: `todo_${normalized.length + 1}`, title: content, content, status: mapped });
        }
        // allowParallel check: if more than one in_progress and caller didn't allow, could deny
        // For now, store as is (DSH plugin would handle allowParallel)
        const data = todoTracker.setTodos(scopeId, normalized.map((n) => ({ id: n.id, title: n.title, status: n.status })));
        // also return DSH-shaped response
        return { success: true, todos: normalized.map((n) => ({ content: n.title, status: n.status === 'todo' ? 'pending' : n.status })), ...data };
      }

      if (action === 'list' || (!action && !todos && !item && !update)) {
        const data = todoTracker.getTodos(scopeId);
        return { success: true, ...data };
      }

      if (action === 'set') {
        if (!Array.isArray(todos)) {
          return { success: false, error: 'Action "set" requires a "todos" array.' };
        }
        const data = todoTracker.setTodos(scopeId, todos);
        return { success: true, ...data };
      }

      if (action === 'add') {
        if (!item?.title) {
          return { success: false, error: 'Action "add" requires an "item" object with a "title".' };
        }
        const added = todoTracker.addTodo(scopeId, item);
        const data = todoTracker.getTodos(scopeId);
        return { success: true, added, ...data };
      }

      if (action === 'update') {
        if (!update?.id) {
          return { success: false, error: 'Action "update" requires an "update" object with an "id".' };
        }
        try {
          const updated = todoTracker.updateTodo(scopeId, update.id, update);
          const data = todoTracker.getTodos(scopeId);
          return { success: true, updated, ...data };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }

      // fallback: if todos provided without action, treat as set (legacy)
      if (Array.isArray(todos) && todos.length) {
        const data = todoTracker.setTodos(scopeId, todos);
        return { success: true, ...data };
      }

      return { success: false, error: `Unknown action: "${action}"` };
    }
  };
}
