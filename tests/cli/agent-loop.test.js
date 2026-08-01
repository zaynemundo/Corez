import { describe, it, expect } from 'vitest';
import { AgentRuntime } from '../../packages/agent-core/runtime/index.js';

describe('AgentRuntime Execution Loop', () => {
  it('executes iterative reasoning loop and completes task cleanly', async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
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
    expect(result.blocked).toBe(false);
    expect(result.response).toBe('Task completed.');
    expect(statusEvents.length).toBeGreaterThan(0);
  });

  it('does not terminate an active task at a fixed step count: long tasks exceed 25 steps', async () => {
    let step = 0;
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      providerRouter: {
        async generate() {
          step += 1;
          if (step < 40) {
            // Each step writes a distinct file, so every tool result is new
            // evidence and the runtime must keep going.
            return { content: `working step ${step}`, toolCalls: [{ id: `c${step}`, function: { name: 'write_file', arguments: JSON.stringify({ filePath: `scratch/progress-${step}.txt`, content: `step ${step}` }) } }] };
          }
          return { content: 'Task completed after 40 steps.', toolCalls: [] };
        }
      }
    });

    const statusEvents = [];
    const result = await runtime.runTask('deep task', {
      onStatus: (st) => statusEvents.push(st)
    });

    expect(result.stepsCount).toBe(40);
    expect(result.success).toBe(true);
    expect(result.truncated).toBe(false);
    expect(statusEvents.some(st => st.type === 'truncated')).toBe(false);
  });

  it('stops with a blocked report when the loop repeats identical evidence without progress', async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      providerRouter: {
        async generate() {
          // Same tool call with the same result every step: no new evidence.
          return { content: 'inspecting again', toolCalls: [{ id: 'call-repeat', function: { name: 'read_file', arguments: JSON.stringify({ filePath: 'package.json' }) } }] };
        }
      }
    });

    const statusEvents = [];
    const result = await runtime.runTask('inspect workspace package.json', {
      onStatus: (st) => statusEvents.push(st)
    });

    expect(result.success).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toMatch(/same tool results/);
    expect(statusEvents.some(st => st.type === 'blocked')).toBe(true);
  });

  it('rejects a repeated no-tool reply instead of finishing prematurely', async () => {
    let step = 0;
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      providerRouter: {
        async generate() {
          step += 1;
          if (step === 1) {
            return { content: 'inspecting', toolCalls: [{ id: 'c1', function: { name: 'read_file', arguments: JSON.stringify({ filePath: 'package.json' }) } }] };
          }
          // The model claims completion but merely repeats its previous
          // message with no tool calls: this is a stall, not a finished task.
          return { content: 'inspecting', toolCalls: [] };
        }
      }
    });

    const result = await runtime.runTask('fix the bug', {
      onStatus: () => {}
    });

    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toMatch(/no-tool reply/);
  });

  it('user cancellation immediately stops execution', async () => {
    const controller = new AbortController();
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      providerRouter: {
        async generate({ signal }) {
          signal?.addEventListener('abort', () => controller.abort(), { once: true });
          return { content: 'still working', toolCalls: [{ id: 'c1', function: { name: 'read_file', arguments: JSON.stringify({ filePath: 'package.json' }) } }] };
        }
      }
    });

    controller.abort();
    await expect(runtime.runTask('inspect workspace', { signal: controller.signal }))
      .rejects.toThrow(/cancelled by user/);
  });
});
