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
//   2. Inline fallback (no queue binding): the execution promise runs in the
//      current invocation and is attached to `ctx.waitUntil` so a disconnect
//      does not cancel it. `waitUntil` only extends an invocation ~30s past
//      the response, which is why the queue is the production path.
//
// Cancellation stays explicit: POST /api/tasks/:id/cancel marks the stored
// task cancelled, and the consumer acks (never redelivers) cancelled work.

import { AgentHarness } from "../packages/agent-core/harness/AgentHarness.js";
import { DEFAULT_TEXT_MODEL } from "../packages/agent-core/providers/modelIds.js";
import { CancellationManager } from "../packages/agent-core/harness/CancellationManager.js";
import { TASK_STATUSES, TERMINAL_TASK_STATUSES } from "../packages/agent-core/harness/TaskState.js";
import { D1TaskStore } from "../packages/agent-core/persistence/D1TaskStore.js";
import { R2TaskStore } from "../packages/agent-core/persistence/R2TaskStore.js";
import { OpenCodeGoAdapter } from "../packages/agent-core/providers/adapters.js";

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

// Hand a task to the durable runner. Prefers the Queue; falls back to inline
// execution attached to waitUntil when the binding is absent or a send fails.
// `options.task` (the live instance the caller just created/resumed) lets the
// inline path start without a storage round-trip. A send that throws after
// the broker accepted the message would produce an extra delivery, which is
// safe: the lease + terminal checks make the second run a no-op.
export async function dispatchTaskExecution(env, ctx, harness, taskId, options = {}) {
  if (taskQueueAvailable(env)) {
    try {
      await env.TASKS_QUEUE.send({ taskId });
      return { dispatched: "queue" };
    } catch {
      // fall through to the inline fallback
    }
  }
  const execution = harness
    .executeTask(taskId, options.task ? { task: options.task } : {})
    .catch(() => {});
  if (typeof ctx?.waitUntil === "function") {
    // `waitUntil` extends this invocation for up to 30 seconds after the
    // response. It is a best-effort bridge for deployments without a Queue
    // binding, not a durability guarantee for long jobs.
    ctx.waitUntil(execution);
  }
  return { dispatched: "inline", execution };
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
// the task "running" forever.
async function failExhaustedTask(store, taskId, reason) {
  if (!store) return;
  try {
    const task = await store.getTask(taskId);
    if (!task || TERMINAL_TASK_STATUSES.has(task.status)) return;
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
  // is mid-flight without a schedule); redeliver after a short delay.
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
