---
name: productivity-connectors
description: Use when the request needs a real connector - send this email, add a calendar event, find a contact, search my inbox or cloud files, or summarize an email thread. Not for drafting message text with no connector available - use `writing-communication` instead.
---

# Productivity Connectors

## When to use

- The request touches email, calendar, contacts, or cloud files and asks for an
  action or a private-data lookup - "send this email", "add a calendar event",
  "find a contact", "search my inbox", "summarize this thread".
- A concrete connector tool is present and authorized, so a draft can become an
  executed action.
- The user wants a reviewable draft, meeting details, search query, or
  step-by-step action plan that a connector could execute later.

## When not to use

- Pure message or document drafting with no connector available - use
  `writing-communication`.
- Producing a schedule, reminder, or calendar specification without a real
  scheduler - use `scheduling-automation`.
- Building or changing the connector implementation itself - use
  `backend-architecture`.
- Reviewing and testing a connector change - use `code-review-testing`.

## Capability gate

This repository does not currently expose email, calendar, contacts, or cloud
file connector tools. Without a concrete connector tool result, this skill may
draft messages, meeting details, search queries, and step-by-step action plans,
but it cannot search private data or perform an external action.

When a future runtime provides a connector, inspect its supported operations
and authorization scope before using it. Tool availability, not the wording of
the request, determines whether an action can be executed.

## Operating rules
1. Confirm that a connector tool exists and is authorized before reading private data or promising an action.
2. Search broadly enough to disambiguate people, threads, dates, and projects before acting.
3. Read the relevant message, thread, event, or record before composing a contextual response.
4. Draft rather than send when the user asks for a draft or reviewable copy.
5. Send, delete, archive, forward, label, create, update, or respond only when the user clearly requests that action.
6. Summarise observed tool results and surface any partial failure.

## Guardrails
- Never invent an email address, attendee, event time, file, thread, or connector result.
- Never say an item was sent, scheduled, deleted, or updated without a successful connector response.
- Preserve recipients, threading, attachments, and calendar recurrence semantics.
- Apply least privilege and minimise exposure of private content in the final answer.
- Follow COREZ pending-action confirmation for destructive, sensitive, or costly operations.

## Related skills

- `writing-communication` - drafting the message copy this skill cannot send.
- `scheduling-automation` - schedule and reminder specs when no scheduler tool exists.
- `ask-env-values` - connector credentials or configuration that must be supplied.
