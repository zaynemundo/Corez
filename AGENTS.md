# Multi-Agent Engineering Workflow

## Roles and authority

- **DeepSeek V4 Flash** is the lead engineering agent, handling orchestration, development, vision, visual inspection, UI layout, game design, SVG creation, and overall implementation strategy.
- **FLUX 1 Schnell** (`@cf/black-forest-labs/flux-1-schnell`) is used for fast, free background image generation and visual artwork.

## Verification & Git completion policy

- After any change, run all applicable tests, linting, typechecking, and builds. A missing script is reported explicitly; it is never treated as having passed.
- Use the repository-local `git-superpowers` skill at task completion whenever file changes remain.
- Commit verified work on the local `main` branch only.
- If the current branch is not `main`, stop and report the mismatch instead of committing from another branch.
- Push `main` to `origin/main`; never create merge commits.

## Git completion policy

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

## Commands

```powershell
# Analysis-only planning or investigation (default mode)
.\scripts\agy-delegate.ps1 -Task 'Inspect the routing design and identify failure modes.'

# Explicitly authorised implementation
.\scripts\agy-delegate.ps1 -Mode Implement -Task 'Modify only src/example.ts to add the validated guard. Do not touch other files.'

# Read-only review of the current tracked staged and unstaged Git diff
.\scripts\agy-delegate.ps1 -Mode ReviewDiff -Task 'Look for correctness regressions and missing tests.'
```
