// Sessions link users to their tasks and track provider usage. Ownership is
// enforced here: a task belongs to exactly one user, and no endpoint may read,
// mutate or cancel another user's task.

export class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  sessionKey(userId, sessionId) {
    return `${userId}::${sessionId || 'default'}`;
  }

  createSession({ userId = 'anonymous', sessionId = 'default' } = {}) {
    const key = this.sessionKey(userId, sessionId);
    if (!this.sessions.has(key)) {
      this.sessions.set(key, {
        userId,
        sessionId,
        createdAt: new Date().toISOString(),
        taskIds: new Set(),
        usage: {
          byProvider: {},
          bySession: {}
        }
      });
    }
    return this.sessions.get(key);
  }

  attachTask({ userId, sessionId, taskId }) {
    const session = this.createSession({ userId, sessionId });
    session.taskIds.add(taskId);
    return session;
  }

  tasksFor({ userId, sessionId }) {
    const key = this.sessionKey(userId, sessionId);
    return this.sessions.has(key) ? Array.from(this.sessions.get(key).taskIds) : [];
  }

  recordUsage({ userId, sessionId, provider, model: _model, step = 1 }) {
    const session = this.createSession({ userId, sessionId });
    if (provider) {
      session.usage.byProvider[provider] = (session.usage.byProvider[provider] || 0) + step;
    }
    session.usage.bySession[sessionId || 'default'] = (session.usage.bySession[sessionId || 'default'] || 0) + step;
    return session.usage;
  }

  getUsage({ userId, sessionId }) {
    const key = this.sessionKey(userId, sessionId);
    return this.sessions.has(key) ? this.sessions.get(key).usage : { byProvider: {}, bySession: {} };
  }

  assertOwnership(task, userId) {
    if (!task) throw new Error('Task not found.');
    if (task.userId !== userId) {
      throw new Error('Access denied: this task belongs to another user.');
    }
    return true;
  }
}
