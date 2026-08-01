import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ToolRegistry } from '../packages/agent-core/tools/index.js';
import { ContextEngine } from '../packages/agent-core/context/index.js';

// Workspace path containment: no tool may read or write outside the
// workspace root, regardless of traversal segments, absolute paths, NUL
// bytes, or symbolic links.
describe('workspace path containment', () => {
  let workspace;
  let context;
  let registry;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'containment-test-'));
    context = new ContextEngine(workspace);
    registry = new ToolRegistry();
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('rejects traversal escapes (../)', async () => {
    const result = await registry.executeTool('write_file', { filePath: '../escape.txt', content: 'x' }, { context });
    expect(result.success).toBe(false);
    expect(result.code).toBe('PATH_TRAVERSAL');
    expect(fs.existsSync(path.join(path.dirname(workspace), 'escape.txt'))).toBe(false);
  });

  it('rejects traversal escapes with backslash separators', async () => {
    const result = await registry.executeTool('write_file', { filePath: '..\\escape.txt', content: 'x' }, { context });
    expect(result.success).toBe(false);
    expect(result.code).toBe('PATH_TRAVERSAL');
  });

  it('rejects absolute paths outside the workspace', async () => {
    const outside = path.join(os.tmpdir(), `containment-outside-${Date.now()}.txt`);
    const result = await registry.executeTool('write_file', { filePath: outside, content: 'x' }, { context });
    expect(result.success).toBe(false);
    expect(result.code).toBe('PATH_ABSOLUTE_ESCAPE');
    expect(fs.existsSync(outside)).toBe(false);
  });

  it('rejects POSIX-style absolute paths that escape the workspace', async () => {
    const result = await registry.executeTool('read_file', { filePath: '/etc/passwd' }, { context });
    expect(result.success).toBe(false);
    expect(result.code).toBe('PATH_ABSOLUTE_ESCAPE');
  });

  it('rejects NUL bytes in paths', async () => {
    const result = await registry.executeTool('write_file', { filePath: 'bad\u0000name.txt', content: 'x' }, { context });
    expect(result.success).toBe(false);
    expect(result.code).toBe('PATH_NUL_BYTE');
  });

  it('rejects symlink escapes', { skip: !symlinkEscapeSupported() }, async () => {
    const outside = path.join(os.tmpdir(), `symlink-outside-${Date.now()}`);
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
    const linkPath = path.join(workspace, 'linkdir');
    try {
      fs.symlinkSync(outside, linkPath, 'junction');
    } catch {
      fs.symlinkSync(outside, linkPath, 'dir');
    }

    const read = await registry.executeTool('read_file', { filePath: 'linkdir/secret.txt' }, { context });
    expect(read.success).toBe(false);
    expect(read.code).toBe('PATH_SYMLINK_ESCAPE');

    const write = await registry.executeTool('write_file', { filePath: 'linkdir/new.txt', content: 'x' }, { context });
    expect(write.success).toBe(false);
    expect(write.code).toBe('PATH_SYMLINK_ESCAPE');
    expect(fs.existsSync(path.join(outside, 'new.txt'))).toBe(false);
  });

  it('allows paths inside the workspace', async () => {
    const write = await registry.executeTool('write_file', { filePath: 'sub/deep/file.txt', content: 'ok' }, { context });
    expect(write.success).toBe(true);
    const read = await registry.executeTool('read_file', { filePath: 'sub/deep/file.txt' }, { context });
    expect(read.error).toBeUndefined();
    expect(read.content).toBe('ok');
    const list = await registry.executeTool('list_directory', { dirPath: 'sub/deep' }, { context });
    expect(list.items.some((item) => item.name === 'file.txt')).toBe(true);
  });
});

function symlinkEscapeSupported() {
  const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-probe-'));
  try {
    const target = path.join(probeRoot, 'target');
    const link = path.join(probeRoot, 'link');
    fs.mkdirSync(target);
    fs.symlinkSync(target, link, 'junction');
    return fs.statSync(link).isDirectory();
  } catch {
    return false;
  } finally {
    fs.rmSync(probeRoot, { recursive: true, force: true });
  }
}
