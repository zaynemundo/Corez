// Durable task execution for the website Worker.
//
// The HTTP handlers only create, resume, cancel and observe tasks. Execution
// is owned by a durable mechanism:
//
//   1. Cloudflare Queue (`TASKS_QUEUE`): POST /api/tasks (and /resume) enqueue
//      a `{ taskId }` message and return immediately. A Queue consumer
//      invocation calls `harness.executeTask(taskId)`, which is idempotent:
//      terminal tasks are skipped, an atomic D1 lease blocks duplicates, and
//      the loop persists progress between steps. If the consumer invocation
//      is evicted mid-task, the message is redelivered and the stored task
//      document resumes the run — browser disconnection is never cancellation.
//
//   2. Durable dispatch outbox (queue binding present, send failing): the
//      dispatch record is persisted to D1 BEFORE the send. If the send throws,
//      the record stays `pending` and a sweeper (scheduled handler + queue
//      batch) re-sends it later. The client still gets an accepted response,
//      but it is backed by the outbox record — never by the current
//      invocation owning the work.
//
//   3. Inline execution is an EXPLICIT development fallback, enabled with
//      `TASK_INLINE_FALLBACK=true` and never a silent default: the execution
//      promise attaches to `ctx.waitUntil`, which only extends an invocation
//      ~30s past the response. In production a missing queue binding or a
//      failed send with no durable record is a retryable error, not a
//      downgrade.
//
// Cancellation stays explicit: POST /api/tasks/:id/cancel marks the stored
// task cancelled, and the consumer acks (never redelivers) cancelled work.

import { AgentHarness } from "../packages/agent-core/harness/AgentHarness.js";
import { DEFAULT_TEXT_MODEL } from "../packages/agent-core/providers/modelIds.js";
import { CancellationManager } from "../packages/agent-core/harness/CancellationManager.js";
import {
  TASK_STATUSES,
  TERMINAL_TASK_STATUSES,
  DISPATCHABLE_TASK_STATUSES,
} from "../packages/agent-core/harness/TaskState.js";
import { D1TaskStore } from "../packages/agent-core/persistence/D1TaskStore.js";
import { R2TaskStore } from "../packages/agent-core/persistence/R2TaskStore.js";
import { OpenCodeGoAdapter } from "../packages/agent-core/providers/adapters.js";
import { estimateTokens, recordUsageOnce } from "./usage.js";

// One shared cancellation registry per Worker isolate: a cancel request in
// one fetch aborts the signal the running task loop listens to in another.
// Cross-isolate cancellation is honored by the loop's store-level check.
const sharedCancellations = new CancellationManager();

const DEFAULT_MAX_ATTEMPTS = 10;
const FALLBACK_RETRY_DELAY_SECONDS = 30;
const MAX_RETRY_DELAY_SECONDS = 3600;

// One harness per request/invocation. The task store is the coordinator:
// D1 (atomic leases + ordered events) whenever the binding exists, with R2
// kept as the artifact bucket and as an honest fallback for deployments
// without D1 (tests, local dev without the binding).
export function taskStoreFor(env) {
  return env?.DB
    ? new D1TaskStore({ db: env.DB, bucket: env?.ASSET_BUCKET })
    : new R2TaskStore({ bucket: env?.ASSET_BUCKET });
}

export function buildHarness(env) {
  const store = taskStoreFor(env);
  const adapters = [
    new OpenCodeGoAdapter({
      opencodeApiKey: env?.OPENCODE_GO_API_KEY || env?.OPENCODE_API_KEY,
      endpoint: env?.OPENCODE_ENDPOINT,
      model: env?.OPENCODE_MODEL,
    }),
  ];
  return new AgentHarness({
    taskStore: store,
    adapters,
    defaultModel: DEFAULT_TEXT_MODEL,
    persistEvents: true,
    cancellationManager: sharedCancellations,
    maxRetryWaitMs: 0, // no in-process retry waits in the Worker; resume via the queue
  });
}

export function taskQueueAvailable(env) {
  return Boolean(env?.TASKS_QUEUE && typeof env.TASKS_QUEUE.send === "function");
}

// Inline execution is never an implicit downgrade: it must be turned on with
// `TASK_INLINE_FALLBACK=true` (local dev / contract tests). In production the
// durable queue or the D1 dispatch outbox carries the work.
export function taskInlineFallbackEnabled(env) {
  return String(env?.TASK_INLINE_FALLBACK || "").toLowerCase() === "true";
}

// Default backoff before the sweeper retries a deferred dispatch.
const DEFAULT_DISPATCH_RETRY_DELAY_SECONDS = 30;

function dispatchRetryDelaySeconds(env) {
  const configured = Number(env?.TASK_DISPATCH_RETRY_DELAY_SECONDS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_DISPATCH_RETRY_DELAY_SECONDS;
  }
  return Math.min(Math.max(1, Math.ceil(configured)), MAX_RETRY_DELAY_SECONDS);
}

function hardDispatchFailure(message, cause) {
  const error = new Error(message);
  error.code = "dispatch-unavailable";
  error.cause = cause;
  return error;
}

// Best-effort event append: the durable task document is the source of
// truth, the event log only makes the dispatch story visible on the SSE
// stream. `attempts`/`error` is metadata, never success.
async function appendDispatchEvent(store, taskId, event) {
  try {
    await store.appendEvent(taskId, { ...event, taskId });
  } catch {
    // Event persistence is best-effort; the outbox row and the stored task
    // still carry the dispatch state.
  }
}

// Inline execution (explicit fallback only): run in this invocation and keep
// it alive past the response via waitUntil. A task that reached a terminal
// state is a no-op, so a stray redelivery cannot duplicate work.
function executeInline(env, ctx, harness, taskId, task) {
  const execution = harness
    .executeTask(taskId, task ? { task } : {})
    .catch(() => {});
  if (typeof ctx?.waitUntil === "function") {
    ctx.waitUntil(execution);
  }
  return { dispatched: "inline", execution };
}

// Hand a task to the durable runner. Order of truth:
//
//   1. Queue send succeeds → dispatched by the queue.
//   2. Send fails but a durable D1 outbox record exists → the accepted task is
//      backed by a recoverable dispatch record the sweeper will retry. The
//      response says `deferred` instead of pretending the queue accepted it.
//   3. Nothing durable was recorded → a retryable error is thrown; the API
//      layer answers 503 and never claims durable acceptance.
//
// The record is written BEFORE the send so an eviction between here and the
// broker loses nothing. A duplicate send is safe: executeTask is idempotent
// (terminal skip + atomic lease), and the outbox record is only deleted after
// a successful send.
export async function dispatchTaskExecution(env, ctx, harness, taskId, options = {}) {
  const store = harness?.store || null;
  const outbox = store && typeof store.recordDispatch === "function" ? store : null;
  const inlineAllowed = taskInlineFallbackEnabled(env);

  if (taskQueueAvailable(env)) {
    let recordError = null;
    if (outbox?.available) {
      try {
        await store.recordDispatch(taskId);
      } catch (err) {
        recordError = err;
      }
    }
    try {
      await env.TASKS_QUEUE.send({ taskId });
      if (outbox?.available) {
        try {
          await store.deleteDispatch(taskId);
        } catch {
          // The sweeper will find the task already running/terminal and clear
          // the record; a failed cleanup cannot duplicate execution.
        }
      }
      return { dispatched: "queue" };
    } catch (sendError) {
      // The binding exists but the send failed. An explicit inline opt-in
      // takes the work now (and clears the pre-send record so the sweeper
      // cannot re-dispatch it); otherwise only a persisted outbox record
      // makes the acceptance durable.
      if (inlineAllowed) {
        console.warn(
          `task dispatch failed for ${taskId}: queue send failed (${safeMessage(sendError)}); running inline by explicit TASK_INLINE_FALLBACK.`,
        );
        if (outbox?.available && !recordError) {
          try {
            await store.deleteDispatch(taskId);
          } catch {
            // The sweeper finds the task mid-run and clears the record.
          }
        }
        return executeInline(env, ctx, harness, taskId, options.task);
      }
      if (outbox?.available && !recordError) {
        const retryAfterSeconds = dispatchRetryDelaySeconds(env);
        console.warn(
          `task dispatch deferred for ${taskId}: queue send failed (${safeMessage(sendError)})`,
        );
        await appendDispatchEvent(outbox, taskId, {
          type: "task.dispatch_deferred",
          retryAfterSeconds,
          error: safeMessage(sendError),
        });
        return { dispatched: "deferred", retryAfterSeconds };
      }
      const message =
        "Task queue is unavailable and no durable dispatch record could be written.";
      console.error(`task dispatch failed for ${taskId}: ${message}`);
      throw hardDispatchFailure(message, sendError || recordError);
    }
  }

  // No queue binding: inline execution is only allowed when it is explicit.
  const reason =
    "Task queue binding (TASKS_QUEUE) is not configured; durable dispatch is unavailable.";
  if (inlineAllowed) {
    console.warn(`${reason} Running inline by explicit TASK_INLINE_FALLBACK.`);
    return executeInline(env, ctx, harness, taskId, options.task);
  }
  console.error(reason);
  throw hardDispatchFailure(
    `${reason} Set TASK_INLINE_FALLBACK=true for local development or bind the queue.`,
  );
}

// Recover deferred dispatches: re-send every due outbox record through the
// queue. Called from the scheduled handler (cron) and at the start of a queue
// batch, so a queue outage heals as soon as either path runs.
export async function sweepPendingTaskDispatches(env, harness, options = {}) {
  if (typeof env?.TASKS_QUEUE?.send !== "function") {
    // A deferred record without a queue binding has no delivery path. The
    // dispatch path already rejects that configuration loudly; nothing to do.
    return { swept: 0, sent: 0, skipped: 0, failed: 0 };
  }
  const store = harness?.store || taskStoreFor(env);
  if (!store || typeof store.listPendingDispatches !== "function" || !store.available) {
    return { swept: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : 10;
  let pending;
  try {
    pending = await store.listPendingDispatches({ limit });
  } catch {
    return { swept: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const result = { swept: pending.length, sent: 0, skipped: 0, failed: 0 };
  for (const record of pending) {
    // Terminal work is done; a removed task is dead weight. Never re-send
    // either — the record is cleared instead.
    let task;
    try {
      task = await store.getTask(record.taskId);
    } catch {
      result.failed += 1;
      continue; // transient read failure: keep the record for the next sweep
    }
    if (!task || !DISPATCHABLE_TASK_STATUSES.has(task.status)) {
      try {
        await store.deleteDispatch(record.taskId);
      } catch {
        // retried next sweep
      }
      result.skipped += 1;
      continue;
    }
    // A task waiting for a retry is dispatchable by design; `executeTask` is
    // idempotent and the atomic lease blocks a duplicate if it is mid-run.

    let claimed;
    try {
      claimed = await store.claimDispatch(record.taskId);
    } catch {
      result.failed += 1;
      continue;
    }
    if (!claimed) {
      result.skipped += 1; // another sweeper owns it, or the record is gone
      continue;
    }

    try {
      await env.TASKS_QUEUE.send({ taskId: record.taskId });
    } catch (err) {
      console.warn(
        `dispatch sweep retry failed for ${record.taskId}: ${safeMessage(err)}`,
      );
      try {
        await store.resetDispatch(record.taskId, {
          attempt: record.attempts + 1,
          delaySeconds: dispatchRetryDelaySeconds(env),
        });
      } catch {
        // the claim expires and the next sweep retries
      }
      result.failed += 1;
      continue;
    }

    try {
      await store.deleteDispatch(record.taskId);
    } catch {
      // The record stays claimed; the task runs now and the sweep cleans up
      // after the claim expires.
    }
    await appendDispatchEvent(store, record.taskId, {
      type: "task.dispatched",
      attempts: record.attempts + 1,
    });
    result.sent += 1;
  }
  return result;
}

function safeMessage(error) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error?.message === "string"
        ? error.message
        : String(error);
  return raw.slice(0, 300);
}

export function taskQueueMaxAttempts(env) {
  const configured = Number(env?.TASKS_QUEUE_MAX_ATTEMPTS);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_MAX_ATTEMPTS;
}

function retryDelaySeconds(seconds) {
  const parsed = Number(seconds);
  if (!Number.isFinite(parsed) || parsed <= 0) return FALLBACK_RETRY_DELAY_SECONDS;
  return Math.min(Math.max(1, Math.ceil(parsed)), MAX_RETRY_DELAY_SECONDS);
}

// Bounded retries must end honestly: when the delivery budget is spent the
// stored task is failed instead of silently dropping the message and leaving
// the task "running" forever. A staged completion is the exception — the
// provider already produced the answer and storing it is strictly better than
// reporting a failure for work that succeeded.
async function failExhaustedTask(store, taskId, reason) {
  if (!store) return;
  try {
    const task = await store.getTask(taskId);
    if (!task || TERMINAL_TASK_STATUSES.has(task.status)) return;
    const staged = task.pendingCompletion;
    if (staged && typeof staged.result === 'string') {
      await store.updateTask(taskId, {
        status: TASK_STATUSES.COMPLETED,
        result: staged.result,
        error: null,
        pendingCompletion: null,
        terminalAt: new Date().toISOString(),
      });
      await store.appendEvent(taskId, {
        type: 'task.completed',
        taskId,
        response: staged.result,
        resumedFromStage: true,
      });
      return;
    }
    const message = `Task retries exhausted: ${reason}`;
    await store.updateTask(taskId, {
      status: TASK_STATUSES.FAILED,
      error: message,
      terminalAt: new Date().toISOString(),
    });
    await store.appendEvent(taskId, {
      type: "task.failed",
      taskId,
      error: message,
    });
  } catch {
    // Best effort: the message is acked regardless so it cannot loop forever.
  }
}

// Reconcile the task's actual output into the token counter, once. Creation
// charged the prompt estimate; this adds the output estimate after the fact.
// The receipt key makes a redelivery that lands after the settlement (crash
// between settle and ack) a no-op instead of a double charge. An unavailable
// accounting store leaves it unsettled so the caller can redeliver and retry.
async function settleTaskUsage(env, task) {
  if (!task || typeof task !== "object" || !task.taskId) {
    return { settled: true, skipped: true };
  }
  const outputTokens = estimateTokens(typeof task.result === "string" ? task.result : "");
  if (outputTokens <= 0) return { settled: true, skipped: true };
  try {
    const result = await recordUsageOnce(env, task.userId, {
      key: `task:${task.taskId}`,
      increments: { tokens: outputTokens },
    });
    return { settled: true, recorded: Boolean(result.recorded) };
  } catch (err) {
    return { settled: false, error: safeMessage(err) || "usage settlement failed" };
  }
}

// Process one Queue message. Exported separately from the batch handler so
// contract tests can drive the consumer in Node without the Queue runtime.
export async function handleTaskQueueMessage(message, env) {
  const taskId = typeof message?.body?.taskId === "string" ? message.body.taskId : null;
  if (!taskId) {
    message.ack();
    return { action: "invalid" };
  }

  const attempts = Number(message?.attempts) || 1;
  const maxAttempts = taskQueueMaxAttempts(env);
  const harness = buildHarness(env);

  let outcome;
  try {
    outcome = await harness.executeTask(taskId);
  } catch (err) {
    const reason = err?.message || "Task runner failed.";
    if (attempts >= maxAttempts) {
      await failExhaustedTask(harness.store, taskId, reason);
      message.ack();
      return { action: "failed", taskId, outcome: "runner-error" };
    }
    message.retry({ delaySeconds: FALLBACK_RETRY_DELAY_SECONDS });
    return { action: "retry", taskId, outcome: "runner-error" };
  }

  // Terminal, cancelled and missing tasks are complete work for the queue.
  // `load-failed` (a transient storage read failure) deliberately falls
  // through to redelivery instead of being acked away.
  if (
    outcome.outcome === "terminal" ||
    outcome.outcome === "cancelled" ||
    outcome.outcome === "not-found"
  ) {
    if (outcome.outcome !== "not-found") {
      // Reconcile the token count before acking; a failed settlement is
      // redelivered and retried idempotently (receipt key = task id).
      const settlement = await settleTaskUsage(env, outcome.task);
      if (!settlement.settled) {
        if (attempts >= maxAttempts) {
          message.ack();
          return { action: "ack", taskId, outcome: outcome.outcome, reason: "usage-settlement" };
        }
        message.retry({ delaySeconds: FALLBACK_RETRY_DELAY_SECONDS });
        return { action: "retry", taskId, outcome: outcome.outcome, reason: "usage-settlement" };
      }
    }
    message.ack();
    return { action: "ack", taskId, outcome: outcome.outcome };
  }

  if (attempts >= maxAttempts) {
    const reason =
      outcome.task?.retryState?.error ||
      outcome.leaseError ||
      `The AI providers did not recover after ${attempts} attempts.`;
    await failExhaustedTask(harness.store, taskId, reason);
    message.ack();
    return { action: "failed", taskId, outcome: outcome.outcome };
  }

  // retry-scheduled: the provider asked for a later retry — the queue IS the
  // durable sleeper. lease-held/running: another runner owns the task (or it
  // is mid-flight without a schedule); lease-unavailable: ownership could not
  // be confirmed because the lease store failed; lease-lost: this runner
  // stopped owning the task mid-run; persist-failed: the run reached a terminal
  // state that could not be stored, so acknowledging it would lose the result.
  // All are redelivered after a delay.
  const delaySeconds = retryDelaySeconds(outcome.retryAfterSeconds);
  message.retry({ delaySeconds });
  return { action: "retry", taskId, outcome: outcome.outcome, delaySeconds };
}

export async function runTaskQueueBatch(batch, env) {
  const results = [];
  for (const message of batch?.messages || []) {
    results.push(await handleTaskQueueMessage(message, env));
  }
  return results;
}
