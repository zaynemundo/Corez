---
name: game-development
description: Use when building a game - make a 2D platformer, Canvas arcade game, Three.js WebGL scene, physics sim, procedural audio, or word puzzle for CoreZ. Not for a plain website or app build - use `frontend-design` instead.
---

# CoreZ AI Game Studio — Router

## When to use

Use this skill whenever creating, debugging, or enhancing interactive web games, Three.js WebGL scenes, 2D HTML5 Canvas engines, physics simulators, procedural audio generators, or word puzzle games for CoreZ.

- "make a 2D platformer", "build a snake game", "add screen shake and juice".
- "my game stutters", "the canvas is blank", "fix the collision detection".
- Running the game pipeline stages - spec, art direction, assets, TDD build, QA.

## When not to use

- A plain website or non-game app build - use `frontend-design`.
- HUD-only styling or design tokens with no game logic - use
  `frontend-modern-design`.
- Generating a standalone image asset with no game attached - use
  `image-generation`.

> **This SKILL.md is a router, not the full manual.** The full former 18-part
> manual lives in `parts/` and the engine mechanics live in
> `reference/engine-handbook.md`. Read ONLY the files the current stage needs
> (Read tool) — do not load every part. A SMALL game may need only
> `reference/engine-handbook.md` plus parts 3, 8, 10.

## Load map

| Stage (`game-*`) | File | Load when |
| --- | --- | --- |
| Engine fundamentals (loop, audio, juice, platformer, Three.js, word games, sprites, touch, checklist) | `reference/engine-handbook.md` | Writing or debugging game code |
| game-start | `parts/01-game-start.md` | Sizing the game, provisioning roles, task graph |
| game-brainstorm | `parts/02-game-brainstorm.md` | Vision/mechanics discovery with the user |
| game-spec | `parts/03-game-spec.md` | Producing/validating `game-spec.json` |
| game-architecture | `parts/04-game-architecture.md` | Module boundaries, frame budget, state machines |
| game-art-direction | `parts/05-game-art-direction.md` | Palette, theme, `art-direction.json` |
| game-asset-spec | `parts/06-game-asset-spec.md` | `asset-manifest.json`, FLUX prompt planning |
| game-task-plan | `parts/07-game-task-plan.md` | DAG task graph and task briefs |
| game-implement | `parts/08-game-implement.md` | TDD RED-GREEN-REFACTOR implementation |
| game-polish | `parts/09-game-polish.md` | Particles, screen shake, audio direction |
| game-smoke-test | `parts/10-game-smoke-test.md` | vitest DOM/canvas/input smoke suite |
| game-qa-plan | `parts/11-game-qa-plan.md` | Test plans and human playtesting |
| game-regression | `parts/12-game-regression.md` | Baseline comparison after changes |
| game-performance-review | `parts/13-game-performance-review.md` | Frame timing and memory audits |
| game-bug-triage | `parts/14-game-bug-triage.md` | Severity, repro, fix verification |
| game-code-review | `parts/15-game-code-review.md` | Spec-compliance and safety review |
| game-visual-review | `parts/16-game-visual-review.md` | Screenshot vs art-direction review |
| game-release-check | `parts/17-game-release-check.md` | Final release gate and evidence |
| game-publish | `parts/18-game-publish.md` | Distribution, press kit, launch |

Read parts in pipeline order for full builds; read an individual part when the
task is a single stage (e.g. "review this game" → part 15; "it stutters" →
part 13, then part 14).

## Runtime rules (hosted CoreZ harness)

- **Games always take the fast path.** In `worker/harness.js` a
  `game_creation` intent skips the planning provider call, the swarm
  pre-pass, and the review rounds: the user prompt is the spec, the build is
  one streamed pass, and structural verification (complete document, canvas,
  loop, input) is the gate. Do not invent extra planning stages for a hosted
  game request; use the pipeline parts to inform the single build instead.
- **Full-viewport rule**: the game must fill the preview viewport
  (`html/body` 100%/100%, `margin:0`, `overflow:hidden`; full-viewport canvas;
  fixed internal resolution scaled with `ctx.setTransform` + a resize
  listener).
- **Image assets**: backgrounds go through the keyless Workers AI path
  `POST /api/image/cf` (`@cf/black-forest-labs/flux-2-klein-4b` primary,
  `@cf/black-forest-labs/flux-1-schnell` fallback) or `POST /api/image`
  (OpenRouter). Sprites are hand-authored SVG/canvas, not generated raster.
  Report the `model` the endpoint actually returned; never hard-code a
  provider claim.
- **Verification gate**: a game is never COMPLETE without runnable evidence —
  `exitCode === 0` from the relevant tests, smoke checks, and build. No
  agent text claim substitutes for execution evidence.

## Non-negotiable engineering rules

- **TDD / tests**: follow `game-implement` (RED-GREEN-REFACTOR); keep a smoke
  suite per `game-smoke-test`. See `code-review-testing` for the repo-wide
  verification protocol.
- **File ownership**: no two parallel agents edit the same file; every task
  brief names its allowed files (see `game-task-plan`).
- **Context isolation**: give each specialist only its brief (task, role,
  goal, allowed files, acceptance criteria) — never the full conversation.
- **Visual layering**: HUD and menus follow the canonical stacking order in
  `frontend-modern-design: §5` (Background `0` → Content `10` → HUD `20-30`
  → Overlays `40-50+`), declared on positioned containers only.
- **Accessibility**: keyboard focus, contrast, and reduced-motion per
  `accessibility-expert`; touch targets ≥ 44x44px on mobile.
- **Performance**: single `requestAnimationFrame` loop, delta-time updates,
  pooled particles (hard cap), no per-frame allocations or listener leaks.

## Verification

- Runnable evidence only - `exitCode === 0` from the smoke suite
  (`parts/10-game-smoke-test.md`), the release gate
  (`parts/17-game-release-check.md`), and the build; no agent text claim
  substitutes for execution (see the Verification gate in Runtime rules).

## Related skills

- `frontend-modern-design` — HUD/menu visual system and tokens (§1, §5).
- `accessibility-expert` — keyboard, contrast, motion, touch.
- `auto-debugging` — build/test/runtime failures.
- `code-review-testing` — review + empirical verification protocol.
- `visual-creative` / `image-generation` — art direction and the image
  endpoints.
- `verify` — launch and drive CoreZ end-to-end.
- `git-superpowers` — commit/push policy at completion.
- `superpowers` — subagent-driven development and plan execution tracking
  across pipeline stages.
