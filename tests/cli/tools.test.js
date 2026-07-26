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

  it.each([
    ['node -e "console.log(\'/etc/passwd\')"'],
    ['echo C:\\Windows\\System32'],
    ['echo \\\\server\\share'],
    ['echo ../outside']
  ])('blocks an uncontained auto-approved command: %s', async command => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-tools-'));
    roots.push(root);
    await expect(new ToolRegistry().executeTool('run_command', { command }, {
      sandbox: WorkspaceSandbox.create(root),
      autoApprove: true,
      authorize: async () => ({ allowed: true })
    })).rejects.toMatchObject({ code: 'TOOL_DENIED' });
  });

  it('keeps arbitrary contained run_command interactive under auto-approve', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-tools-'));
    roots.push(root);
    await expect(new ToolRegistry().executeTool('run_command', { command: 'echo contained' }, {
      sandbox: WorkspaceSandbox.create(root),
      autoApprove: true
    })).rejects.toMatchObject({ code: 'TOOL_APPROVAL_REQUIRED' });
  });

  it('marks arbitrary run_command as not auto-eligible in its approval request', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-tools-'));
    roots.push(root);
    const result = await new ToolRegistry().executeTool('run_command', { command: 'echo approved' }, {
      sandbox: WorkspaceSandbox.create(root),
      autoApprove: true,
      authorize: async request => {
        expect(request.autoEligible).toBe(false);
        return { allowed: true };
      }
    });
    expect(result.success).toBe(true);
  });

  it('validates run_tests filters before allowing automatic execution', () => {
    const tool = new ToolRegistry().getTool('run_tests');
    expect(tool.contained({ testFilter: '../outside.test.js' })).toBe(false);
    expect(tool.contained({ testFilter: '/tmp/outside.test.js' })).toBe(false);
    expect(tool.contained({ testFilter: 'tests/cli/tools.test.js' })).toBe(true);
  });

  it('does not search sensitive workspace files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-tools-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'visible.md'), 'needle is visible\n');
    fs.writeFileSync(path.join(root, 'credentials.json'), '{"token":"needle credential"}');
    fs.writeFileSync(path.join(root, 'secrets.json'), '{"token":"needle secret"}');
    const result = await new ToolRegistry().executeTool('search_text', { query: 'needle' }, {
      sandbox: WorkspaceSandbox.create(root),
      authorize: async () => ({ allowed: true })
    });
    expect(result).toMatchObject({ success: true });
    expect(result.data.matches).toEqual([{ file: 'visible.md', lineNumber: 1, content: 'needle is visible' }]);
  });

  it('returns structured failures when a file cannot be read', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-tools-'));
    roots.push(root);
    const result = await new ToolRegistry().executeTool('read_file', { filePath: 'missing.txt' }, {
      sandbox: WorkspaceSandbox.create(root),
      authorize: async () => ({ allowed: true })
    });
    expect(result).toMatchObject({ success: false, data: { error: expect.any(String) }, durationMs: expect.any(Number) });
  });

  it.each([
    ['missing target', 'before\n', 'absent'],
    ['ambiguous target', 'before before\n', 'before']
  ])('rejects an edit with %s', async (_label, original, targetContent) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-tools-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'a.txt'), original);
    const result = await new ToolRegistry().executeTool('edit_file', {
      filePath: 'a.txt', targetContent, replacementContent: 'after'
    }, {
      sandbox: WorkspaceSandbox.create(root),
      authorize: async () => ({ allowed: true })
    });
    expect(result).toMatchObject({ success: false, data: { error: expect.any(String) } });
    expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe(original);
  });

  it('requires network permission for embed_text without making a live request', () => {
    const tool = new ToolRegistry().getTool('embed_text');
    expect(tool.category).toBe('network');
  });
});
