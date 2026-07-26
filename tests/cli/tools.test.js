import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ToolRegistry, WorkspaceSandbox } from '../../packages/agent-core/index.js';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe('ToolRegistry', () => {
  it('emits OpenAI-compatible function schemas', () => {
    const schema = new ToolRegistry().getProviderSchemas()[0];
    expect(schema).toMatchObject({
      type: 'function',
      function: {
        name: expect.any(String),
        description: expect.any(String),
        parameters: { type: 'object' }
      }
    });
  });

  it('cannot read outside the workspace', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-tools-'));
    roots.push(root);
    const registry = new ToolRegistry();
    await expect(registry.executeTool('read_file', { filePath: '/etc/passwd' }, {
      sandbox: WorkspaceSandbox.create(root),
      authorize: async () => ({ allowed: true })
    })).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
  });

  it('patches an exact unique string and records the change', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-tools-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'a.txt'), 'before\n');
    const result = await new ToolRegistry().executeTool('edit_file', {
      filePath: 'a.txt',
      targetContent: 'before',
      replacementContent: 'after'
    }, {
      sandbox: WorkspaceSandbox.create(root),
      authorize: async () => ({ allowed: true })
    });
    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after\n');
  });
});
