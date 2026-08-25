import { describe, it, expect } from 'vitest';
import { AgentSwarmOrchestrator, OPENROUTER_SWARM_ROUTING } from '../src/services/gamePipeline/swarm/agentSwarmOrchestrator.js';

describe('Unlimited Dynamic Swarm: Agent Swarm Orchestrator', () => {
  it('includes exact OpenRouter model routing parameters', () => {
    expect(OPENROUTER_SWARM_ROUTING.model).toBe('mimo-v2.5');
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
    expect(result.completed).toBe(true);
    expect(result.finalHtml).toContain('<canvas id="gameCanvas"');
    expect(result.metrics.currentConcurrency).toBeGreaterThan(0);
  });

  it('merges all agent outputs in dependency order when no integration task exists', async () => {
    const mockAiClient = async (prompt) => {
      if (prompt.includes('Lead Swarm Architect')) {
        return JSON.stringify([
          { taskId: 'task-art-director', role: 'art-director', objective: 'Plan style', dependencies: [], ownedResources: ['spec/art.json'] },
          { taskId: 'task-engine', role: 'engine-architect', objective: 'Build core canvas engine', dependencies: [], ownedResources: ['engine/core.js'] }
        ]);
      }
      if (prompt.includes('art-director')) {
        return '<style>.bg{color:red}</style>';
      }
      return '<canvas id="gameCanvas"></canvas>';
    };

    const orchestrator = new AgentSwarmOrchestrator({
      aiClient: mockAiClient
    });

    const result = await orchestrator.executeSwarmJob('Build a game');
    expect(result.completed).toBe(true);
    // Both agents' contributions are present, labeled by role/task.
    expect(result.finalHtml).toContain('<canvas id="gameCanvas"></canvas>');
    expect(result.finalHtml).toContain('<style>.bg{color:red}</style>');
    expect(result.finalHtml).toContain('<!-- art-director (task-art-director) -->');
    expect(result.finalHtml).toContain('<!-- engine-architect (task-engine) -->');
  });

  it('gates completion on the verifier hook and drops failed outputs from the build', async () => {
    const mockAiClient = async (prompt) => {
      if (prompt.includes('Lead Swarm Architect')) {
        return JSON.stringify([
          { taskId: 'task-engine', role: 'engine-architect', objective: 'Build engine', dependencies: [], ownedResources: ['engine/core.js'] }
        ]);
      }
      return '<canvas id="gameCanvas"></canvas>';
    };

    const orchestrator = new AgentSwarmOrchestrator({
      aiClient: mockAiClient,
      verifier: async ({ task }) =>
        task.role === 'engine-architect'
          ? { ok: false, evidence: 'canvas test failed (exit 1)' }
          : { ok: true, evidence: 'ok' }
    });

    const result = await orchestrator.executeSwarmJob('Build a game');
    expect(result.completed).toBe(false);
    expect(result.failedTasks.some(t => t.reason.includes('verification failed'))).toBe(true);
    expect(result.verification.find(v => v.role === 'engine-architect').evidence).toBe('canvas test failed (exit 1)');
    // The failed task's output must not leak into the final artifact.
    expect(result.finalHtml).toBeNull();
  });
});
