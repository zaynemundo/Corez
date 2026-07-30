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

## CoreZ AI Game Studio Hierarchy & OpenCode Go Models

When handling browser game requests, CoreZ activates the **AI Game Studio** orchestrator:

### High-Precision Engineering Architecture Map (DeepSeek V4 Flash Single Model Executor)

> **Primary Model Rule**: **DeepSeek V4 Flash** operates as the single primary executor for all code execution, component building, UI work, task graph routing, architectural guidance, code review, and empirical verification.

| Studio Role | AI Model | Provider | Mode / Authority | Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| `primary-executor` | `deepseek-v4-flash` | `opencode-go` | Coder / Tester | **Primary Executor**: writes code, builds components, edits files, runs tests |
| `game-studio-producer` | `deepseek-v4-flash` | `opencode-go` | Coordinator | Workflow state, task briefs, context isolation, rapid routing |
| `ui-programmer` | `deepseek-v4-flash` | `opencode-go` | Coder | Responsive browser HUDs, pause screens, game-over overlays, JSX components |
| `level-designer` | `deepseek-v4-flash` | `opencode-go` | Coder | Map layouts, tilemaps, platform placement, level pacing |
| `qa-tester` | `deepseek-v4-flash` | `openrouter` | Tester | Rapid smoke tests, control validation, bug reproduction |
| `architect-guide` | `deepseek-v4-flash` | `opencode-go` | Spec Lead | **Guidance & Architecture**: High-level specs, task graph decomposition, code review |
| `code-reviewer` | `deepseek-v4-flash` | `opencode-go` | Read-only Reviewer | Safety audit, specification compliance, code quality review |
| `physics-advisor` | `deepseek-v4-flash` | `opencode-go` | Read-only Advisor | **Physics & Math Advisor**: High-frequency physics math, spatial hashing formulas, canvas loop algorithms |
| `art-director` | `flux-1-schnell` | `cloudflare-workers-ai` | Creative Lead | Visual direction, color palettes, background textures, art assets |

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
