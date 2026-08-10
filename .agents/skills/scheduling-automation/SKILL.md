---
name: scheduling-automation
description: Use only when a real scheduler or automation tool is available; otherwise produce a precise schedule specification or reminder text without claiming background work was created.
---

# Scheduling & Automation

## Capability gate

CoreZ currently has no background reminder or recurring-job API. In this
repository, this skill can define a schedule, recurrence, notification rule,
and self-contained future-run prompt, but cannot create a durable automation.
Only execute scheduling when a concrete scheduler tool is present and returns
a successful task identifier.

## Workflow
1. Extract the task, schedule, timezone, recurrence, end condition, and notification criteria.
2. Resolve relative dates against the user's timezone and use explicit dates when ambiguity could matter.
3. Choose exact scheduling for named clock times, flexible scheduling for broad dayparts, and condition monitoring for event-triggered alerts.
4. Write the future-run instruction as a self-contained imperative with all durable constraints.
5. For condition monitoring, suppress notifications when the condition is not met.
6. If a scheduler tool exists, confirm its returned task identifier and normalized schedule. Otherwise label the result as a schedule specification only.

## Guardrails
- Do not promise background work unless an automation was successfully created.
- Do not schedule more frequently than the platform supports.
- Avoid duplicate tasks when an existing automation can be updated.
- For high-volatility subjects, include source verification and timestamp requirements in the automation prompt.
