// The unified CoreZ agent harness.
//
// One harness powers the website (Cloudflare Worker, conversation mode) and
// provides the shared task layer: durable tasks, events, cancellation,
// resumption, leases and multi-user isolation. Repository-mode tasks are
// delegated to an injected repository runner (the Node AgentRuntime with its
// evidence-backed gate); the browser runtime has no such runner and honestly
// blocks repository tasks instead of pretending files were touched.

import { EventBus } from './EventBus.js';
import { TASK_STATUSES } from './TaskState.js';
import { CancellationManager } from './CancellationManager.js';
import { SessionManager } from './SessionManager.js';
import { TaskManager } from './TaskManager.js';
import { abortableSleep } from './utils.js';
import { RetryScheduler } from '../providers/retryScheduler.js';
import { ProviderChain } from '../providers/providerChain.js';

export class AgentHarness {
  constructor(options = {}) {
    this.eventBus = options.eventBus || new EventBus();
    this.cancellations = options.cancellationManager || new CancellationManager();
    this.sessions = options.sessionManager || new SessionManager();
    this.store = options.taskStore || null;
    this.taskManager = options.taskManager || new TaskManager({
      store: this.store,
      eventBus: this.eventBus,
      cancellationManager: this.cancellations,
      sessions: this.sessions
    });

    this.retryScheduler = options.retryScheduler || this.#buildRetryScheduler(this.store);
    this.providerChain = options.providerChain || new ProviderChain({
      adapters: options.adapters,
      retryScheduler: this.retryScheduler,
      onEvent: (event) => this.eventBus.emit({ ...event, taskId: event.taskId || null }),
      waitBudgetMs: options.providerWaitBudgetMs,
      baseBackoffMs: options.providerBaseBackoffMs
    });

    // Repository-mode delegation target (Node CLI AgentRuntime). Without it,
    // repository tasks are honestly blocked in the browser runtime.
    this.repositoryRunner = options.repositoryRunner || null;
    this.defaultModel = options.defaultModel || 'deepseek-v4-flash';
    this.autoApprove = options.autoApprove === true;
    // Durable event persistence: every emitted event is appended to the task
    // store so SSE consumers can reconnect and replay what they missed.
    this.persistEvents = options.persistEvents === true;
    if (this.persistEvents && this.store) {
      this.eventBus.subscribe((event) => {
        if (!event.taskId) return;
        this.store.appendEvent(event.taskId, event).catch(() => {
          // Event persistence is best-effort; the task record remains the
          // source of truth.
        });
      });
    }
    // Operator hang guard for in-process retry waits (0 disables waiting).
    this.maxRetryWaitMs = Number.isFinite(options.maxRetryWaitMs)
      ? options.maxRetryWaitMs
      : readPositiveEnv('COREZ_RETRY_WAIT_MS', 120_000);
  }

  #buildRetryScheduler(store) {
    if (!store) return null;
    return new RetryScheduler({
      load: async (taskId) => {
        const task = await store.getTask(taskId).catch(() => null);
        return task?.retryState ?? null;
      },
      save: async (taskId, state) => {
        await store.updateTask(taskId, { retryState: state });
      }
    });
  }

  // ---- Public API ----

  async startTask({ userId, sessionId, workspaceId, prompt, model, mode = 'repository', autoApprove, contract } = {}) {
    const task = await this.taskManager.createTask({ userId, sessionId, workspaceId, prompt, model, mode, contract });
    this.#execute(task, { autoApprove }).catch((err) => this.#handleLoopError(task, err));
    return task;
  }

  async runTask(options = {}) {
    const task = await this.taskManager.createTask({
      userId: options.userId,
      sessionId: options.sessionId,
      workspaceId: options.workspaceId,
      prompt: options.prompt,
      model: options.model,
      mode: options.mode || 'repository',
      contract: options.contract
    });
    return this.#execute(task, options);
  }

  async resumeTask(taskId, userId = null, options = {}) {
    const task = await this.taskManager.getTask(taskId, userId);
    if (task.isTerminal) return task;
    // The task lease decides duplicate-execution conflicts: a live loop still
    // holding the lease blocks the resume; an expired lease (process restart)
    // lets the resume proceed.
    task.status = TASK_STATUSES.RUNNING;
    task.error = null;
    task.touch();
    await this.taskManager.updateTask(taskId, { status: task.status, error: null });
    this.eventBus.emit({ type: 'task.resumed', taskId, userId: task.userId });
    return this.#execute(task, options);
  }

  async cancelTask(taskId, userId = null) {
    return this.taskManager.cancelTask(taskId, userId);
  }

  async getTask(taskId, userId = null) {
    return this.taskManager.getTask(taskId, userId);
  }

  subscribe(taskId, listener) {
    return this.eventBus.subscribe((event) => {
      if (event.taskId === taskId) {
        try {
          listener(event);
        } catch {
          // listener errors never break the bus
        }
      }
    });
  }

  // Synchronous conversation path (website chat). No completion gate, no
  // repository tools: a single model exchange with the provider chain,
  // including persisted retry scheduling for the session.
  async runConversation({ userId = 'anonymous', sessionId, prompt, messages = [], model, signal, tools = [] } = {}) {
    const taskId = `conv-${userId}::${sessionId || 'default'}`;
    const apiMessages = [...messages, { role: 'user', content: prompt }];
    const result = await this.providerChain.generate({
      taskId,
      model: model || this.defaultModel,
      messages: apiMessages,
      tools,
      signal
    });
    if (result.status === 'completed') {
      return {
        content: result.content,
        model: result.model,
        provider: result.provider,
        taskId
      };
    }
    if (result.status === 'cancelled') {
      throw new DOMException('Generation cancelled.', 'AbortError');
    }
    const error = new Error(result.error || 'All AI providers failed.');
    error.retryAfterSeconds = result.retryAfterSeconds;
    error.resumable = result.resumable !== false;
    throw error;
  }

  // ---- Internals ----

  async #handleLoopError(task, err) {
    if (task.isTerminal) return;
    const message = err?.message || 'Unexpected harness failure.';
    task.markTerminal(TASK_STATUSES.FAILED, null, message);
    this.eventBus.emit({ type: 'task.failed', taskId: task.taskId, error: message });
    try {
      await this.store?.updateTask(task.taskId, { status: task.status, error: message, terminalAt: task.terminalAt });
    } catch {
      // Persistence is best-effort on the failure path.
    }
  }

  async #execute(task, options = {}) {
    const signal = options.signal || this.cancellations.create(task.taskId).signal;
    if (options.signal) {
      options.signal.addEventListener('abort', () => this.cancellations.abort(task.taskId), { once: true });
    }

    // Task lease: prevents duplicate execution (a resume racing a live loop).
    // Released on every terminal path; expires automatically if the process
    // dies mid-run so a restart can resume.
    const leaseHolder = `run-${task.taskId}-${Math.random().toString(36).slice(2, 10)}`;
    const leaseTtlMs = 60_000;
    let lease;
    try {
      lease = await this.store?.acquireLease(task.taskId, leaseHolder, leaseTtlMs);
    } catch {
      lease = null; // transient lease-store failure: proceed without a lease
    }
    if (lease && lease.acquired === false) {
      // Another execution holds the task: leave the persisted state alone.
      this.eventBus.emit({ type: 'task.blocked', taskId: task.taskId, reason: lease.error || 'Task is already executing elsewhere.' });
      return task;
    }
    const renewLease = async () => {
      try {
        await this.store?.renewLease(task.taskId, leaseHolder, leaseTtlMs);
      } catch {
        // best-effort
      }
    };
    try {
      return await this.#executeCore(task, { ...options, signal, renewLease });
    } finally {
      try {
        await this.store?.releaseLease(task.taskId, leaseHolder);
      } catch {
        // best-effort
      }
    }
  }

  async #executeCore(task, options = {}) {
    const mode = task.mode || 'repository';
    if (mode === 'repository') {
      return this.#executeRepository(task, options);
    }
    return this.#executeConversation(task, options);
  }

  // Repository mode: delegated to the injected repository runner (the Node
  // AgentRuntime with its evidence-backed completion gate). The browser
  // runtime has no runner, so repository tasks are honestly blocked there.
  async #executeRepository(task, options = {}) {
    const { signal } = options;
    if (!this.repositoryRunner || typeof this.repositoryRunner.runTask !== 'function') {
      const reason = 'Repository tasks require a repository runner (Node CLI). The browser runtime cannot execute file or shell tools.';
      task.markTerminal(TASK_STATUSES.BLOCKED, null, reason);
      this.eventBus.emit({ type: 'task.blocked', taskId: task.taskId, reason });
      await this.#persist(task);
      return task;
    }
    this.eventBus.emit({ type: 'task.started', taskId: task.taskId, mode: 'repository' });
    try {
      const result = await this.repositoryRunner.runTask(task.prompt, {
        model: task.model,
        signal,
        autoApprove: options.autoApprove === true
      });
      if (signal.aborted) return this.#finishCancelled(task);
      if (result?.success === true || result?.status === 'completed') {
        const response = result?.response || result?.result || 'Task completed.';
        task.markTerminal(TASK_STATUSES.COMPLETED, response, null);
        this.eventBus.emit({ type: 'task.completed', taskId: task.taskId, response });
        await this.#persist(task);
        return task;
      }
      if (result?.status === 'cancelled' || result?.cancelled === true) {
        return this.#finishCancelled(task);
      }
      const reason = result?.blockedReason || result?.blocked
        ? (result?.blockedReason || result?.response || 'Repository task did not complete the completion gate.')
        : (result?.response || 'Repository task failed.');
      task.markTerminal(result?.blocked ? TASK_STATUSES.BLOCKED : TASK_STATUSES.FAILED, null, reason);
      this.eventBus.emit({
        type: result?.blocked ? 'task.blocked' : 'task.failed',
        taskId: task.taskId,
        reason,
        error: reason
      });
      await this.#persist(task);
      return task;
    } catch (err) {
      task.markTerminal(TASK_STATUSES.FAILED, null, err?.message || 'Repository runner failed.');
      this.eventBus.emit({ type: 'task.failed', taskId: task.taskId, error: err?.message || 'Repository runner failed.' });
      await this.#persist(task);
      return task;
    }
  }

  // Conversation mode: a model <-> retry exchange with no completion gate and
  // no repository tools. Stops only on completion, cancellation, a permanent
  // provider failure across every configured provider, or an empty response.
  async #executeConversation(task, options = {}) {
    const { signal, renewLease } = options;
    const messages = task.messages.length > 0
      ? task.messages
      : [
          { role: 'system', content: 'You are COREZ AI, an AI assistant. Answer the user\'s request directly with text only.' },
          { role: 'user', content: task.prompt }
        ];
    task.messages = messages;
    await this.#persist(task);

    while (!signal.aborted) {
      if (typeof renewLease === 'function') await renewLease();

      // Durable cancellation: a cancel issued from another process (website
      // API request) marks the task cancelled in the store; the running loop
      // honors it so cancellation works across harness instances.
      if (this.store) {
        try {
          const current = await this.store.getTask(task.taskId);
          if (current?.status === TASK_STATUSES.CANCELLED) {
            return this.#finishCancelled(task);
          }
        } catch {
          // transient read failure; keep going
        }
      }

      this.eventBus.emit({ type: 'model.requested', taskId: task.taskId, step: task.currentStep + 1 });

      const chainResult = await this.providerChain.generate({
        taskId: task.taskId,
        model: task.model,
        messages,
        tools: [],
        signal,
        persistRetries: true
      });

      if (chainResult.status === 'cancelled' || signal.aborted) {
        return this.#finishCancelled(task);
      }

      if (chainResult.status === 'retry-scheduled') {
        task.retryState = {
          provider: chainResult.provider,
          retryAfterSeconds: chainResult.retryAfterSeconds,
          error: chainResult.error
        };
        task.touch();
        await this.#persist(task);
        this.eventBus.emit({
          type: 'task.retry_pending',
          taskId: task.taskId,
          provider: chainResult.provider,
          retryAfterSeconds: chainResult.retryAfterSeconds
        });
        if (this.maxRetryWaitMs > 0) {
          const waitMs = Math.min((chainResult.retryAfterSeconds ?? 1) * 1000, this.maxRetryWaitMs);
          try {
            await abortableSleep(waitMs, signal);
          } catch {
            return this.#finishCancelled(task);
          }
          continue; // resume the loop once the schedule is due
        }
        // No in-process waiting allowed: leave the task running and resumable.
        return task;
      }

      if (chainResult.status === 'failed') {
        task.markTerminal(TASK_STATUSES.FAILED, null, chainResult.error);
        this.eventBus.emit({ type: 'task.failed', taskId: task.taskId, error: chainResult.error });
        await this.#persist(task);
        return task;
      }

      const content = chainResult.content || '';
      task.recordProviderUsage({ provider: chainResult.provider, model: chainResult.model });
      task.currentStep += 1;
      this.eventBus.emit({
        type: 'model.responded',
        taskId: task.taskId,
        step: task.currentStep,
        provider: chainResult.provider
      });

      if (!content.trim()) {
        task.markTerminal(TASK_STATUSES.FAILED, null, 'The model returned an empty conversation response.');
        this.eventBus.emit({ type: 'task.failed', taskId: task.taskId, error: 'The model returned an empty conversation response.' });
        await this.#persist(task);
        return task;
      }

      messages.push({ role: 'assistant', content });
      return this.#finishCompleted(task, content);
    }

    return this.#finishCancelled(task);
  }

  async #finishCompleted(task, response) {
    task.markTerminal(TASK_STATUSES.COMPLETED, response, null);
    this.eventBus.emit({ type: 'task.completed', taskId: task.taskId, response });
    await this.#persist(task);
    this.cancellations.dispose(task.taskId);
    return task;
  }

  async #finishCancelled(task) {
    task.markTerminal(TASK_STATUSES.CANCELLED, null, this.cancellations.reason(task.taskId));
    this.eventBus.emit({ type: 'task.cancelled', taskId: task.taskId });
    await this.#persist(task);
    return task;
  }

  async #persist(task) {
    if (!this.store) return;
    try {
      await this.#persistUnsafe(task);
    } catch (err) {
      // Transient storage failure: keep the in-memory task alive and track
      // the failure honestly instead of pretending persistence succeeded.
      task.persistFailures = (task.persistFailures || 0) + 1;
      this.eventBus.emit({
        type: 'task.persist_failed',
        taskId: task.taskId,
        error: err?.message || 'storage failure'
      });
    }
  }

  async #persistUnsafe(task) {
    if (!this.store) return;
    const snapshot = {
      status: task.status,
      messages: task.messages,
      plan: task.plan,
      currentStep: task.currentStep,
      toolExecutions: task.toolExecutions,
      modifiedFiles: task.modifiedFiles,
      inspectedFiles: task.inspectedFiles,
      retryState: task.retryState,
      evidence: task.evidence,
      providerHistory: task.providerHistory,
      projectInfo: task.projectInfo,
      instructionsLoaded: task.instructionsLoaded,
      initialGitStatus: task.initialGitStatus,
      baselineHashes: task.baselineHashes,
      fileActivity: task.fileActivity,
      preservationEvidence: task.preservationEvidence,
      reviewResolutions: task.reviewResolutions,
      result: task.result,
      error: task.error,
      terminalAt: task.terminalAt,
      updatedAt: task.updatedAt
    };
    await this.store.updateTask(task.taskId, snapshot);
  }
}

function readPositiveEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
