---
name: git-superpowers
description: Use when a task completion requires verified changes to be committed on main, pushed to origin/main, or the auto_commit Stop hook in .agents/hooks.json did not fire. Not for writing tests or fixes - use `code-review-testing` instead.
---

# Git Superpowers Skill

Use this skill at the end of every repository task that leaves file changes.
The required policy is: commit verified work on the local `main` branch, then
push `main` to `origin/main`.

## When to use

- A task is complete and leaves tracked file changes that must be committed.
- Verified work must be pushed from local `main` to `origin/main`.
- The `Stop` hook in `.agents/hooks.json` (`.agents/scripts/auto_commit.py`) did not run or failed.
- A commit attempt stopped on a branch mismatch and the policy must be restated.

## When not to use

- Verifying the change before committing - use `code-review-testing`.
- Fixing a failing test or build - use `auto-debugging`.
- Executing a long multi-step task plan that does not involve committing - use `autonomous-execution`.
- Secret handling and credential policy for commits - use `cursor-security-rules`.

## Required behavior

- Before committing, confirm the current branch is `main`.
- If the current branch is not `main`, stop and report the branch mismatch.
- Stage all changed, added, and deleted files only after verification is complete.
- Commit on `main` with a descriptive task-based message.
- Fetch `origin/main`, rebase `main` onto it, and push `main:main`.
- Never create merge commits.
- If fetch, rebase, commit, or push fails, stop and report the failure without
  discarding work.

## Configuration

The automation is driven by a `Stop` event hook defined in
`.agents/hooks.json` (repository root) that executes
`.agents/scripts/auto_commit.py`.

Self-verification: `bash tests/git-superpowers-contract.sh` asserts the policy
(main-only commits, rebase, push `main:main`, no merge commits) against the
script's behavior.

## Related skills

- `autonomous-execution` - structured execution of the task that precedes this commit step.
- `code-review-testing` - verification that must pass before committing.
- `cursor-security-rules` - secret-scanning gate that keeps credentials out of commits.
