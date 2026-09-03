---
name: user-learning
description: Use when the user asks CoreZ to remember, recall, update, or forget durable facts about them — name, preferences, tech stack, project context, and goals; privacy-preserving and explicit-consent only.
---

# User Learning

CoreZ learns about the user across sessions so answers stay relevant without
asking twice. Learning is always explicit-consent and privacy-preserving, and
it builds on `personalisation-context` (policy) + `r2-mem0-memory` (storage).

## When to use

- User says remember/learn: "remember I prefer dark mode", "learn about me",
  "my name is Ada", "I use React + Vite", "my project is a 2D platformer".
- User asks recall: "what do you know about me?", "what are my preferences?".
- User asks forget: "forget my theme", "delete everything you know about me".
- A durable preference repeats (tone, units, locale, stack, workflow) and is
  worth offering to save — offer first, never save silently.
- Apply a saved fact quietly when it is relevant to the current task.

## What may be learned

- Identity basics the user states: name, role, timezone, locale, units.
- Preferences: tone, detail level, theme, accent colour, output formats.
- Technical profile: languages, frameworks, runtimes, editors, repo conventions.
- Project context: active project, goals, constraints, milestones.
- Never learn: passwords, tokens, API keys, exact street addresses,
  government IDs, health conditions, financial account numbers, or any
  secret — refuse and suggest a placeholder instead.

## Workflow

1. Separate durable facts from temporary task details. Only durable facts
   are candidates for memory.
2. If the request is ambiguous ("remember this"), ask what exactly to keep
   and for how long before storing.
3. Store, search, list, or delete only through `src/services/userLearningService.js`
   (R2-backed `/api/memory/*` endpoints). A memory counts as saved only
   after a 2xx response with the expected `success`, `userId`, and `key`.
4. Require an unguessable per-user identifier. Never use `default_user` for
   durable personal memory and never describe the endpoint as authenticated
   user storage.
5. Apply known facts quietly when relevant; do not surface unrelated context.
6. On "what do you know about me", list stored categories and texts only —
   never invent facts that are not in memory.
7. On forget, delete the matching key(s) and confirm what was removed.
   "Delete everything" deletes every key for that userId after confirmation.

## Guardrails

- No silent learning: an offered save happens only after the user confirms.
- No sensitive data (see list above) even if the user insists on storing a
  real secret — offer a reference label instead.
- Do not claim to remember, recall, or forget unless the operation succeeded.
- Recall is keyword-based (substring over `text`, `key`, `category`);
  the worker reports `embeddingStored: false`, so never claim semantic recall.
- Never let memory override factual accuracy, safety controls, or the
  user's current instruction.
- Keep acknowledgements short: what was saved, under which category, and
  how to remove it.
