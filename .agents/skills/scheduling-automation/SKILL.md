---
name: scheduling-automation
description: Use when the user asks to schedule a task, set a reminder, run something later, on a recurrence, or when a condition is met, and a concrete scheduler tool is available. Not for ordinary email or calendar coordination - use `productivity-connectors` instead.
---

# Scheduling & Automation

## When to use
- The user asks to schedule a task, set a reminder, or run something later.
- A recurring job, notification rule, or condition-based alert is requested.
- A precise schedule specification or future-run prompt must be produced when no scheduler tool exists.

## When not to use
- Ordinary email or calendar coordination without a scheduler tool - use `productivity-connectors` instead.
- A one-off current value such as time, weather, or scores - use `live-utilities` instead.
- Wording the reminder message itself - use `writing-communication` instead.

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

## Verification
- If a scheduler tool exists, confirm the returned task identifier and normalized schedule before claiming the automation was created.
- If no scheduler tool exists, confirm the result is labelled as a schedule specification only.

## Related skills
- `productivity-connectors` - email, calendar, and collaboration connectors when those tools exist.
- `live-utilities` - one-off current time, date, and weather values.
- `writing-communication` - wording for reminder text and notifications.
