// R2-backed task store for the Cloudflare Worker.
//
// Honesty contract: R2 offers no atomic compare-and-swap, so updateTask is a
// read-modify-write and leases are best-effort (a racing holder can win).
// This store never claims atomic lock semantics; coordination guarantees come
// from the in-process TaskManager mutex plus lease expiry.

import { TaskStore } from './TaskStore.js';

export class R2TaskStore extends TaskStore {
  constructor({ bucket } = {}) {
    super();
    this.bucket = bucket;
  }

  get available() {
    return Boolean(this.bucket && typeof this.bucket.get === 'function' && typeof this.bucket.put === 'function');
  }

  #key(taskId) {
    return `tasks/${safeSegment(taskId)}.json`;
  }

  #eventsKey(taskId) {
    return `tasks/${safeSegment(taskId)}.events.json`;
  }

  #leaseKey(taskId) {
    return `tasks/${safeSegment(taskId)}.lease.json`;
  }

  async #getJson(key) {
    const object = await this.bucket.get(key);
    if (!object) return null;
    try {
      return JSON.parse(await object.text());
    } catch {
      return null;
    }
  }

  async #putJson(key, value) {
    await this.bucket.put(key, JSON.stringify(value), {
      httpMetadata: { contentType: 'application/json' }
    });
  }

  async createTask(task) {
    await this.#putJson(this.#key(task.taskId), task);
    return JSON.parse(JSON.stringify(task));
  }

  async getTask(taskId) {
    if (!this.available) return null;
    return this.#getJson(this.#key(taskId));
  }

  async updateTask(taskId, patch) {
    const task = await this.getTask(taskId);
    if (!task) return null;
    const next = { ...task, ...JSON.parse(JSON.stringify(patch)), taskId, updatedAt: new Date().toISOString() };
    await this.#putJson(this.#key(taskId), next);
    return next;
  }

  async listTasks(filter = {}) {
    if (!this.available) return [];
    const list = await this.bucket.list({ prefix: 'tasks/', limit: 1000 });
    const tasks = [];
    for (const obj of list?.objects || []) {
      if (!obj.key.endsWith('.json') || obj.key.includes('.events') || obj.key.includes('.lease')) continue;
      const task = await this.#getJson(obj.key);
      if (!task) continue;
      if (filter.userId && task.userId !== filter.userId) continue;
      if (filter.sessionId && task.sessionId !== filter.sessionId) continue;
      if (filter.status && task.status !== filter.status) continue;
      tasks.push(task);
    }
    return tasks;
  }

  async appendEvent(taskId, event) {
    if (!this.available) return null;
    const key = this.#eventsKey(taskId);
    const existing = await this.#getJson(key);
    const list = Array.isArray(existing) ? existing : [];
    const id = (list[list.length - 1]?.id || 0) + 1;
    const stamped = { ...event, id, timestamp: event.timestamp || new Date().toISOString() };
    list.push(stamped);
    await this.#putJson(key, list);
    return stamped;
  }

  async listEvents(taskId, { sinceId = 0 } = {}) {
    if (!this.available) return [];
    const list = await this.#getJson(this.#eventsKey(taskId));
    if (!Array.isArray(list)) return [];
    return list.filter((e) => e.id > sinceId);
  }

  // Best-effort lease: read-modify-write without CAS. Expiry bounds the
  // damage of a lost renewal. Documented as non-atomic.
  async acquireLease(taskId, holder, ttlMs = 30_000) {
    if (!this.available) {
      return { acquired: true, expiresAt: Date.now() + ttlMs, bestEffort: true };
    }
    const key = this.#leaseKey(taskId);
    const now = Date.now();
    const existing = await this.#getJson(key);
    if (existing && existing.holder !== holder && existing.expiresAt > now) {
      return { acquired: false, expiresAt: existing.expiresAt, error: `Lease held by ${existing.holder}` };
    }
    const expiresAt = now + ttlMs;
    await this.#putJson(key, { holder, expiresAt, acquiredAt: now });
    return { acquired: true, expiresAt, bestEffort: true };
  }

  async renewLease(taskId, holder, ttlMs = 30_000) {
    if (!this.available) return true;
    const key = this.#leaseKey(taskId);
    const existing = await this.#getJson(key);
    if (!existing || existing.holder !== holder) return false;
    existing.expiresAt = Date.now() + ttlMs;
    await this.#putJson(key, existing);
    return true;
  }

  async releaseLease(taskId, holder) {
    if (!this.available) return true;
    const key = this.#leaseKey(taskId);
    const existing = await this.#getJson(key);
    if (!existing || existing.holder !== holder) return false;
    await this.bucket.delete(key);
    return true;
  }
}

function safeSegment(value) {
  return String(value || 'task').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
}
