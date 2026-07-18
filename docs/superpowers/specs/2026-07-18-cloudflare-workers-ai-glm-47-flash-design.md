# Cloudflare Workers AI GLM-4.7-Flash Substitution Design

## Goal

Replace the production Workers AI model `@cf/zai-org/glm-5.2` with
`@cf/zai-org/glm-4.7-flash` so hosted text generation works on the account's
Workers Free plan.

This document supersedes the production-model choice in the earlier GLM-5.2
design. The native Cloudflare Workers AI architecture remains unchanged.

## Scope

- Change the fixed model identifier in `worker/index.js`.
- Update `tests/cloudflare-worker-contract.mjs`,
  `tests/workers-ai-provider-contract.sh`, and
  `tests/public-ai-proxy-contract.sh` to require GLM-4.7-Flash and reject stale
  GLM-5.2 references in their explicitly scoped active files.
- Update `README.md` and `src/components/SettingsModal.jsx` copy shown to users.
- Preserve `/api/ai`, the `AI` binding, request validation, prompt construction,
  structured logging, sanitized error responses, and static asset handling.
- Preserve the successful response shape `{ content, model }`; only the model
  value changes to `@cf/zai-org/glm-4.7-flash`.

Historical design and implementation-plan files remain unchanged as records of
the earlier migration. Repository inspection found no model identifier in
Wrangler configuration, deployment workflows, frontend state, or environment
configuration, so those surfaces do not change.

## Runtime Flow

The browser continues to send `{ prompt, intent }` to `POST /api/ai`. The Worker
calls:

```js
env.AI.run('@cf/zai-org/glm-4.7-flash', { messages })
```

Cloudflare documents GLM-4.7-Flash's synchronous output as the same chat
completion envelope used by the current adapter. The adapter therefore
continues to read `choices[0].message.content`, trim it, and return the existing
JSON response contract. The request stays on the documented minimal `messages`
payload to avoid introducing unrelated sampling or token-limit changes during
the model substitution; Cloudflare's model defaults remain in effect.

## Testing and Deployment

The change follows a red-green cycle: update the model assertions first and
observe their expected failure against GLM-5.2, then change the active
production and documentation references. Run all shell contracts, Worker
behavior tests, intent evaluation gates, lint, build, and a Wrangler dry run.

After independent diff review, commit and push `main`, watch the GitHub Actions
deployment through Cloudflare publish, and make a real request to the hosted
`/api/ai` endpoint. Completion requires an HTTP 200 response identifying
`@cf/zai-org/glm-4.7-flash`.

## Source

- Cloudflare GLM-4.7-Flash model documentation:
  <https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/>
