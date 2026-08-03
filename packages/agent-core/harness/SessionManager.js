// Sessions link users to their tasks. Ownership is enforced in TaskManager
// (a task belongs to exactly one user, and no endpoint may read, mutate or
// cancel another user's task).

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
        taskIds: new Set()
      });
    }
    return this.sessions.get(key);
  }

  attachTask({ userId, sessionId, taskId }) {
    const session = this.createSession({ userId, sessionId });
    session.taskIds.add(taskId);
    return session;
  }
}
