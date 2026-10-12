// CoreZ task API for the website Worker.
//
// The same AgentHarness that powers the CLI runs here (conversation mode: the
// browser runtime cannot execute shell/filesystem tools — repository mode
// honestly returns 400 until a Node-side runner is attached). Tasks persist in
// D1 when the binding exists (atomic leases + ordered events) and fall back to
// R2 otherwise; execution is handed to a durable Cloudflare Queue consumer so
// the HTTP invocation never owns long-running work. Events stream over SSE
// with Last-Event-ID replay, and task ownership is enforced per user.
//
// Dispatch honesty: an accepted task is always backed by the queue or by a
// durable D1 dispatch record (`dispatch: "queue" | "deferred"`). When neither
// is available the request fails 503 with a retryable error instead of
// silently downgrading to inline execution in the HTTP invocation.
//
// Budget honesty: creating a task charges the account atomically (one
// generation + the prompt's token estimate) BEFORE the task exists, so two
// simultaneous creations cannot both pass against the last remaining
// generation and a task never runs unaccounted. An unavailable accounting
// store refuses the request retryably instead of letting the work start.
//
// Browser disconnection is not task cancellation: the POST only creates and
// dispatches the task, and only an explicit /cancel marks it cancelled.

import { TERMINAL_TASK_STATUSES } from "../packages/agent-core/harness/TaskState.js";
import { ContextStore } from "../packages/agent-core/persistence/ContextStore.js";
import { verifySession } from "./auth.js";
import { getActiveSubscription } from "./subscriptions.js";
import { jsonResponse, readBoundedJson, safeErrorDetail } from "./utils.js";
import {
  UsageUnavailableError,
  checkAllowance,
  consumeAllowance,
  estimateTokens,
  limitResponse,
  normalizePlan,
  usageUnavailableResponse,
} from "./usage.js";
import {
  buildHarness,
  dispatchTaskExecution,
  taskStoreFor,
} from "./taskRunner.js";

export const OWNER_HEADER = "x-corez-user";
const TASK_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const RECORD_ID_PATTERN = /^[A-Za-z0-9._-]{1,160}$/;

async function resolvePlanForUser(env, userId) {
  const sub = await getActiveSubscription(env, userId).catch(() => null);
  return normalizePlan(
    sub?.status === "expired" || sub?.isExpired ? "free" : sub?.plan || "free",
  );
}

// Atomic budget admission for one queued generation. Returns a Response when
// the request must be refused (402 out of quota, 503 accounting down),
// otherwise null. The charge is one generation plus the prompt's token
// estimate, exactly like a direct /api/ai turn.
async function admitGeneration(env, userId, plan, prompt) {
  try {
    const admission = await consumeAllowance(env, userId, {
      plan,
      charges: [
        { metric: "messages", amount: 1 },
        { metric: "tokens", amount: estimateTokens(prompt) },
      ],
    });
    if (!admission.ok && admission.reason === "limit") {
      return limitResponse(admission.metric, admission.evaluation, plan);
    }
    return null;
  } catch (err) {
    if (err instanceof UsageUnavailableError) {
      return usageUnavailableResponse();
    }
    throw err;
  }
}

// Caller identity: the verified session is the ONLY trusted source. The
// legacy X-Corez-User header is honored solely when AUTH_SECRET is unset
// (local dev / contract tests) and is never trusted in production, where a
// missing session means 401.
async function getUserId(request, env) {
  const sess = await verifySession(request, env);
  if (sess?.uid) return sess.uid;
  if (!env?.AUTH_SECRET) {
    return (
      (request.headers.get(OWNER_HEADER) || "").trim().slice(0, 100) ||
      "anonymous"
    );
  }
  return null;
}

// One shared cancellation registry per Worker isolate: a cancel request in
// one fetch aborts the signal the running task loop listens to in another.
// Cross-isolate cancellation is honored by the loop's store-level check. The
// harness factory itself lives in taskRunner.js (shared with the queue
// consumer), so this file only owns HTTP semantics.

function publicTask(task) {
  if (!task || typeof task !== "object") return task;
  return {
    taskId: task.taskId,
    userId: task.userId,
    sessionId: task.sessionId,
    workspaceId: task.workspaceId,
    status: task.status,
    prompt: task.prompt,
    model: task.model,
    mode: task.mode,
    plan: task.plan,
    currentStep: task.currentStep,
    toolExecutions: (task.toolExecutions || []).slice(-50),
    modifiedFiles: task.modifiedFiles,
    inspectedFiles: (task.inspectedFiles || []).slice(-100),
    evidence: (task.evidence || []).slice(-100),
    providerHistory: task.providerHistory,
    retryState: task.retryState,
    result: task.result,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    terminalAt: task.terminalAt,
  };
}

function parseTaskId(raw) {
  const value = decodeURIComponent(raw);
  return TASK_ID_PATTERN.test(value) ? value : null;
}

// Dispatch failure with no durable record: the task itself is safe (it was
// persisted before dispatch), but nothing owns its execution, so the API must
// not claim acceptance. A retry either dispatches it or lands on the same
// clear failure.
function dispatchFailureResponse(err) {
  return jsonResponse(
    503,
    {
      error:
        "The task was created but could not be durably dispatched. Retry the request.",
      detail: safeErrorDetail(err),
      retryable: true,
    },
    { "Retry-After": "30" },
  );
}

// The dispatch result drives the response: `queue` is the normal path;
// `deferred` means the queue send failed but a durable D1 dispatch record was
// persisted and a sweeper will retry it, so the accepted status still holds.
function dispatchedTaskResponse(status, task, dispatch) {
  if (dispatch.dispatched === "deferred") {
    return jsonResponse(
      status,
      {
        ...publicTask(task),
        dispatch: "deferred",
        retryAfterSeconds: dispatch.retryAfterSeconds,
      },
      { "Retry-After": String(dispatch.retryAfterSeconds) },
    );
  }
  return jsonResponse(status, { ...publicTask(task), dispatch: dispatch.dispatched });
}

export async function handleTaskApi(request, env, ctx = null) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const userId = await getUserId(request, env);
  if (!userId) {
    return jsonResponse(401, { error: "Authentication required." });
  }

  // POST /api/tasks — start a task, return the task id immediately.
  if (pathname === "/api/tasks" && request.method === "POST") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return jsonResponse(400, { error: "prompt is required." });
    }

    // Repository tasks are never executed on this deployment: corez.pro is a
    // public site with no repository workspace, and it never delegates to a
    // remote workspace. Repository work belongs to the local CLI agent.
    if (body?.workspaceId) {
      return jsonResponse(400, {
        error:
          "Repository mode is not available on this public deployment: no repository workspace is attached and remote workspace execution is disabled. Run the local CLI agent against a repository for repository work.",
      });
    }

    const harness = buildHarness(env);
    if (!harness.store?.available) {
      return jsonResponse(503, { error: "Task storage is not configured." });
    }
    // Charge the generation before the task exists. A concurrent pair with one
    // slot left admits exactly one; if the process dies after this charge but
    // before the task is created, the account is charged for a task it did not
    // get — the conservative direction (never an unaccounted generation).
    const plan = await resolvePlanForUser(env, userId);
    const denied = await admitGeneration(env, userId, plan, prompt);
    if (denied) return denied;
    // Execution is always handed to the runner seam: the queue, or a durable
    // dispatch record the sweeper retries. The HTTP invocation never silently
    // owns the long-running work; a dispatch that cannot be made durable is a
    // retryable 503, not an accepted task.
    const task = await harness.startTask({
      userId,
      sessionId:
        typeof body?.sessionId === "string"
          ? body.sessionId.slice(0, 160)
          : null,
      workspaceId: null,
      prompt,
      model:
        typeof body?.model === "string" ? body.model.slice(0, 120) : undefined,
      mode: "conversation",
      autoApprove: false,
      deferExecution: true,
    });
    let dispatch;
    try {
      dispatch = await dispatchTaskExecution(env, ctx, harness, task.taskId, {
        task,
      });
    } catch (err) {
      return dispatchFailureResponse(err);
    }
    // `dispatch: "deferred"` is the honest form of acceptance here: the record
    // is durable in D1 and the sweeper will re-send it, so the task will run
    // even if this isolate never does.
    return dispatchedTaskResponse(202, task, dispatch);
  }

  // GET /api/tasks/:taskId, POST /resume, POST /cancel, GET /events, GET /artifacts
  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)(?:\/([^/]+))?$/);
  if (taskMatch) {
    const taskId = parseTaskId(taskMatch[1]);
    if (!taskId) return jsonResponse(400, { error: "Invalid task id." });
    const sub = taskMatch[2] || null;

    if (request.method === "GET" && sub === null) {
      const store = taskStoreFor(env);
      const task = store.available ? await store.getTask(taskId) : null;
      if (!task) return jsonResponse(404, { error: "Task not found." });
      if (task.userId !== userId)
        return jsonResponse(403, { error: "Access denied." });
      return jsonResponse(200, publicTask(task));
    }

    if (request.method === "POST" && sub === "resume") {
      const harness = buildHarness(env);
      if (!harness.store?.available) {
        return jsonResponse(503, { error: "Task storage is not configured." });
      }
      // Resuming continues the generation the account was already charged for
      // at creation, so it does not consume another generation. It still
      // requires the accounting store to answer (an outage must not start
      // unaccounted work) and the token backstop still bounds provider spend.
      const existing = await harness.store.getTask(taskId).catch(() => null);
      if (existing && existing.userId === userId) {
        const plan = await resolvePlanForUser(env, userId);
        try {
          const check = await checkAllowance(env, userId, {
            plan,
            charges: [{ metric: "tokens", amount: estimateTokens(existing.prompt) }],
          });
          if (!check.ok && check.reason === "limit") {
            return limitResponse(check.metric, check.evaluation, plan);
          }
        } catch (err) {
          if (err instanceof UsageUnavailableError) {
            return usageUnavailableResponse();
          }
          throw err;
        }
      }
      let task;
      try {
        task = await harness.resumeTask(taskId, userId, { deferExecution: true });
      } catch (err) {
        if (err?.message?.includes("Access denied"))
          return jsonResponse(403, { error: "Access denied." });
        if (err?.message?.includes("Task not found"))
          return jsonResponse(404, { error: "Task not found." });
        return jsonResponse(500, { error: safeErrorDetail(err) });
      }
      // Resumed work goes back through the same durable dispatch as a new
      // task; the queue redelivers it on failure instead of tying the retry
      // to this HTTP invocation. An undispatchable resume is a retryable 503
      // (the task stays running and resumable, never silently inline).
      if (!task.isTerminal) {
        let dispatch;
        try {
          dispatch = await dispatchTaskExecution(env, ctx, harness, task.taskId, {
            task,
          });
        } catch (err) {
          return dispatchFailureResponse(err);
        }
        return dispatchedTaskResponse(200, task, dispatch);
      }
      return jsonResponse(200, publicTask(task));
    }

    if (request.method === "POST" && sub === "cancel") {
      const harness = buildHarness(env);
      let task;
      try {
        task = await harness.cancelTask(taskId, userId);
      } catch (err) {
        if (err?.message?.includes("Access denied"))
          return jsonResponse(403, { error: "Access denied." });
        if (err?.message?.includes("Task not found"))
          return jsonResponse(404, { error: "Task not found." });
        return jsonResponse(500, { error: safeErrorDetail(err) });
      }
      return jsonResponse(200, publicTask(task));
    }

    if (request.method === "GET" && sub === "events") {
      return streamTaskEvents(request, env, taskId, userId);
    }

    if (request.method === "GET" && sub === "artifacts") {
      const task = await readTask(env, taskId);
      if (!task) return jsonResponse(404, { error: "Task not found." });
      if (task.userId !== userId)
        return jsonResponse(403, { error: "Access denied." });
      return jsonResponse(200, {
        taskId,
        plan: task.plan || null,
        evidence: (task.evidence || []).slice(-200),
        modifiedFiles: task.modifiedFiles || [],
        inspectedFiles: (task.inspectedFiles || []).slice(-200),
        providerHistory: task.providerHistory || [],
      });
    }

    return jsonResponse(405, { error: "Method not allowed." });
  }

  // POST /api/context/records — durable context record save.
  if (pathname === "/api/context/records" && request.method === "POST") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) {
      return jsonResponse(400, { error: "messages are required." });
    }
    if (!env?.ASSET_BUCKET) {
      return jsonResponse(503, {
        error: "Context storage (ASSET_BUCKET) is not configured.",
      });
    }
    const store = new ContextStore({ bucket: env.ASSET_BUCKET });
    const result = await store.save({
      userId,
      sessionId:
        typeof body?.sessionId === "string"
          ? body.sessionId.slice(0, 160)
          : null,
      messages,
      recordId:
        typeof body?.recordId === "string" &&
        RECORD_ID_PATTERN.test(body.recordId)
          ? body.recordId
          : null,
      summary:
        typeof body?.summary === "string" ? body.summary.slice(0, 5000) : null,
    });
    if (!result.persisted) {
      return jsonResponse(502, {
        error: "Context record could not be persisted.",
        persisted: false,
        reason: result.reason,
      });
    }
    return jsonResponse(200, result);
  }

  // GET /api/context/records/:recordId
  const recordMatch = pathname.match(/^\/api\/context\/records\/([^/]+)$/);
  if (recordMatch && request.method === "GET") {
    const recordId = decodeURIComponent(recordMatch[1]);
    if (!RECORD_ID_PATTERN.test(recordId)) {
      return jsonResponse(400, { error: "Invalid record id." });
    }
    if (!env?.ASSET_BUCKET) {
      return jsonResponse(503, {
        error: "Context storage (ASSET_BUCKET) is not configured.",
      });
    }
    const store = new ContextStore({ bucket: env.ASSET_BUCKET });
    try {
      const record = await store.get(recordId, { userId });
      if (!record)
        return jsonResponse(404, { error: "Context record not found." });
      return jsonResponse(200, record);
    } catch (err) {
      if (err?.status === 403)
        return jsonResponse(403, { error: "Access denied." });
      return jsonResponse(500, { error: safeErrorDetail(err) });
    }
  }

  return null; // not handled here
}

async function readTask(env, taskId) {
  const store = taskStoreFor(env);
  if (!store.available) return null;
  const task = await store.getTask(taskId);
  return task;
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  };
}

function parseLastEventId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

// The event stream may only open after the task record has been read and the
// caller's ownership of it confirmed. A metadata read that fails leaves the
// owner unknown, which is NOT permission to stream: without a verified owner
// the event log must not be disclosed. Transient read failures get a small
// bounded retry, then the request fails closed with 503.
const STREAM_OWNERSHIP_ATTEMPTS = 3;
const STREAM_OWNERSHIP_RETRY_MS = 150;

// Returns null when ownership is established, otherwise the error response.
async function establishTaskOwnership(store, taskId, userId) {
  if (!store.available) {
    return jsonResponse(503, {
      error: "Task storage (ASSET_BUCKET) is not configured.",
    });
  }
  for (let attempt = 0; attempt < STREAM_OWNERSHIP_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await sleep(STREAM_OWNERSHIP_RETRY_MS + Math.floor(Math.random() * 100));
    }
    let task;
    try {
      task = await store.getTask(taskId);
    } catch {
      continue; // transient read failure: retry, then fail closed below
    }
    if (!task) return jsonResponse(404, { error: "Task not found." });
    if (task.userId !== userId) {
      return jsonResponse(403, { error: "Access denied." });
    }
    return null; // ownership established: the stream may open
  }
  return jsonResponse(503, {
    error:
      "Task storage is temporarily unavailable; ownership could not be verified.",
  });
}

async function streamTaskEvents(request, env, taskId, userId) {
  const store = taskStoreFor(env);
  const denied = await establishTaskOwnership(store, taskId, userId);
  if (denied) return denied;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const closed = request.signal?.aborted ? true : false;
  let clientClosed = closed;
  request.signal?.addEventListener(
    "abort",
    () => {
      clientClosed = true;
    },
    { once: true },
  );

  const sendEvent = async (event) => {
    try {
      await writer.write(
        encoder.encode(
          `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        ),
      );
    } catch {
      clientClosed = true;
    }
  };

  // Stream the response while polling the durable event log. The event log
  // keeps growing while the harness task runs; a disconnected client only
  // misses events it can replay via Last-Event-ID on reconnect.
  (async () => {
    let sinceId = parseLastEventId(request.headers.get("last-event-id"));
    let backoffMs = 400;
    let lastActivity = Date.now();
    const deadline = Date.now() + 90_000;

    while (!clientClosed && !request.signal?.aborted && Date.now() < deadline) {
      let events;
      try {
        events = await store.listEvents(taskId, { sinceId });
      } catch {
        events = [];
      }
      if (events.length > 0) {
        for (const event of events) {
          await sendEvent(event);
          sinceId = Math.max(sinceId, event.id);
        }
        lastActivity = Date.now();
        backoffMs = 400; // adaptive: reset after a batch arrives
        continue;
      }

      // Terminal check: when the task finishes and no new events are left to
      // deliver, close the stream. The real terminal event (task.completed /
      // task.cancelled / ...) was already persisted by the harness, so the
      // poller only appends task.stream_end.
      let current;
      try {
        current = await store.getTask(taskId);
      } catch {
        current = null;
      }
      // Ownership was verified before the stream opened; a readable record
      // that no longer belongs to the verified caller is an inconsistent
      // store, and no further event may be sent from it.
      if (current && current.userId !== userId) break;
      if (current && TERMINAL_TASK_STATUSES.has(current.status)) {
        await sendEvent({
          id: sinceId + 1,
          type: "task.stream_end",
          taskId,
          status: current.status,
        });
        break;
      }

      // Adaptive backoff: grow up to 3s, jittered, resetting on activity.
      const idle = Date.now() - lastActivity;
      if (idle > 15_000) backoffMs = Math.min(3000, backoffMs * 2);
      await sleep(backoffMs + Math.floor(Math.random() * 200));
      if (clientClosed || request.signal?.aborted) break;
    }

    try {
      await writer.close();
    } catch {
      // client already gone
    }
  })();

  return new Response(readable, { headers: sseHeaders() });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
