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
    description: 'Track and update the multi-step execution checklist for the current task.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['set', 'add', 'update', 'list'],
          description: 'Action to perform: set full checklist, add a single task, update task status, or list todos'
        },
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              status: { type: 'string', enum: ['todo', 'in_progress', 'completed', 'cancelled'] },
              priority: { type: 'string', enum: ['low', 'medium', 'high'] }
            },
            required: ['title']
          },
          description: 'List of todo items (used when action is "set")'
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
      required: ['action']
    },
    execute: async ({ action, todos, item, update }, runtimeOptions = {}) => {
      const scopeId = runtimeOptions.taskId || runtimeOptions.sessionId || 'default';

      if (action === 'list') {
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

      return { success: false, error: `Unknown action: "${action}"` };
    }
  };
}
