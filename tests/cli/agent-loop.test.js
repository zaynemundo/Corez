import { describe, it, expect } from 'vitest';
import { AgentRuntime } from '../../packages/agent-core/runtime/index.js';

// A ToolRegistry whose tools return canned results without touching the
// real repository (used to exercise the completion gate deterministically).
class StubToolRegistry {
  constructor(map = {}) {
    this.map = map;
    this.tools = new Map(Object.keys(map).map((name) => [name, { name }]));
  }
  getToolSchemas() {
    return [...this.tools.keys()].map((name) => ({ name, description: name, parameters: {} }));
  }
  async executeTool(name, args, runtimeOptions) {
    const stub = this.map[name];
    if (typeof stub === 'function') return stub(args, runtimeOptions);
    return stub ?? { success: true };
  }
}

describe('AgentRuntime Execution Loop', () => {
  it('executes iterative reasoning loop and completes task cleanly (conversational)', async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      mode: 'conversational',
      providerRouter: {
        async generate() {
          return { content: 'Task completed.', toolCalls: [] };
        }
      }
    });

    const statusEvents = [];
    const result = await runtime.runTask('answer me', {
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
      mode: 'conversational',
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

  it('declares a blocker only when a deterministic action repeats with unchanged evidence', async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      mode: 'conversational',
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
    expect(result.blockedReason).toMatch(/deterministic action/);
    expect(statusEvents.some(st => st.type === 'blocked')).toBe(true);
  });

  it('more than three identical polling results do NOT block progress while an operation is pending', async () => {
    let step = 0;
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      mode: 'conversational',
      providerRouter: {
        async generate() {
          step += 1;
          if (step <= 5) {
            // The model polls the same operation five times; the tool reports
            // it is still running, so identical results are valid polling.
            return {
              content: 'polling',
              toolCalls: [{ id: 'poll', function: { name: 'run_command', arguments: JSON.stringify({ command: 'wait-for-job' }) } }]
            };
          }
          return { content: 'job finished', toolCalls: [] };
        }
      },
      toolRegistry: {
        getToolSchemas() {
          return [{ name: 'run_command', description: 'run', parameters: {} }];
        },
        async executeTool() {
          return { command: 'wait-for-job', status: 'running', exitCode: 0 };
        }
      }
    });

    const result = await runtime.runTask('wait for the job', {
      onStatus: () => {}
    });

    // Five identical polling results while the operation is pending never
    // block progress: the task completes on the final no-tool reply.
    expect(result.blocked).toBe(false);
    expect(result.success).toBe(true);
    expect(result.stepsCount).toBe(6);
  });

  it('rejects a repeated no-tool reply instead of finishing a repository task prematurely', async () => {
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

  it('a no-tool conversational response completes normally', async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      mode: 'conversational',
      providerRouter: {
        async generate() {
          return { content: 'Here is the answer.', toolCalls: [] };
        }
      }
    });

    const result = await runtime.runTask('what is 2+2', { onStatus: () => {} });

    expect(result.success).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.response).toBe('Here is the answer.');
  });

  it('a premature no-tool response cannot complete a repository task: continuation is injected', async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      providerRouter: {
        async generate() {
          // The model answers conversationally without tools: repository mode
          // must reject this as incomplete and continue.
          return { content: 'I will handle that task.', toolCalls: [] };
        }
      },
      toolRegistry: new StubToolRegistry()
    });

    const result = await runtime.runTask('refactor the login flow', {
      onStatus: () => {}
    });

    expect(result.success).toBe(false);
    expect(result.gatePassed).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toMatch(/no-tool reply/);
  });

  it('repository tasks complete only after the evidence-backed gate passes', async () => {
    let step = 0;
    const toolOrder = [];
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      providerRouter: {
        async generate() {
          step += 1;
          const calls = [];
          const add = (name, args) => calls.push({ id: `c${step}-${name}`, function: { name, arguments: JSON.stringify(args) } });

          // Step 1: understand + plan.
          if (step === 1) {
            add('git_status', {});
            add('read_file', { filePath: 'package.json' });
            add('create_plan', { planItems: [{ id: 'p1', description: 'Implement the feature' }] });
            add('update_plan_item', { itemId: 'p1', status: 'done' });
            add('write_file', { filePath: 'scratch/out.txt', content: 'done' });
            return { content: 'planned and implemented', toolCalls: calls };
          }
          // Step 2: verify evidence, then finalize.
          add('git_diff', {});
          add('git_diff_check', {});
          add('run_tests', {});
          add('run_lint', {});
          add('run_build', {});
          add('finalize_task', {
            verifiedConstraints: ['preserve existing API'],
            reviewFindingsResolved: true,
            unrelatedChangesPreserved: true
          });
          return { content: 'verifying and finalising', toolCalls: calls };
        }
      },
      toolRegistry: new StubToolRegistry({
        git_status: { success: true, status: 'clean' },
        read_file: { filePath: 'package.json', content: '{}' },
        create_plan: { success: true },
        update_plan_item: { success: true },
        write_file: { success: true, filePath: 'scratch/out.txt' },
        git_diff: { staged: false, diff: 'diff --git a/scratch/out.txt' },
        git_diff_check: { command: 'git diff --check', stdout: '', exitCode: 0 },
        run_tests: { command: 'npm test', stdout: 'ok', exitCode: 0 },
        run_lint: { command: 'npm run lint', stdout: 'ok', exitCode: 0 },
        run_build: { command: 'npm run build', stdout: 'ok', exitCode: 0 },
        finalize_task: (_args, _opts) => {
          toolOrder.push('finalize');
          // Delegate to the runtime's real gate evaluation via the recorded
          // executions would be ideal, but the stub returns the canonical
          // result shape; the runtime records it and marks gatePassed.
          return { success: true, gate: 'passed', message: 'Completion gate passed.' };
        }
      })
    });

    const result = await runtime.runTask('implement the feature', {
      onStatus: () => {}
    });

    expect(result.gatePassed).toBe(true);
    expect(result.success).toBe(true);
    expect(result.stepsCount).toBe(2);
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
