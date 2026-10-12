---
name: durable-task-context
description: Use when working with durable tasks - start a long-running task, stream or replay SSE events, resume or cancel my task, get task artifacts, or persist conversation context records. Not for local repository CLI work - use `corez-cli` instead.
---

# Durable Task And Context

## When to use

- Starting or operating a durable conversation task through `/api/tasks` -
  "start a long task", "resume my task", "cancel the task", "get the artifacts".
- Streaming or replaying task events over SSE with `Last-Event-ID` after a
  reconnect, deduplicating by event ID.
- Persisting or reading bounded conversation context through
  `/api/context/records`.
- Enforcing task or record ownership with the `x-corez-user` header on the
  public Worker.

## When not to use

- Local repository work through the CoreZ CLI - use `corez-cli`.
- Long-term user facts and preferences across sessions - use `user-learning`.
- Raw R2 memory storage and keyword recall - use `r2-mem0-memory`.

## API contract

- `POST /api/tasks` starts a conversation task and returns `202` with task
  state. The public Worker rejects repository `workspaceId` requests.
  Execution is durable: the task is persisted first, then run by the
  Cloudflare Queue consumer (`TASKS_QUEUE`) when bound, or inline under
  `ctx.waitUntil` otherwise. A browser disconnect is not cancellation; only
  `POST .../cancel` is.
- `GET /api/tasks/:taskId`, `POST .../resume`, and `POST .../cancel` read or
  change an owned task. `/resume` re-dispatches through the same durable path.
- `GET .../events` streams SSE and supports `Last-Event-ID` replay. Ownership
  is proven from the task record before the stream opens: missing metadata is
  `404`, a different owner is `403`, and unreadable storage is `503` - event
  data never flows without a verified owner.
- `GET .../artifacts` returns the plan, evidence, inspected or modified files,
  and provider history recorded by the task.
- `POST /api/context/records` and `GET /api/context/records/:recordId` persist
  bounded conversation context.
- Durable task state requires a task store: D1 (`DB` binding) when present,
  R2 (`ASSET_BUCKET`) otherwise. Session-log artifacts stay in R2.

## Ownership boundary

The `x-corez-user` header selects task and context ownership.
It is not strong authentication on the public endpoint. Use an unguessable, stable identifier,
never rely on the `anonymous` default for private durable work, and never expose
another user's task or record.

## Workflow

1. Start with a non-empty prompt and explicit owner identifier.
2. Persist and surface the returned `taskId` before polling or subscribing.
3. Resume only retryable or interrupted work; do not duplicate a running task.
4. Treat cancel as complete only after the API returns the owned task's updated
   status.
5. Replay events from the last observed ID and deduplicate by event ID.
6. Claim context persistence only when `persisted: true` is returned.

## Guardrails

- Never claim that the public Worker edited a repository; repository mode is
  available only through the local CoreZ CLI.
- Do not treat ownership headers as authenticated accounts.
- Do not fabricate completion when a task is deferred, blocked, or cancelled.

## Verification

Run `npx vitest run tests/task-persistence.test.js tests/context-storage.test.js tests/d1-task-store.test.js tests/task-durable-execution.test.js` and `npm run test:cloudflare`.

## Related skills

- `corez-cli` - local repository tasks, which the public Worker cannot run.
- `r2-mem0-memory` - durable user memory behind the same storage bucket.
- `user-learning` - consent-based durable user facts, separate from per-task context.
