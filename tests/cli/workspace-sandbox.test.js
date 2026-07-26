import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceSandbox } from '../../packages/agent-core/index.js';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe('WorkspaceSandbox', () => {
  it('allows existing and new paths inside the workspace', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-ws-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'inside.txt'), 'ok');
    const sandbox = WorkspaceSandbox.create(root);
    expect(sandbox.resolveExisting('inside.txt')).toBe(path.join(root, 'inside.txt'));
    expect(sandbox.resolveForCreate('src/new.js')).toBe(path.join(root, 'src/new.js'));
  });

  it.each(['../outside.txt', '/tmp/outside.txt'])('rejects an escape: %s', input => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-ws-'));
    roots.push(root);
    const sandbox = WorkspaceSandbox.create(root);
    expect(() => sandbox.resolveForCreate(input)).toThrowError(
      expect.objectContaining({ code: 'PATH_OUTSIDE_WORKSPACE' })
    );
  });

  it('rejects symlinks that point outside the workspace', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-ws-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-out-'));
    roots.push(root, outside);
    fs.symlinkSync(outside, path.join(root, 'escape'));
    const sandbox = WorkspaceSandbox.create(root);
    expect(() => sandbox.resolveForCreate('escape/new.txt'))
      .toThrowError(expect.objectContaining({ code: 'PATH_OUTSIDE_WORKSPACE' }));
  });
});
