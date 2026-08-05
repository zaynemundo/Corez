import { describe, it, expect } from 'vitest';
import { runAdaptiveAgentPool } from '../worker/swarm-index.js';
import { AgentSwarmOrchestrator, OPENROUTER_SWARM_ROUTING } from '../src/services/gamePipeline/swarm/agentSwarmOrchestrator.js';

describe('Unlimited Dynamic Swarm: Agent Swarm Orchestrator', () => {
  it('includes exact OpenRouter model routing parameters', () => {
    expect(OPENROUTER_SWARM_ROUTING.model).toBe('deepseek/deepseek-v4-flash');
    expect(OPENROUTER_SWARM_ROUTING.provider).toEqual({
      sort: 'throughput',
      allow_fallbacks: true,
      require_parameters: true
    });
  });

  it('executes a dynamic multi-swarm job end-to-end', async () => {
    const mockAiClient = async (prompt, options) => {
      expect(options.routing).toEqual(OPENROUTER_SWARM_ROUTING);
      if (prompt.includes('Lead Swarm Architect')) {
        return JSON.stringify([
          { taskId: 'task-art-director', role: 'art-director', objective: 'Plan style', dependencies: [], ownedResources: ['spec/art.json'] },
          { taskId: 'task-engine', role: 'engine-architect', objective: 'Build core canvas engine', dependencies: [], ownedResources: ['engine/core.js'] },
          { taskId: 'task-integration', role: 'integration-agent', objective: 'Synthesize HTML', dependencies: ['task-art-director', 'task-engine'], ownedResources: ['game/index.html'] }
        ]);
      }
      if (prompt.includes('integration-agent')) {
        return '<!DOCTYPE html><html><body><canvas id="gameCanvas" width="960" height="540"></canvas></body></html>';
      }
      return 'Completed specialist task output';
    };

    const orchestrator = new AgentSwarmOrchestrator({
      aiClient: mockAiClient
    });

    const result = await orchestrator.executeSwarmJob('Build 8-bit space shooter game');
    expect(result.projectId).toContain('game_');
    expect(result.finalHtml).toContain('<canvas id="gameCanvas"');
    expect(result.metrics.currentConcurrency).toBeGreaterThan(0);
  });

  it('defers a spec whose cumulative retry window exceeds the invocation budget instead of retrying forever', async () => {
    // A provider that keeps answering 429 with a small Retry-After must not
    // keep this invocation retrying indefinitely: once the accumulated
    // recovery windows pass the budget, the spec is deferred (not failed).
    let now = 0;
    let executions = 0;
    const alwaysRateLimited = async () => {
      executions += 1;
      const error = new Error('Too Many Requests');
      error.status = 429;
      error.retryAfter = 1; // 1 s recovery window every attempt
      throw error;
    };

    const result = await runAdaptiveAgentPool(
      [{ agentId: 'agent-1', role: 'engine-architect', objective: 'Build', priority: 'core' }],
      alwaysRateLimited,
      {
        clock: () => now,
        sleep: async (ms) => { now += ms; },
        invocationRetryBudgetMs: 3000,
        backoffBaseMs: 250
      }
    );

    expect(executions).toBeLessThan(10);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].kind).toBe('deferred');
    expect(result.failed[0].nextEligibleAt).toBeGreaterThan(0);
    expect(result.completed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });
});
