# Multi-Agent Engineering Workflow

## Roles and authority

- **DeepSeek V4 Pro** (`deepseek/deepseek-v4-pro`) is the lead engineering agent, handling orchestration, development, vision, UI layout, game design, SVG creation, and overall implementation strategy.
- **MiMo V2.5** (`xiaomi/mimo-v2.5` / `opencode-go/mimo-v2.5`) is the visual testing and inspection specialist, performing screenshot analysis, visual UI smoke testing, visual specification matching, and regression detection.
- **FLUX 1 Schnell** (`@cf/black-forest-labs/flux-1-schnell`) is used for fast, free background image generation and visual artwork.

## Verification & Git completion policy

- After any change, run all applicable tests, linting, typechecking, and builds. A missing script is reported explicitly; it is never treated as having passed.
- Use the repository-local `git-superpowers` skill at task completion whenever file changes remain.
- Commit verified work on the local `main` branch only.
- If the current branch is not `main`, stop and report the mismatch instead of committing from another branch.
- Push `main` to `origin/main`; never create merge commits.

## Standard sequence

1. DeepSeek V4 Pro defines a bounded task and identifies files that MiMo V2.5 may inspect or, if explicitly authorised, edit.
2. DeepSeek V4 Pro delegates with analysis-only mode unless implementation is necessary and authorised.
3. MiMo V2.5 returns findings or changes; its output is preserved under `artifacts/mimo/` by default.
4. DeepSeek V4 Pro critically reviews the response and diff.
5. DeepSeek V4 Pro makes the final engineering decision and performs independent verification.

## CoreZ AI Game Studio Hierarchy & OpenCode Go Models

When handling browser game requests, CoreZ activates the **AI Game Studio** orchestrator:

### High-Precision Engineering Architecture Map (DeepSeek V4 Pro Primary Executor)

> **Primary Model Rule**: **DeepSeek V4 Pro** performs all primary code execution, component building, architecture, UI work, and verification. **DeepSeek V4 Flash** operates as a fast secondary executor for rapid UI smoke testing. **MiMo V2.5** operates as the primary visual testing agent for screenshot inspection and UI layout verification.

| Studio Role | AI Model | Provider | Mode / Authority | Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| `primary-executor` | `deepseek-v4-pro` | `opencode-go` | Coder / Tester | **Primary Executor**: writes code, builds components, edits files, runs tests |
| `game-studio-producer` | `deepseek-v4-pro` | `opencode-go` | Coordinator | Workflow state, task briefs, context isolation, rapid routing |
| `ui-programmer` | `deepseek-v4-pro` | `opencode-go` | Coder | Responsive browser HUDs, pause screens, game-over overlays, JSX components |
| `level-designer` | `deepseek-v4-pro` | `opencode-go` | Coder | Map layouts, tilemaps, platform placement, level pacing |
| `qa-tester` | `deepseek-v4-flash` | `openrouter` | Tester | Rapid smoke tests, control validation, bug reproduction |
| `visual-specialist` | `mimo-v2.5` | `opencode-go` | Visual Tester | **Visual Inspection & Testing**: Screenshot analysis, visual layout verification, pixel/UI spec matching |
| `architect-guide` | `deepseek-v4-pro` | `opencode-go` | Spec Lead | **Guidance & Architecture**: High-level specs, task graph decomposition, code review |
| `code-reviewer` | `deepseek-v4-pro` | `opencode-go` | Read-only Reviewer | Safety audit, specification compliance, code quality review |
| `physics-advisor` | `kimi-k3` | `opencode-go` | Read-only Advisor | **Physics & Math Advisor**: High-frequency physics math, spatial hashing formulas, canvas loop algorithms |
| `art-director` | `flux-1-schnell` | `cloudflare-workers-ai` | Creative Lead | Visual direction, color palettes, background textures, art assets |

### File Ownership & Context Rules
- **Context Isolation**: Each specialist subagent receives only its specific task brief (`task`, `role`, `goal`, `allowedFiles`, `acceptanceCriteria`). Monolithic conversation history dumps are forbidden.
- **File Ownership**: No two parallel subagents may edit the same source file concurrently.
- **Director Privileges**: Directors (`creative-director`, `technical-director`, `art-director`, `qa-lead`, `code-reviewer`, `visual-specialist`) are read-only (`edit: deny`) by default.
- **Visual Inspection Workflow**: Whenever an Awwwards design category is selected for website creation, `visual-specialist` (`opencode-go/mimo-v2.5`) reviews the reference target site (`https://www.awwwards.com/websites/<category>/`) and generated render screenshots for visual guidance, layout auditing, aesthetic benchmarking, and visual specification matching.
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
