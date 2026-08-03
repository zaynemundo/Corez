// Disk-backed task store for the CLI: tasks survive process restarts under
// <workspace>/.corez/tasks/. Leases are process-local (single-process CLI);
// multi-process coordination belongs to the R2/DO stores.

import fs from 'node:fs';
import path from 'node:path';
import { TaskStore } from './TaskStore.js';

export class DiskTaskStore extends TaskStore {
  constructor({ rootDir } = {}) {
    super();
    this.rootDir = rootDir || path.join(process.cwd(), '.corez', 'tasks');
    this.eventsDir = path.join(this.rootDir, 'events');
    this.leases = new Map();
    fs.mkdirSync(this.eventsDir, { recursive: true });
  }

  #taskPath(taskId) {
    return path.join(this.rootDir, `${safeSegment(taskId)}.json`);
  }

  #eventsPath(taskId) {
    return path.join(this.eventsDir, `${safeSegment(taskId)}.events.json`);
  }

  async createTask(task) {
    fs.writeFileSync(this.#taskPath(task.taskId), JSON.stringify(task, null, 2), 'utf8');
    return JSON.parse(JSON.stringify(task));
  }

  async getTask(taskId) {
    const filePath = this.#taskPath(taskId);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  async updateTask(taskId, patch) {
    const task = await this.getTask(taskId);
    if (!task) return null;
    const next = { ...task, ...JSON.parse(JSON.stringify(patch)), taskId, updatedAt: new Date().toISOString() };
    fs.writeFileSync(this.#taskPath(taskId), JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  async listTasks(filter = {}) {
    const tasks = [];
    for (const entry of fs.readdirSync(this.rootDir)) {
      if (!entry.endsWith('.json')) continue;
      try {
        const task = JSON.parse(fs.readFileSync(path.join(this.rootDir, entry), 'utf8'));
        if (filter.userId && task.userId !== filter.userId) continue;
        if (filter.sessionId && task.sessionId !== filter.sessionId) continue;
        if (filter.status && task.status !== filter.status) continue;
        tasks.push(task);
      } catch {
        // skip corrupt entries
      }
    }
    return tasks;
  }

  async appendEvent(taskId, event) {
    const filePath = this.#eventsPath(taskId);
    let list = [];
    if (fs.existsSync(filePath)) {
      try {
        list = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        list = [];
      }
    }
    const id = (list[list.length - 1]?.id || 0) + 1;
    const stamped = { ...event, id, timestamp: event.timestamp || new Date().toISOString() };
    list.push(stamped);
    fs.writeFileSync(filePath, JSON.stringify(list), 'utf8');
    return stamped;
  }

  async listEvents(taskId, { sinceId = 0 } = {}) {
    const filePath = this.#eventsPath(taskId);
    if (!fs.existsSync(filePath)) return [];
    try {
      const list = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return list.filter((e) => e.id > sinceId);
    } catch {
      return [];
    }
  }

  async acquireLease(taskId, holder, ttlMs = 30_000) {
    const now = Date.now();
    const existing = this.leases.get(taskId);
    if (existing && existing.holder !== holder && existing.expiresAt > now) {
      return { acquired: false, expiresAt: existing.expiresAt, error: `Lease held by ${existing.holder}` };
    }
    const expiresAt = now + ttlMs;
    this.leases.set(taskId, { holder, expiresAt });
    return { acquired: true, expiresAt };
  }

  async renewLease(taskId, holder, ttlMs = 30_000) {
    const existing = this.leases.get(taskId);
    if (!existing || existing.holder !== holder) return false;
    existing.expiresAt = Date.now() + ttlMs;
    return true;
  }

  async releaseLease(taskId, holder) {
    const existing = this.leases.get(taskId);
    if (!existing || existing.holder !== holder) return false;
    this.leases.delete(taskId);
    return true;
  }
}

function safeSegment(value) {
  return String(value || 'task').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
}
