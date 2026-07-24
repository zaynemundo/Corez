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

1. DeepSeek V4 Flash defines a bounded task and identifies files that MiMo V2.5 may inspect or, if explicitly authorised, edit.
2. DeepSeek V4 Flash delegates with analysis-only mode unless implementation is necessary and authorised.
3. MiMo V2.5 returns findings or changes; its output is preserved under `artifacts/mimo/` by default.
4. DeepSeek V4 Flash critically reviews the response and diff.
5. DeepSeek V4 Flash makes the final engineering decision and performs independent verification.

## CoreZ AI Game Studio Hierarchy & OpenCode Go Models

When handling browser game requests, CoreZ activates the **AI Game Studio** orchestrator:

### CoreZ 4-Model Swarm Architecture Map

| Studio Role | AI Model | Provider | Mode / Authority | Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| `game-studio-producer` | `deepseek-v4-flash` | `opencode-go` / `openrouter` | Coordinator | Workflow state, task briefs, context isolation, rapid routing |
| `creative-director` | `deepseek-v4-flash` | `opencode-go` / `openrouter` | Read-only | Game vision, player fantasy, genre identity, pacing |
| `technical-director` | `deepseek-v4-pro` | `opencode-go` | Read-only | Technical feasibility, architecture, 60 FPS performance guardrails |
| `game-designer` | `deepseek-v4-pro` | `opencode-go` | Spec Lead | Core loops, game mechanics, state schema (`game-spec.json`) |
| `lead-programmer` | `deepseek-v4-pro` | `opencode-go` | Tech Lead | Task graph decomposition, module interfaces, backend endpoints |
| `art-director` | `flux-1-schnell` | `cloudflare-workers-ai` | Creative Lead | Visual direction, color palettes, background textures, art assets |
| `qa-lead` | `deepseek-v4-pro` | `opencode-go` | Read-only | Acceptance criteria, test matrix, regression checklist |
| `gameplay-programmer` | `kimi-k3` | `opencode-go` | Specialist | Player movement, physics simulation, attacks, collisions, health |
| `game-ai-programmer` | `kimi-k3` | `opencode-go` | Specialist | Enemy AI state machines, boss logic, difficulty scaling |
| `engine-programmer` | `kimi-k3` | `opencode-go` | Specialist | Game loop, delta timing, canvas rendering, spatial hashing |
| `ui-programmer` | `deepseek-v4-flash` | `opencode-go` / `openrouter` | Specialist | Responsive browser HUD, pause screens, game-over overlays |
| `level-designer` | `deepseek-v4-flash` | `opencode-go` / `openrouter` | Specialist | Map layouts, tilemaps, platform placement, level pacing |
| `technical-artist` | `flux-1-schnell` | `cloudflare-workers-ai` | Specialist | Background rendering, visual assets, particle textures |
| `qa-tester` | `deepseek-v4-flash` | `opencode-go` / `openrouter` | Tester | Rapid smoke tests, control validation, bug reproduction |
| `code-reviewer` | `deepseek-v4-pro` | `opencode-go` | Read-only | Specification compliance, safety audit, code quality review |

### File Ownership & Context Rules
- **Context Isolation**: Each specialist subagent receives only its specific task brief (`task`, `role`, `goal`, `allowedFiles`, `acceptanceCriteria`). Monolithic conversation history dumps are forbidden.
- **File Ownership**: No two parallel subagents may edit the same source file concurrently.
- **Director Privileges**: Directors (`creative-director`, `technical-director`, `art-director`, `qa-lead`, `code-reviewer`, `visual-specialist`) are read-only (`edit: deny`) by default.
- **Visual Inspection Workflow**: Actual game screenshots are saved in project review directories and passed to `visual-specialist` (`opencode-go/mimo-v2.5`) for visual specification matching.
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
