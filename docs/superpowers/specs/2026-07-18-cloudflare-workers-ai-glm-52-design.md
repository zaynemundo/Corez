# Cloudflare Workers AI GLM-5.2 Design

**Date:** 2026-07-18

## Goal

Replace Corez's OpenRouter text-generation path with Cloudflare Workers AI and
the fixed model `@cf/zai-org/glm-5.2`. The deployed application becomes
Cloudflare-only for hosted text generation and no longer requires an external
provider key.

## Scope

This migration covers the production Worker, frontend text-generation client,
settings UI, active documentation, live evaluation path, and provider contract
tests. It removes the obsolete Vercel-compatible OpenRouter handler.

Historical design and implementation records under `docs/superpowers/` and
`.superpowers/` remain unchanged because they describe completed prior work.
The local intent classifier and deterministic local response fallback remain
unchanged except for provider-neutral naming at their integration boundary.

## Architecture

`wrangler.jsonc` declares a native Workers AI binding named `AI`. The Worker
handles `POST /api/ai`, validates the existing prompt and inferred intent, and
calls:

```js
env.AI.run('@cf/zai-org/glm-5.2', input)
```

The model identifier is fixed server-side. Public users cannot choose an
arbitrary model, and the Worker does not read API keys, account IDs, provider
URLs, or model environment variables.

The frontend calls `/api/ai`. It continues to infer intent locally before the
request and falls back to `generateLocalAIResponse()` when the hosted request
fails. The settings modal no longer contains a provider model field; its
conversation-history controls remain.

The former `api/openrouter.js` Vercel handler is deleted. `/api/openrouter` is
not retained as an alias because the deployment target is Cloudflare-only and
the route is an internal frontend contract deployed with the same application.

## Request and Response Contract

The request is:

```json
{
  "prompt": "Build a timer",
  "intent": {
    "type": "app",
    "summary": "Create a timer app."
  }
}
```

`prompt` must be a non-empty string after trimming. `intent` is optional and is
used only to enrich the system prompt and select a completion limit. Incoming
`model` fields are ignored rather than executed, preventing clients from
selecting another hosted model.

A successful response preserves the current consumer-friendly shape:

```json
{
  "content": "Generated text",
  "model": "@cf/zai-org/glm-5.2"
}
```

The Worker sends system and user messages. It retains the existing Corez system
prompt, a temperature of `0.72`, and larger output allowance for app-generation
intent. It uses GLM-5.2's current parameter names from Cloudflare's documented
schema, including `max_completion_tokens` instead of deprecated `max_tokens`.
Reasoning effort is fixed to `high` in code rather than supplied by an
environment variable. Completion limits remain `3200` tokens for app intent and
`1800` tokens for all other intent types.

The response adapter reads the documented GLM-5.2 chat-completion output and
extracts the first assistant message. Empty or malformed model output is an
upstream failure and is never presented as a successful blank answer.

## Error Handling

- Non-`POST` requests to `/api/ai` return `405` JSON.
- Malformed JSON returns `400` JSON.
- A missing or blank prompt returns `400` JSON.
- A missing or unusable `AI` binding returns a safe `503` JSON response.
- A model exception returns a safe `502` JSON response without exposing binding
  details, prompts, credentials, or stack traces.
- An empty or malformed model result returns `502` JSON.
- Unknown `/api/*` routes continue to return `404` JSON.
- Non-API requests continue through the `ASSETS` binding.

The frontend logs a provider-neutral warning and uses the existing local
fallback after any non-success response or request failure.

## Configuration and Secrets

`wrangler.jsonc` gains:

```jsonc
"ai": {
  "binding": "AI"
}
```

No new environment variable or secret is required. Active documentation stops
instructing operators to configure `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, or
`OPENROUTER_REASONING_EFFORT`. The repository-local environment-value skill is
updated so it does not claim that Corez requires those values.

## Testing

Implementation follows test-driven development.

1. Update the Worker behavior contract first so its environment supplies a fake
   `AI.run` binding. Assert the exact model ID, system/user messages, parameter
   names, intent-dependent completion limit, response normalization, and safe
   failures. Run it and confirm it fails against the OpenRouter implementation.
2. Update provider/configuration contract tests first to require `/api/ai`, the
   Wrangler AI binding, fixed GLM-5.2 naming, no active OpenRouter secret or
   endpoint, no model selector, and preserved local fallback. Confirm failure.
3. Implement the minimum production changes needed to pass those tests.
4. Update the live evaluation path to target the Cloudflare Worker rather than
   importing the deleted Vercel handler. Live evaluation must require an
   explicitly supplied deployment URL and must not invent one. This optional
   network check remains separate from deterministic local verification.
5. Run the complete contract suite, lint, local intent evaluation, production
   build, and Wrangler configuration/type validation.

## Documentation

The README describes Corez as using native Cloudflare Workers AI with
GLM-5.2, explains that no provider API key is required, documents `/api/ai`, and
retains the existing Cloudflare build and deployment commands.

## Acceptance Criteria

- Production text generation calls `env.AI.run('@cf/zai-org/glm-5.2', ...)`.
- The frontend uses `/api/ai` and falls back locally on failure.
- The successful JSON response remains `{ content, model }`.
- Active runtime code, UI, tests, and README contain no OpenRouter provider
  configuration or endpoint dependency.
- `api/openrouter.js` is removed and `/api/openrouter` is not served.
- `wrangler.jsonc` declares the `AI` binding.
- No new secret or runtime environment value is required.
- All applicable deterministic tests, linting, local evaluation, build, and
  Wrangler validation pass.

## Current Documentation Basis

- Cloudflare Workers AI binding:
  <https://developers.cloudflare.com/workers-ai/configuration/bindings/>
- Cloudflare GLM-5.2 model:
  <https://developers.cloudflare.com/workers-ai/models/glm-5.2/>
- Cloudflare Workers best practices:
  <https://developers.cloudflare.com/workers/best-practices/workers-best-practices/>
