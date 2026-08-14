// Sessions link users to their tasks. Ownership is enforced in TaskManager
// (a task belongs to exactly one user, and no endpoint may read, mutate or
// cancel another user's task).
//
// Extended with Session Forking (inspired by DeepSeek Harness dsh-session / dsh-subagent):
// Allows child agents, subagents, and swarm specialists to fork parent session state
// and execute exploratory tasks on isolated branches without mutating parent history.

export class SessionManager {
  constructor() {
    this.sessions = new Map();
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
    return this.sessions.get(key);
  }

  getSession(userId, sessionId) {
    const key = this.sessionKey(userId, sessionId);
    return this.sessions.get(key) || null;
  }

  attachTask({ userId, sessionId, taskId }) {
    const session = this.createSession({ userId, sessionId });
    session.taskIds.add(taskId);
    return session;
  }

  /**
   * Forks an existing session for a subagent or swarm specialist branch.
   * @param {object} options
   * @param {string} options.userId
   * @param {string} options.sourceSessionId
   * @param {string} options.childSessionId
   * @param {number} [options.boundaryStep]
   * @param {object} [options.snapshot]
   * @returns {object} The created child session
   */
  forkSession({ userId = 'anonymous', sourceSessionId = 'default', childSessionId, boundaryStep = null, snapshot = {} } = {}) {
    const sourceKey = this.sessionKey(userId, sourceSessionId);
    const parentSession = this.sessions.get(sourceKey);
    if (!parentSession) {
      throw new Error(`Cannot fork nonexistent session: "${sourceKey}"`);
    }

    const forkId = childSessionId || `${sourceSessionId}__fork_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const childKey = this.sessionKey(userId, forkId);

    const childSession = {
      userId,
      sessionId: forkId,
      createdAt: new Date().toISOString(),
      taskIds: new Set(),
      parentSessionKey: sourceKey,
      forkedAtStep: boundaryStep,
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
      status: 'active'
    });

    return childSession;
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
}
