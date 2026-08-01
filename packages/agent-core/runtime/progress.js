/**
 * Semantic progress tracker for the agent runtime.
 *
 * A task is blocked only when a deterministic action, run against unchanged
 * inputs and environment, yields an unchanged result AND no other semantic
 * dimension moved AND no alternative evidence source is pending. Repeated
 * identical tool outputs alone are NEVER a blocker: polling an operation
 * that is still pending remains valid.
 *
 * Semantic dimensions tracked:
 *   - inspected files
 *   - modified files
 *   - plan-item statuses
 *   - diagnostics (error/compiler output)
 *   - git diff content
 *   - test outcome
 *   - provider state
 *   - error classifications
 *   - completed dependencies
 *   - verification evidence
 *   - pending operations (polling states reported by tools)
 */

export class ProgressTracker {
  constructor() {
    this.inspectedFiles = new Set();
    this.modifiedFiles = new Set();
    this.planItemStatus = new Map();
    this.diagnosticsCount = 0;
    this.diffHash = null;
    this.testOutcome = null;
    this.providerState = null;
    this.errorClassifications = new Map();
    this.completedDependencies = new Set();
    this.verificationEvidence = new Set();
    this.pendingOperations = new Set();
  }

  applyToolResult(toolName, args, result) {
    const raw = typeof result === 'string' ? result : JSON.stringify(result || {});
    const lower = raw.toLowerCase();

    if (['read_file', 'list_directory', 'search_files', 'search_text'].includes(toolName)) {
      if (typeof args?.filePath === 'string') this.inspectedFiles.add(args.filePath);
      if (typeof args?.dirPath === 'string') this.inspectedFiles.add(args.dirPath);
      if (typeof args?.pattern === 'string') this.inspectedFiles.add(`pattern:${args.pattern}`);
      if (typeof args?.query === 'string') this.inspectedFiles.add(`query:${args.query}`);
    }
    if (['write_file', 'edit_file'].includes(toolName) && typeof args?.filePath === 'string') {
      this.modifiedFiles.add(args.filePath);
      // A file that was modified is itself new evidence for later reads.
      this.inspectedFiles.add(args.filePath);
    }
    if (toolName === 'create_plan' && Array.isArray(args?.planItems)) {
      for (const item of args.planItems) {
        const id = String(item?.id ?? item?.description ?? '');
        if (id) this.planItemStatus.set(id, 'planned');
      }
    }
    if (toolName === 'update_plan_item') {
      const id = String(args?.itemId ?? args?.id ?? '');
      const status = String(args?.status ?? '');
      if (id && status) this.planItemStatus.set(id, status);
    }
    if (toolName === 'git_diff' || toolName === 'git_diff_check' || toolName === 'git_status') {
      this.diffHash = hashOf(raw);
    }
    if (toolName === 'run_tests' || toolName === 'run_build' || toolName === 'run_lint') {
      this.testOutcome = /exitcode[:=]\s*0|"exitcode"\s*:\s*0|passed/i.test(lower)
        ? 'pass'
        : (lower.includes('fail') || lower.includes('error') ? 'fail' : 'unknown');
      if (this.testOutcome === 'pass') this.verificationEvidence.add(toolName);
    }
    if (toolName === 'finalize_task') {
      this.verificationEvidence.add('finalize');
    }

    // Pending-operation detection: tools may report a polling state.
    if (/"(?:status|state)"\s*:\s*"(?:running|pending|in.progress|queued|waiting)"/i.test(raw)
      || /(?:still|currently)\s+(?:running|processing|working)/i.test(lower)) {
      this.pendingOperations.add(`${toolName}:${String(args?.filePath || args?.command || '')}`);
    } else {
      this.pendingOperations.delete(`${toolName}:${String(args?.filePath || args?.command || '')}`);
    }

    // New error evidence: error/exception markers that did not exist before.
    const errorMatches = raw.match(/(?:error|exception|failed|failure)\s*[:=]?\s*[^\n]{1,120}/gi) || [];
    for (const match of errorMatches) {
      const key = match.slice(0, 160).toLowerCase();
      if (!this.errorClassifications.has(key)) {
        this.errorClassifications.set(key, 1);
      }
    }
    this.diagnosticsCount = this.errorClassifications.size;
  }

  hasPendingOperations() {
    return this.pendingOperations.size > 0;
  }

  snapshot() {
    return hashOf(JSON.stringify({
      inspected: [...this.inspectedFiles].sort(),
      modified: [...this.modifiedFiles].sort(),
      plan: [...this.planItemStatus.entries()].sort(),
      diagnostics: this.diagnosticsCount,
      diff: this.diffHash,
      testOutcome: this.testOutcome,
      provider: this.providerState,
      errors: [...this.errorClassifications.keys()].sort(),
      dependencies: [...this.completedDependencies].sort(),
      verification: [...this.verificationEvidence].sort(),
      pending: [...this.pendingOperations].sort()
    }));
  }
}

function hashOf(value) {
  let hash = 0;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return `h${(hash >>> 0).toString(36)}`;
}
