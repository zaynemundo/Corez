---
name: autonomous-execution
description: Guidance for executing tasks completely autonomously in agy auto-approve (YOLO) mode. Outlines strategies for structured plan execution, command guards, automated test validation, and context management.
---

# Autonomous Plan Execution

This skill provides a robust operational framework for the agent when running in auto-pilot or auto-approve mode (`agy --dangerously-skip-permissions`). Since you are running without step-by-step human verification, you must be extremely rigorous, self-correcting, and safety-conscious.

## 1. Safety & Command Validation
- **Dry-run verification**: Before executing commands that modify data, perform a dry-run or verify their impact (e.g., `git diff`, `git diff --check` for whitespace/conflict markers, `npm test` before deleting code).
- **Path containment**: Never target system directories outside the workspace (e.g., `/usr/bin`, `/etc`). Always use absolute paths within the workspace.
- **Process management**: When launching long-running processes (e.g., development servers), ensure they run in the background, monitor their output, and kill them cleanly when finished.

## 2. Iterative Development & Verification
- **Write-test-fix loop**: Apply changes in small, logical chunks. Immediately after modifying code:
  1. Run the project's test suite or test helper (`npm test`, `pytest`, etc.).
  2. Run the linter or compiler (`npm run build`, `tsc`, `eslint`) to catch syntax/type issues early.
  3. Inspect the diff (`git diff`) to confirm no unintended changes were introduced.
- **Verification criteria**: A task is only considered complete when all tests pass, the build succeeds, and the diff is clean.

## 3. Context & Token Management
- **Optimize view_file**: Avoid viewing entire large files. Use line range selectors to fetch only the relevant lines.
- **Avoid command loops**: Do not run the same command repeatedly (e.g., checking status in a loop). Rely on reactive wakeup or background task status.
- **Workspace hygiene**: Keep the workspace clean. Delete temporary scratch files (`scratch/`) or ensure they are ignored by git.

## 4. Execution Tracking
- **Interactive Plans**: Keep a checklist of tasks in a markdown plan file (e.g., in `docs/superpowers/plans/`). Check off steps as you complete them to maintain a clear trail of your progress.
- **Self-Healing**: If a task fails or encounters a blocker, pause and write a brief analysis of the failure in your thinking block, refine the plan, and proceed with the updated strategy.
