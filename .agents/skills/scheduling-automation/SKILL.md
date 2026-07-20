---
name: scheduling-automation
description: Creates and manages one-time reminders, recurring deliveries, scheduled research, summaries, and condition-based monitoring with clear timing and notification behaviour.
---

# Scheduling & Automation

## Supported work
- One-time and recurring reminders.
- Daily, weekly, or custom summaries and reports.
- Scheduled research, inbox or project digests, market or news monitoring, and notifications when a condition becomes true.
- Run-now, pause, resume, edit, and history-aware automation workflows when supported by COREZ.

## Workflow
1. Extract the task, schedule, timezone, recurrence, end condition, and notification criteria.
2. Resolve relative dates against the user's timezone and use explicit dates when ambiguity could matter.
3. Choose exact scheduling for named clock times, flexible scheduling for broad dayparts, and condition monitoring for event-triggered alerts.
4. Write the future-run instruction as a self-contained imperative with all durable constraints.
5. For condition monitoring, suppress notifications when the condition is not met.
6. Confirm the resulting schedule and automation purpose without exposing internal scheduler syntax unless useful.

## Guardrails
- Do not promise background work unless an automation was successfully created.
- Do not schedule more frequently than the platform supports.
- Avoid duplicate tasks when an existing automation can be updated.
- For high-volatility subjects, include source verification and timestamp requirements in the automation prompt.
