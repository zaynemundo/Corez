---
name: git-superpowers
description: Automates git committing and pushing to main branch without merge commits upon task completion.
---

# Git Superpowers Skill

This skill activates Git automation superpowers for the agent.

## Features
- **Auto-Commit on Completion**: Automatically stages all changed, added, or deleted files, commits them, and pushes them to the remote `main` branch when the agent terminates or finishes a task.
- **Merge Prevention**: Employs `git fetch origin main` followed by `git rebase origin/main` to keep the commit history clean and linear, completely avoiding merge commits.
- **Smart Commit Messages**: Automatically reads the agent's task execution transcript to craft descriptive commit messages based on the user's actual prompt and goal.
- **Safety Fallback**: If a conflict occurs during rebase or if a push fails, the hook safely aborts the rebase and prompts the user to resolve the conflict manually, ensuring zero code loss.

## Configuration
The automation is driven by a `Stop` event hook defined in [hooks.json](file:///workspaces/New-Corez/.agents/hooks.json) that executes [auto_commit.py](file:///workspaces/New-Corez/.agents/scripts/auto_commit.py).
