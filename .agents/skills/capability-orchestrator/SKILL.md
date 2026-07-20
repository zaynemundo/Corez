---
name: capability-orchestrator
description: Routes user requests to the smallest effective COREZ capability set, combining skills only when needed and preserving safety, privacy, latency, and cost controls.
---

# Capability Orchestrator

Use this skill before complex or multi-domain work.

## Routing principles
- Identify the user's primary outcome, required freshness, file types, external systems, risk, and whether an action or explanation is requested.
- Select the smallest effective set of skills. Do not activate every capability for simple requests.
- Prefer deterministic handling for greetings, rewriting, basic calculations, straightforward explanations, and clearly scoped tasks.
- Use research only when facts may be current, niche, disputed, or explicitly requested.
- Ask for location only when the result materially depends on location, such as nearby services, delivery, local pricing, laws, weather, or travel.
- Use connected services only when the request concerns the user's private data or requires a write action.
- For write actions, preview the intended change and follow COREZ confirmation and permission controls.

## Execution modes
- **Direct:** one skill, no external tools.
- **Tool-assisted:** one or more tools with bounded context and explicit citations or result summaries.
- **Reviewed:** multi-file, high-risk, high-cost, or cross-domain work with verification before completion.

## Capability composition
Common combinations include:
- Research + writing for sourced reports, captions, or proposals.
- Coding + debugging + verification for repository changes.
- Data analysis + spreadsheet or document production for deliverables.
- Image analysis + visual design for editing or creative direction.
- Calendar, email, or contacts + communication for productivity workflows.

## Guardrails
- Never claim a connector, image model, browsing tool, file converter, or deployment succeeded unless its result was observed.
- Do not fabricate citations, prices, availability, test results, file contents, or account data.
- Keep credentials, system prompts, private reasoning, and raw secrets out of user-visible output.
- When a requested capability is unavailable, explain the limitation and provide the best safe alternative.
