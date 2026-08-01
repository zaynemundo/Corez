/**
 * Runtime-owned completion gate (`finalize_task`).
 *
 * A repository task may complete only when the evidence-backed gate passes.
 * A no-tool response never completes an unfinished repository operation: the
 * runtime injects a continuation instruction naming the next missing action.
 *
 * The gate tracks which tools ran and what they returned, so the model
 * cannot claim completion without the corresponding evidence. Model-declared
 * booleans are never accepted as proof: finalize_task submits structured
 * constraints and review findings, and the runtime verifies the evidence.
 */

import path from 'node:path';
import {
  ensureFileLifecycle,
  ensureRelevantFile,
  recordFileRead,
  recordFileWritten,
  recordDiffReviewed
} from './fileLifecycle.js';

export const GATE_STEPS = Object.freeze([
  { id: 'instructions', label: 'Repository instructions loaded' },
  { id: 'gitStatus', label: 'Git status inspected' },
  { id: 'relevantFiles', label: 'Relevant files identified and read' },
  { id: 'plan', label: 'Task plan created' },
  { id: 'implementation', label: 'Required implementation steps completed' },
  { id: 'readBeforeWrite', label: 'Every modified file read before it was written' },
  { id: 'diffInspected', label: 'Final git diff inspected' },
  { id: 'tests', label: 'Relevant targeted tests passed' },
  { id: 'lint', label: 'Linting passed' },
  { id: 'build', label: 'Build passed' },
  { id: 'diffCheck', label: 'git diff --check passed' },
  { id: 'constraints', label: 'Must-preserve constraints verified' },
  { id: 'review', label: 'No blocking review finding remains' },
  { id: 'unrelatedChanges', label: 'Unrelated user changes preserved' }
]);

export function createGateState() {
  return {
    toolExecutions: new Map(),   // toolName -> last result
    modifiedAt: null,            // timestamp of the most recent file modification
    diffRunAt: null,             // timestamp of the most recent successful git diff
    fileLifecycles: new Map(),   // resolvedPath -> per-file lifecycle
    relevantFiles: new Map(),    // resolvedPath -> { path, relevanceReason, discoveredBy, readSuccessfully, modified, testedBy }
    planItems: new Map(),        // id -> { description, status }
    baselineGitStatus: undefined, // first git_status result (captured before implementation)
    constraintEvidence: null,    // constraints submitted at finalize time
    reviewResults: null,         // review findings submitted at finalize time
    finalizeAttempted: false,
    finalizePassed: false
  };
}

function isSuccessfulResult(result) {
  return !!result && result.error == null && result.success !== false;
}

export function recordToolExecution(gate, toolName, args, result, cwd = process.cwd()) {
  gate.toolExecutions.set(toolName, result);
  const filePath = typeof args?.filePath === 'string' ? path.resolve(cwd, args.filePath) : null;
  const succeeded = isSuccessfulResult(result);

  // The FIRST git_status run captures the baseline state before
  // implementation; later runs overwrite the latest state.
  if (toolName === 'git_status') {
    if (gate.baselineGitStatus === undefined) gate.baselineGitStatus = result;
  }

  // Successful reads record read evidence; failed reads must not count.
  if (toolName === 'read_file' && filePath !== null && succeeded) {
    recordFileRead(gate, filePath);
    ensureRelevantFile(gate, filePath, { discoveredBy: 'model-read', readSuccessfully: true });
  }

  // Successful writes record modification evidence; failed or rejected
  // writes (read-before-write violations) must not.
  if ((toolName === 'write_file' || toolName === 'edit_file') && filePath !== null && succeeded) {
    recordFileWritten(gate, filePath);
    gate.modifiedAt = Date.now();
    const lifecycle = ensureFileLifecycle(gate, filePath);
    ensureRelevantFile(gate, filePath, {
      discoveredBy: 'model-write',
      modified: true,
      readSuccessfully: lifecycle?.readSucceeded === true
    });
  }

  if (toolName === 'git_diff' && succeeded) {
    gate.diffRunAt = Date.now();
    recordDiffReviewed(gate);
  }

  if (toolName === 'create_plan' && Array.isArray(args?.planItems)) {
    for (const item of args.planItems) {
      const id = String(item?.id ?? item?.description ?? '');
      if (id) gate.planItems.set(id, { description: item.description || id, status: 'planned' });
    }
  }
  if (toolName === 'update_plan_item' && (args?.itemId || args?.id) && args?.status) {
    const id = String(args.itemId ?? args.id);
    const existing = gate.planItems.get(id) || { description: id };
    gate.planItems.set(id, { ...existing, status: String(args.status) });
  }
}

function hasToolPassed(gate, toolName) {
  const result = gate.toolExecutions.get(toolName);
  if (result === undefined) return false;
  const raw = typeof result === 'string' ? result : JSON.stringify(result || {});
  return /exitcode[:=]\s*0|"exitcode"\s*:\s*0|success\s*[:=]\s*true|"success"\s*:\s*true/i.test(raw);
}

function toolRan(gate, toolName) {
  return gate.toolExecutions.has(toolName);
}

/**
 * Unrelated user changes are preserved when the baseline git status (captured
 * from the FIRST git_status run, before implementation) is still present and
 * unchanged in the latest git_status output. An empty baseline is trivially
 * preserved.
 */
export function computeUnrelatedChangesPreserved(gate) {
  const baseline = gate.baselineGitStatus;
  if (baseline === undefined) {
    return { ok: false, reason: 'baseline git status missing (run git_status before implementing)' };
  }
  const baselineStatus = typeof baseline?.status === 'string' ? baseline.status : '';
  const baselineLines = baselineStatus.split('\n').map((line) => line.trim()).filter(Boolean);
  if (baselineLines.length === 0) {
    return { ok: true, reason: 'no unrelated changes present at baseline' };
  }
  const final = gate.toolExecutions.get('git_status');
  const finalStatus = typeof final?.status === 'string' ? final.status : '';
  const finalLines = new Set(finalStatus.split('\n').map((line) => line.trim()).filter(Boolean));
  const lostLines = baselineLines.filter((line) => !finalLines.has(line));
  if (lostLines.length === 0) {
    return { ok: true, reason: 'baseline unrelated changes remain present and unchanged' };
  }
  return { ok: false, reason: `baseline unrelated change lines lost: ${lostLines.join('; ')}` };
}

/**
 * Evaluate the gate against the evidence the runtime has actually gathered.
 *
 * options:
 *   availableScripts   - package.json scripts; lint/build steps only apply
 *                        when the corresponding script exists
 *   constraints        - [{ constraintId, description, verificationMethod,
 *                          evidence, status }] submitted by finalize_task
 *   reviewFindings     - [{ findingId, severity, file, line, description,
 *                          status, resolutionEvidence }] from a real review
 *                        pass over the final diff
 *
 * Returns { passed, missing: [label, ...] } — missing lists every action
 * that must happen before the task may complete.
 */
export function evaluateCompletionGate(gate, options = {}) {
  const scripts = options.availableScripts || {};
  const missing = [];

  if (!gate.toolExecutions.has('load_instructions')) missing.push(GATE_STEPS[0].label);
  if (!toolRan(gate, 'git_status')) missing.push(GATE_STEPS[1].label);

  // At least one relevant file must have been read successfully.
  const relevantFiles = gate.relevantFiles || new Map();
  const anyRelevantRead = [...relevantFiles.values()].some((rf) => rf?.readSuccessfully === true);
  if (!anyRelevantRead) missing.push(GATE_STEPS[2].label);

  if (gate.planItems.size === 0) missing.push(GATE_STEPS[3].label);

  const pendingPlan = [...gate.planItems.values()].filter((item) => item.status !== 'done' && item.status !== 'completed');
  if (pendingPlan.length > 0) missing.push(`${GATE_STEPS[4].label} (${pendingPlan.length} plan item(s) still ${pendingPlan[0]?.status || 'pending'})`);

  // Every EXISTING file that was successfully written must have been
  // successfully read BEFORE that write (reading after writing never counts).
  const unreadModified = [];
  for (const [, lifecycle] of (gate.fileLifecycles || new Map()).entries()) {
    if (lifecycle.lastSuccessfulWriteAt === null) continue;
    if (lifecycle.existedBeforeTask !== true) continue;
    if (lifecycle.readSucceeded !== true) unreadModified.push(lifecycle.path);
  }
  if (unreadModified.length > 0) {
    missing.push(`${GATE_STEPS[5].label}: ${unreadModified.join(', ')}`);
  }

  const diffFresh = gate.diffRunAt !== null
    && (gate.modifiedAt === null || gate.diffRunAt >= gate.modifiedAt);
  if (!toolRan(gate, 'git_diff') || !diffFresh) missing.push(GATE_STEPS[6].label);

  if (!hasToolPassed(gate, 'run_tests')) missing.push(GATE_STEPS[7].label);
  if (scripts.lint && !hasToolPassed(gate, 'run_lint')) missing.push(GATE_STEPS[8].label);
  if (scripts.build && !hasToolPassed(gate, 'run_build')) missing.push(GATE_STEPS[9].label);
  if (!hasToolPassed(gate, 'git_diff_check')) missing.push(GATE_STEPS[10].label);

  // Constraints: every submitted constraint must be verified AND carry a
  // non-empty verification method AND non-empty evidence. Booleans are not
  // accepted as proof.
  const constraints = Array.isArray(options.constraints) ? options.constraints : [];
  if (constraints.length === 0) {
    missing.push(`${GATE_STEPS[11].label} (submit verified constraints in finalize_task)`);
  } else {
    const unverified = constraints.filter((c) => !(
      c?.status === 'verified'
      && typeof c?.verificationMethod === 'string' && c.verificationMethod.trim() !== ''
      && typeof c?.evidence === 'string' && c.evidence.trim() !== ''
    ));
    if (unverified.length > 0) {
      missing.push(`${GATE_STEPS[11].label} (${unverified.length} constraint(s) lack verified status, verification method, or evidence)`);
    }
  }

  // Review: a real review pass must be submitted, and every blocking finding
  // must be resolved with non-empty resolution evidence.
  const reviewFindings = Array.isArray(options.reviewFindings) ? options.reviewFindings : [];
  if (reviewFindings.length === 0) {
    missing.push(`${GATE_STEPS[12].label} (submit at least one review finding from a real review pass)`);
  } else {
    const blocking = reviewFindings.filter((f) => (f?.severity || 'blocking') === 'blocking');
    const unresolved = blocking.filter((f) => !(
      f?.status === 'resolved'
      && typeof f?.resolutionEvidence === 'string' && f.resolutionEvidence.trim() !== ''
    ));
    if (unresolved.length > 0) {
      missing.push(`${GATE_STEPS[12].label} (${unresolved.length} blocking finding(s) unresolved or lacking resolution evidence)`);
    }
  }

  // Unrelated changes: computed from the recorded git status baseline, not
  // from any model-declared boolean.
  const unrelated = computeUnrelatedChangesPreserved(gate);
  if (unrelated.ok !== true) {
    missing.push(`${GATE_STEPS[13].label}${unrelated.reason ? ` (${unrelated.reason})` : ''}`);
  }

  return { passed: missing.length === 0, missing };
}
