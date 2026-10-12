// The unified CoreZ agent harness - DeepSeek Harness inspired (B).
//
// One harness powers the website (Cloudflare Worker, conversation mode) and
// provides the shared task layer: durable tasks, events, cancellation,
// resumption, leases and multi-user isolation. Repository-mode tasks are
// delegated to an injected repository runner (the Node AgentRuntime with its
// evidence-backed gate); the browser runtime has no such runner and honestly
// blocks repository tasks instead of pretending files were touched.
//
// Durable execution: startTask({ deferExecution: true }) only creates and
// persists the task; a durable scheduler (the Worker's Cloudflare Queue
// consumer, or any external runner) then calls executeTask(taskId). That
// entry point is idempotent — terminal tasks are never re-executed, an atomic
// lease with a heartbeat blocks duplicates, and every step persists progress —
// so at-least-once delivery and process eviction resume instead of
// duplicating or dropping work.
//
// B-upgrade: DSH-lite
// - Everything is a plugin via HarnessContext (ctx) + Cordis-style effects
// - SessionLog append-only log is source of truth for model-visible history (deriveMessages)
// - AgentLoop drives turn/step over SessionLog with waterfall agent/pre-step, agent/request, llm/stream
// - ToolRegistry pipeline: tools/pre-execute (waterfall) -> guard -> tools/execute -> tools/post-execute -> tools/result
// - Profiles/bundles composition (web/headless/agy) via ProfileRegistry + --patch overlays
// - Capability seams: llm (ProviderChain), tools, sessions, fs/shell/subagents via context

import { DEFAULT_TEXT_MODEL } from '../providers/modelIds.js';
import { EventBus } from './EventBus.js';
import { TASK_STATUSES } from './TaskState.js';
import { CancellationManager } from './CancellationManager.js';
import { SessionManager } from './SessionManager.js';
import { TaskManager } from './TaskManager.js';
import { abortableSleep } from './utils.js';
import { LeaseLostError } from '../persistence/TaskStore.js';
import { RetryScheduler } from '../providers/retryScheduler.js';
import { ProviderChain } from '../providers/providerChain.js';
import { CompactionEngine } from '../context/CompactionEngine.js';
import { SessionLog } from './SessionLog.js';
import { AgentLoop } from './AgentLoop.js';
import { HarnessContext } from './HarnessContext.js';
import { ProfileRegistry } from './ProfileRegistry.js';
import { verifyTaskCompletion } from './VerificationGate.js';
import { registerCoreCapabilities } from '../capabilities/index.js';
import { ToolRegistry } from '../tools/index.js';

// Retry delay reported when a runner cannot (or no longer can) hold the task
// lease. The caller — the queue consumer, primarily — redelivers after this.
const LEASE_RETRY_SECONDS = 30;

// Lease acquisition is retried briefly in-process so a transient lease-store
// failure does not force a full redelivery; a prolonged outage is still
// reported as retryable and handled by the durable caller.
const LEASE_ACQUIRE_ATTEMPTS = 8;
const LEASE_ACQUIRE_RETRY_CAP_MS = 200;

export class AgentHarness {
  constructor(options = {}) {
    this.eventBus = options.eventBus || new EventBus();
    this.cancellations = options.cancellationManager || new CancellationManager();
    const persistDir = options.persistDir || (options.persistSessions === false ? null : `${options.cwd || process.cwd()}/artifacts/sessions`);
    this.sessions = options.sessionManager || new SessionManager({ persistDir });
    this.store = options.taskStore || null;
    // taskId -> live lease state for runs this harness is currently executing.
    // Progress writes are fenced with the holder token so a runner that lost
    // its lease can never keep updating the task.
    this.activeTaskLeases = new Map();
    this.compactionEngine = options.compactionEngine || new CompactionEngine();
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

    // DSH-lite tool seam: shared bus so waterfalls are globally observable
    this.toolRegistry = options.toolRegistry || new ToolRegistry({ eventBus: this.eventBus });

    // HarnessContext (ctx) - the plugin surface (Cordis-inspired, lightweight)
    this.harnessContext = options.harnessContext || new HarnessContext({
      eventBus: this.eventBus,
      sessionManager: this.sessions,
      toolRegistry: this.toolRegistry,
      providerChain: this.providerChain
    });
    // DSH: everything is a plugin — mount core capability seams (fs/shell/subprocess/terminals/subagents/todo/skill/compaction/guard)
    try {
      registerCoreCapabilities(this.harnessContext, {
        cwd: options.cwd || process.cwd(),
        harness: this,
        compactionEngine: this.compactionEngine,
        terminalManager: this.toolRegistry?.terminalManager || null
      });
    } catch {}

    // Profile composition (web / headless / agy) - DSH layers
    this.profileRegistry = options.profileRegistry || new ProfileRegistry({ context: this.harnessContext, cwd: options.cwd || process.cwd() });
    const initialProfile = options.profile || 'web';
    try { this.profileRegistry.compose(initialProfile); } catch {}

    // Per-task SessionLogs (durable projection, in-memory for now)
    this.sessionLogs = new Map();

    // Feature flag: when true, conversation mode drives through AgentLoop (turn/step)
    // Keep default false for test parity; callers can enable via options.enableAgentLoop
    this.enableAgentLoop = options.enableAgentLoop === true || options.harnessMode === 'dsh';
    this.activeProfile = this.profileRegistry.activeProfile?.name || initialProfile;
    // Verification gate: agy must test before saying its done
    // When true, any task that touched files must have build/test/diff-check evidence
    // before it can be marked COMPLETED (checked via VerificationGate).
    this.enforceVerification = options.enforceVerification === true || options.requireVerification === true;
    // allow per-task override via task.contract?.requireVerification
    this.verificationOptions = options.verificationOptions || {};

    // Repository-mode delegation target (Node CLI AgentRuntime). Without it,
    // repository tasks are honestly blocked in the browser runtime.
    this.repositoryRunner = options.repositoryRunner || null;
    this.defaultModel = options.defaultModel || DEFAULT_TEXT_MODEL;
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
    // Also persist SessionLog durable events into the store's event stream
    // (so listEvents can replay composite history for reconnect).
    this._bindSessionLogPersistence();
    // Operator hang guard for in-process retry waits (0 disables waiting).
    this.maxRetryWaitMs = Number.isFinite(options.maxRetryWaitMs)
      ? options.maxRetryWaitMs
      : readPositiveEnv('COREZ_RETRY_WAIT_MS', 120_000);
    // Task lease TTL. A heartbeat renews the lease every TTL/3 while a run is
    // active, so the TTL only bounds how quickly a crashed runner's task can
    // be picked up again — never how long a healthy run may last.
    this.leaseTtlMs = Number.isFinite(options.leaseTtlMs)
      ? options.leaseTtlMs
      : readPositiveEnv('COREZ_TASK_LEASE_MS', 60_000);
  }

  #buildRetryScheduler(store) {
    if (!store) return null;
    return new RetryScheduler({
      load: async (taskId) => {
        const task = await store.getTask(taskId).catch(() => null);
        return task?.retryState ?? null;
      },
      // Retry-schedule writes are progress writes: while this harness holds a
      // lease they go through the fenced path, so a runner that lost the lease
      // cannot keep touching the task document.
      save: async (taskId, state) => {
        const leaseState = this.activeTaskLeases.get(String(taskId));
        if (leaseState) {
          if (leaseState.lost) {
            throw new LeaseLostError(taskId, leaseState.lost.message);
          }
          const updated = await store.updateTaskFenced(taskId, { retryState: state }, leaseState.holder);
          if (!updated) {
            const error = new LeaseLostError(taskId, 'Task lease is no longer held by this runner.');
            leaseState.markLost(error);
            throw error;
          }
          return;
        }
        await store.updateTask(taskId, { retryState: state });
      }
    });
  }

  _bindSessionLogPersistence() {
    // Whenever a SessionLog appends, mirror it to store best-effort via taskId mapping
    // (lazy: each log is created with a back-reference to the harness)
    // We monkey-patch append on creation site instead of polling.
  }

  _ensureSessionLog(task) {
    const key = String(task.taskId);
    if (this.sessionLogs.has(key)) return this.sessionLogs.get(key);
    const log = new SessionLog({
      sessionId: task.sessionId || key,
      header: {
        cwd: task.workspaceId || undefined,
        agentPreset: this.activeProfile,
        createdAt: Date.now()
      }
    });
    // wrap append to also persist into store events (best-effort)
    const originalAppend = log.append.bind(log);
    log.append = (type, data, opts) => {
      const ev = originalAppend(type, data, opts);
      if (this.store) {
        this.store.appendEvent(key, { type, data: ev.data, seq: ev.seq, time: ev.time, surfaceOp: ev.surfaceOp, sourceEventSeqs: ev.sourceEventSeqs, ignorable: ev.ignorable, taskId: key, sessionId: log.sessionId }).catch(() => {});
      }
      // also emit on eventBus for typed observers
      try { this.eventBus.emit({ type, taskId: key, sessionId: log.sessionId, seq: ev.seq, data: ev.data }); } catch {}
      return ev;
    };
    this.sessionLogs.set(key, log);
    return log;
  }

  getSessionLog(taskId) {
    return this.sessionLogs.get(String(taskId)) || null;
  }

  // Profile affordances (DSH: dsh --profile web --dump-config, --patch)
  dumpConfig() {
    return this.profileRegistry.dumpConfig();
  }

  composeProfile(profileName, opts = {}) {
    const rows = this.profileRegistry.compose(profileName, opts);
    this.activeProfile = this.profileRegistry.activeProfile?.name || profileName;
    return rows;
  }

  applyPatch(patch) {
    return this.profileRegistry.applyPatch(patch);
  }

  // HarnessContext plugin surface (everything is a plugin)
  get ctx() { return this.harnessContext; }

  // ---- Public API ----

  async startTask({ userId, sessionId, workspaceId, prompt, model, mode = 'repository', autoApprove, contract, deferExecution = false } = {}) {
    const task = await this.taskManager.createTask({ userId, sessionId, workspaceId, prompt, model, mode, contract });
    this._ensureSessionLog(task);
    // Inline execution is the default (CLI, tests). A durable runner (Worker
    // queue consumer) starts the task with deferExecution so the HTTP
    // invocation does not own the long-running work at all.
    if (!deferExecution) {
      this.#execute(task, { autoApprove }).catch((err) => this.#handleLoopError(task, err));
    }
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
    this._ensureSessionLog(task);
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
    // re-ensure log exists even after restart
    this._ensureSessionLog(task);
    // A durable runner re-dispatches the resumed task itself (executeTask);
    // it must not start a second computation inside this invocation.
    if (options.deferExecution === true) return task;
    return this.#execute(task, options);
  }

  // Durable, idempotent execution entry point for external runners (queue
  // consumers, schedulers, cron). Safe under at-least-once delivery:
  // - a terminal task is never re-executed,
  // - a live lease reports `lease-held` instead of running a duplicate,
  // - a crashed runner's expired lease lets the next delivery resume.
  // Progress is persisted between steps by the loop itself, so a retry
  // continues from the stored task document. Passing `options.task` (the
  // freshly created/resumed instance the caller already holds) skips the
  // initial read so a transient storage read failure cannot drop the work.
  async executeTask(taskId, options = {}) {
    let task = options.task && options.task.taskId === taskId ? options.task : null;
    if (!task) {
      try {
        task = await this.taskManager.getTask(taskId);
      } catch (err) {
        const message = err?.message || `Task not found: ${taskId}`;
        const missing = /not found/i.test(message);
        return {
          task: null,
          outcome: missing ? 'not-found' : 'load-failed',
          executed: false,
          error: message
        };
      }
    }
    if (task.status === TASK_STATUSES.CANCELLED) {
      return { task, outcome: 'cancelled', executed: false };
    }
    if (task.isTerminal) {
      return { task, outcome: 'terminal', executed: false };
    }

    const outcome = await this.#executeWithLease(task, options);
    const finished = outcome.task;
    if (outcome.cancelled && !outcome.leaseAcquired) {
      // Cancelled while waiting for the lease: nothing ran, nothing is owned.
      return {
        task: finished,
        outcome: 'cancelled',
        executed: false,
        leaseError: outcome.leaseError || null
      };
    }
    if (outcome.leaseUnavailable) {
      // Acquisition failed at the storage layer: ownership is unknown, so
      // nothing ran. Retryable — the caller redelivers once storage recovers.
      return {
        task: finished,
        outcome: 'lease-unavailable',
        executed: false,
        leaseError: outcome.leaseError || null,
        retryAfterSeconds: LEASE_RETRY_SECONDS
      };
    }
    if (outcome.leaseLost) {
      // This runner stopped because it no longer owns the task. The task
      // itself is not failed or cancelled: redeliver for the current owner.
      return {
        task: finished,
        outcome: 'lease-lost',
        executed: false,
        leaseError: outcome.leaseError || null,
        retryAfterSeconds: LEASE_RETRY_SECONDS
      };
    }
    if (!outcome.leaseAcquired) {
      // Another live lease holds the task: do not run, do not touch state.
      return {
        task: finished,
        outcome: 'lease-held',
        executed: false,
        leaseError: outcome.leaseError || 'Task is already executing elsewhere.',
        retryAfterSeconds: secondsUntil(outcome.leaseExpiresAt)
      };
    }
    if (finished.status === TASK_STATUSES.CANCELLED) {
      return { task: finished, outcome: 'cancelled', executed: true };
    }
    if (finished.isTerminal) {
      return { task: finished, outcome: 'terminal', executed: true };
    }
    // The provider asked for a later retry and this runtime does not sleep
    // in-process: report the schedule so the caller can retry durably.
    const retryAfterSeconds = Number(finished.retryState?.retryAfterSeconds);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return { task: finished, outcome: 'retry-scheduled', executed: true, retryAfterSeconds };
    }
    return { task: finished, outcome: 'running', executed: true };
  }

  async cancelTask(taskId, userId = null) {
    // also cancel any live loop bound to this task
    const log = this.sessionLogs.get(String(taskId));
    if (log && log._loop) {
      try { log._loop.cancel({ kind: 'user' }); } catch {}
    }
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
    if (err?.code === 'TASK_LEASE_LOST') {
      // The task belongs to another runner now; writing a terminal failure
      // here would corrupt state this process no longer owns.
      this.cancellations.dispose(task.taskId);
      return;
    }
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
    const outcome = await this.#executeWithLease(task, options);
    return outcome.task;
  }

  async #executeWithLease(task, options = {}) {
    const signal = options.signal || this.cancellations.create(task.taskId).signal;
    if (options.signal) {
      options.signal.addEventListener('abort', () => this.cancellations.abort(task.taskId), { once: true });
    }

    // Task lease: prevents duplicate execution (a resume racing a live loop,
    // or a durable runner redelivering a message). Acquisition is mandatory
    // whenever a store is present: a thrown or unconfirmed acquire leaves
    // ownership unknown, and unknown ownership is never permission to run.
    // The lease is released on every terminal path, renewed by a heartbeat
    // while the run is active, and expires automatically if the process dies
    // mid-run so the next delivery can resume.
    const leaseHolder = `run-${task.taskId}-${Math.random().toString(36).slice(2, 10)}`;
    const leaseTtlMs = Number.isFinite(options.leaseTtlMs) && options.leaseTtlMs > 0
      ? options.leaseTtlMs
      : this.leaseTtlMs;
    let lease = null;
    if (this.store) {
      // Acquisition retries transient storage failures in-process. It never
      // falls back to running unleased, and an abort during the wait stops
      // immediately instead of waiting out the remaining attempts.
      let acquired = null;
      let acquireError = null;
      for (let attempt = 0; attempt < LEASE_ACQUIRE_ATTEMPTS; attempt += 1) {
        if (attempt > 0) {
          const delayMs = Math.min(LEASE_ACQUIRE_RETRY_CAP_MS, 25 * 2 ** (attempt - 1));
          try {
            await abortableSleep(delayMs, signal);
          } catch {
            return {
              task,
              leaseAcquired: false,
              cancelled: true,
              leaseError: 'Task cancelled while acquiring the lease.',
              leaseExpiresAt: null
            };
          }
        }
        try {
          acquired = await this.store.acquireLease(task.taskId, leaseHolder, leaseTtlMs);
          acquireError = null;
          break;
        } catch (err) {
          acquired = null;
          acquireError = err;
        }
      }
      if (acquireError) {
        const message = acquireError.message || 'lease backend unavailable';
        this.eventBus.emit({ type: 'task.lease_unavailable', taskId: task.taskId, error: message });
        return {
          task,
          leaseAcquired: false,
          leaseUnavailable: true,
          leaseError: `Task lease could not be acquired: ${message}`,
          leaseExpiresAt: null
        };
      }
      if (!acquired || acquired.acquired !== true) {
        // Explicit rejection: another live lease holds the task. Do not run.
        const reason = acquired?.error || 'Lease acquisition did not confirm ownership.';
        this.eventBus.emit({ type: 'task.blocked', taskId: task.taskId, reason });
        return {
          task,
          leaseAcquired: false,
          leaseError: reason,
          leaseExpiresAt: acquired?.expiresAt ?? null
        };
      }
      lease = acquired;
    }

    const leaseState = { holder: leaseHolder, lost: null, markLost: null };
    leaseState.markLost = (error) => {
      if (leaseState.lost) return;
      leaseState.lost = error instanceof Error ? error : new Error(String(error));
      this.eventBus.emit({ type: 'task.lease_lost', taskId: task.taskId, error: leaseState.lost.message });
      // Promptly stop in-flight work; the loop and the fenced writes also check.
      this.cancellations.abort(task.taskId, `Task lease lost: ${leaseState.lost.message}`);
    };

    // Renewal is not best-effort: a renewal that throws or is rejected means
    // this runner no longer owns the task, so the run must stop. Nothing from
    // this point may write task state (writes are fenced with the holder).
    const renewLease = async () => {
      if (!this.store) return true;
      if (leaseState.lost) return false;
      let renewed;
      try {
        renewed = await this.store.renewLease(task.taskId, leaseHolder, leaseTtlMs);
      } catch (err) {
        leaseState.markLost(err instanceof Error ? err : new Error(String(err)));
        return false;
      }
      if (renewed !== true) {
        leaseState.markLost(new Error('Lease renewal was rejected; another runner may own the task.'));
        return false;
      }
      return true;
    };

    // Lease heartbeat: a single provider call can outlive the base TTL, so
    // ownership is refreshed on a timer for as long as this run is active.
    // Without it a slow call would let the lease expire mid-run and admit a
    // duplicate execution (the exact "interrupted or duplicated work" bug).
    let heartbeat = null;
    if (this.store) {
      const intervalMs = Math.max(5_000, Math.floor(leaseTtlMs / 3));
      heartbeat = setInterval(() => { renewLease().catch(() => {}); }, intervalMs);
      if (typeof heartbeat?.unref === 'function') heartbeat.unref();
    }

    this.activeTaskLeases.set(String(task.taskId), leaseState);
    try {
      const finished = await this.#executeCore(task, { ...options, signal, renewLease, lease: leaseState });
      return {
        task: finished,
        leaseAcquired: true,
        leaseLost: Boolean(leaseState.lost),
        leaseError: leaseState.lost?.message ?? null,
        leaseExpiresAt: leaseState.lost ? null : lease?.expiresAt ?? null
      };
    } catch (err) {
      if (err?.code === 'TASK_LEASE_LOST' || leaseState.lost) {
        return {
          task,
          leaseAcquired: true,
          leaseLost: true,
          leaseError: (leaseState.lost || err).message,
          leaseExpiresAt: null
        };
      }
      throw err;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      this.activeTaskLeases.delete(String(task.taskId));
      if (leaseState.lost) {
        // The lease is no longer ours to release; drop the aborted controller
        // too, so a later resume in this isolate starts with a clean signal.
        this.cancellations.dispose(task.taskId);
      } else if (this.store) {
        try {
          await this.store.releaseLease(task.taskId, leaseHolder);
        } catch {
          // best-effort
        }
      }
    }
  }

  async #executeCore(task, options = {}) {
    const mode = task.mode || 'repository';
    if (mode === 'repository') {
      return this.#executeRepository(task, options);
    }
    if (this.enableAgentLoop) {
      return this.#executeAgentLoop(task, options);
    }
    return this.#executeConversation(task, options);
  }

  // Repository mode: delegated to the injected repository runner (the Node
  // AgentRuntime with its evidence-backed completion gate). The browser
  // runtime has no runner, so repository tasks are honestly blocked there.
  async #executeRepository(task, options = {}) {
    const { signal, lease } = options;
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
        workspaceId: task.workspaceId,
        signal,
        autoApprove: options.autoApprove === true
      });
      if (signal.aborted) {
        if (lease?.lost) return this.#stopForLostLease(task);
        return this.#finishCancelled(task);
      }
      if (result?.success === true || result?.status === 'completed') {
        const response = result?.response || result?.result || 'Task completed.';
        // Mirror any file activity the runner reports into task state so
        // verification can inspect it (runner may have touched files via tools)
        if (Array.isArray(result.modifiedFiles)) task.modifiedFiles = result.modifiedFiles;
        if (Array.isArray(result.toolExecutions)) task.toolExecutions = result.toolExecutions;
        // agy must test before saying done — gate here too
        const needsVerify = this.enforceVerification || task.contract?.requireVerification === true;
        if (needsVerify) {
          const verdict = verifyTaskCompletion(task, this.verificationOptions);
          if (!verdict.ok) {
            const msg = `Verification failed: agy must test before saying its done. Missing: ${verdict.missing.join('; ')}`;
            task.markTerminal(TASK_STATUSES.FAILED, null, msg);
            this.eventBus.emit({ type: 'task.failed', taskId: task.taskId, error: msg, missing: verdict.missing });
            await this.#persist(task);
            return task;
          }
          this.eventBus.emit({ type: 'task.verified', taskId: task.taskId, evidence: verdict.evidence });
        }
        task.markTerminal(TASK_STATUSES.COMPLETED, response, null);
        this.eventBus.emit({ type: 'task.completed', taskId: task.taskId, response });
        await this.#persist(task);
        return task;
      }
      if (result?.status === 'cancelled' || result?.cancelled === true) {
        if (lease?.lost) return this.#stopForLostLease(task);
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
      if (lease?.lost) return this.#stopForLostLease(task);
      task.markTerminal(TASK_STATUSES.FAILED, null, err?.message || 'Repository runner failed.');
      this.eventBus.emit({ type: 'task.failed', taskId: task.taskId, error: err?.message || 'Repository runner failed.' });
      await this.#persist(task);
      return task;
    }
  }

  // Agentic turn/step loop (DSH-lite) - single task, multi-step, tool-aware
  async #executeAgentLoop(task, options = {}) {
    const { signal, lease } = options;
    const log = this._ensureSessionLog(task);
    const llmService = this.harnessContext?.llm || null;
    const loop = new AgentLoop({
      sessionLog: log,
      eventBus: this.eventBus,
      providerChain: this.providerChain,
      llmService,
      toolRegistry: this.toolRegistry,
      sessionId: task.taskId,
      model: task.model,
      provider: options.provider || null,
      systemPromptProvider: {
        assemble: async ({ signal: _sig }) => ({
          system: `You are COREZ AI, an AI assistant. Answer directly; use tools when needed.`,
          tools: this.toolRegistry.getToolSchemas()
        })
      }
    });
    // keep loop handle for cancellation
    log._loop = loop;
    if (signal) signal.addEventListener('abort', () => loop.cancel({ kind: 'user' }), { once: true });

    // seed inbox with initial prompt as durable user message (model-visible => logged)
    loop.send({ role: 'user', content: task.prompt }, 'next-turn', true);

    // mirror loop lifecycle events to task status
    const _onComplete = new Promise((_resolve) => {
      let _settled = false;
      const _onStatus = (ev) => {
        if (ev.taskId !== task.taskId) return;
      };
      void _settled; void _onStatus;
      // waitIdle will resolve after turn flow completes
    });
    void _onComplete;

    try {
      await loop.whenIdle();
      // Derive final assistant text from log (model-visible surface)
      const msgs = log.deriveMessages();
      const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
      const finalContent = lastAssistant ? (typeof lastAssistant.content === 'string' ? lastAssistant.content : JSON.stringify(lastAssistant.content)) : '';
      task.messages = msgs;
      task.currentStep = log.events.filter((e) => e.type === 'step/end').length;
      if (signal?.aborted) {
        if (lease?.lost) return this.#stopForLostLease(task);
        return this.#finishCancelled(task);
      }
      if (!finalContent || !finalContent.trim()) {
        task.markTerminal(TASK_STATUSES.FAILED, null, 'The model returned an empty conversation response.');
        this.eventBus.emit({ type: 'task.failed', taskId: task.taskId, error: 'The model returned an empty conversation response.' });
        await this.#persist(task);
        return task;
      }
      return this.#finishCompleted(task, finalContent);
    } catch (err) {
      if (lease?.lost) return this.#stopForLostLease(task);
      if (signal?.aborted) return this.#finishCancelled(task);
      task.markTerminal(TASK_STATUSES.FAILED, null, err?.message || 'Agent loop failed.');
      this.eventBus.emit({ type: 'task.failed', taskId: task.taskId, error: err?.message || 'Agent loop failed.' });
      await this.#persist(task);
      return task;
    } finally {
      delete log._loop;
    }
  }

  // Conversation mode: a model <-> retry exchange with no completion gate and
  // no repository tools. Stops only on completion, cancellation, a permanent
  // provider failure across every configured provider, or an empty response.
  async #executeConversation(task, options = {}) {
    const { signal, renewLease, lease } = options;
    const log = this._ensureSessionLog(task);
    // Also mirror into log for deriveMessages parity (even when using legacy path)
    try { log.append('turn/start', { turn: 1 }); } catch {}
    const messages = task.messages.length > 0
      ? task.messages
      : [
          { role: 'system', content: 'You are COREZ AI, an AI assistant. Answer the user\'s request directly with text only.' },
          { role: 'user', content: task.prompt }
        ];
    task.messages = messages;
    // log user message as surface (so deriveMessages includes it)
    try { log.append('user/message', { role: 'user', content: task.prompt }, { surfaceOp: 'append' }); } catch {}
    await this.#persist(task);

    while (!signal.aborted) {
      if (typeof renewLease === 'function') {
        // A failed renewal ends the run: this runner no longer owns the task.
        const renewed = await renewLease();
        if (!renewed) return this.#stopForLostLease(task);
      }

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

      // Proactive context compaction under token pressure
      if (this.compactionEngine && messages.length > 4) {
        try {
          const compactRes = await this.compactionEngine.compact(messages);
          if (compactRes.compacted) {
            messages.length = 0;
            messages.push(...compactRes.messages);
            task.messages = messages;
            this.eventBus.emit({
              type: 'context.compacted',
              taskId: task.taskId,
              savedTokens: compactRes.savedTokens
            });
            try { log.append('context/compacted', { savedTokens: compactRes.savedTokens }); } catch {}
          }
        } catch {
          // Compaction is best-effort; keep running with existing messages
        }
      }

      this.eventBus.emit({ type: 'model.requested', taskId: task.taskId, step: task.currentStep + 1 });
      try { log.append('step/start', { turn: 1, step: task.currentStep + 1 }); } catch {}

      const chainResult = await this.providerChain.generate({
        taskId: task.taskId,
        model: task.model,
        messages,
        tools: [],
        signal,
        persistRetries: true
      });

      // Lease loss takes precedence over cancellation: the run must stop
      // without marking the task cancelled (or anything else).
      if (lease?.lost) return this.#stopForLostLease(task);
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
            if (lease?.lost) return this.#stopForLostLease(task);
            return this.#finishCancelled(task);
          }
          continue; // resume the loop once the schedule is due
        }
        // No in-process waiting allowed: leave the task running and resumable.
        return task;
      }

      if (chainResult.status === 'failed') {
        if (lease?.lost) return this.#stopForLostLease(task);
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
      try { log.append('assistant/chunk', { turn: 1, step: task.currentStep, chunk: { type: 'text', text: content } }); } catch {}
      try { log.append('assistant/message', { turn: 1, step: task.currentStep, message: { role: 'assistant', content } }, { surfaceOp: 'append', sourceEventSeqs: [] }); } catch {}
      try { log.append('step/end', { turn: 1, step: task.currentStep }); } catch {}
      try { log.append('turn/end', { turn: 1, reason: { kind: 'completed' } }); } catch {}

      if (!content.trim()) {
        task.markTerminal(TASK_STATUSES.FAILED, null, 'The model returned an empty conversation response.');
        this.eventBus.emit({ type: 'task.failed', taskId: task.taskId, error: 'The model returned an empty conversation response.' });
        await this.#persist(task);
        return task;
      }

      messages.push({ role: 'assistant', content });
      return this.#finishCompleted(task, content);
    }

    if (lease?.lost) return this.#stopForLostLease(task);
    return this.#finishCancelled(task);
  }

  // Lease loss ends this run without a terminal transition: the task is not
  // failed and not cancelled — it belongs to whoever holds the lease now, or
  // to the next delivery after expiry. Nothing is written here.
  #stopForLostLease(task) {
    return task;
  }

  async #finishCompleted(task, response) {
    // Verification gate: agy must test before saying its done
    // Only enforced when the harness was created with enforceVerification
    // or the task contract opts in. Analysis-only tasks (no file touches) pass
    // without checks; any workspace modification requires build/test/diff evidence.
    const needsVerify = this.enforceVerification || task.contract?.requireVerification === true;
    if (needsVerify) {
      const verdict = verifyTaskCompletion(task, this.verificationOptions);
      if (!verdict.ok) {
        const msg = `Verification failed: agy must test before saying its done. Missing: ${verdict.missing.join('; ')}. Evidence: ${verdict.evidence.join(', ') || 'none'}. Re-run the required checks (run_build, run_tests, git diff --check) and retry.`;
        task.markTerminal(TASK_STATUSES.FAILED, null, msg);
        this.eventBus.emit({ type: 'task.failed', taskId: task.taskId, error: msg, missing: verdict.missing });
        await this.#persist(task);
        this.cancellations.dispose(task.taskId);
        return task;
      }
      this.eventBus.emit({ type: 'task.verified', taskId: task.taskId, evidence: verdict.evidence });
    }
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
      // Losing the lease is not a storage blip: stop the run and never retry
      // the write against a task this runner no longer owns.
      if (err?.code === 'TASK_LEASE_LOST') throw err;
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
    const log = this.sessionLogs.get(String(task.taskId));
    const sessionLogSnapshot = log ? log.toJSON() : null;
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
      updatedAt: task.updatedAt,
      sessionLog: sessionLogSnapshot
    };
    // Progress writes are fenced: while this harness holds a lease, only the
    // current holder may update the task document. A stale owner's write is
    // rejected and treated as lease loss, ending the run.
    const leaseState = this.activeTaskLeases.get(String(task.taskId));
    if (leaseState) {
      if (leaseState.lost) {
        throw new LeaseLostError(task.taskId, leaseState.lost.message);
      }
      const updated = await this.store.updateTaskFenced(task.taskId, snapshot, leaseState.holder);
      if (!updated) {
        const error = new LeaseLostError(task.taskId, 'Task lease is no longer held by this runner.');
        leaseState.markLost(error);
        throw error;
      }
      return;
    }
    await this.store.updateTask(task.taskId, snapshot);
  }
}

function readPositiveEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function secondsUntil(timestampMs) {
  const parsed = Number(timestampMs);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.ceil((parsed - Date.now()) / 1000));
}
