# Multi-Agent Engineering Workflow

## Roles and authority

- **Muse Spark 1.2** (`muse-spark-1.2` / opencode-go) is the lead engineering agent, handling orchestration, development, vision, visual inspection, UI layout, game design, SVG creation, and overall implementation strategy.
- **FLUX 1 Schnell** (`@cf/black-forest-labs/flux-1-schnell`) is used for fast, free background image generation and visual artwork.

## Verification & Git completion policy

- After any change, run all applicable tests, linting, typechecking, and builds. A missing script is reported explicitly; it is never treated as having passed.
- Use the repository-local `git-superpowers` skill at task completion whenever file changes remain.
- Commit verified work on the local `main` branch only.
- If the current branch is not `main`, stop and report the mismatch instead of committing from another branch.
- Push `main` to `origin/main`; never create merge commits.

## Standard sequence

1. Muse Spark 1.2 defines a bounded task and identifies files that subagents may inspect or, if explicitly authorised, edit.
2. Muse Spark 1.2 delegates with analysis-only mode unless implementation is necessary and authorised.
3. Subagents return findings or changes.
4. Muse Spark 1.2 critically reviews the response and diff.
5. Muse Spark 1.2 makes the final engineering decision and performs independent verification.

## Swarm Multi-Agent Execution for Coding

Coding, development, and implementation tasks (websites, web apps, browser games, widgets, tools, refactoring, and bug fixes) run through the swarm orchestrators (`GenericSwarmOrchestrator` in `packages/agent-core/swarm`, `AgentSwarmOrchestrator` in `src/services/gamePipeline/swarm`) with an **automatic complexity router** (`decideSwarmMode`):

- **`auto` (default)**: short, surgical tasks (a typo fix, a single component edit) take the **fast DAG** — `explorer` → `engineer` → `reviewer`. Larger briefs (websites, web apps, games, backend/API work, refactors, or anything ≥ ~100 tokens) take the **full specialist DAG** — `explorer` → `architect` → `frontend`/`backend` (parallel) → `tester` → `reviewer`.
- **`swarm`**: force the full specialist DAG.
- **`fast`**: force the fast DAG.

Roles match `SWARM_ROLES` in `packages/agent-core/swarm`: `orchestrator`, `explorer`, `architect`, `engineer`, `frontend`, `backend`, `debugger`, `tester`, `reviewer`, `security`, `integration`, and `art-director`. Visual assets are produced by `asset-worker` agents through the FLUX image provider (`flux-2-klein-4b` / `cloudflare-workers-ai`).

### Execution Model (Muse Spark 1.2 Single Model Executor)

> **Primary Model Rule**: **Muse Spark 1.2** operates as the lead primary executor for all code execution, component building, UI work, task graph routing, architectural guidance, code review, and empirical verification.

- `primary-executor` — `muse-spark-1.2` / `opencode-go` — Coder / Tester: writes code, builds components, edits files, runs tests.
- `art-director` — `flux-2-klein-4b` / `cloudflare-workers-ai` — Creative Lead: visual direction, color palettes, background textures, art assets.

### File Ownership & Context Rules
- **Context Isolation**: Each specialist subagent receives only its specific task brief (`task`, `role`, `goal`, `allowedFiles`, `acceptanceCriteria`). Monolithic conversation history dumps are forbidden.
- **File Ownership**: No two parallel subagents may edit the same source file concurrently (`ResourceLockManager` acquires all-or-nothing locks and releases partial acquisitions on conflict).
- **Director Privileges**: Directors (`creative-director`, `technical-director`, `art-director`, `qa-lead`, `code-reviewer`, `visual-specialist`) are read-only (`edit: deny`) by default.
- **Visual Inspection Workflow**: Actual game screenshots are saved in project review directories and passed to `visual-specialist` for visual specification matching.
- **Visual Layering Mandate**: All UI and canvas components must follow strict z-index stacking context layering (Background `z:0` -> Content `z:10` -> HUD/Controls `z:20-30` -> Overlays/Modals `z:40-50+`) with explicit container positioning before outputting code.
- **Integration**: When a plan has no explicit integration task, the final artifact is merged from every completed agent's string output in deterministic dependency order — never from a single arbitrary task.
- **Creation Harness Swarm Pre-Pass** (`worker/swarm.js`): complex (non-fast-path) website/app builds run a small swarm of PARALLEL specialist briefs — `architect` (structure/state/components) and `art-director` (palette/typography/motion) — before the streamed build. Their short contributions are injected into the build context so the single-file artifact is better informed on the first attempt: fewer truncations and repair rounds means less wall time and less worker CPU. The pre-pass is never a gate (failed specialists fall back to the plain spec context), games and trivial requests always skip it, and `AI_SWARM_ENABLED=false` disables it per deployment.

### Verification Gate
No deliverable is marked `COMPLETE` without empirical test execution evidence (`exitCode === 0`) from the harness. An agent's text claim is **never evidence**: the optional `verifier` hook runs real checks (tests, lint, builds) after each agent output, marks the task `FAILED` when they do not pass, and records the evidence in the swarm result. A swarm that has no provider configured fails loudly instead of fabricating success.

## Commands

```powershell
# Analysis-only planning or investigation (default mode)
.\scripts\agy-delegate.ps1 -Task 'Inspect the routing design and identify failure modes.'

# Explicitly authorised implementation
.\scripts\agy-delegate.ps1 -Mode Implement -Task 'Modify only src/example.ts to add the validated guard. Do not touch other files.'

# Read-only review of the current tracked staged and unstaged Git diff
.\scripts\agy-delegate.ps1 -Mode ReviewDiff -Task 'Look for correctness regressions and missing tests.'
```
