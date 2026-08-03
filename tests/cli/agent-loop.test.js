import { describe, it, expect } from 'vitest';
import { AgentRuntime } from '../../packages/agent-core/runtime/index.js';

describe('AgentRuntime Execution Loop', () => {
  it('completes a conversational exchange with the provider response', async () => {
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
    expect(result.status).toBe('completed');
    expect(result.response).toBe('Task completed.');
    expect(result.stepsCount).toBe(1);
    expect(statusEvents.length).toBeGreaterThan(0);
  });

  it('never executes repository tools: no tool calls, no file access', async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      providerRouter: {
        async generate({ tools }) {
          // Repository execution was removed from CoreZ: the runtime never
          // requests or executes tools.
          expect(tools).toEqual([]);
          return { content: 'Here is the answer.', toolCalls: [{ id: 'c1', function: { name: 'read_file', arguments: '{}' } }] };
        }
      }
    });

    const result = await runtime.runTask('fix the bug in this api', {});

    expect(result.success).toBe(true);
    expect(result.response).toBe('Here is the answer.');
    expect(result.executedToolsCount).toBe(0);
    expect(result.modifiedFiles).toEqual([]);
  });

  it('propagates cancellation as an error', async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      providerRouter: {
        async generate({ signal }) {
          return new Promise((resolve) => {
            const timer = setTimeout(() => resolve({ content: 'late answer', toolCalls: [] }), 10_000);
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              const error = new Error('aborted');
              error.name = 'AbortError';
              resolve(Promise.reject(error));
            }, { once: true });
          });
        }
      }
    });

    const controller = new AbortController();
    const promise = runtime.runTask('do anything', { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);

    await expect(promise).rejects.toThrow(/aborted|Abort/i);
  });
});
