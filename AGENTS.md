# Multi-Agent Engineering Workflow

## Roles and authority

- **DeepSeek V4 Flash** (`deepseek/deepseek-v4-flash`) is the lead engineering agent, handling orchestration, development, vision, visual inspection, UI layout, game design, SVG creation, and overall implementation strategy.
- **FLUX 1 Schnell** (`@cf/black-forest-labs/flux-1-schnell`) is used for fast, free background image generation and visual artwork.

## Verification & Git completion policy

- After any change, run all applicable tests, linting, typechecking, and builds. A missing script is reported explicitly; it is never treated as having passed.
- Use the repository-local `git-superpowers` skill at task completion whenever file changes remain.
- Commit verified work on the local `main` branch only.
- If the current branch is not `main`, stop and report the mismatch instead of committing from another branch.
- Push `main` to `origin/main`; never create merge commits.

## Standard sequence

1. DeepSeek V4 Flash defines a bounded task and identifies files that subagents may inspect or, if explicitly authorised, edit.
2. DeepSeek V4 Flash delegates with analysis-only mode unless implementation is necessary and authorised.
3. Subagents return findings or changes.
4. DeepSeek V4 Flash critically reviews the response and diff.
5. DeepSeek V4 Flash makes the final engineering decision and performs independent verification.

## CoreZ Game Creation & OpenCode Go Models

Browser game requests are deliberately SIMPLE: they run the creation harness
on its one-pass fast path (no planning spec call, no review round) — one
streamed build through the OpenCode Go provider, structural verification
(complete document, canvas, animation loop, input listeners), and done.
Websites and apps keep the full harness pipeline (planning -> build ->
verify -> repair -> review).

### Execution Model (DeepSeek V4 Flash Single Model Executor)

> **Primary Model Rule**: **DeepSeek V4 Flash** operates as the single primary executor for all code execution, component building, UI work, task graph routing, architectural guidance, code review, and empirical verification.

- `primary-executor` — `deepseek-v4-flash` / `opencode-go` — Coder / Tester: writes code, builds components, edits files, runs tests.
- `art-director` — `flux-1-schnell` / `cloudflare-workers-ai` — Creative Lead: visual direction, color palettes, background textures, art assets.

### File Ownership & Context Rules
- **Context Isolation**: Each specialist subagent receives only its specific task brief (`task`, `role`, `goal`, `allowedFiles`, `acceptanceCriteria`). Monolithic conversation history dumps are forbidden.
- **File Ownership**: No two parallel subagents may edit the same source file concurrently.
- **Director Privileges**: Directors (`creative-director`, `technical-director`, `art-director`, `qa-lead`, `code-reviewer`, `visual-specialist`) are read-only (`edit: deny`) by default.
- **Visual Inspection Workflow**: Actual game screenshots are saved in project review directories and passed to `visual-specialist` for visual specification matching.
- **Visual Layering Mandate**: All UI and canvas components must follow strict z-index stacking context layering (Background `z:0` -> Content `z:10` -> HUD/Controls `z:20-30` -> Overlays/Modals `z:40-50+`) with explicit container positioning before outputting code.
- **Verification Gate**: No game deliverable is marked `COMPLETE` without empirical test execution evidence (`exitCode === 0`).

## Commands

```powershell
# Analysis-only planning or investigation (default mode)
.\scripts\agy-delegate.ps1 -Task 'Inspect the routing design and identify failure modes.'

# Explicitly authorised implementation
.\scripts\agy-delegate.ps1 -Mode Implement -Task 'Modify only src/example.ts to add the validated guard. Do not touch other files.'

# Read-only review of the current tracked staged and unstaged Git diff
.\scripts\agy-delegate.ps1 -Mode ReviewDiff -Task 'Look for correctness regressions and missing tests.'
```
