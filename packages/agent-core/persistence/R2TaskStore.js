// R2-backed task store for the Cloudflare Worker.
//
// Honesty contract: R2 offers no atomic compare-and-swap, so updateTask is a
// read-modify-write and leases are best-effort (a racing holder can win).
// This store never claims atomic lock semantics; coordination guarantees come
// from the in-process TaskManager mutex plus lease expiry.

import { TaskStore } from './TaskStore.js';
import {
  userTaskKey,
  userTaskEventsKey,
  userTaskLeaseKey,
  userTaskPrefix,
  legacyTaskKey,
  legacyTaskEventsKey,
  legacyTaskLeaseKey,
  getWithFallback,
  listWithFallback,
} from '../../../worker/storageKeys.js';

export class R2TaskStore extends TaskStore {
  constructor({ bucket } = {}) {
    super();
    this.bucket = bucket;
  }

  get available() {
    return Boolean(this.bucket && typeof this.bucket.get === 'function' && typeof this.bucket.put === 'function');
  }

  async #getJson(key) {
    if (!key) return null;
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

  async #getJsonWithFallback(userKey, legacyKey) {
    const { object } = await getWithFallback(this.bucket, userKey, legacyKey);
    if (!object) return null;
    try {
      return JSON.parse(await object.text());
    } catch {
      return null;
    }
  }

  // Locate a task written before the caller knew the owner: legacy flat key
  // first, then a bounded scan of per-user folders. R2TaskStore is the
  // no-D1 fallback (tests / local dev), so a bounded scan is acceptable and
  // only runs when both direct lookups miss. A backend read failure on a
  // matching key propagates (fail closed: callers retry) instead of
  // masquerading as a miss; only absent keys are skipped.
  async #scanUserTask(taskId) {
    let listing;
    try {
      listing = await this.bucket.list({ prefix: 'users/', limit: 1000 });
    } catch {
      return null;
    }
    const suffix = `tasks/${safeSegment(taskId)}.json`;
    for (const obj of listing?.objects || []) {
      if (obj.key.endsWith(suffix) && !obj.key.includes('.events') && !obj.key.includes('.lease')) {
        const task = await this.#getJson(obj.key);
        if (task && task.taskId === taskId) return task;
      }
    }
    return null;
  }

  #userIdOf(taskLike) {
    const uid = taskLike?.userId;
    return typeof uid === 'string' && uid ? uid : null;
  }

  async createTask(task) {
    const uid = this.#userIdOf(task);
    const key = uid ? userTaskKey(uid, task.taskId) : legacyTaskKey(task.taskId);
    await this.#putJson(key, task);
    return JSON.parse(JSON.stringify(task));
  }

  async getTask(taskId, options = {}) {
    if (!this.available) return null;
    const hint = typeof options === 'string' ? options : options?.userId;
    if (hint) {
      const found = await this.#getJsonWithFallback(userTaskKey(hint, taskId), legacyTaskKey(taskId));
      if (found) return found;
    } else {
      const legacy = await this.#getJson(legacyTaskKey(taskId));
      if (legacy) return legacy;
    }
    // Pre-move record without a hint, or a per-user record read without one.
    return this.#scanUserTask(taskId);
  }

  async updateTask(taskId, patch, options = {}) {
    const task = await this.getTask(taskId, options);
    if (!task) return null;
    const next = { ...task, ...JSON.parse(JSON.stringify(patch)), taskId, updatedAt: new Date().toISOString() };
    const uid = this.#userIdOf(next) || (typeof options === 'string' ? options : options?.userId) || null;
    const key = uid ? userTaskKey(uid, taskId) : legacyTaskKey(taskId);
    await this.#putJson(key, next);
    // Best-effort legacy cleanup: a task that moved folders must not linger
    // in both places.
    if (uid) {
      try { await this.bucket.delete(legacyTaskKey(taskId)); } catch { /* best effort */ }
    }
    return next;
  }

  // Best-effort fenced write: the lease record is checked before the
  // read-modify-write. R2 has no atomic compare-and-swap, so this narrows —
  // but cannot fully close — the window where a stale owner writes; D1's
  // conditional UPDATE is the atomic implementation.
  async updateTaskFenced(taskId, patch, leaseToken, options = {}) {
    if (!this.available) return null;
    const hint = typeof options === 'string' ? options : options?.userId;
    // Resolve the owner for the lease lookup: explicit hint wins, otherwise
    // the stored task's userId.
    let owner = hint || null;
    if (!owner) {
      const current = await this.getTask(taskId);
      owner = this.#userIdOf(current);
    }
    const leaseKey = owner ? userTaskLeaseKey(owner, taskId) : legacyTaskLeaseKey(taskId);
    const leaseFallback = owner ? legacyTaskLeaseKey(taskId) : null;
    const lease = await this.#getJsonWithFallback(leaseKey, leaseFallback);
    if (
      !lease ||
      lease.holder !== String(leaseToken) ||
      Number(lease.expiresAt) <= Date.now()
    ) {
      return null;
    }
    return this.updateTask(taskId, patch, owner ? { userId: owner } : {});
  }

  async listTasks(filter = {}) {
    if (!this.available) return [];
    // Per-user folder first (cheap prefix scan); legacy flat namespace as
    // fallback so pre-move tasks still list. Merged by taskId, user copy wins.
    const byId = new Map();
    const prefixes = [];
    if (filter.userId) {
      prefixes.push(userTaskPrefix(filter.userId));
      prefixes.push('tasks/');
    } else {
      prefixes.push('users/');
      prefixes.push('tasks/');
    }
    for (const prefix of prefixes) {
      let listing;
      try {
        listing = await listWithFallback(this.bucket, prefix, null);
      } catch {
        continue;
      }
      for (const obj of listing?.objects || []) {
        if (!obj.key.endsWith('.json') || obj.key.includes('.events') || obj.key.includes('.lease') || obj.key.includes('.session')) continue;
        // When filtering by user, skip other users' folders without a GET.
        if (filter.userId && obj.key.startsWith('users/') && !obj.key.startsWith(userTaskPrefix(filter.userId))) continue;
        const task = await this.#getJson(obj.key);
        if (!task) continue;
        if (filter.userId && task.userId !== filter.userId) continue;
        if (filter.sessionId && task.sessionId !== filter.sessionId) continue;
        if (filter.status && task.status !== filter.status) continue;
        if (task.taskId && !byId.has(task.taskId)) byId.set(task.taskId, task);
      }
      // Scoped listing with a user filter never needs the legacy/global pass
      // to also scan every other user's folder.
      if (filter.userId && prefix === userTaskPrefix(filter.userId)) {
        // Still check legacy flat keys for pre-move tasks of this user.
        continue;
      }
    }
    return [...byId.values()];
  }

  async #eventsKeysFor(taskId, userIdHint) {
    if (userIdHint) {
      return [userTaskEventsKey(userIdHint, taskId), legacyTaskEventsKey(taskId)];
    }
    const task = await this.getTask(taskId);
    const owner = this.#userIdOf(task);
    if (owner) return [userTaskEventsKey(owner, taskId), legacyTaskEventsKey(taskId)];
    return [legacyTaskEventsKey(taskId), null];
  }

  async appendEvent(taskId, event, options = {}) {
    if (!this.available) return null;
    const hint = typeof options === 'string' ? options : options?.userId || event?.userId;
    const [primary, fallback] = await this.#eventsKeysFor(taskId, hint);
    const existing = await this.#getJsonWithFallback(primary, fallback);
    const list = Array.isArray(existing) ? existing : [];
    const id = (list[list.length - 1]?.id || 0) + 1;
    const stamped = { ...event, id, timestamp: event.timestamp || new Date().toISOString() };
    list.push(stamped);
    await this.#putJson(primary, list);
    return stamped;
  }

  async listEvents(taskId, { sinceId = 0, userId = null } = {}) {
    if (!this.available) return [];
    const [primary, fallback] = await this.#eventsKeysFor(taskId, userId);
    const list = await this.#getJsonWithFallback(primary, fallback);
    if (!Array.isArray(list)) return [];
    return list.filter((e) => e.id > sinceId);
  }

  async #leaseKeysFor(taskId, userIdHint) {
    if (userIdHint) {
      return [userTaskLeaseKey(userIdHint, taskId), legacyTaskLeaseKey(taskId)];
    }
    const task = await this.getTask(taskId).catch(() => null);
    const owner = this.#userIdOf(task);
    if (owner) return [userTaskLeaseKey(owner, taskId), legacyTaskLeaseKey(taskId)];
    return [legacyTaskLeaseKey(taskId), null];
  }

  // Best-effort lease: read-modify-write without CAS. Expiry bounds the
  // damage of a lost renewal. Documented as non-atomic.
  async acquireLease(taskId, holder, ttlMs = 30_000, options = {}) {
    if (!this.available) {
      return { acquired: true, expiresAt: Date.now() + ttlMs, bestEffort: true };
    }
    const hint = typeof options === 'string' ? options : options?.userId;
    const [primary, fallback] = await this.#leaseKeysFor(taskId, hint);
    const key = primary;
    const now = Date.now();
    const existing = await this.#getJsonWithFallback(primary, fallback);
    if (existing && existing.holder !== holder && existing.expiresAt > now) {
      return { acquired: false, expiresAt: existing.expiresAt, error: `Lease held by ${existing.holder}` };
    }
    const expiresAt = now + ttlMs;
    await this.#putJson(key, { holder, expiresAt, acquiredAt: now });
    return { acquired: true, expiresAt, bestEffort: true };
  }

  async renewLease(taskId, holder, ttlMs = 30_000, options = {}) {
    if (!this.available) return true;
    const hint = typeof options === 'string' ? options : options?.userId;
    const [primary, fallback] = await this.#leaseKeysFor(taskId, hint);
    const existing = await this.#getJsonWithFallback(primary, fallback);
    if (!existing || existing.holder !== holder) return false;
    existing.expiresAt = Date.now() + ttlMs;
    await this.#putJson(primary, existing);
    return true;
  }

  async releaseLease(taskId, holder, options = {}) {
    if (!this.available) return true;
    const hint = typeof options === 'string' ? options : options?.userId;
    const [primary, fallback] = await this.#leaseKeysFor(taskId, hint);
    const existing = await this.#getJsonWithFallback(primary, fallback);
    if (!existing || existing.holder !== holder) return false;
    await this.bucket.delete(primary);
    if (fallback && fallback !== primary) {
      try { await this.bucket.delete(fallback); } catch { /* best effort */ }
    }
    return true;
  }
}

function safeSegment(value) {
  return String(value || 'task').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
}
