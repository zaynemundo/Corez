---
name: productivity-connectors
description: Use only when concrete email, calendar, contacts, files, or collaboration connector tools are available; otherwise limit work to drafts and action plans and never claim a connected-service action occurred.
---

# Productivity Connectors

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
