---
name: superpowers
description: Use when delegating parallel or complex subtasks to subagents, running subagent-driven development, or executing a markdown plan task-by-task with checkbox progress tracking. Not for autonomous runs without a plan - use `autonomous-execution` instead.
---

# Superpowers Skill

The `superpowers` skill equips the agent with advanced orchestration and execution abilities, specifically:
1. **Subagent-Driven Development (`superpowers:subagent-driven-development`)**: Spawn and orchestrate specialized subagents to tackle parallel or complex subtasks.
2. **Plan Execution (`superpowers:executing-plans`)**: Follow a structured markdown plan task-by-task, tracking progress using checkbox (`- [ ]` / `- [x]`) syntax, and updating the plan file dynamically.

## When to use

- Spawning subagents for parallel or complex subtasks.
- Delegating with focused prompts, bounded context, and named files.
- Executing a structured markdown plan task-by-task.
- Tracking progress with `- [ ]` / `- [/]` / `- [x]` checkbox syntax.

## When not to use

- Running fully autonomously without a plan or human checkpoints - use `autonomous-execution` instead.
- Long-horizon work needing a workspace ledger and ship checks - use `corez` instead.
- Writing or reviewing the code a subagent will implement - use `software-engineering` instead.
- Launching and probing a running app for runtime proof - use `verify` instead.

## 1. Subagent-Driven Development (`superpowers:subagent-driven-development`)

When implementing complex features or parallelizable tasks, delegate to specialized subagents using the `task` tool (subagent types such as `general`, `engine-programmer`, `gameplay-programmer`, `ui-programmer`, `code-reviewer`, `qa-tester`, `explore`, or `web-search`). The available subagent types are listed by the environment; pick the narrowest type that can complete the job.

### Guidelines for Subagent Orchestration
- **Define Clear Prompts**: Give the subagent a focused, unambiguous goal and clear inputs/outputs; state whether it is analysis-only or authorised to edit, and name the exact files it may touch.
- **Bounded Context**: Pass only the task-relevant context (task, role, goal, allowed files, acceptance criteria) — never dump full conversation history.
- **Avoid Polling**: Once spawned, do not query the subagent's status in a loop. Allow the system to notify you upon subagent completion.
- **Handoff Integration**: Integrate the subagent's deliverables into the primary workspace and final synthesis, then critically review the returned diff before accepting it.

---

## 2. Plan Execution (`superpowers:executing-plans`)

For multi-step or multi-task operations, use a structured plan (such as those in `docs/superpowers/plans/`) and track progress in real-time.

### Guidelines for Plan Tracking
- **Checklist Syntax**: Keep track of the current status of each sub-task using:
  - `- [ ]` for pending tasks
  - `- [/]` for current focus (in progress)
  - `- [x]` for successfully completed tasks
- **Atomic Updates**: Modify the plan file after completing each step to keep the workspace and user informed.
- **Verification**: Run tests or verification commands at the end of each task to ensure correctness before checking it off.

---

## Verification

- Run `npm test`, `npm run lint`, and `npm run build` before checking off a plan step or accepting a subagent deliverable.

## Related skills

- `autonomous-execution` - operating model for unattended, no-approval runs.
- `corez` - ledger and ship checks for long-horizon tasks.
- `git-superpowers` - commits verified work on `main` at task completion.
