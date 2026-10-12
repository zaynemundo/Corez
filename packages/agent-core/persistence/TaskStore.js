// Durable task storage contract for the CoreZ harness.
//
// Implementations: MemoryTaskStore (tests/CLI), DiskTaskStore (CLI restarts),
// R2TaskStore (Worker fallback without D1), D1TaskStore (Worker coordination:
// atomic leases and ordered events). Leases provide task ownership; each
// backend is honest about its atomicity guarantees.

// Thrown when a run discovers it no longer holds the task lease. Lease loss is
// not a task failure: the stored task belongs to whoever holds the lease now,
// and the losing runner must stop writing instead of marking the task.
export class LeaseLostError extends Error {
  constructor(taskId, message) {
    super(message || `Task lease lost for ${taskId}.`);
    this.name = 'LeaseLostError';
    this.code = 'TASK_LEASE_LOST';
    this.taskId = taskId;
  }
}

export class TaskStore {
  async createTask(_task) {
    throw new Error('TaskStore.createTask is not implemented');
  }

  async getTask(_taskId) {
    throw new Error('TaskStore.getTask is not implemented');
  }

  async updateTask(_taskId, _patch) {
    throw new Error('TaskStore.updateTask is not implemented');
  }

  // Fenced write: apply the patch only when `leaseToken` still holds a live
  // lease for the task. Returns the updated task, or null when the lease is
  // not held, so the write is rejected. Stores that cannot check a lease must
  // not implement this by falling back to an unfenced write.
  async updateTaskFenced(_taskId, _patch, _leaseToken) {
    throw new Error('TaskStore.updateTaskFenced is not implemented');
  }

  async listTasks(_filter = {}) {
    throw new Error('TaskStore.listTasks is not implemented');
  }

  async appendEvent(_taskId, _event) {
    throw new Error('TaskStore.appendEvent is not implemented');
  }

  async listEvents(_taskId, _options = {}) {
    throw new Error('TaskStore.listEvents is not implemented');
  }

  // Lease semantics: acquireLease returns { acquired, expiresAt, error }.
  // A lease expires automatically after ttlMs; the holder must renew before
  // expiry to keep ownership. Memory store is process-local; R2-based leases
  // are best-effort (no atomic compare-and-swap), documented as such.
  async acquireLease(_taskId, _holder, _ttlMs = 30_000) {
    return { acquired: false, expiresAt: null, error: 'not implemented' };
  }

  async renewLease(_taskId, _holder, _ttlMs = 30_000) {
    return false;
  }

  async releaseLease(_taskId, _holder) {
    return false;
  }
}

export class MemoryTaskStore extends TaskStore {
  constructor() {
    super();
    this.tasks = new Map();
    this.events = new Map();
    this.leases = new Map();
    this.eventCounter = new Map();
  }

  async createTask(task) {
    this.tasks.set(task.taskId, JSON.parse(JSON.stringify(task)));
    return this.tasks.get(task.taskId);
  }

  async getTask(taskId) {
    const task = this.tasks.get(taskId);
    return task ? JSON.parse(JSON.stringify(task)) : null;
  }

  async updateTask(taskId, patch) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    const next = { ...task, ...JSON.parse(JSON.stringify(patch)), taskId, updatedAt: new Date().toISOString() };
    this.tasks.set(taskId, next);
    return next;
  }

  async updateTaskFenced(taskId, patch, leaseToken) {
    const lease = this.leases.get(taskId);
    if (!lease || lease.holder !== String(leaseToken) || lease.expiresAt <= Date.now()) {
      return null;
    }
    return this.updateTask(taskId, patch);
  }

  async listTasks(filter = {}) {
    let tasks = Array.from(this.tasks.values());
    if (filter.userId) tasks = tasks.filter((t) => t.userId === filter.userId);
    if (filter.sessionId) tasks = tasks.filter((t) => t.sessionId === filter.sessionId);
    if (filter.status) tasks = tasks.filter((t) => t.status === filter.status);
    return JSON.parse(JSON.stringify(tasks));
  }

  async appendEvent(taskId, event) {
    const list = this.events.get(taskId) || [];
    const id = (this.eventCounter.get(taskId) || 0) + 1;
    this.eventCounter.set(taskId, id);
    const stamped = { ...event, id, timestamp: event.timestamp || new Date().toISOString() };
    list.push(stamped);
    this.events.set(taskId, list);
    return stamped;
  }

  async listEvents(taskId, { sinceId = 0 } = {}) {
    const list = this.events.get(taskId) || [];
    return list.filter((e) => e.id > sinceId);
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
