---
name: corez-cli
description: Use when running the local CoreZ CLI - corez plan a feature, corez build, corez fix, corez review my changes, corez swarm, or debug model routing and permission modes. Not for hosted browser task APIs - use `durable-task-context` instead.
---

# CoreZ CLI

This skill applies to `packages/cli` and `packages/agent-core`. It is distinct
from the public browser task API: the local CLI can operate on a repository,
while the public Worker cannot.

## When to use

- Running a repository task from the local CLI - `corez plan "feature"`,
  `corez build "feature"`, `corez fix`, `corez review`, or `corez swarm "task"`.
- Configuring or inspecting the CLI - `corez models`, `corez agents`,
  `corez status`, `.corez/config.json`, `corez.config.json`.
- Debugging model routing, workspace tools, permission modes, or
  `COREZ_AUTO_APPROVE` / `YOLO` behavior.

## When not to use

- Hosted browser task APIs, SSE replay, or task artifacts - use
  `durable-task-context`.
- Missing environment or provider secret values - use `ask-env-values`.
- Generic TypeScript refactors or bug fixes outside the CLI packages - use
  `software-engineering`.

## Commands

- `corez` or `corez chat`: interactive session.
- `corez "task"`: direct workspace task.
- `corez plan "feature"`: read-only analysis and implementation plan.
- `corez build "feature"`: implementation within the current workspace.
- `corez fix`: run diagnostics and repair applicable failures.
- `corez review`: read-only review of uncommitted Git changes.
- `corez swarm "task"`: DAG-based multi-agent execution.
- `corez models`, `corez agents`, and `corez status`: inspect configuration.

For repository-local development without a global link, use
`npm run dev:cli -- <command and arguments>` from the repository root.

## Safety workflow

1. Confirm the workspace root and current Git branch before a mutating mode.
2. Use `plan` or `review` when the request is read-only.
3. Preserve the permission categories in `packages/agent-core/permissions`:
   read, workspace write, shell, network, and dangerous operations.
4. Never enable `COREZ_AUTO_APPROVE` or `YOLO` without explicit user approval.
5. Keep file operations inside the selected workspace and reject destructive
   commands rather than attempting to sanitize them after execution.
6. Report actual command output, modified files, and failed verification; do
   not claim success from a generated plan alone.

## Configuration

Project configuration lives in `.corez/config.json` or `corez.config.json`.
Provider secrets belong in environment variables, never in those files. Load
`ask-env-values` when a required key is absent.

## Verification

Run `npm run test:cli`, then `npm run lint` and `npm run build` for changes that
affect shared web or agent-core modules.

## Related skills

- `durable-task-context` - hosted durable task API, distinct from the local CLI.
- `ask-env-values` - required provider keys and their placement.
- `git-superpowers` - commit and push policy after CLI changes.
