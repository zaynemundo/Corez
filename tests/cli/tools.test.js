import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../packages/agent-core/tools/index.js';
import { ContextEngine } from '../../packages/agent-core/context/index.js';
import { PermissionManager } from '../../packages/agent-core/permissions/index.js';

describe('ToolRegistry Core Tools', () => {
  it('registers core local tools', () => {
    const registry = new ToolRegistry();
    const tools = registry.getAllTools();

    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('write_file');
    expect(toolNames).toContain('edit_file');
    expect(toolNames).toContain('list_directory');
    expect(toolNames).toContain('search_files');
    expect(toolNames).toContain('search_text');
    expect(toolNames).toContain('run_command');
    expect(toolNames).toContain('git_status');
    expect(toolNames).toContain('git_diff');
    expect(toolNames).toContain('git_log');
    expect(toolNames).toContain('run_tests');
    expect(toolNames).toContain('run_build');
    expect(toolNames).toContain('run_lint');
  });

  it('executes read_file tool cleanly', async () => {
    const registry = new ToolRegistry();
    const context = new ContextEngine(process.cwd());
    const permissionManager = new PermissionManager();

    const result = await registry.executeTool('read_file', { filePath: 'package.json' }, {
      context,
      permissionManager
    });

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('"name":');
    expect(context.inspectedFiles.has('package.json')).toBe(true);
  });

  it('executes list_directory tool cleanly', async () => {
    const registry = new ToolRegistry();
    const context = new ContextEngine(process.cwd());

    const result = await registry.executeTool('list_directory', { dirPath: '.' }, { context });
    expect(result.items).toBeDefined();
    expect(result.items.some(i => i.name === 'package.json')).toBe(true);
  });
});
