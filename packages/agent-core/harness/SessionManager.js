// Sessions link users to their tasks. Ownership is enforced in TaskManager
// (a task belongs to exactly one user, and no endpoint may read, mutate or
// cancel another user's task).
//
// Extended with Session Forking (inspired by DeepSeek Harness dsh-session / dsh-subagent):
// Allows child agents, subagents, and swarm specialists to fork parent session state
// and execute exploratory tasks on isolated branches without mutating parent history.
//
// Phase C upgrade: DSH SessionStore parity — durable header, firstLiveSeq,
// seed/fork boundary, jsonl persistence, and SessionLog ownership.

import fs from 'node:fs';
import path from 'node:path';
import { SessionLog, SESSION_FORMAT_VERSION } from './SessionLog.js';

export class SessionManager {
  constructor(options = {}) {
    this.sessions = new Map();
    this.logs = new Map(); // sessionKey -> SessionLog
    this.persistDir = options.persistDir || null; // e.g. artifacts/sessions
    if (this.persistDir) {
      try { fs.mkdirSync(this.persistDir, { recursive: true }); } catch {}
    }
  }

  sessionKey(userId, sessionId) {
    return `${userId}::${sessionId || 'default'}`;
  }

  createSession({ userId = 'anonymous', sessionId = 'default', meta = {} } = {}) {
    const key = this.sessionKey(userId, sessionId);
    if (!this.sessions.has(key)) {
      this.sessions.set(key, {
        userId,
        sessionId,
        createdAt: new Date().toISOString(),
        taskIds: new Set(),
        meta: { ...meta },
        forks: new Map(),
        parentSessionKey: null
      });
    }
    // also ensure a SessionLog exists for this session (DSH: Session + header)
    if (!this.logs.has(key)) {
      const header = {
        version: SESSION_FORMAT_VERSION,
        id: sessionId,
        createdAt: Date.now(),
        ...(meta.cwd ? { cwd: String(meta.cwd) } : {}),
        ...(meta.parentSession ? { parentSession: String(meta.parentSession) } : {}),
        ...(meta.agentPreset ? { agentPreset: String(meta.agentPreset) } : {}),
        ...(Number.isFinite(meta.delegationDepth) ? { delegationDepth: meta.delegationDepth } : {}),
        ...(meta.origin ? { origin: meta.origin } : {})
      };
      const log = new SessionLog({ sessionId, header });
      this.logs.set(key, log);
      // optionally wrap append for jsonl persistence
      this._wrapLogPersistence(key, log);
    }
    return this.sessions.get(key);
  }

  getSession(userId, sessionId) {
    const key = this.sessionKey(userId, sessionId);
    return this.sessions.get(key) || null;
  }

  getLog(userId, sessionId) {
    const key = this.sessionKey(userId, sessionId);
    return this.logs.get(key) || null;
  }

  // DSH parity: SessionStore.create / SessionLog factory
  createLog(userId, sessionId, opts = {}) {
    const key = this.sessionKey(userId, sessionId);
    if (this.logs.has(key)) return this.logs.get(key);
    const header = {
      version: SESSION_FORMAT_VERSION,
      id: sessionId,
      createdAt: Date.now(),
      ...opts.header
    };
    const log = new SessionLog({ sessionId, header, seed: opts.seed || [], seedSource: opts.seedSource });
    this.logs.set(key, log);
    this._wrapLogPersistence(key, log);
    return log;
  }

  attachTask({ userId, sessionId, taskId }) {
    const session = this.createSession({ userId, sessionId });
    session.taskIds.add(taskId);
    return session;
  }

  /**
   * Forks an existing session for a subagent or swarm specialist branch.
   * DSH parity: fork(source, boundary, childSessionId) where boundary is the
   * seq of the last event inherited from parent.
   * @param {object} options
   * @param {string} options.userId
   * @param {string} options.sourceSessionId
   * @param {string} options.childSessionId
   * @param {number} [options.boundaryStep]
   * @param {number} [options.boundarySeq] - if provided, used as seedLength
   * @param {object} [options.snapshot]
   * @returns {object} The created child session
   */
  forkSession({ userId = 'anonymous', sourceSessionId = 'default', childSessionId, boundaryStep = null, boundarySeq = null, snapshot = {} } = {}) {
    const sourceKey = this.sessionKey(userId, sourceSessionId);
    const parentSession = this.sessions.get(sourceKey);
    if (!parentSession) {
      throw new Error(`Cannot fork nonexistent session: "${sourceKey}"`);
    }

    const forkId = childSessionId || `${sourceSessionId}__fork_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const childKey = this.sessionKey(userId, forkId);

    const parentLog = this.logs.get(sourceKey);
    const boundary = boundarySeq !== null ? boundarySeq : (parentLog ? parentLog.seq : 0);
    const seed = parentLog ? parentLog.events.slice(0, boundary) : [];

    const childHeader = {
      version: SESSION_FORMAT_VERSION,
      id: forkId,
      createdAt: Date.now(),
      parentSession: String(sourceSessionId),
      seedLength: seed.length,
      origin: 'subagent',
      delegationDepth: (parentLog?.header?.delegationDepth || 0) + 1,
      ...(parentSession.meta?.cwd ? { cwd: parentSession.meta.cwd } : {}),
      ...(parentSession.meta?.agentPreset ? { agentPreset: parentSession.meta.agentPreset } : {})
    };

    const childLog = new SessionLog({ sessionId: forkId, header: childHeader, seed });
    // mark end-seed boundary if not already
    if (childLog.events.length > 0 && childLog.events[childLog.events.length - 1].type !== 'session/end-seed') {
      // end-seed is appended lazily on first live write; DSH does it in constructor if needed
    }
    this.logs.set(childKey, childLog);
    this._wrapLogPersistence(childKey, childLog);

    const childSession = {
      userId,
      sessionId: forkId,
      createdAt: new Date().toISOString(),
      taskIds: new Set(),
      parentSessionKey: sourceKey,
      forkedAtStep: boundaryStep,
      forkedAtSeq: boundary,
      meta: {
        ...parentSession.meta,
        isFork: true,
        parentSessionId: sourceSessionId
      },
      snapshot: {
        taskIds: Array.from(parentSession.taskIds),
        ...snapshot
      },
      forks: new Map()
    };

    this.sessions.set(childKey, childSession);
    parentSession.forks.set(forkId, {
      childSessionId: forkId,
      forkedAt: childSession.createdAt,
      status: 'active',
      boundarySeq: boundary
    });

    return childSession;
  }

  // forkLog is DSH SessionStore.fork(source, boundary?, childSessionId?)
  forkLog({ userId = 'anonymous', sourceSessionId = 'default', childSessionId, boundary } = {}) {
    const session = this.forkSession({ userId, sourceSessionId, childSessionId, boundarySeq: boundary });
    const childKey = this.sessionKey(userId, session.sessionId);
    return this.logs.get(childKey);
  }

  _wrapLogPersistence(key, log) {
    if (!this.persistDir) return;
    const filePath = path.join(this.persistDir, `${String(log.sessionId).replace(/[^a-zA-Z0-9_-]/g, '_')}.jsonl`);
    const originalAppend = log.append.bind(log);
    log.append = (type, data, opts) => {
      const ev = originalAppend(type, data, opts);
      try {
        fs.appendFileSync(filePath, JSON.stringify(ev) + '\n', 'utf8');
      } catch {}
      return ev;
    };
    // also write header sidecar on creation
    try {
      const headerPath = path.join(this.persistDir, `${String(log.sessionId).replace(/[^a-zA-Z0-9_-]/g, '_')}.header.json`);
      if (!fs.existsSync(headerPath)) {
        fs.writeFileSync(headerPath, JSON.stringify(log.header, null, 2), 'utf8');
      }
    } catch {}
  }

  // restore from jsonl (for resume)
  loadFromJsonl(userId, sessionId, filePath) {
    const key = this.sessionKey(userId, sessionId);
    try {
      const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
      const events = lines.map((l) => JSON.parse(l));
      const headerPath = filePath.replace(/\.jsonl$/, '.header.json');
      let header = {};
      if (fs.existsSync(headerPath)) header = JSON.parse(fs.readFileSync(headerPath, 'utf8'));
      const log = new SessionLog({ sessionId, header, seed: events });
      this.logs.set(key, log);
      this._wrapLogPersistence(key, log);
      return log;
    } catch (_e) {
      return null;
    }
  }

  /**
   * Merges fork results back into parent session metadata.
   */
  mergeFork({ userId = 'anonymous', parentSessionId = 'default', childSessionId, result = null } = {}) {
    const parentKey = this.sessionKey(userId, parentSessionId);
    const parent = this.sessions.get(parentKey);
    if (!parent) return null;

    const forkRecord = parent.forks.get(childSessionId);
    if (forkRecord) {
      forkRecord.status = 'merged';
      forkRecord.mergedAt = new Date().toISOString();
      forkRecord.result = result;
    }

    return parent;
  }

  listSessions({ userId } = {}) {
    const all = Array.from(this.sessions.values());
    if (userId) return all.filter((s) => s.userId === userId);
    return all;
  }
}
