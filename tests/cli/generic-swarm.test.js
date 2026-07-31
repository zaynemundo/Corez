import { describe, it, expect } from 'vitest';
import { GenericSwarmOrchestrator, SWARM_ROLES } from '../../packages/agent-core/swarm/index.js';

describe('GenericSwarmOrchestrator', () => {
  it('executes multi-agent DAG task decomposition concurrently', async () => {
    const orchestrator = new GenericSwarmOrchestrator();

    const events = [];
    const result = await orchestrator.executeSwarmJob('build a high performance REST API', {
      mockExecution: true,
      onStatus: (st) => events.push(st)
    });

    expect(result.completed).toBe(true);
    expect(result.tasksCount).toBe(6);
    expect(result.results.length).toBe(6);
    expect(events.some(e => e.role === SWARM_ROLES.EXPLORER)).toBe(true);
    expect(events.some(e => e.role === SWARM_ROLES.ARCHITECT)).toBe(true);
    expect(events.some(e => e.role === SWARM_ROLES.FRONTEND)).toBe(true);
    expect(events.some(e => e.role === SWARM_ROLES.BACKEND)).toBe(true);
    expect(events.some(e => e.role === SWARM_ROLES.TESTER)).toBe(true);
    expect(events.some(e => e.role === SWARM_ROLES.REVIEWER)).toBe(true);
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

    // No hang: every agent failed and the swarm terminated with zero completed tasks
    expect(result.completed).toBe(true);
    expect(result.results).toHaveLength(0);
    expect(events.filter(e => e.step === 'agent_failed').length).toBeGreaterThan(0);
  });
});
