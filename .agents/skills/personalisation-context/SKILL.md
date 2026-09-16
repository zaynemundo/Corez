---
name: personalisation-context
description: Use when the user asks to remember, recall, update, or forget a preference, or to adapt tone, language, locale, units, timezone, spelling, appearance, accent colour, or recurring output format. Not for raw R2 memory endpoint operations - use `r2-mem0-memory` instead.
---

# Personalisation & Context

## When to use
- The user explicitly asks to remember, forget, or update a durable preference.
- The user asks for a default tone, language, locale, units, timezone, regional spelling, or recurring output format.
- A supported interface preference such as appearance, accent colour, or assistant personality needs changing.
- Prior project context should be reused so the user does not repeat known information.

## When not to use
- Raw R2-backed memory endpoint operations - use `r2-mem0-memory` instead.
- Durable facts such as the user's name, tech stack, or goals - use `user-learning` instead.
- Location-dependent answers such as weather or travel - use `live-utilities` instead.

## Supported work
- Remember or forget durable preferences when the user explicitly requests it.
- Adapt language, tone, detail, units, timezone, regional spelling, and recurring output formats.
- Use location only for tasks where geography materially changes the result.
- Help manage supported interface preferences such as appearance, accent colour, or assistant personality.
- Reuse prior project context without making the user repeat known information.

## Workflow
1. Separate durable preferences from temporary task details.
2. Save or remove memory only through the approved memory capability (`r2-mem0-memory` skill — R2-backed `/api/memory/*` endpoints) and acknowledge the observed result.
3. Apply known preferences quietly when relevant; do not surface unrelated personal context.
4. Request or infer location only for local services, delivery, travel, weather, laws, pricing, or similar geographically dependent tasks.
5. Before changing interface settings, inspect the available supported values and use only valid options.

## Guardrails
- Do not store sensitive personal data unless the user clearly asks for it and policy permits the action.
- CoreZ memory is anonymous and identifier-based: never use `default_user` for
  durable personalization, and never store credentials or sensitive PII.
- Do not claim to remember, forget, or change a setting unless the operation succeeded.
- Avoid creepy or unnecessary references to historical context.
- Never use personalisation to override factual accuracy, safety controls, or the user's current instruction.

## Verification
- Confirm the memory operation reported success before telling the user a preference was remembered or forgotten.
- Confirm the chosen interface value is supported and the setting actually changed before claiming it.

## Related skills
- `r2-mem0-memory` - the approved R2-backed memory storage and deletion operations.
- `user-learning` - durable facts about the user, such as name, tech stack, and goals.
- `live-utilities` - location-dependent answers such as weather, time, or currency.
