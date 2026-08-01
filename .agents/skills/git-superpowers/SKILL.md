---
name: git-superpowers
description: Use at task completion to commit verified work on the local main branch and push main to origin/main without merge commits.
---

# Git Superpowers Skill

Use this skill at the end of every repository task that leaves file changes.
The required policy is: commit verified work on the local `main` branch, then
push `main` to `origin/main`.

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
[hooks.json](file:///workspaces/New-Corez/.agents/hooks.json) that executes
[auto_commit.py](file:///workspaces/New-Corez/.agents/scripts/auto_commit.py).

Self-verification: `bash tests/git-superpowers-contract.sh` asserts the policy
(main-only commits, rebase, push `main:main`, no merge commits) against the
script's behavior.
