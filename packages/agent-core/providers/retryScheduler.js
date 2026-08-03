// Persisted retry schedules for the provider chain.
//
// When a request cannot wait any longer (the preferred provider is
// temporarily unavailable and a fallback must answer now), the chain records
// when the provider should be tried again. The schedule is persisted through
// an injected store adapter so that task resumption — after a page refresh,
// worker restart or provider outage — can continue exactly where the retry
// state left off instead of restarting completed work.

export class RetryScheduler {
  constructor({ load, save } = {}) {
    this.loadHandler = load || null;
    this.saveHandler = save || null;
  }

  get available() {
    return Boolean(this.loadHandler && this.saveHandler);
  }

  async load(taskId) {
    if (!this.available || !taskId) return null;
    const state = await this.loadHandler(taskId);
    if (!state || typeof state !== 'object') return null;
    return {
      provider: state.provider || null,
      attempt: Number.isFinite(state.attempt) ? state.attempt : 0,
      nextRetryAt: Number.isFinite(state.nextRetryAt) ? state.nextRetryAt : Date.now(),
      lastError: state.lastError || ''
    };
  }

  async save(taskId, state) {
    if (!this.available || !taskId) return;
    await this.saveHandler(taskId, {
      provider: state.provider,
      attempt: state.attempt,
      nextRetryAt: state.nextRetryAt,
      lastError: state.lastError || ''
    });
  }

  async clear(taskId) {
    if (!this.available || !taskId) return;
    await this.saveHandler(taskId, null);
  }
}
