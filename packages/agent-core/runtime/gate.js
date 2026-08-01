/**
 * Runtime-owned completion gate (`finalize_task`).
 *
 * A repository task may complete only when the evidence-backed gate passes.
 * A no-tool response never completes an unfinished repository operation: the
 * runtime injects a continuation instruction naming the next missing action.
 *
 * The gate tracks which tools ran and what they returned, so the model
 * cannot claim completion without the corresponding evidence.
 */

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
    diffRunAt: null,             // timestamp of the most recent git diff
    readHistory: new Map(),      // filePath -> last read timestamp
    planItems: new Map(),        // id -> { description, status }
    constraintsDeclared: new Set(),
    reviewFindingsResolved: new Set(),
    unrelatedChangesPreserved: false,
    finalizeAttempted: false,
    finalizePassed: false
  };
}

export function recordToolExecution(gate, toolName, args, result) {
  gate.toolExecutions.set(toolName, result);
  if (toolName === 'read_file' && typeof args?.filePath === 'string') {
    gate.readHistory.set(args.filePath, Date.now());
  }
  if ((toolName === 'write_file' || toolName === 'edit_file') && typeof args?.filePath === 'string') {
    gate.modifiedAt = Date.now();
    if (!gate.readHistory.has(args.filePath)) {
      gate.readHistory.set(args.filePath, 0); // written without a prior read
    }
  }
  if (toolName === 'git_diff') {
    gate.diffRunAt = Date.now();
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
 * Evaluate the gate against the evidence the runtime has actually gathered.
 * Returns { passed, missing: [label, ...] } — missing lists every action
 * that must happen before the task may complete.
 */
export function evaluateCompletionGate(gate, options = {}) {
  const scripts = options.availableScripts || {};
  const missing = [];

  if (!gate.toolExecutions.has('load_instructions')) missing.push(GATE_STEPS[0].label);
  if (!toolRan(gate, 'git_status')) missing.push(GATE_STEPS[1].label);
  if (gate.readHistory.size === 0) missing.push(GATE_STEPS[2].label);
  if (gate.planItems.size === 0) missing.push(GATE_STEPS[3].label);

  const pendingPlan = [...gate.planItems.values()].filter((item) => item.status !== 'done' && item.status !== 'completed');
  if (pendingPlan.length > 0) missing.push(`${GATE_STEPS[4].label} (${pendingPlan.length} plan item(s) still ${pendingPlan[0]?.status || 'pending'})`);

  const unreadModified = [...gate.readHistory.entries()]
    .filter(([, readAt]) => {
      const writtenWithoutRead = readAt === 0;
      const modifiedRecently = gate.modifiedAt !== null && readAt > 0 && readAt < gate.modifiedAt;
      return writtenWithoutRead || modifiedRecently;
    })
    .map(([filePath]) => filePath);
  if (unreadModified.length > 0) {
    missing.push(`${GATE_STEPS[5].label}: ${unreadModified.join(', ')}`);
  }

  const lastDiff = gate.toolExecutions.get('git_diff');
  const diffFresh = gate.diffRunAt !== null
    && (gate.modifiedAt === null || gate.diffRunAt >= gate.modifiedAt);
  if (lastDiff === undefined || !diffFresh) missing.push(GATE_STEPS[6].label);

  if (!hasToolPassed(gate, 'run_tests')) missing.push(GATE_STEPS[7].label);
  if (scripts.lint && !hasToolPassed(gate, 'run_lint')) missing.push(GATE_STEPS[8].label);
  if (scripts.build && !hasToolPassed(gate, 'run_build')) missing.push(GATE_STEPS[9].label);
  if (!hasToolPassed(gate, 'git_diff_check')) missing.push(GATE_STEPS[10].label);

  const declared = options.declaredConstraints || [];
  if (declared.length === 0) {
    missing.push(`${GATE_STEPS[11].label} (declare verified constraints in finalize_task)`);
  }
  if (options.reviewFindingsResolved !== true) missing.push(GATE_STEPS[12].label);
  if (options.unrelatedChangesPreserved !== true) missing.push(GATE_STEPS[13].label);

  return { passed: missing.length === 0, missing };
}
