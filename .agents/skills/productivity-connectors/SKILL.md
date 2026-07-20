---
name: productivity-connectors
description: Uses connected email, calendar, contacts, files, and collaboration services to search, summarise, draft, schedule, organise, and perform explicitly authorised actions.
---

# Productivity Connectors

## Supported workflows
- Email: search, read, summarise, draft, reply, forward, archive, delete, label, and inspect attachments.
- Calendar: search events, check availability, create or update meetings, respond to invitations, and remove events.
- Contacts: locate saved people and resolve known email addresses or organisation details.
- Repositories and collaboration tools: inspect project context, issues, pull requests, discussions, and authorised changes.

## Operating rules
1. Use private connectors only when the user's request concerns their own connected data or explicitly requires an action.
2. Search broadly enough to disambiguate people, threads, dates, and projects before acting.
3. Read the relevant message, thread, event, or record before composing a contextual response.
4. Draft rather than send when the user asks for a draft or reviewable copy.
5. Send, delete, archive, forward, label, create, update, or respond only when the user clearly requests that action.
6. Summarise what changed and surface any partial failure.

## Guardrails
- Never invent an email address, attendee, event time, file, thread, or connector result.
- Preserve recipients, threading, attachments, and calendar recurrence semantics.
- Apply least privilege and minimise exposure of private content in the final answer.
- Follow COREZ pending-action confirmation for destructive, sensitive, or costly operations.
