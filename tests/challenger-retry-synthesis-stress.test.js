import { describe, it, expect, vi } from 'vitest';
import {
  AgentSwarmOrchestrator,
  topologicalOrder,
  mergeOutputsInDagOrder,
} from '../src/services/gamePipeline/swarm/agentSwarmOrchestrator.js';
import {
  TaskDependencyGraph,
} from '../src/services/gamePipeline/swarm/taskGraph.js';
import {
  HierarchicalSynthesis,
  chunkByTokens,
} from '../packages/agent-core/swarm/hierarchicalSynthesis.js';
import { MemoryTaskStore } from '../packages/agent-core/persistence/TaskStore.js';
import '../packages/agent-core/swarm/index.js';

describe('Challenger 2: Verifier-Driven Retry Loops & Self-Correction Diagnostics', () => {
  it('1.1: Self-correction retry loop injects verifier evidence and recovers on subsequent attempt', async () => {
    const receivedPrompts = [];
    let attempts = 0;

    const mockAiClient = async (prompt) => {
      receivedPrompts.push(prompt);
      if (prompt.includes('Lead Swarm Architect')) {
        return JSON.stringify([
          { taskId: 'task-engine', role: 'engine-architect', objective: 'Create canvas engine', dependencies: [], ownedResources: ['engine/core.js'] }
        ]);
      }
      if (prompt.includes('Role: engine-architect')) {
        attempts++;
        if (attempts === 1) {
          return '<canvas id="wrongCanvas"></canvas>';
        }
        return '<canvas id="gameCanvas" width="800" height="600"></canvas><script>console.log("ready");</script>';
      }
      return 'OK';
    };

    const verifier = vi.fn(async ({ output }) => {
      const text = typeof output === 'object' ? output?.output : output;
      if (typeof text === 'string' && text.includes('wrongCanvas')) {
        return { ok: false, evidence: 'Canvas element must have id="gameCanvas" and script initialized' };
      }
      return { ok: true, evidence: 'DOM and Canvas verification passed' };
    });

    const orchestrator = new AgentSwarmOrchestrator({
      aiClient: mockAiClient,
      verifier
    });

    const result = await orchestrator.executeSwarmJob('Build canvas game');
    expect(result.completed).toBe(true);
    expect(attempts).toBe(2);
    expect(result.finalHtml).toContain('id="gameCanvas"');

    // Verify self-correction diagnostic injection into attempt 2 prompt
    const retryPrompt = receivedPrompts.find(p => p.includes('Self-Correction Retry (Attempt 2/3)'));
    expect(retryPrompt).toBeDefined();
    expect(retryPrompt).toContain('Verifier feedback: Canvas element must have id="gameCanvas" and script initialized');
    expect(retryPrompt).toContain('Please analyze the failure above and fix the issue in your revised output.');
  });

  it('1.2: Multi-task concurrent retry loops maintain independent diagnostic state without cross-talk', async () => {
    const taskAttempts = { 'task-art': 0, 'task-engine': 0 };
    const taskPrompts = { 'task-art': [], 'task-engine': [] };

    const mockAiClient = async (prompt) => {
      if (prompt.includes('Lead Swarm Architect')) {
        return JSON.stringify([
          { taskId: 'task-art', role: 'art-director', objective: 'Define theme', dependencies: [], ownedResources: ['spec/art.json'] },
          { taskId: 'task-engine', role: 'engine-architect', objective: 'Build core', dependencies: [], ownedResources: ['engine/core.js'] }
        ]);
      }
      if (prompt.includes('Role: art-director')) {
        taskAttempts['task-art']++;
        taskPrompts['task-art'].push(prompt);
        if (taskAttempts['task-art'] === 1) {
          return 'missing-palette';
        }
        return JSON.stringify({ primary: '#00ffcc', secondary: '#330066' });
      }
      if (prompt.includes('Role: engine-architect')) {
        taskAttempts['task-engine']++;
        taskPrompts['task-engine'].push(prompt);
        if (taskAttempts['task-engine'] === 1) {
          return 'uninitialized-canvas';
        }
        return '<canvas id="gameCanvas"></canvas>';
      }
      return 'OK';
    };

    const verifier = vi.fn(async ({ task, output }) => {
      const text = typeof output === 'object' ? output?.output : output;
      if (task.taskId === 'task-art' && text === 'missing-palette') {
        return { ok: false, evidence: 'Art spec must include JSON color palette' };
      }
      if (task.taskId === 'task-engine' && text === 'uninitialized-canvas') {
        return { ok: false, evidence: 'Engine must provide valid canvas element' };
      }
      return { ok: true, evidence: 'Validation clean' };
    });

    const orchestrator = new AgentSwarmOrchestrator({
      aiClient: mockAiClient,
      verifier
    });

    const result = await orchestrator.executeSwarmJob('Build neon game');
    expect(result.completed).toBe(true);
    expect(taskAttempts['task-art']).toBe(2);
    expect(taskAttempts['task-engine']).toBe(2);

    // Verify task-art received its own diagnostic and not engine's
    const artRetry = taskPrompts['task-art'].find(p => p.includes('Self-Correction Retry'));
    expect(artRetry).toContain('Art spec must include JSON color palette');
    expect(artRetry).not.toContain('Engine must provide valid canvas');

    // Verify task-engine received its own diagnostic and not art's
    const engineRetry = taskPrompts['task-engine'].find(p => p.includes('Self-Correction Retry'));
    expect(engineRetry).toContain('Engine must provide valid canvas element');
    expect(engineRetry).not.toContain('Art spec must include JSON color');
  });

  it('1.3: Verifier runtime exceptions are captured as failed verifications and retried without crashing', async () => {
    let verifierCalls = 0;
    const mockAiClient = async (prompt) => {
      if (prompt.includes('Lead Swarm Architect')) {
        return JSON.stringify([
          { taskId: 'task-test', role: 'engine-architect', objective: 'Create engine', dependencies: [], ownedResources: ['engine.js'] }
        ]);
      }
      return '<canvas id="gameCanvas"></canvas>';
    };

    const verifier = vi.fn(async () => {
      verifierCalls++;
      if (verifierCalls === 1) {
        throw new Error('E_TIMEDOUT: Vitest runner crashed unexpectedly');
      }
      return { ok: true, evidence: 'Passed on recovery' };
    });

    const orchestrator = new AgentSwarmOrchestrator({
      aiClient: mockAiClient,
      verifier
    });

    const result = await orchestrator.executeSwarmJob('Build game');
    expect(result.completed).toBe(true);
    expect(verifierCalls).toBe(2);
    expect(result.verification.some(v => v.evidence.includes('verifier threw: E_TIMEDOUT'))).toBe(true);
  });
});

describe('Challenger 2: maxAttempts Exhaustion & Clean Failure Handling', () => {
  it('2.1: Exhaustion of maxAttempts results in FAILED state, purged outputs, and non-blocking exit', async () => {
    const mockAiClient = async (prompt) => {
      if (prompt.includes('Lead Swarm Architect')) {
        return JSON.stringify([
          { taskId: 'task-broken', role: 'engine-architect', objective: 'Build broken engine', dependencies: [], ownedResources: ['broken.js'], maxAttempts: 3 }
        ]);
      }
      return 'always-invalid-output';
    };

    const verifier = vi.fn(async () => ({ ok: false, evidence: 'Persistent SyntaxError: Unexpected token' }));

    const orchestrator = new AgentSwarmOrchestrator({
      aiClient: mockAiClient,
      verifier
    });

    const result = await orchestrator.executeSwarmJob('Build game with failing component');
    expect(result.completed).toBe(false);
    expect(result.failedTasks).toHaveLength(1);
    expect(result.failedTasks[0].taskId).toBe('task-broken');
    expect(result.failedTasks[0].reason).toContain('Persistent SyntaxError: Unexpected token');

    // Must not leak unverified output into finalHtml or state
    expect(result.finalHtml).toBeNull();
    expect(result.state.validatedOutputs['task-broken']).toBeUndefined();
    expect(result.state.issues).toHaveLength(1);
    expect(result.state.issues[0].description).toContain('Persistent SyntaxError: Unexpected token');
  });

  it('2.2: Dependent tasks remain un-executed when upstream prerequisite fails maxAttempts', async () => {
    const executedTasks = [];

    const mockAiClient = async (prompt) => {
      if (prompt.includes('Lead Swarm Architect')) {
        return JSON.stringify([
          { taskId: 'task-upstream', role: 'engine-architect', objective: 'Build core', dependencies: [], ownedResources: ['core.js'], maxAttempts: 2 },
          { taskId: 'task-downstream', role: 'integration-agent', objective: 'Integrate', dependencies: ['task-upstream'], ownedResources: ['index.html'] }
        ]);
      }
      if (prompt.includes('Role: engine-architect')) {
        executedTasks.push('task-upstream');
        return 'broken-core';
      }
      if (prompt.includes('Role: integration-agent')) {
        executedTasks.push('task-downstream');
        return 'html';
      }
      return 'OK';
    };

    const verifier = vi.fn(async ({ task }) => {
      if (task.taskId === 'task-upstream') {
        return { ok: false, evidence: 'Core build failed' };
      }
      return { ok: true, evidence: 'OK' };
    });

    const orchestrator = new AgentSwarmOrchestrator({
      aiClient: mockAiClient,
      verifier
    });

    const result = await orchestrator.executeSwarmJob('Build pipeline');
    expect(result.completed).toBe(false);
    expect(executedTasks).toContain('task-upstream');
    expect(executedTasks).not.toContain('task-downstream'); // Downstream must NEVER run
    expect(result.failedTasks.some(t => t.taskId === 'task-upstream')).toBe(true);
  });
});

describe('Challenger 2: Topological Ordering & Artifact Merging', () => {
  it('3.1: topologicalOrder produces strictly valid topological linearization for diamond & multi-tier graphs', () => {
    const graph = new TaskDependencyGraph('proj_topo');
    // Root -> (Branch1, Branch2) -> (Sub1, Sub2) -> Merge -> Validate
    graph.addTask({ taskId: 'root', role: 'explorer', dependencies: [] });
    graph.addTask({ taskId: 'b1', role: 'art-director', dependencies: ['root'] });
    graph.addTask({ taskId: 'b2', role: 'engine-architect', dependencies: ['root'] });
    graph.addTask({ taskId: 'sub1', role: 'asset-worker', dependencies: ['b1'] });
    graph.addTask({ taskId: 'sub2', role: 'gameplay-worker', dependencies: ['b1', 'b2'] });
    graph.addTask({ taskId: 'merge', role: 'integration-agent', dependencies: ['sub1', 'sub2'] });
    graph.addTask({ taskId: 'validate', role: 'validation-agent', dependencies: ['merge'] });

    const order = topologicalOrder(graph);
    expect(order).toHaveLength(7);

    // Verify all topological ordering invariants: index(dep) < index(task)
    for (const [taskId, task] of graph.tasks.entries()) {
      const taskIndex = order.indexOf(taskId);
      for (const depId of task.dependencies) {
        const depIndex = order.indexOf(depId);
        expect(depIndex).toBeLessThan(taskIndex);
      }
    }
  });

  it('3.2: mergeOutputsInDagOrder merges string outputs with role comments and gracefully skips non-strings', () => {
    const tasks = new Map([
      ['t1', { taskId: 't1', role: 'art-director' }],
      ['t2', { taskId: 't2', role: 'asset-worker' }],
      ['t3', { taskId: 't3', role: 'engine-architect' }],
      ['t4', { taskId: 't4', role: 'audio-specialist' }]
    ]);

    const outputs = {
      t1: '<style>:root { --bg: #000; }</style>',
      t2: { url: 'https://storage.example.com/bg.png', assetId: 'bg' }, // Non-string: must be skipped
      t3: '<canvas id="gameCanvas"></canvas>',
      t4: null // Null: must be skipped
    };

    const order = ['t1', 't2', 't3', 't4'];
    const merged = mergeOutputsInDagOrder(outputs, order, tasks);

    expect(merged).toContain('<!-- art-director (t1) -->\n<style>:root { --bg: #000; }</style>');
    expect(merged).toContain('<!-- engine-architect (t3) -->\n<canvas id="gameCanvas"></canvas>');
    expect(merged).not.toContain('https://storage.example.com');
    expect(merged).not.toContain('audio-specialist');
  });

  it('3.3: mergeOutputsInDagOrder returns null for empty or non-string outputs', () => {
    const tasks = new Map([['t1', { taskId: 't1', role: 'asset-worker' }]]);
    expect(mergeOutputsInDagOrder({}, [], tasks)).toBeNull();
    expect(mergeOutputsInDagOrder({ t1: { obj: 1 } }, ['t1'], tasks)).toBeNull();
  });
});

describe('Challenger 2: HierarchicalSynthesis 1,000+ Workstreams & Wave Persistence', () => {
  const LARGE_SCALE_COUNT = 1_200;

  function makeScaleOutputs(count = LARGE_SCALE_COUNT) {
    return Array.from({ length: count }, (_, i) => ({
      agentId: `specialist-worker-${i}`,
      output: `Workstream payload #${i}: ` + 'modular logic and interface contracts '.repeat(6)
    }));
  }

  function createMockProviderChain() {
    const calls = [];
    return {
      calls,
      async generate({ messages, taskId, model }) {
        calls.push({ messages, taskId, model });
        const lastMsg = messages[messages.length - 1]?.content || '';
        if (lastMsg.includes('Contributions:')) {
          const match = lastMsg.match(/Contribution (\d+):/g);
          const count = match ? match.length : 1;
          return {
            status: 'completed',
            content: `Aggregated summary for chunk containing ${count} contributions.`,
            toolCalls: []
          };
        }
        return {
          status: 'completed',
          content: `FINAL HIERARCHICAL SYNTHESIS COMPLETE for ${LARGE_SCALE_COUNT} workstreams.`,
          toolCalls: []
        };
      }
    };
  }

  it('4.1: chunkByTokens accurately respects maxTokens constraint across 1,200 workstreams', () => {
    const outputs = makeScaleOutputs(1200);
    const chunks = chunkByTokens(outputs, { maxTokens: 4000 });

    expect(chunks.length).toBeGreaterThan(10);

    let totalItems = 0;
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
      totalItems += chunk.length;
    }
    // Invariant: zero dropped, zero duplicated items
    expect(totalItems).toBe(1200);
  });

  it('4.2: Full synthesis pass over 1,200 workstreams persists all specialist outputs and allows direct ID retrieval', async () => {
    const store = new MemoryTaskStore();
    const taskId = 'task-scale-1200';
    await store.createTask({ taskId, userId: 'user-stress', prompt: 'Synthesize 1200 tasks', status: 'pending' });

    const providerChain = createMockProviderChain();
    const synthesis = new HierarchicalSynthesis({ providerChain, store, taskId });

    const outputs = makeScaleOutputs(1200);
    const result = await synthesis.synthesize({
      outputs,
      prompt: 'Synthesize all 1200 specialist workstreams into unified system specification',
      model: 'muse-spark-1.3-contributor'
    });

    expect(result.content).toContain('FINAL HIERARCHICAL SYNTHESIS COMPLETE');
    expect(result.chunks).toBeGreaterThan(1);
    expect(result.wave).toBe(0);

    // Verify all 1,200 items are stored durably
    const task = await store.getTask(taskId);
    expect(task.synthesisOutputs).toHaveLength(1200);
    expect(task.synthesisState.wave).toBe(1);
    expect(task.synthesisState.completedWaves).toEqual([0]);

    // Spot-check exact retrieval by agentId across boundaries
    const first = await synthesis.retrieve('specialist-worker-0');
    expect(first).toContain('Workstream payload #0:');

    const mid = await synthesis.retrieve('specialist-worker-600');
    expect(mid).toContain('Workstream payload #600:');

    const last = await synthesis.retrieve('specialist-worker-1199');
    expect(last).toContain('Workstream payload #1199:');

    const missing = await synthesis.retrieve('non-existent-agent');
    expect(missing).toBeNull();
  });

  it('4.3: Crash recovery and wave persistence: resume() continues without re-executing completed waves', async () => {
    const store = new MemoryTaskStore();
    const taskId = 'task-wave-recovery';
    await store.createTask({ taskId, userId: 'user-recovery', prompt: 'Recovery test', status: 'pending' });

    const chain1 = createMockProviderChain();
    const synthesis1 = new HierarchicalSynthesis({ providerChain: chain1, store, taskId });

    const outputs = makeScaleOutputs(500);
    await synthesis1.synthesize({
      outputs,
      prompt: 'Initial wave execution',
      model: 'muse-spark-1.3-contributor'
    });

    const stateAfterWave0 = (await store.getTask(taskId)).synthesisState;
    expect(stateAfterWave0.wave).toBe(1);
    expect(stateAfterWave0.completedWaves).toEqual([0]);

    // Simulate process restart: instantiate brand new synthesis instance over persistent store
    const chain2 = createMockProviderChain();
    const synthesis2 = new HierarchicalSynthesis({ providerChain: chain2, store, taskId });

    const resumedResult = await synthesis2.resume({
      prompt: 'Resumed wave execution',
      model: 'muse-spark-1.3-contributor'
    });

    expect(resumedResult).not.toBeNull();
    expect(resumedResult.wave).toBe(1);

    const stateAfterWave1 = (await store.getTask(taskId)).synthesisState;
    expect(stateAfterWave1.wave).toBe(2);
    expect(stateAfterWave1.completedWaves).toEqual([0, 1]);
    expect((await store.getTask(taskId)).synthesisOutputs).toHaveLength(500);
  });
});
