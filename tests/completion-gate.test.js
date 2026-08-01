import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGateState, recordToolExecution, evaluateCompletionGate } from '../packages/agent-core/runtime/gate.js';

// Completion gate evaluation against REAL recorded evidence. No always-
// success stubs: every gate state is built from recordToolExecution output
// exactly as the runtime records it, in a throwaway temp workspace.
const SCRIPTS = { lint: 'npm run lint', build: 'npm run build' };

const DEFAULT_CONSTRAINTS = [
  {
    constraintId: 'c1',
    description: 'Preserve the existing public API surface',
    verificationMethod: 'Inspected the final git diff',
    evidence: 'Final diff contains no signature or export changes',
    status: 'verified'
  }
];

const DEFAULT_REVIEW = [
  {
    findingId: 'f1',
    severity: 'blocking',
    file: 'src/index.js',
    line: 1,
    description: 'Review pass performed over the final diff',
    status: 'resolved',
    resolutionEvidence: 'Verified against the final state'
  }
];

describe('completion gate evidence evaluation', () => {
  let workspace;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  function buildPassingGate({ gitStatus = { branch: 'main', status: '' } } = {}) {
    const gate = createGateState();
    recordToolExecution(gate, 'load_instructions', {}, { success: true }, workspace);
    recordToolExecution(gate, 'git_status', {}, gitStatus, workspace);
    recordToolExecution(gate, 'read_file', { filePath: 'a.txt' }, { filePath: 'a.txt', totalLines: 1, content: 'x' }, workspace);
    recordToolExecution(gate, 'create_plan', { planItems: [{ id: 'p1', description: 'Implement feature' }] }, { success: true }, workspace);
    recordToolExecution(gate, 'update_plan_item', { itemId: 'p1', status: 'done' }, { success: true }, workspace);
    recordToolExecution(gate, 'write_file', { filePath: 'a.txt' }, { success: true, filePath: 'a.txt' }, workspace);
    recordToolExecution(gate, 'git_diff', {}, { staged: false, diff: 'diff --git a/a.txt' }, workspace);
    recordToolExecution(gate, 'git_diff_check', {}, { command: 'git diff --check', stdout: '', exitCode: 0 }, workspace);
    recordToolExecution(gate, 'run_tests', {}, { command: 'npm test', stdout: 'ok', exitCode: 0 }, workspace);
    recordToolExecution(gate, 'run_lint', {}, { command: 'npm run lint', stdout: 'ok', exitCode: 0 }, workspace);
    recordToolExecution(gate, 'run_build', {}, { command: 'npm run build', stdout: 'ok', exitCode: 0 }, workspace);
    return gate;
  }

  function evaluate(gate, { constraints = DEFAULT_CONSTRAINTS, reviewFindings = DEFAULT_REVIEW, scripts = SCRIPTS } = {}) {
    return evaluateCompletionGate(gate, { availableScripts: scripts, constraints, reviewFindings });
  }

  it('rejects a premature no-tool answer: bare evidence cannot complete repository work', () => {
    const gate = createGateState();
    recordToolExecution(gate, 'load_instructions', {}, { success: true }, workspace);
    const result = evaluate(gate);
    expect(result.passed).toBe(false);
    expect(result.missing).toContain('Git status inspected');
  });

  it('failed tests prevent completion', () => {
    const gate = buildPassingGate();
    recordToolExecution(gate, 'run_tests', {}, { command: 'npm test', stdout: '', stderr: '1 test failed', exitCode: 1 }, workspace);
    const result = evaluate(gate);
    expect(result.passed).toBe(false);
    expect(result.missing).toContain('Relevant targeted tests passed');
  });

  it('failed lint prevents completion when a lint script exists', () => {
    const gate = buildPassingGate();
    recordToolExecution(gate, 'run_lint', {}, { command: 'npm run lint', stdout: '', stderr: 'lint error', exitCode: 1 }, workspace);
    const result = evaluate(gate);
    expect(result.passed).toBe(false);
    expect(result.missing).toContain('Linting passed');
  });

  it('failed build prevents completion when a build script exists', () => {
    const gate = buildPassingGate();
    recordToolExecution(gate, 'run_build', {}, { command: 'npm run build', stdout: '', stderr: 'build error', exitCode: 1 }, workspace);
    const result = evaluate(gate);
    expect(result.passed).toBe(false);
    expect(result.missing).toContain('Build passed');
  });

  it('a stale diff inspection (before the last change) prevents completion', async () => {
    const gate = buildPassingGate();
    // Modify AFTER the diff was inspected: the diff no longer covers the
    // final state. The delay guarantees modifiedAt lands strictly after
    // diffRunAt (timestamps otherwise share the same millisecond).
    await new Promise((resolve) => setTimeout(resolve, 10));
    recordToolExecution(gate, 'write_file', { filePath: 'b.txt' }, { success: true, filePath: 'b.txt' }, workspace);
    const result = evaluate(gate);
    expect(result.passed).toBe(false);
    expect(result.missing).toContain('Final git diff inspected');
  });

  it('a final diff after the last change permits completion', () => {
    const result = evaluate(buildPassingGate());
    expect(result.passed).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('an unresolved blocking review finding prevents completion', () => {
    const gate = buildPassingGate();
    const result = evaluate(gate, {
      reviewFindings: [
        { findingId: 'f1', severity: 'blocking', file: 'a.txt', line: 3, description: 'logic bug', status: 'open', resolutionEvidence: '' }
      ]
    });
    expect(result.passed).toBe(false);
    expect(result.missing.some((m) => m.includes('blocking finding'))).toBe(true);
  });

  it('a blocking review finding resolved without evidence prevents completion', () => {
    const gate = buildPassingGate();
    const result = evaluate(gate, {
      reviewFindings: [
        { findingId: 'f1', severity: 'blocking', file: 'a.txt', line: 3, description: 'logic bug', status: 'resolved', resolutionEvidence: '' }
      ]
    });
    expect(result.passed).toBe(false);
    expect(result.missing.some((m) => m.includes('blocking finding'))).toBe(true);
  });

  it('a constraint without evidence prevents completion', () => {
    const gate = buildPassingGate();
    const result = evaluate(gate, {
      constraints: [
        { constraintId: 'c1', description: 'keep api', verificationMethod: 'inspected diff', evidence: '', status: 'verified' }
      ]
    });
    expect(result.passed).toBe(false);
    expect(result.missing.some((m) => m.includes('constraint'))).toBe(true);
  });

  it('a constraint declared verified without a verification method prevents completion', () => {
    const gate = buildPassingGate();
    const result = evaluate(gate, {
      constraints: [
        { constraintId: 'c1', description: 'keep api', verificationMethod: '   ', evidence: 'no api change', status: 'verified' }
      ]
    });
    expect(result.passed).toBe(false);
    expect(result.missing.some((m) => m.includes('constraint'))).toBe(true);
  });

  it('unrelated changes present in the baseline and preserved permit completion', () => {
    const gate = buildPassingGate({ gitStatus: { branch: 'main', status: ' M unrelated.txt' } });
    // Final state still reports the identical unrelated change.
    recordToolExecution(gate, 'git_status', {}, { branch: 'main', status: ' M unrelated.txt' }, workspace);
    const result = evaluate(gate);
    expect(result.passed).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('unrelated changes lost from the baseline prevent completion', () => {
    const gate = buildPassingGate({ gitStatus: { branch: 'main', status: ' M unrelated.txt' } });
    // Final state no longer reports the unrelated change: it was lost.
    recordToolExecution(gate, 'git_status', {}, { branch: 'main', status: '' }, workspace);
    const result = evaluate(gate);
    expect(result.passed).toBe(false);
    expect(result.missing.some((m) => m.includes('Unrelated user changes preserved'))).toBe(true);
  });
});
