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
});
