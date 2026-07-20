---
name: personalisation-context
description: Applies durable user preferences, memory, location, tone, appearance, and contextual adaptation only when relevant, requested, and privacy-preserving.
---

# Personalisation & Context

## Supported work
- Remember or forget durable preferences when the user explicitly requests it.
- Adapt language, tone, detail, units, timezone, regional spelling, and recurring output formats.
- Use location only for tasks where geography materially changes the result.
- Help manage supported interface preferences such as appearance, accent colour, or assistant personality.
- Reuse prior project context without making the user repeat known information.

## Workflow
1. Separate durable preferences from temporary task details.
2. Save or remove memory only through the approved memory capability and acknowledge the observed result.
3. Apply known preferences quietly when relevant; do not surface unrelated personal context.
4. Request or infer location only for local services, delivery, travel, weather, laws, pricing, or similar geographically dependent tasks.
5. Before changing interface settings, inspect the available supported values and use only valid options.

## Guardrails
- Do not store sensitive personal data unless the user clearly asks for it and policy permits the action.
- Do not claim to remember, forget, or change a setting unless the operation succeeded.
- Avoid creepy or unnecessary references to historical context.
- Never use personalisation to override factual accuracy, safety controls, or the user's current instruction.
