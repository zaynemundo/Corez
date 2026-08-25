// Task state model. Every task owns an isolated instance; no global mutable
// runtime is shared between users, sessions or workspaces.

export const TASK_STATUSES = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  BLOCKED: 'blocked',
  FAILED: 'failed'
});

export const TERMINAL_TASK_STATUSES = new Set([
  TASK_STATUSES.COMPLETED,
  TASK_STATUSES.CANCELLED,
  TASK_STATUSES.BLOCKED,
  TASK_STATUSES.FAILED
]);

export class TaskState {
  constructor({
    taskId,
    userId,
    sessionId,
    workspaceId,
    prompt,
    model,
    mode = 'repository'
  } = {}) {
    this.taskId = taskId;
    this.userId = userId || 'anonymous';
    this.sessionId = sessionId || null;
    this.workspaceId = workspaceId || null;
    this.status = TASK_STATUSES.PENDING;
    this.prompt = prompt || '';
    this.model = model || 'mimo-v2.5';
    this.mode = mode;
    this.messages = [];
    this.plan = null;
    this.currentStep = 0;
    this.toolExecutions = [];
    this.modifiedFiles = [];
    this.inspectedFiles = [];
    this.retryState = null;
    this.evidence = [];
    this.providerHistory = [];
    this.contract = null;
    this.preservationEvidence = {};
    this.reviewResolutions = {};
    this.initialGitStatus = null;
    this.baselineHashes = null;
    this.projectInfo = null;
    this.instructionsLoaded = false;
    this.result = null;
    this.error = null;
    this.fileActivity = {};
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.terminalAt = null;
  }

  touch() {
    this.updatedAt = new Date().toISOString();
  }

  get isTerminal() {
    return TERMINAL_TASK_STATUSES.has(this.status);
  }

  addMessage(message) {
    this.messages.push(message);
    this.touch();
  }

  addEvidence(evidence) {
    this.evidence.push(evidence);
    this.touch();
  }

  recordProviderUsage({ provider, model }) {
    this.providerHistory.push({
      provider,
      model,
      at: new Date().toISOString()
    });
    this.touch();
  }

  recordToolExecution(execution) {
    this.toolExecutions.push(execution);
    this.touch();
  }

  markTerminal(status, result = null, error = null) {
    this.status = status;
    if (result !== null) this.result = result;
    if (error !== null) this.error = error;
    this.terminalAt = new Date().toISOString();
    this.touch();
  }

  toJSON() {
    const copy = {};
    for (const key of Object.keys(this)) {
      copy[key] = this[key];
    }
    return copy;
  }

  static fromJSON(data) {
    const task = new TaskState({});
    for (const key of Object.keys(data || {})) {
      task[key] = data[key];
    }
    return task;
  }
}
