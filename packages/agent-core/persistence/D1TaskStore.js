// D1-backed task store for the Cloudflare Worker.
//
// Why D1 (and not more R2): R2 has no compare-and-swap and no transactional
// writes, so the R2 store's leases and event arrays were read-modify-write
// races — two concurrent updates could both "win" a lease or silently drop
// events. D1 is a single-writer SQLite database: conditional upserts and
// INSERT statements are atomic, which is exactly what task ownership and
// ordered event replay need.
//
// Coordination contract:
// - Leases are atomic. acquireLease is one conditional upsert that only
//   succeeds when the lease is free, expired, or already held by the same
//   holder; every other contender gets acquired: false.
// - Events are append-only. The event id is assigned by SQLite itself
//   (INTEGER PRIMARY KEY AUTOINCREMENT), so concurrent appends from different
//   isolates never overwrite each other and `sinceId` replay stays ordered.
// - The task document merges patches with a read-modify-write, but only the
//   lease holder executes a task, so a single writer owns the document. The
//   atomic lease is what makes that guarantee real.
// - Large artifacts stay out of D1: the session-log snapshot is written to R2
//   under `users/<uid>/tasks/<taskId>.session.json` (legacy
//   `tasks/<taskId>.session.json` read as fallback) and the D1 row keeps only
//   the task document. R2 remains the artifact store; D1 is the coordinator.

import { TaskStore } from './TaskStore.js';
import {
  userTaskSessionKey,
  legacyTaskSessionKey,
} from '../../../worker/storageKeys.js';

const TASKS_TABLE = 'harness_tasks';
const EVENTS_TABLE = 'harness_task_events';
const LEASES_TABLE = 'harness_task_leases';
const DISPATCHES_TABLE = 'harness_task_dispatches';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ${TASKS_TABLE} (
     task_id TEXT PRIMARY KEY,
     user_id TEXT,
     session_id TEXT,
     status TEXT NOT NULL,
     doc TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     terminal_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_harness_tasks_user ON ${TASKS_TABLE} (user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_harness_tasks_session ON ${TASKS_TABLE} (session_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_harness_tasks_status ON ${TASKS_TABLE} (status, updated_at)`,
  `CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id TEXT NOT NULL,
     event TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_harness_task_events_task ON ${EVENTS_TABLE} (task_id, id)`,
  `CREATE TABLE IF NOT EXISTS ${LEASES_TABLE} (
     task_id TEXT PRIMARY KEY,
     holder TEXT NOT NULL,
     expires_at INTEGER NOT NULL,
     acquired_at INTEGER NOT NULL
   )`,
  // Durable dispatch outbox: a queue-backed dispatcher writes the record
  // BEFORE attempting the send, so a Queue outage, a lost send response or an
  // evicted invocation can never strand an accepted task. A sweeper reclaims
  // `pending`/expired-`claimed` rows and re-sends them; the record is deleted
  // only after a successful send (or when the task is already terminal or
  // running under another live runner, which makes the record unnecessary).
  `CREATE TABLE IF NOT EXISTS ${DISPATCHES_TABLE} (
     task_id TEXT PRIMARY KEY,
     status TEXT NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     next_attempt_at INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_harness_task_dispatches_pending
     ON ${DISPATCHES_TABLE} (next_attempt_at)`
];

// Schema creation is idempotent and cached per D1 binding object so a busy
// isolate does not re-run DDL on every request (the same pattern as auth.js).
const schemaReady = new WeakSet();

const UPSERT_TASK = `
  INSERT INTO ${TASKS_TABLE} (task_id, user_id, session_id, status, doc, created_at, updated_at, terminal_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(task_id) DO UPDATE SET
    user_id = excluded.user_id,
    session_id = excluded.session_id,
    status = excluded.status,
    doc = excluded.doc,
    updated_at = excluded.updated_at,
    terminal_at = excluded.terminal_at`;

const UPDATE_TASK = `
  UPDATE ${TASKS_TABLE}
  SET user_id = ?, session_id = ?, status = ?, doc = ?, updated_at = ?, terminal_at = ?
  WHERE task_id = ?`;

// Fenced write: the task document only changes while the caller still holds a
// live lease row. The lease check is part of the same UPDATE statement, so a
// previous owner cannot overwrite the new owner's progress even if its write
// is already in flight when the lease moves on.
const UPDATE_TASK_FENCED = `
  UPDATE ${TASKS_TABLE}
  SET user_id = ?, session_id = ?, status = ?, doc = ?, updated_at = ?, terminal_at = ?
  WHERE task_id = ?
    AND EXISTS (
      SELECT 1 FROM ${LEASES_TABLE}
      WHERE task_id = ? AND holder = ? AND expires_at > ?
    )`;

// One statement wins the lease: insert when free, replace when expired or
// when the same holder is re-acquiring. The WHERE clause applies to the
// conflict update, so a live foreign lease changes nothing (changes === 0).
const ACQUIRE_LEASE = `
  INSERT INTO ${LEASES_TABLE} (task_id, holder, expires_at, acquired_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(task_id) DO UPDATE SET
    holder = excluded.holder,
    expires_at = excluded.expires_at,
    acquired_at = excluded.acquired_at
  WHERE ${LEASES_TABLE}.holder = excluded.holder
     OR ${LEASES_TABLE}.expires_at <= ?`;

const RENEW_LEASE = `
  UPDATE ${LEASES_TABLE} SET expires_at = ?
  WHERE task_id = ? AND holder = ?`;

const RELEASE_LEASE = `
  DELETE FROM ${LEASES_TABLE} WHERE task_id = ? AND holder = ?`;

const READ_LEASE = `
  SELECT holder, expires_at FROM ${LEASES_TABLE} WHERE task_id = ?`;

// Idempotent: re-recording a dispatch for the same task is a no-op (the
// original pending window is preserved). A record still in flight is never
// reset by a later record call.
const RECORD_DISPATCH = `
  INSERT INTO ${DISPATCHES_TABLE} (task_id, status, attempts, next_attempt_at, created_at, updated_at)
  VALUES (?, 'pending', 0, ?, ?, ?)
  ON CONFLICT(task_id) DO NOTHING`;

// The read that decides the expected attempts value before a conditional
// claim. Kept separate from the leased `claimed` window: this only answers
// "does the row exist and what is its attempt counter".
const READ_DISPATCH = `
  SELECT attempts, status FROM ${DISPATCHES_TABLE} WHERE task_id = ?`;

// Claim is atomic and time-bounded: a row is claimable while pending and due,
// or when a previous claim went stale (the claiming worker died). The
// attempts compare-and-set (`attempts` unchanged since the read) makes two
// sweepers that read the same version race safely — exactly one update wins.
// A successful claim sets next_attempt_at a full claim window ahead.
const CLAIM_DISPATCH = `
  UPDATE ${DISPATCHES_TABLE}
  SET status = 'claimed',
      attempts = attempts + 1,
      next_attempt_at = ?,
      updated_at = ?
  WHERE task_id = ?
    AND attempts = ?
    AND (status = 'pending' OR (status = 'claimed' AND next_attempt_at <= ?))
    AND next_attempt_at <= ?`;

// The dispatch is done (send accepted, task terminal, or the explicit inline
// fallback took ownership): the record must not be retried. Deletion is
// idempotent and unconditional — "remove whatever record exists for this
// task" is correct even if a concurrent claim just bumped the attempts.
const DELETE_DISPATCH = `
  DELETE FROM ${DISPATCHES_TABLE} WHERE task_id = ?`;

// The send failed: hand the record back for a later sweep with a backoff. The
// attempts guard makes this a no-op if another worker already claimed it.
const RESET_DISPATCH = `
  UPDATE ${DISPATCHES_TABLE}
  SET status = 'pending', next_attempt_at = ?, updated_at = ?
  WHERE task_id = ? AND attempts = ?`;

// The outbox row is joined to the live task so terminal work is never
// re-sent and a removed task does not leave an immortal record. A task with no
// row yet (in flight between createTask and dispatchTaskExecution) is still
// swept: the caller holds the task document, which is what executeTask needs.
// `claimed` rows are only listed once the claim window expired (a crashed
// claimant), so a healthy send is never duplicated.
const SELECT_DISPATCHES = `
  SELECT d.task_id, d.attempts, t.status AS task_status
  FROM ${DISPATCHES_TABLE} AS d
  LEFT JOIN ${TASKS_TABLE} AS t ON t.task_id = d.task_id
  WHERE (d.status = 'pending' OR (d.status = 'claimed' AND d.next_attempt_at <= ?))
    AND d.next_attempt_at <= ?
    AND (t.status IS NULL OR t.status IN ('pending', 'running'))
  ORDER BY d.next_attempt_at ASC
  LIMIT ?`;

export class D1TaskStore extends TaskStore {
  constructor({ db, bucket = null } = {}) {
    super();
    this.db = db;
    this.bucket = bucket;
  }

  get available() {
    return Boolean(this.db && typeof this.db.prepare === 'function');
  }

  #sessionKey(taskId, userId = null) {
    if (userId !== null && userId !== undefined && userId !== '') {
      return userTaskSessionKey(userId, taskId);
    }
    return legacyTaskSessionKey(taskId);
  }

  async #ensureSchema() {
    if (!this.available) return false;
    const db = this.db;
    if (schemaReady.has(db)) return true;
    if (typeof db.batch === 'function') {
      await db.batch(SCHEMA.map((statement) => db.prepare(statement)));
    } else {
      for (const statement of SCHEMA) {
        await db.prepare(statement).run();
      }
    }
    schemaReady.add(db);
    return true;
  }

  #splitArtifacts(task) {
    const doc = clone(task);
    let sessionLog = null;
    if (Object.prototype.hasOwnProperty.call(doc, 'sessionLog')) {
      sessionLog = doc.sessionLog;
      delete doc.sessionLog;
    }
    return { doc, sessionLog };
  }

  async #storeSessionLog(taskId, sessionLog, userId = null) {
    if (sessionLog === null || sessionLog === undefined) return;
    if (!this.bucket || typeof this.bucket.put !== 'function') return;
    try {
      await this.bucket.put(this.#sessionKey(taskId, userId), JSON.stringify(sessionLog), {
        httpMetadata: { contentType: 'application/json' }
      });
    } catch {
      // Artifact persistence is best-effort: the D1 document is the source of
      // truth for task state, and the log can be re-derived from events.
    }
  }

  async createTask(task) {
    if (!this.available) return null;
    await this.#ensureSchema();
    const { doc, sessionLog } = this.#splitArtifacts(task);
    const now = Date.now();
    await this.db.prepare(UPSERT_TASK).bind(
      String(task.taskId),
      doc.userId ?? null,
      doc.sessionId ?? null,
      doc.status || 'pending',
      JSON.stringify(doc),
      epochMs(doc.createdAt, now),
      now,
      epochMs(doc.terminalAt, null)
    ).run();
    await this.#storeSessionLog(task.taskId, sessionLog, doc.userId ?? task.userId ?? null);
    return clone(task);
  }

  async getTask(taskId) {
    if (!this.available) return null;
    await this.#ensureSchema();
    const row = await this.db.prepare(
      `SELECT doc FROM ${TASKS_TABLE} WHERE task_id = ?`
    ).bind(String(taskId)).first();
    if (!row?.doc) return null;
    try {
      return JSON.parse(row.doc);
    } catch {
      return null;
    }
  }

  async updateTask(taskId, patch) {
    if (!this.available) return null;
    await this.#ensureSchema();
    const current = await this.getTask(taskId);
    if (!current) return null;
    const next = { ...current, ...clone(patch), taskId, updatedAt: new Date().toISOString() };
    const { doc, sessionLog } = this.#splitArtifacts(next);
    await this.db.prepare(UPDATE_TASK).bind(
      doc.userId ?? null,
      doc.sessionId ?? null,
      doc.status || 'pending',
      JSON.stringify(doc),
      Date.now(),
      epochMs(doc.terminalAt, null),
      String(taskId)
    ).run();
    await this.#storeSessionLog(taskId, sessionLog, doc.userId ?? current.userId ?? null);
    return next;
  }

  async updateTaskFenced(taskId, patch, leaseToken) {
    if (!this.available) return null;
    await this.#ensureSchema();
    const current = await this.getTask(taskId);
    if (!current) return null;
    const next = { ...current, ...clone(patch), taskId, updatedAt: new Date().toISOString() };
    const { doc, sessionLog } = this.#splitArtifacts(next);
    const now = Date.now();
    const result = await this.db.prepare(UPDATE_TASK_FENCED).bind(
      doc.userId ?? null,
      doc.sessionId ?? null,
      doc.status || 'pending',
      JSON.stringify(doc),
      now,
      epochMs(doc.terminalAt, null),
      String(taskId),
      String(taskId),
      String(leaseToken),
      now
    ).run();
    if ((Number(result?.meta?.changes) || 0) === 0) return null;
    await this.#storeSessionLog(taskId, sessionLog, doc.userId ?? current.userId ?? null);
    return next;
  }

  async listTasks(filter = {}) {
    if (!this.available) return [];
    await this.#ensureSchema();
    const clauses = [];
    const binds = [];
    if (filter.userId) {
      clauses.push('user_id = ?');
      binds.push(filter.userId);
    }
    if (filter.sessionId) {
      clauses.push('session_id = ?');
      binds.push(filter.sessionId);
    }
    if (filter.status) {
      clauses.push('status = ?');
      binds.push(filter.status);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await this.db.prepare(
      `SELECT doc FROM ${TASKS_TABLE} ${where} ORDER BY updated_at DESC LIMIT 1000`
    ).bind(...binds).all();
    const tasks = [];
    for (const row of rows?.results || []) {
      if (!row?.doc) continue;
      try {
        tasks.push(JSON.parse(row.doc));
      } catch {
        // Skip a corrupt row instead of failing the whole listing.
      }
    }
    return tasks;
  }

  async appendEvent(taskId, event) {
    if (!this.available) return null;
    await this.#ensureSchema();
    const stamped = {
      ...event,
      taskId,
      timestamp: event?.timestamp || new Date().toISOString()
    };
    const result = await this.db.prepare(
      `INSERT INTO ${EVENTS_TABLE} (task_id, event, created_at) VALUES (?, ?, ?)`
    ).bind(String(taskId), JSON.stringify(stamped), Date.now()).run();
    const id = Number(result?.meta?.last_row_id) || 0;
    if (id > 0) stamped.id = id;
    return stamped;
  }

  async listEvents(taskId, { sinceId = 0, limit = 1000 } = {}) {
    if (!this.available) return [];
    await this.#ensureSchema();
    const rows = await this.db.prepare(
      `SELECT id, event FROM ${EVENTS_TABLE}
       WHERE task_id = ? AND id > ?
       ORDER BY id ASC LIMIT ?`
    ).bind(String(taskId), Number(sinceId) || 0, clampLimit(limit)).all();
    const events = [];
    for (const row of rows?.results || []) {
      try {
        const parsed = JSON.parse(row.event);
        parsed.id = Number(row.id);
        events.push(parsed);
      } catch {
        // Skip an unreadable event; the rest of the replay is still valid.
      }
    }
    return events;
  }

  // Atomic lease acquisition: exactly one contender can win while the lease
  // is live. The conditional upsert decides the winner inside SQLite, so two
  // concurrent invocations can never both believe they own the task.
  async acquireLease(taskId, holder, ttlMs = 30_000) {
    if (!this.available) {
      return { acquired: true, expiresAt: Date.now() + ttlMs, bestEffort: true };
    }
    await this.#ensureSchema();
    const now = Date.now();
    const ttl = Number(ttlMs) > 0 ? Number(ttlMs) : 30_000;
    const expiresAt = now + ttl;
    const result = await this.db.prepare(ACQUIRE_LEASE)
      .bind(String(taskId), String(holder), expiresAt, now, now)
      .run();
    const changes = Number(result?.meta?.changes) || 0;
    if (changes > 0) return { acquired: true, expiresAt };
    const existing = await this.db.prepare(READ_LEASE).bind(String(taskId)).first();
    return {
      acquired: false,
      expiresAt: Number(existing?.expires_at) || null,
      error: `Lease held by ${existing?.holder || 'another runner'}`
    };
  }

  async renewLease(taskId, holder, ttlMs = 30_000) {
    if (!this.available) return true;
    await this.#ensureSchema();
    const ttl = Number(ttlMs) > 0 ? Number(ttlMs) : 30_000;
    const result = await this.db.prepare(RENEW_LEASE)
      .bind(Date.now() + ttl, String(taskId), String(holder))
      .run();
    return (Number(result?.meta?.changes) || 0) > 0;
  }

  async releaseLease(taskId, holder) {
    if (!this.available) return true;
    await this.#ensureSchema();
    const result = await this.db.prepare(RELEASE_LEASE)
      .bind(String(taskId), String(holder))
      .run();
    return (Number(result?.meta?.changes) || 0) > 0;
  }

  // ---- Durable dispatch outbox -----------------------------------------
  // The queue-backed dispatcher records the intent to dispatch BEFORE the
  // send, so a Queue outage can never silently strand an accepted task. The
  // sweeper (`worker/taskRunner.js` sweepPendingTaskDispatches) reclaims due
  // rows and re-sends them; duplicate sends are safe because executeTask is
  // idempotent (terminal skip + atomic lease).

  // Persist the dispatch intent. Idempotent per task. With no delay the row is
  // immediately due (`Date.now() - 1`) so a claim in the same millisecond — or
  // across a clock that ticks backwards — still satisfies `next_attempt_at <= now`.
  async recordDispatch(taskId, { delaySeconds = 0 } = {}) {
    if (!this.available) return null;
    await this.#ensureSchema();
    const now = Date.now();
    const delayMs =
      Number.isFinite(delaySeconds) && delaySeconds > 0
        ? Math.floor(delaySeconds * 1000)
        : 0;
    const dueAt = now + delayMs - (delayMs > 0 ? 0 : 1);
    await this.db.prepare(RECORD_DISPATCH).bind(
      String(taskId),
      dueAt,
      now,
      now
    ).run();
    return { taskId: String(taskId), status: 'pending', nextAttemptAt: dueAt };
  }

  // Atomically take ownership of a due dispatch record. The read decides
  // `attempts`; the conditional update then wins only if the row still holds
  // that value and is due/claimable, so exactly one concurrent sweeper can
  // claim it. `leaseMs` bounds how long the claim blocks other sweepers.
  // Returns false when the row is gone, not due, claimed elsewhere, or the
  // task already reached a terminal state.
  async claimDispatch(taskId, { leaseMs = 120_000 } = {}) {
    if (!this.available) return false;
    await this.#ensureSchema();
    const now = Date.now();
    let row;
    try {
      row = await this.db.prepare(READ_DISPATCH)
        .bind(String(taskId))
        .first();
    } catch {
      return false;
    }
    if (!row) return false;
    const attempts = Number(row.attempts) || 0;
    const result = await this.db.prepare(CLAIM_DISPATCH).bind(
      now + Math.max(1, Math.floor(leaseMs)),
      now,
      String(taskId),
      attempts,
      now,
      now
    ).run();
    return (Number(result?.meta?.changes) || 0) > 0;
  }

  // The send was accepted (or the task is terminal / running elsewhere): the
  // record must never be re-sent.
  async deleteDispatch(taskId) {
    if (!this.available) return false;
    await this.#ensureSchema();
    const result = await this.db.prepare(DELETE_DISPATCH)
      .bind(String(taskId))
      .run();
    return (Number(result?.meta?.changes) || 0) > 0;
  }

  // Release a failed send back to `pending` with a backoff so the next sweep
  // retries it. `attempt` is the attempts value the caller observed at claim
  // time (the compare-and-set guard); without it the call is refused rather
  // than risking a blind reset of a record another worker now owns.
  async resetDispatch(taskId, { attempt, delaySeconds = 0 } = {}) {
    if (!this.available) return false;
    if (!Number.isFinite(attempt) || attempt < 0) return false;
    await this.#ensureSchema();
    const now = Date.now();
    const delayMs =
      Number.isFinite(delaySeconds) && delaySeconds > 0
        ? Math.floor(delaySeconds * 1000)
        : 0;
    const result = await this.db.prepare(RESET_DISPATCH).bind(
      now + delayMs,
      now,
      String(taskId),
      Math.floor(attempt)
    ).run();
    return (Number(result?.meta?.changes) || 0) > 0;
  }

  // Pending dispatch records that are due (or whose claim expired) and whose
  // task is still dispatchable. `limit` bounds one sweep pass.
  async listPendingDispatches({ limit = 10 } = {}) {
    if (!this.available) return [];
    await this.#ensureSchema();
    const now = Date.now();
    const rows = await this.db.prepare(SELECT_DISPATCHES).bind(
      now,
      now,
      clampLimit(limit)
    ).all();
    return (rows?.results || []).map((row) => ({
      taskId: String(row.task_id),
      attempts: Number(row.attempts) || 0,
      taskStatus: row.task_status ?? null
    }));
  }

  // Session-log snapshots live in R2, not D1. Nothing in the harness reads
  // them back for execution (deriveMessages rebuilds history from the task
  // document), so this is offered for operators and replay tooling only.
  // Per-user layout with legacy fallback; an explicit userId hint avoids
  // the bounded users/ scan.
  async getSessionLog(taskId, options = {}) {
    if (!this.bucket || typeof this.bucket.get !== 'function') return null;
    const hint = typeof options === 'string' ? options : options?.userId;
    const keysToTry = [];
    if (hint) keysToTry.push(this.#sessionKey(taskId, hint));
    keysToTry.push(this.#sessionKey(taskId, null));
    for (const key of keysToTry) {
      try {
        const object = await this.bucket.get(key);
        if (!object) continue;
        try {
          return JSON.parse(await object.text());
        } catch {
          return null;
        }
      } catch {
        // try next
      }
    }
    if (!hint && typeof this.bucket.list === 'function') {
      // Bounded fallback scan for a per-user log read without a hint.
      try {
        const listing = await this.bucket.list({ prefix: 'users/', limit: 1000 });
        const suffix = `tasks/${safeSegment(taskId)}.session.json`;
        for (const obj of listing?.objects || []) {
          if (obj.key.endsWith(suffix)) {
            const object = await this.bucket.get(obj.key);
            if (!object) continue;
            try {
              return JSON.parse(await object.text());
            } catch {
              return null;
            }
          }
        }
      } catch {
        // miss
      }
    }
    return null;
  }
}

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function epochMs(value, fallback) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1000;
  return Math.min(Math.floor(parsed), 5000);
}

function safeSegment(value) {
  return String(value || 'task').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
}
