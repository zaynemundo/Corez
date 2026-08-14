import { describe, it, expect } from 'vitest';
import { SessionManager } from '../packages/agent-core/harness/SessionManager.js';

describe('Session Forking for Subagents & Swarm', () => {
  it('creates and attaches tasks to sessions', () => {
    const manager = new SessionManager();
    const session = manager.attachTask({ userId: 'alice', sessionId: 'sess-1', taskId: 'task-100' });

    expect(session.userId).toBe('alice');
    expect(session.sessionId).toBe('sess-1');
    expect(session.taskIds.has('task-100')).toBe(true);
  });

  it('forks a session with parent lineage and snapshot isolation', () => {
    const manager = new SessionManager();
    manager.attachTask({ userId: 'bob', sessionId: 'main-session', taskId: 'task-1' });

    const fork = manager.forkSession({
      userId: 'bob',
      sourceSessionId: 'main-session',
      childSessionId: 'subagent-explorer',
      boundaryStep: 3,
      snapshot: { contextFiles: ['src/index.js'] }
    });

    expect(fork.sessionId).toBe('subagent-explorer');
    expect(fork.parentSessionKey).toBe('bob::main-session');
    expect(fork.forkedAtStep).toBe(3);
    expect(fork.snapshot.taskIds).toContain('task-1');
    expect(fork.snapshot.contextFiles).toContain('src/index.js');

    // Modifying fork does not mutate parent
    fork.taskIds.add('fork-task-99');
    const parent = manager.getSession('bob', 'main-session');
    expect(parent.taskIds.has('fork-task-99')).toBe(false);
    expect(parent.forks.has('subagent-explorer')).toBe(true);
  });

  it('merges fork completion record back into parent session', () => {
    const manager = new SessionManager();
    manager.createSession({ userId: 'carol', sessionId: 'dev-session' });

    manager.forkSession({
      userId: 'carol',
      sourceSessionId: 'dev-session',
      childSessionId: 'test-runner-fork'
    });

    manager.mergeFork({
      userId: 'carol',
      parentSessionId: 'dev-session',
      childSessionId: 'test-runner-fork',
      result: { allTestsPassed: true, coverage: 100 }
    });

    const parent = manager.getSession('carol', 'dev-session');
    const record = parent.forks.get('test-runner-fork');
    expect(record.status).toBe('merged');
    expect(record.result.allTestsPassed).toBe(true);
  });

  it('throws error when trying to fork nonexistent session', () => {
    const manager = new SessionManager();
    expect(() => {
      manager.forkSession({ userId: 'dave', sourceSessionId: 'ghost-session' });
    }).toThrow(/Cannot fork nonexistent session/);
  });
});
