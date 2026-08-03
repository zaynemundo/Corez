// Per-task cancellation. One AbortController per task: cancelling one task
// never affects any other task.

export class CancellationManager {
  constructor() {
    this.controllers = new Map();
    this.reasons = new Map();
  }

  create(taskId) {
    if (!this.controllers.has(taskId)) {
      this.controllers.set(taskId, new AbortController());
    }
    return this.controllers.get(taskId);
  }

  get(taskId) {
    return this.controllers.get(taskId) || null;
  }

  getSignal(taskId) {
    return this.create(taskId).signal;
  }

  abort(taskId, reason = 'Task cancelled by user.') {
    const controller = this.controllers.get(taskId);
    if (!controller || controller.signal.aborted) return false;
    this.reasons.set(taskId, reason);
    controller.abort(reason);
    return true;
  }

  isAborted(taskId) {
    const controller = this.controllers.get(taskId);
    return controller?.signal?.aborted || false;
  }

  reason(taskId) {
    return this.reasons.get(taskId) || 'Task cancelled by user.';
  }

  dispose(taskId) {
    this.controllers.delete(taskId);
    this.reasons.delete(taskId);
  }
}
