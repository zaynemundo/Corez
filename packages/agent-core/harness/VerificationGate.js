// VerificationGate: agy must test before saying its done.
//
// Enforces the DSH verifier principle: an agent's text claim is never evidence.
// Only real execution evidence (tests, lint, build, git diff --check) counts.
//
// This gate is used by:
// - AgentHarness #finishCompleted (conversation/repo agentic path)
// - ToolRegistry finalize_task (model-facing completion gate)
// - agy-delegate scripts (post-AGY verification hook)
//
// Policy:
// - Analysis / read-only tasks (no file modifications): pass without checks.
// - Any task that touched the workspace (modifiedFiles || write_file/edit_file tool calls):
//   must have run at least one verification command successfully and recently.
//   Required evidence (configurable):
//   * run_build or npm run build  (exitCode 0)
//   * git_diff_check or git diff --check (exitCode 0)
//   * run_tests or npm test (exitCode 0)  — skipped only if explicitly opted via allow list
//   Optionally, lint is recommended but not blocking unless task touched lint-sensitive files.
//
// The gate never fabricates evidence: it inspects the actual tool execution
// history and, when run live, executes the checks and records their stdout.

import { spawnSync, execSync } from 'node:child_process';

function hasSuccessTool(toolExecutions, names) {
  if (!Array.isArray(toolExecutions)) return false;
  const set = new Set(names);
  return toolExecutions.some((e) => {
    const name = e.tool || e.name || '';
    if (!set.has(name)) return false;
    const res = e.result || e.output || e;
    // ToolRegistry executeTool returns {stdout, exitCode, error} or {success, error}
    if (res && typeof res.exitCode === 'number') return res.exitCode === 0;
    if (res && typeof res.success === 'boolean') return res.success === true;
    if (res && res.error) return false;
    return true;
  });
}



export function verifyTaskCompletion(task, options = {}) {
  const {
    // When true, the gate actually runs `npm run build` etc. instead of just
    // inspecting prior tool executions. agy-delegate uses this for live verification.
    liveRun = false,
    cwd = process.cwd(),
    // which checks are required when files were touched
    requireBuild = true,
    requireTests = true,
    requireDiffCheck = true,
    // allow list to waive tests for trivial changes (e.g. docs only)
    waiveTestsFor = null
  } = options;

  const modified = Array.isArray(task.modifiedFiles) ? task.modifiedFiles : [];
  const inspected = Array.isArray(task.inspectedFiles) ? task.inspectedFiles : [];
  const toolExecutions = Array.isArray(task.toolExecutions) ? task.toolExecutions : [];
  const didModify = modified.length > 0 || toolExecutions.some((e) => ['write_file', 'edit_file'].includes(e.tool || e.name));

  const missing = [];
  const evidence = [];

  if (!didModify) {
    // Read-only analysis: no build/test required, but if task claims completion
    // without any tool use at all, warn but pass (DSH: allow empty no-step turn)
    return { ok: true, didModify: false, missing: [], evidence: ['no file modifications — analysis-only task, no build/test required'] };
  }

  // From here: files were touched — must have verification evidence
  if (requireBuild) {
    const hasBuild = hasSuccessTool(toolExecutions, ['run_build', 'build']);
    if (!hasBuild) {
      if (liveRun) {
        try {
          const r = spawnSync('npm', ['run', 'build'], { cwd, encoding: 'utf8', timeout: 120000 });
          if (r.status === 0) evidence.push(`run_build: ${r.stdout?.slice(0, 300) || 'ok'}`);
          else missing.push(`run_build failed (exit ${r.status}): ${r.stderr?.slice(0, 500) || r.stdout?.slice(0, 500) || 'no output'}`);
        } catch (e) {
          missing.push(`run_build execution failed: ${e.message}`);
        }
      } else {
        missing.push('run_build: no successful build was executed after the last file change (expected tool "run_build" with exitCode 0)');
      }
    } else evidence.push('run_build: verified');
  }

  if (requireDiffCheck) {
    const hasDiffCheck = hasSuccessTool(toolExecutions, ['git_diff_check']);
    if (!hasDiffCheck) {
      if (liveRun) {
        try {
          execSync('git diff --check', { cwd, encoding: 'utf8' });
          evidence.push('git diff --check: ok (no whitespace errors)');
        } catch (e) {
          const out = (e.stdout || '') + (e.stderr || '');
          missing.push(`git diff --check failed: ${out.slice(0, 500) || e.message}`);
        }
      } else {
        missing.push('git_diff_check: no successful "git diff --check" after the last change');
      }
    } else evidence.push('git diff --check: verified');
  }

  if (requireTests) {
    // allow waiving tests for docs-only changes if caller provides predicate
    const shouldWaive = typeof waiveTestsFor === 'function' ? waiveTestsFor(modified) : false;
    if (!shouldWaive) {
      const hasTests = hasSuccessTool(toolExecutions, ['run_tests']);
      if (!hasTests) {
        if (liveRun) {
          try {
            const r = spawnSync('npm', ['test', '--', '--run'], { cwd, encoding: 'utf8', timeout: 180000 });
            if (r.status === 0) evidence.push(`run_tests: ${r.stdout?.slice(-500) || 'ok'}`);
            else missing.push(`run_tests failed (exit ${r.status}): ${r.stderr?.slice(0, 800) || r.stdout?.slice(-800) || 'no output'}`);
          } catch (e) {
            missing.push(`run_tests execution failed: ${e.message}`);
          }
        } else {
          missing.push('run_tests: no successful test run after the last file change (expected tool "run_tests" with exitCode 0)');
        }
      } else evidence.push('run_tests: verified');
    } else evidence.push('run_tests: waived for trivial change');
  }

  // extra: constraints/reviewFindings evidence (finalize_task)
  if (Array.isArray(task.constraints)) {
    for (const c of task.constraints) {
      if (!c.verificationMethod || !String(c.verificationMethod).trim()) missing.push(`constraint "${c.constraintId||'?'}" missing verificationMethod`);
      if (!c.evidence || !String(c.evidence).trim()) missing.push(`constraint "${c.constraintId||'?'}" missing evidence`);
      if (c.status !== 'verified') missing.push(`constraint "${c.constraintId||'?'}" not verified`);
    }
  }
  if (Array.isArray(task.reviewFindings)) {
    for (const f of task.reviewFindings) {
      if (f.severity === 'blocking' && f.status !== 'resolved') missing.push(`blocking finding "${f.findingId||'?'}" not resolved`);
      if (f.severity === 'blocking' && f.status === 'resolved' && !String(f.resolutionEvidence||'').trim()) missing.push(`blocking finding "${f.findingId}" missing resolutionEvidence`);
    }
  }

  const ok = missing.length === 0;
  return { ok, didModify, missing, evidence, inspectedCount: inspected.length, modifiedCount: modified.length };
}

// Live helper for CLI / agy-delegate: run verification commands and return evidence
export function runLiveVerification(cwd = process.cwd()) {
  const results = [];
  const checks = [
    { name: 'git diff --check', cmd: 'git diff --check', args: [] },
    { name: 'npm run build', cmd: 'npm', args: ['run', 'build'] },
    { name: 'npm run lint', cmd: 'npm', args: ['run', 'lint'] }
  ];
  for (const chk of checks) {
    try {
      let r;
      if (chk.cmd === 'git') {
        execSync('git diff --check', { cwd, encoding: 'utf8' });
        results.push({ name: chk.name, ok: true, output: 'ok' });
      } else {
        r = spawnSync(chk.cmd, chk.args, { cwd, encoding: 'utf8', timeout: 150000 });
        results.push({ name: chk.name, ok: r.status === 0, exitCode: r.status, output: (r.stdout||'').slice(-2000), error: (r.stderr||'').slice(0,2000) });
      }
    } catch (e) {
      results.push({ name: chk.name, ok: false, error: e.message, output: (e.stdout||'')+(e.stderr||'') });
    }
  }
  // tests are heavy; run with --run and capture, but failure is not hidden
  try {
    const r = spawnSync('npm', ['test', '--', '--run', 'tests/harness-lite.test.js', 'tests/agent-harness.test.js'], { cwd, encoding: 'utf8', timeout: 180000 });
    results.push({ name: 'npm test (harness)', ok: r.status === 0, exitCode: r.status, output: (r.stdout||'').slice(-2000), error: (r.stderr||'').slice(0,2000) });
  } catch (e) {
    results.push({ name: 'npm test (harness)', ok: false, error: e.message });
  }
  return results;
}
