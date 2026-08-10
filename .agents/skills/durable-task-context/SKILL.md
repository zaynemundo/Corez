---
name: durable-task-context
description: Use when implementing or operating CoreZ durable conversation tasks, SSE replay, cancellation, artifact retrieval, or context records; enforce R2, ownership, and public-deployment boundaries.
---

# Durable Task And Context

## API contract

- `POST /api/tasks` starts a conversation task and returns `202` with task
  state. The public Worker rejects repository `workspaceId` requests.
- `GET /api/tasks/:taskId`, `POST .../resume`, and `POST .../cancel` read or
  change an owned task.
- `GET .../events` streams SSE and supports `Last-Event-ID` replay.
- `GET .../artifacts` returns the plan, evidence, inspected or modified files,
  and provider history recorded by the task.
- `POST /api/context/records` and `GET /api/context/records/:recordId` persist
  bounded conversation context.
- Durable task and context operations require `ASSET_BUCKET`.

## Ownership boundary

The `x-corez-user` header selects task and context ownership. It is not strong
authentication on the public endpoint. Use an unguessable, stable identifier,
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

Run `npx vitest run tests/task-persistence.test.js tests/context-storage.test.js` and `npm run test:cloudflare`.
