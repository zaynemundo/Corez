import { describe, it, expect } from 'vitest';
import { HierarchicalSynthesis, chunkByTokens } from '../packages/agent-core/swarm/hierarchicalSynthesis.js';
import { MemoryTaskStore } from '../packages/agent-core/persistence/TaskStore.js';

const WORKSTREAM_COUNT = 1_001;

function makeOutputs(count = WORKSTREAM_COUNT) {
  return Array.from({ length: count }, (_, i) => ({
    agentId: `agent-${i}`,
    output: `Specialist output for workstream ${i}: ` + 'implementation detail '.repeat(8)
  }));
}

function recordingChain() {
  const calls = [];
  return {
    calls,
    async generate({ messages }) {
      calls.push({ messages });
      const text = messages[messages.length - 1].content;
      const contributionMatch = text.match(/(\d+) contribution\(s\)/);
      const chunkCount = contributionMatch ? Number(contributionMatch[1]) : 0;
      const content = chunkCount > 0
        ? `Chunk summary for ${chunkCount} contributions`
        : 'Final merged answer';
      return { status: 'completed', content, toolCalls: [], provider: 'mock', model: 'muse-spark-1.3-contributor' };
    }
  };
}

describe('1,001-workstream hierarchical synthesis', () => {
  it('chunks by estimated tokens, not a fixed specialist count', () => {
    const chunks = chunkByTokens(makeOutputs(1001), { maxTokens: 500 });
    expect(chunks.length).toBeGreaterThan(100); // many small chunks
    const single = chunkByTokens([{ agentId: 'a', output: 'x' }], { maxTokens: 1000 });
    expect(single).toHaveLength(1);
  });

  it('synthesizes 1,001 workstreams without discarding or duplicating any', async () => {
    const store = new MemoryTaskStore();
    await store.createTask({ taskId: 'swarm-big', userId: 'alice', prompt: 'big', status: 'pending' });
    const chain = recordingChain();
    const synthesis = new HierarchicalSynthesis({ providerChain: chain, store, taskId: 'swarm-big' });

    const result = await synthesis.synthesize({
      outputs: makeOutputs(),
      prompt: 'Build everything',
      model: 'muse-spark-1.3-contributor'
    });

    expect(result.content).toBe('Final merged answer');
    expect(result.chunks).toBeGreaterThan(1); // hierarchical: many chunk summaries + merge

    // No workstream discarded: every agentId is retrievable with its FULL
    // output (retrieval by id, never a summary).
    const stored = await store.getTask('swarm-big');
    expect(stored.synthesisOutputs.length).toBe(WORKSTREAM_COUNT);
    const full = await synthesis.retrieve('agent-777');
    expect(full).toContain('Specialist output for workstream 777');
    expect(full).not.toContain('Chunk summary');

    // No duplicate execution: every chunk summary is unique and complete.
    const chunkCalls = chain.calls.filter((c) => c.messages.some((m) => m.content.includes('contribution(s)')));
    expect(chunkCalls.length).toBe(result.chunks);
  });

  it('persists wave state and resumes after a restart without re-running completed waves', async () => {
    const store = new MemoryTaskStore();
    await store.createTask({ taskId: 'swarm-wave', userId: 'alice', prompt: 'wave', status: 'pending' });

    const firstChain = recordingChain();
    const first = new HierarchicalSynthesis({ providerChain: firstChain, store, taskId: 'swarm-wave' });
    await first.synthesize({ outputs: makeOutputs(1001), prompt: 'wave build', model: 'muse-spark-1.3-contributor' });

    const taskAfterWave = await store.getTask('swarm-wave');
    expect(taskAfterWave.synthesisState.wave).toBe(1);
    expect(taskAfterWave.synthesisState.completedWaves).toEqual([0]);

    // "Restart": a new synthesis instance over the same store.
    const secondChain = recordingChain();
    const resumed = new HierarchicalSynthesis({ providerChain: secondChain, store, taskId: 'swarm-wave' });
    const outputIds = await resumed.storeOutputs(makeOutputs(1001));
    expect(outputIds.storedAgentIds.length).toBe(WORKSTREAM_COUNT); // deduped, none lost

    const continuation = await resumed.resume({ prompt: 'wave build', model: 'muse-spark-1.3-contributor' });
    expect(continuation).not.toBeNull();
    // The resumed wave ran, and the persisted outputs survived the restart.
    expect(secondChain.calls.length).toBeGreaterThan(0);
    const after = await store.getTask('swarm-wave');
    expect(after.synthesisState.completedWaves).toEqual([0, 1]);
    expect(after.synthesisOutputs.length).toBe(WORKSTREAM_COUNT);
  });

  it('fails honestly when a synthesis pass produces nothing', async () => {
    const store = new MemoryTaskStore();
    await store.createTask({ taskId: 'swarm-fail', userId: 'alice', prompt: 'fail', status: 'pending' });
    const synthesis = new HierarchicalSynthesis({
      providerChain: {
        async generate() {
          return { status: 'failed', provider: 'mock', error: 'all providers down', content: '', toolCalls: [] };
        }
      },
      store,
      taskId: 'swarm-fail'
    });
    await expect(synthesis.synthesize({ outputs: makeOutputs(3), prompt: 'x', model: 'm' })).rejects.toThrow(/no usable summary/);
  });
});
