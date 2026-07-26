import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRuntime, MockProvider } from '../../packages/agent-core/index.js';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe('AgentRuntime', () => {
  it('executes a tool turn and streams final completion', async () => {
    const provider = new MockProvider({ turns: [
      [{ type: 'tool.requested', data: { id: 'c1', name: 'read_file', arguments: { filePath: 'package.json' } } }],
      [
        { type: 'assistant.delta', data: { text: 'Inspected package.json.' } },
        { type: 'assistant.completed', data: { finishReason: 'stop' } }
      ]
    ] });
    const runtime = AgentRuntime.createForWorkspace(process.cwd(), { provider });
    const events = [];
    for await (const event of runtime.runTask('inspect package', { policy: 'plan' })) events.push(event);

    expect(events.map(event => event.type)).toEqual(expect.arrayContaining([
      'run.started', 'tool.requested', 'tool.completed',
      'assistant.delta', 'assistant.completed', 'run.completed'
    ]));
    expect(events.at(-1).data.success).toBe(true);
    expect(events.every(event => typeof event.timestamp === 'string')).toBe(true);
  });

  it('collects streamed output and execution metrics without logging', async () => {
    const provider = new MockProvider({ turns: [
      [{ type: 'tool.requested', data: { id: 'c1', name: 'read_file', arguments: { filePath: 'package.json' } } }],
      [
        { type: 'assistant.delta', data: { text: 'Inspected ' } },
        { type: 'assistant.delta', data: { text: 'package.json.' } },
        { type: 'assistant.completed', data: { finishReason: 'stop' } }
      ]
    ] });
    const runtime = AgentRuntime.createForWorkspace(process.cwd(), { provider });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runtime.execute('inspect package', { policy: 'plan' });

    expect(result).toMatchObject({
      success: true,
      response: 'Inspected package.json.',
      stepsCount: 2,
      inspectedFiles: expect.arrayContaining(['package.json']),
      modifiedFiles: [],
      executedToolsCount: 1
    });
    expect(Object.keys(result)).toEqual([
      'success', 'response', 'stepsCount', 'inspectedFiles', 'modifiedFiles', 'executedToolsCount'
    ]);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('streams approval lifecycle events before executing the tool', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-runtime-'));
    roots.push(root);
    const outputPath = path.join(root, 'output.txt');
    const provider = new MockProvider({ turns: [
      [{
        type: 'tool.requested',
        data: { id: 'c1', name: 'write_file', arguments: { filePath: 'output.txt', content: 'done' } }
      }],
      [{ type: 'assistant.completed', data: { finishReason: 'stop' } }]
    ] });
    const runtime = AgentRuntime.createForWorkspace(root, { provider });
    const eventTypes = [];

    for await (const event of runtime.runTask('write output', { policy: 'run' })) {
      eventTypes.push(event.type);
      if (event.type === 'approval.requested' || event.type === 'approval.resolved') {
        expect(fs.existsSync(outputPath)).toBe(false);
      }
      if (event.type === 'tool.completed') expect(fs.existsSync(outputPath)).toBe(true);
    }

    expect(eventTypes.indexOf('approval.requested')).toBeLessThan(eventTypes.indexOf('approval.resolved'));
    expect(eventTypes.indexOf('approval.resolved')).toBeLessThan(eventTypes.indexOf('tool.completed'));
  });

  it('accepts a streaming provider through the existing providerRouter constructor slot', async () => {
    const providerRouter = new MockProvider({ turns: [[
      { type: 'assistant.delta', data: { text: 'Compatible.' } },
      { type: 'assistant.completed', data: { finishReason: 'stop' } }
    ]] });
    const runtime = new AgentRuntime({ cwd: process.cwd(), providerRouter });

    await expect(runtime.execute('compatibility', { policy: 'chat' })).resolves.toMatchObject({
      success: true,
      response: 'Compatible.',
      stepsCount: 1
    });
  });

  it('reports inspected files from only the current execution when reused', async () => {
    const provider = new MockProvider({ turns: [
      [{ type: 'tool.requested', data: { id: 'c1', name: 'read_file', arguments: { filePath: 'package.json' } } }],
      [{ type: 'assistant.completed', data: { finishReason: 'stop' } }],
      [{ type: 'tool.requested', data: { id: 'c2', name: 'read_file', arguments: { filePath: 'README.md' } } }],
      [{ type: 'assistant.completed', data: { finishReason: 'stop' } }]
    ] });
    const runtime = AgentRuntime.createForWorkspace(process.cwd(), { provider });

    const first = await runtime.execute('inspect package', { policy: 'plan' });
    const second = await runtime.execute('inspect readme', { policy: 'plan' });

    expect(first.inspectedFiles).toContain('package.json');
    expect(second.inspectedFiles).toContain('README.md');
    expect(second.inspectedFiles).not.toContain('package.json');
  });
});
