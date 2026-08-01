import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ToolRegistry } from '../packages/agent-core/tools/index.js';
import { ContextEngine } from '../packages/agent-core/context/index.js';
import { createGateState, recordToolExecution, evaluateCompletionGate } from '../packages/agent-core/runtime/gate.js';

// Per-file read-before-write enforcement, tested through the real tools and
// the real gate in a throwaway temp workspace (no repository touched).
describe('read-before-write enforcement', () => {
  let workspace;
  let context;
  let gate;
  let registry;

  const abs = (p) => path.resolve(workspace, p);
  const runtimeOptions = () => ({ context, gate });
  const validFinalizeEvidence = () => ({
    constraints: [
      { constraintId: 'c1', description: 'keep api', verificationMethod: 'inspected final diff', evidence: 'no api change', status: 'verified' }
    ],
    reviewFindings: [
      { findingId: 'f1', severity: 'blocking', file: 'a.txt', line: 1, description: 'review pass', status: 'resolved', resolutionEvidence: 'verified in final state' }
    ]
  });

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'rbw-test-'));
    context = new ContextEngine(workspace);
    gate = createGateState();
    registry = new ToolRegistry();
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('rejects overwriting an existing file that was never read', async () => {
    fs.writeFileSync(abs('a.txt'), 'original');
    const result = await registry.executeTool('write_file', { filePath: 'a.txt', content: 'clobbered' }, runtimeOptions());
    expect(result.success).toBe(false);
    expect(result.error).toBe('read-before-write');
    expect(result.code).toBe('READ_BEFORE_WRITE');
    expect(result.message).toContain('a.txt');
    expect(fs.readFileSync(abs('a.txt'), 'utf8')).toBe('original');
  });

  it('rejects editing an existing file that was never read', async () => {
    fs.writeFileSync(abs('b.txt'), 'hello world');
    const result = await registry.executeTool('edit_file', { filePath: 'b.txt', targetContent: 'hello', replacementContent: 'goodbye' }, runtimeOptions());
    expect(result.success).toBe(false);
    expect(result.error).toBe('read-before-write');
    expect(result.code).toBe('READ_BEFORE_WRITE');
    expect(fs.readFileSync(abs('b.txt'), 'utf8')).toBe('hello world');
  });

  it('reading after writing never satisfies the gate', () => {
    fs.writeFileSync(abs('c.txt'), 'v1');
    // Simulate a write that happened without a prior read (e.g. the tool ran
    // before the gate was passed, or the registry was bypassed).
    recordToolExecution(gate, 'write_file', { filePath: 'c.txt' }, { success: true, filePath: 'c.txt' }, workspace);
    // A read AFTER that write must NOT satisfy read-before-write.
    recordToolExecution(gate, 'read_file', { filePath: 'c.txt' }, { filePath: 'c.txt', content: 'v1' }, workspace);
    const result = evaluateCompletionGate(gate, { availableScripts: {}, ...validFinalizeEvidence() });
    expect(result.passed).toBe(false);
    expect(result.missing.some((m) => m.includes('read before it was written') && m.includes('c.txt'))).toBe(true);
  });

  it('allows creating a new file without reading it first', async () => {
    const result = await registry.executeTool('write_file', { filePath: 'new.txt', content: 'fresh' }, runtimeOptions());
    expect(result.success).toBe(true);
    expect(fs.readFileSync(abs('new.txt'), 'utf8')).toBe('fresh');
  });

  it('reading file A does not satisfy read-before-write for file B', async () => {
    fs.writeFileSync(abs('a.txt'), 'A');
    fs.writeFileSync(abs('b.txt'), 'B');
    const read = await registry.executeTool('read_file', { filePath: 'a.txt' }, runtimeOptions());
    expect(read.error).toBeUndefined();
    const writeB = await registry.executeTool('write_file', { filePath: 'b.txt', content: 'X' }, runtimeOptions());
    expect(writeB.success).toBe(false);
    expect(writeB.code).toBe('READ_BEFORE_WRITE');
    const writeA = await registry.executeTool('write_file', { filePath: 'a.txt', content: 'A2' }, runtimeOptions());
    expect(writeA.success).toBe(true);
  });

  it('failed file reads do not count as read evidence', async () => {
    fs.writeFileSync(abs('d.txt'), 'D');
    const failedRead = await registry.executeTool('read_file', { filePath: 'missing.txt' }, runtimeOptions());
    expect(failedRead.error).toBeDefined();
    const write = await registry.executeTool('write_file', { filePath: 'd.txt', content: 'D2' }, runtimeOptions());
    expect(write.success).toBe(false);
    expect(write.code).toBe('READ_BEFORE_WRITE');
  });

  it('failed writes do not create modification evidence', () => {
    fs.writeFileSync(abs('e.txt'), 'E');
    recordToolExecution(gate, 'write_file', { filePath: 'e.txt' }, { success: false, error: 'disk error', exitCode: 1 }, workspace);
    const lifecycle = gate.fileLifecycles.get(abs('e.txt'));
    if (lifecycle) {
      expect(lifecycle.firstSuccessfulWriteAt).toBeNull();
      expect(lifecycle.lastSuccessfulWriteAt).toBeNull();
    }
    const result = evaluateCompletionGate(gate, { availableScripts: {}, ...validFinalizeEvidence() });
    expect(result.missing.some((m) => m.includes('e.txt'))).toBe(false);
  });
});
