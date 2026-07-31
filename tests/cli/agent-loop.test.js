import { describe, it, expect } from 'vitest';
import { AgentRuntime } from '../../packages/agent-core/runtime/index.js';

describe('AgentRuntime Execution Loop', () => {
  it('executes iterative reasoning loop and completes task cleanly', async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      maxSteps: 5,
      providerRouter: {
        async generate() {
          return { content: 'Task completed.', toolCalls: [] };
        }
      }
    });

    const statusEvents = [];
    const result = await runtime.runTask('inspect workspace package.json', {
      onStatus: (st) => statusEvents.push(st)
    });

    expect(result.success).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.response).toBe('Task completed.');
    expect(statusEvents.length).toBeGreaterThan(0);
  });

  it('reports truncation when the step cap is reached with work still pending', async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      maxSteps: 3
    });

    const statusEvents = [];
    const result = await runtime.runTask('inspect workspace package.json', {
      onStatus: (st) => statusEvents.push(st)
    });

    expect(result.success).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.stepsCount).toBe(3);
    expect(statusEvents.some(st => st.type === 'truncated')).toBe(true);
  });
});
