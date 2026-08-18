import { describe, it, expect } from 'vitest';
import { GenericSwarmOrchestrator, SWARM_ROLES, SWARM_MODE, decideSwarmMode } from '../../packages/agent-core/swarm/index.js';

describe('GenericSwarmOrchestrator', () => {
  it('routes large/scope-heavy briefs to the full specialist DAG', async () => {
    const orchestrator = new GenericSwarmOrchestrator();

    const events = [];
    const result = await orchestrator.executeSwarmJob('build a high performance REST API', {
      mockExecution: true,
      onStatus: (st) => events.push(st)
    });

    expect(result.completed).toBe(true);
    expect(result.mode).toBe(SWARM_MODE.SWARM);
    expect(result.tasksCount).toBe(6);
    expect(result.results.length).toBe(6);
    expect(events.some(e => e.role === SWARM_ROLES.EXPLORER)).toBe(true);
    expect(events.some(e => e.role === SWARM_ROLES.ARCHITECT)).toBe(true);
    expect(events.some(e => e.role === SWARM_ROLES.FRONTEND)).toBe(true);
    expect(events.some(e => e.role === SWARM_ROLES.BACKEND)).toBe(true);
    expect(events.some(e => e.role === SWARM_ROLES.TESTER)).toBe(true);
    expect(events.some(e => e.role === SWARM_ROLES.REVIEWER)).toBe(true);
  });

  it('routes short surgical tasks to the fast DAG (explorer -> engineer -> reviewer)', async () => {
    const orchestrator = new GenericSwarmOrchestrator();
    const events = [];
    const result = await orchestrator.executeSwarmJob('fix the typo in src/utils.js', {
      mockExecution: true,
      onStatus: (st) => events.push(st)
    });

    expect(result.completed).toBe(true);
    expect(result.mode).toBe(SWARM_MODE.FAST);
    expect(result.tasksCount).toBe(3);
    expect(events.some(e => e.role === SWARM_ROLES.EXPLORER)).toBe(true);
    expect(events.some(e => e.role === SWARM_ROLES.ENGINEER)).toBe(true);
    expect(events.some(e => e.role === SWARM_ROLES.REVIEWER)).toBe(true);
    // No heavyweight specialists for a trivial task.
    expect(events.some(e => e.role === SWARM_ROLES.ARCHITECT)).toBe(false);
    expect(events.some(e => e.role === SWARM_ROLES.BACKEND)).toBe(false);
    expect(events.some(e => e.role === SWARM_ROLES.TESTER)).toBe(false);
  });

  it('completes all tasks without commit failures or failed agents', async () => {
    const orchestrator = new GenericSwarmOrchestrator();
    const events = [];
    const result = await orchestrator.executeSwarmJob('build a demo app', {
      mockExecution: true,
      onStatus: (st) => events.push(st)
    });

    const completed = events.filter(e => e.step === 'agent_complete').length;
    const failed = events.filter(e => e.step === 'agent_failed').length;

    expect(result.completed).toBe(true);
    expect(result.mode).toBe(SWARM_MODE.SWARM);
    expect(completed).toBe(6);
    expect(failed).toBe(0);
  });

  it('marks failed tasks as FAILED instead of looping forever', async () => {
    const orchestrator = new GenericSwarmOrchestrator();
    orchestrator.providerRouter = {
      generate: async () => {
        throw new Error('provider outage');
      }
    };

    const events = [];
    const result = await orchestrator.executeSwarmJob('build something', {
      onStatus: (st) => events.push(st)
    });

    // No hang: every agent failed and the swarm terminated, reporting the failure
    expect(result.completed).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(result.failedTasks.length).toBeGreaterThan(0);
    expect(result.failedTasks.every(t => typeof t.reason === 'string' && t.reason.length > 0)).toBe(true);
    expect(events.filter(e => e.step === 'agent_failed').length).toBeGreaterThan(0);
    expect(events.some(e => e.step === 'swarm_failed')).toBe(true);
  });

  it('fails loudly when no provider is configured instead of fabricating success', async () => {
    const orchestrator = new GenericSwarmOrchestrator();
    const events = [];
    const result = await orchestrator.executeSwarmJob('fix the typo in src/utils.js', {
      onStatus: (st) => events.push(st)
    });

    expect(result.completed).toBe(false);
    expect(result.results).toHaveLength(0);
    // Explorer fails; engineer/reviewer stay blocked on it (incomplete, not failed).
    expect(result.failedTasks.length).toBe(1);
    expect(result.failedTasks[0].role).toBe(SWARM_ROLES.EXPLORER);
    expect(result.failedTasks[0].reason).toContain('no providerRouter');
    expect(result.incompleteTasks.length).toBe(2);
  });

  it('rejects an unknown forced mode', async () => {
    const orchestrator = new GenericSwarmOrchestrator();
    await expect(
      orchestrator.executeSwarmJob('build something', { mockExecution: true, mode: 'banana' })
    ).rejects.toThrow(/Invalid swarm mode/);
  });

  it('forces the full DAG even for a trivial brief when mode: swarm is requested', async () => {
    const orchestrator = new GenericSwarmOrchestrator();
    const result = await orchestrator.executeSwarmJob('fix typo', {
      mockExecution: true,
      mode: SWARM_MODE.SWARM
    });
    expect(result.mode).toBe(SWARM_MODE.SWARM);
    expect(result.tasksCount).toBe(6);
  });

  it('gates completion on the verifier hook: a failed real check fails the task', async () => {
    const orchestrator = new GenericSwarmOrchestrator({
      verifier: async ({ task }) => {
        if (task.role === SWARM_ROLES.ENGINEER) {
          return { ok: false, evidence: 'unit tests failed (exit 1)' };
        }
        return { ok: true, evidence: 'lint clean' };
      }
    });

    const events = [];
    const result = await orchestrator.executeSwarmJob('fix typo', {
      mockExecution: true,
      onStatus: (st) => events.push(st)
    });

    // The failed engineer task blocks dependents; nothing hangs, swarm reports failure.
    expect(result.completed).toBe(false);
    expect(result.verification.find(v => v.role === SWARM_ROLES.ENGINEER).ok).toBe(false);
    expect(result.verification.find(v => v.role === SWARM_ROLES.ENGINEER).evidence).toBe('unit tests failed (exit 1)');
    expect(result.failedTasks.some(t => t.reason.includes('verification failed'))).toBe(true);
    expect(events.some(e => e.step === 'swarm_failed')).toBe(true);
  });

  it('reports passing verification evidence on success', async () => {
    const orchestrator = new GenericSwarmOrchestrator({
      verifier: async () => ({ ok: true, evidence: 'tests passed (exit 0)' })
    });
    const result = await orchestrator.executeSwarmJob('fix typo', { mockExecution: true });
    expect(result.completed).toBe(true);
    expect(result.verification.length).toBe(3);
    expect(result.verification.every(v => v.ok && v.evidence === 'tests passed (exit 0)')).toBe(true);
  });
});

describe('decideSwarmMode', () => {
  it('routes small surgical prompts to fast mode', () => {
    expect(decideSwarmMode('fix the typo in src/utils.js')).toBe(SWARM_MODE.FAST);
    expect(decideSwarmMode('add a submit button to the navbar')).toBe(SWARM_MODE.FAST);
  });

  it('routes scope-heavy prompts to full swarm mode', () => {
    expect(decideSwarmMode('build a high performance REST API')).toBe(SWARM_MODE.SWARM);
    expect(decideSwarmMode('build a demo app')).toBe(SWARM_MODE.SWARM);
    expect(decideSwarmMode('create a browser game')).toBe(SWARM_MODE.SWARM);
    expect(decideSwarmMode('migrate the database to Postgres')).toBe(SWARM_MODE.SWARM);
  });

  it('routes long briefs to full swarm mode even without scope signals', () => {
    const longBrief = 'Please carefully refactor the login flow so that the session handling, token refresh, and error recovery all work together, then update the tests. '.repeat(4);
    expect(decideSwarmMode(longBrief)).toBe(SWARM_MODE.SWARM);
  });

  it('honors an explicit force override', () => {
    expect(decideSwarmMode('fix typo', { force: SWARM_MODE.SWARM })).toBe(SWARM_MODE.SWARM);
    expect(decideSwarmMode('build a REST API', { force: SWARM_MODE.FAST })).toBe(SWARM_MODE.FAST);
  });
});
