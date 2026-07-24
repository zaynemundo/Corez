import { describe, it, expect } from 'vitest';
import { AgentRuntime } from '../../packages/agent-core/runtime/index.js';

describe('AgentRuntime Execution Loop', () => {
  it('executes iterative reasoning loop and completes task cleanly', async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      maxSteps: 5
    });

    const statusEvents = [];
    const result = await runtime.runTask('inspect workspace package.json', {
      onStatus: (st) => statusEvents.push(st)
    });

    expect(result.success).toBe(true);
    expect(result.response).toBeDefined();
    expect(statusEvents.length).toBeGreaterThan(0);
  });
});
