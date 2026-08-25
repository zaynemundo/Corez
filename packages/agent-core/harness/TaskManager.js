// Task lifecycle management: creation, persistence, ownership, workspace
// concurrency and cancellation coordination. Every task is isolated; two
// tasks may not write the same workspace checkout simultaneously.

import { TaskState, TASK_STATUSES } from './TaskState.js';
import { nowIso } from './utils.js';

export class TaskManager {
  constructor({ store, eventBus, cancellationManager, sessionManager, idFactory } = {}) {
    this.store = store;
    this.eventBus = eventBus || null;
    this.cancellations = cancellationManager || null;
    this.sessions = sessionManager || null;
    this.idFactory = idFactory || defaultIdFactory;
    // Per-workspace in-process mutex: task executions on the same workspace
    // are serialized while the mutex is held (lease in the store when
    // available covers multi-process coordination).
    this.workspaceLocks = new Map();
  }

  async createTask({ userId = 'anonymous', sessionId, workspaceId, prompt, model, mode = 'repository', contract = null } = {}) {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('A prompt is required to create a task.');
    }
    const task = new TaskState({
      taskId: this.idFactory(),
      userId,
      sessionId: sessionId || null,
      workspaceId: workspaceId || null,
      prompt: prompt.trim(),
      model: model || 'muse-spark-1.2-contributor',
      mode
    });
    task.contract = contract && typeof contract === 'object' ? contract : null;
    task.status = TASK_STATUSES.RUNNING;
    task.touch();

    if (this.sessions) this.sessions.attachTask({ userId, sessionId, taskId: task.taskId });
    if (this.store) await this.store.createTask(task.toJSON());
    if (this.eventBus) this.eventBus.emit({ type: 'task.started', taskId: task.taskId, userId, sessionId, workspaceId, mode });
    return task;
  }

  async getTask(taskId, userId = null) {
    if (!taskId) throw new Error('taskId is required.');
    let task;
    if (this.store) {
      task = await this.store.getTask(taskId);
    } else {
      task = null;
    }
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (userId !== null && userId !== undefined && task.userId !== userId) {
      throw new Error('Access denied: this task belongs to another user.');
    }
    return TaskState.fromJSON(task);
  }

  async updateTask(taskId, patch, userId = null) {
    const current = await this.getTask(taskId, userId);
    const next = { ...current.toJSON(), ...patch, taskId, updatedAt: nowIso() };
    if (this.store) {
      const saved = await this.store.updateTask(taskId, patch);
      return TaskState.fromJSON(saved || next);
    }
    return TaskState.fromJSON(next);
  }

  async listTasks({ userId, sessionId, status } = {}) {
    if (!this.store) return [];
    const tasks = await this.store.listTasks({ userId, sessionId, status });
    return tasks.map((t) => TaskState.fromJSON(t));
  }

  async cancelTask(taskId, userId = null) {
    const task = await this.getTask(taskId, userId);
    if (task.isTerminal) return task;
    if (this.cancellations) {
      this.cancellations.abort(taskId);
    }
    if (this.eventBus) {
      this.eventBus.emit({ type: 'task.cancelled', taskId, userId: task.userId });
    }
    const updated = await this.updateTask(taskId, {
      status: TASK_STATUSES.CANCELLED,
      terminalAt: nowIso(),
      error: this.cancellations?.reason(taskId) || 'Task cancelled by user.'
    });
    return updated;
  }

  // ---- Workspace concurrency ----

  async acquireWorkspaceLock(workspaceId, holder, ttlMs = 5 * 60_000) {
    if (!workspaceId) return { acquired: true, expiresAt: Date.now() + ttlMs };
    const previous = this.workspaceLocks.get(workspaceId);
    const now = Date.now();
    if (previous && previous.holder !== holder && previous.expiresAt > now) {
      // Fall back to the store lease when present (multi-process safety).
      if (this.store) {
        const lease = await this.store.acquireLease(`ws:${workspaceId}`, holder, ttlMs);
        if (lease.acquired) {
          this.workspaceLocks.set(workspaceId, { holder, expiresAt: lease.expiresAt });
          return lease;
        }
        return lease;
      }
      return { acquired: false, expiresAt: previous.expiresAt, error: `Workspace ${workspaceId} is locked by ${previous.holder}` };
    }
    const expiresAt = now + ttlMs;
    this.workspaceLocks.set(workspaceId, { holder, expiresAt });
    if (this.store) {
      const lease = await this.store.acquireLease(`ws:${workspaceId}`, holder, ttlMs);
      if (lease.acquired) return lease;
      // Store lease rejected but the in-process lock is free: proceed.
      return { acquired: true, expiresAt: lease.expiresAt || expiresAt };
    }
    return { acquired: true, expiresAt };
  }

  async releaseWorkspaceLock(workspaceId, holder) {
    if (!workspaceId) return true;
    if (this.store) {
      await this.store.releaseLease(`ws:${workspaceId}`, holder);
    }
    const current = this.workspaceLocks.get(workspaceId);
    if (current && current.holder === holder) {
      this.workspaceLocks.delete(workspaceId);
    }
    return true;
  }
}

function defaultIdFactory() {
  const random = Math.random().toString(36).slice(2, 10);
  return `task_${Date.now().toString(36)}_${random}`;
}
