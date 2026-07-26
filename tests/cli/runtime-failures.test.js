import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AgentRuntime,
  ApprovalController,
  CorezError,
  ERROR_CODES,
  MockProvider,
  PermissionManager,
  toolCallFingerprint
} from '../../packages/agent-core/index.js';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

const repeated = () => ({
  type: 'tool.requested',
  data: { id: crypto.randomUUID(), name: 'list_directory', arguments: { dirPath: '.' } }
});

async function capture(generator) {
  const events = [];
  let error;
  try {
    for await (const event of generator) events.push(event);
  } catch (caught) {
    error = caught;
  }
  return { events, error };
}

function deferred() {
  let resolve;
  const promise = new Promise(complete => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('AgentRuntime failure states', () => {
  it('creates stable fingerprints by recursively sorting argument keys', () => {
    expect(toolCallFingerprint({
      name: 'read_file',
      arguments: { range: { end: 10, start: 2 }, filePath: 'a.js' }
    })).toBe('read_file:{"filePath":"a.js","range":{"end":10,"start":2}}');
  });

  it('fails after three identical consecutive calls', async () => {
    const provider = new MockProvider({ turns: [[repeated()], [repeated()], [repeated()]] });
    const runtime = AgentRuntime.createForWorkspace(process.cwd(), { provider });
    await expect(runtime.execute('loop', { policy: 'plan' }))
      .rejects.toMatchObject({ code: 'DUPLICATE_TOOL_LOOP' });
  });

  it('emits a structured error before throwing a duplicate-loop failure', async () => {
    const provider = new MockProvider({ turns: [[repeated()], [repeated()], [repeated()]] });
    const runtime = AgentRuntime.createForWorkspace(process.cwd(), { provider });

    const { events, error } = await capture(runtime.runTask('loop', { policy: 'plan' }));

    expect(events.at(-1)).toMatchObject({
      type: 'error',
      data: { code: 'DUPLICATE_TOOL_LOOP' }
    });
    expect(error).toMatchObject({ code: 'DUPLICATE_TOOL_LOOP' });
    expect(events.some(event => event.type === 'run.completed')).toBe(false);
  });

  it('fails instead of reporting success at the step limit', async () => {
    const provider = new MockProvider({ turns: [[repeated()], [repeated()]] });
    const runtime = AgentRuntime.createForWorkspace(process.cwd(), {
      provider,
      duplicateToolLimit: 99,
      maxSteps: 2
    });
    await expect(runtime.execute('limit', { policy: 'plan' }))
      .rejects.toMatchObject({ code: 'STEP_LIMIT' });
  });

  it('propagates an already-aborted signal as a typed cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const runtime = AgentRuntime.createForWorkspace(process.cwd(), {
      provider: new MockProvider({ turns: [] })
    });
    await expect(runtime.execute('cancel', { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'COMMAND_CANCELLED' });
  });

  it('prioritizes caller cancellation over a provider error raised after abort', async () => {
    const controller = new AbortController();
    const provider = {
      stream() {
        return {
          async next() {
            controller.abort();
            throw new CorezError(ERROR_CODES.PROVIDER_HTTP_ERROR, 'Transport failed after cancellation.');
          },
          [Symbol.asyncIterator]() {
            return this;
          }
        };
      }
    };
    const runtime = AgentRuntime.createForWorkspace(process.cwd(), { provider });

    await expect(runtime.execute('cancel', { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'COMMAND_CANCELLED' });
  });

  it('cancels while approval is pending without executing the tool', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-runtime-'));
    roots.push(root);
    const controller = new AbortController();
    const provider = new MockProvider({ turns: [[{
      type: 'tool.requested',
      data: { id: 'c1', name: 'write_file', arguments: { filePath: 'blocked.txt', content: 'blocked' } }
    }]] });
    const approvalController = new ApprovalController({
      prompt: async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return 'once';
      }
    });
    const runtime = AgentRuntime.createForWorkspace(root, {
      provider,
      permissionManager: new PermissionManager({ workspaceWrite: 'ask' }),
      approvalController
    });
    const iterator = runtime.runTask('write', {
      policy: 'run',
      signal: controller.signal
    })[Symbol.asyncIterator]();
    let next;
    do {
      next = await iterator.next();
    } while (next.value?.type !== 'approval.requested');

    controller.abort();
    const failureEvent = await iterator.next();

    expect(failureEvent.value).toMatchObject({
      type: 'error',
      data: { code: 'COMMAND_CANCELLED' }
    });
    await expect(iterator.next()).rejects.toMatchObject({ code: 'COMMAND_CANCELLED' });
    expect(fs.existsSync(path.join(root, 'blocked.txt'))).toBe(false);
  });

  it('does not persist a late session approval after cancellation', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-runtime-'));
    roots.push(root);
    const controller = new AbortController();
    const promptStarted = deferred();
    const promptResponse = deferred();
    const approvalController = new ApprovalController({
      prompt: async () => {
        promptStarted.resolve();
        return promptResponse.promise;
      }
    });
    const provider = new MockProvider({ turns: [[{
      type: 'tool.requested',
      data: { id: 'c1', name: 'write_file', arguments: { filePath: 'late.txt', content: 'late' } }
    }]] });
    const runtime = AgentRuntime.createForWorkspace(root, {
      provider,
      permissionManager: new PermissionManager({ workspaceWrite: 'ask' }),
      approvalController
    });
    const iterator = runtime.runTask('write', {
      policy: 'run',
      signal: controller.signal
    })[Symbol.asyncIterator]();
    let next;
    do {
      next = await iterator.next();
    } while (next.value?.type !== 'approval.requested');

    const pendingAuthorization = iterator.next();
    await promptStarted.promise;
    controller.abort();
    expect(await pendingAuthorization).toMatchObject({
      value: {
        type: 'error',
        data: { code: 'COMMAND_CANCELLED' }
      }
    });
    await expect(iterator.next()).rejects.toMatchObject({ code: 'COMMAND_CANCELLED' });

    promptResponse.resolve('session');
    await Promise.resolve();
    await Promise.resolve();

    expect(approvalController.sessionApprovals.size).toBe(0);
    expect(fs.existsSync(path.join(root, 'late.txt'))).toBe(false);
  });

  it('rejects policy-disallowed tools before authorization or execution', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-runtime-'));
    roots.push(root);
    const prompt = vi.fn(async () => 'once');
    const provider = new MockProvider({ turns: [[{
      type: 'tool.requested',
      data: { id: 'c1', name: 'write_file', arguments: { filePath: 'blocked.txt', content: 'blocked' } }
    }]] });
    const runtime = AgentRuntime.createForWorkspace(root, {
      provider,
      permissionManager: new PermissionManager({ workspaceWrite: 'ask' }),
      approvalController: new ApprovalController({ prompt })
    });

    await expect(runtime.execute('write', { policy: 'plan' }))
      .rejects.toMatchObject({ code: 'TOOL_DENIED' });
    expect(prompt).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, 'blocked.txt'))).toBe(false);
  });

  it('resets duplicate detection after each successful workspace mutation', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-runtime-'));
    roots.push(root);
    const write = id => ({
      type: 'tool.requested',
      data: { id, name: 'write_file', arguments: { filePath: 'output.txt', content: 'complete' } }
    });
    const provider = new MockProvider({ turns: [
      [write('c1')],
      [write('c2')],
      [write('c3')],
      [
        { type: 'assistant.delta', data: { text: 'Finished.' } },
        { type: 'assistant.completed', data: { finishReason: 'stop' } }
      ]
    ] });
    const runtime = AgentRuntime.createForWorkspace(root, { provider });

    await expect(runtime.execute('write', { policy: 'run' })).resolves.toMatchObject({
      success: true,
      response: 'Finished.',
      stepsCount: 4,
      modifiedFiles: ['output.txt'],
      executedToolsCount: 3
    });
  });
});
