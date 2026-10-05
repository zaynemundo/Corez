---
name: cloudflare-platform
description: Use when deploying, configuring, or debugging this project on Cloudflare Workers - wrangler commands, the wrangler.jsonc bindings (KV, D1, R2, Durable Objects, Workers AI), worker logs, limits, or secrets. Not for the CoreZ-specific API contract - use `backend-architecture`; not for D1 table and column changes - use `d1-schema-migrations`.
---

# Cloudflare Platform Operations

Platform-level facts for **this** deployment. Prefer these over generic
Cloudflare guidance, and confirm deployed state from `wrangler` output rather
than from memory.

## When to use

- "Deploy this", "why is the worker returning 503?", "which binding holds X?"
- Changing `wrangler.jsonc`, bindings, routes, or compatibility settings.
- Reading worker logs, tailing, or investigating a platform limit.

## When not to use

- The CoreZ route/response contract, validation, or caching policy - use
  `backend-architecture`.
- Creating or migrating D1 tables and columns - use `d1-schema-migrations`.
- Model/provider routing and token budgets - use `ai-infrastructure`.

## Deployment

| Task | Command |
|---|---|
| Production deploy | `npm run deploy` (`vite build` then `wrangler deploy`) |
| Local worker | `npm run dev:worker` (`npm run build` then `wrangler dev --host localhost`) |
| SPA dev server | `npm run dev` (Vite) |

`--host localhost` is not optional for local work: without it the custom-domain
route redirects every request. `wrangler dev` listens on its default port 8787.

Configuration is `wrangler.jsonc` — **not** `wrangler.toml`. The worker entry is
`./worker/entry.js`, and `wrangler.jsonc` is the source of truth for it; read the
`main` field rather than assuming a path.

## Bindings

| Binding | Kind | Name / detail |
|---|---|---|
| `ASSET_BUCKET` | R2 | bucket `corez-assets`; built assets, uploads, **and domain records** |
| `DB` | D1 | database `corez-auth`; auth, chats, memories, subscriptions, usage, analytics |
| `INSPIRATION_CACHE` | KV | cached inspiration payloads (`worker/inspiration.js`) |
| `GAME_ROOMS` | Durable Object | class `GameRoom`; multiplayer game rooms |
| `AI` | Workers AI | `/api/image/cf`, `/api/rerank`, `/api/embed` |
| `ASSETS` | Static assets | built SPA in `./dist`, `run_worker_first` |

Only one KV namespace is bound. Reuse `INSPIRATION_CACHE` rather than binding a
second one, and never cache metered or user-specific responses (`/api/ai`,
`/api/image`, `/api/memory`).

Not every persisted record is D1: `worker/customDomains.js` keeps domain records
as **R2 objects** in `ASSET_BUCKET` on purpose, so a per-request lookup is a
direct `get()` instead of a query.

## Secrets

- `OPENCODE_GO_API_KEY` — powers chat.
- `OPENROUTER_API_KEY` — only for `/api/image`.

Never ask a public app user for either, and never write a secret value into code,
a log, or a response. See `ask-env-values` for how to request a missing value.

## Honesty rules

- State a limit, price, or model availability only when it came from Cloudflare
  docs or from real `wrangler`/worker output. Do not recall them.
- Claim a deploy or binding succeeded **only** after a successful `wrangler
  deploy` exit code. A dashboard value you did not read is not evidence.
- The Cloudflare MCP servers (observability, bindings, builds, docs) confirm
  deployed state read-only. Never mutate production through them.

## Verification

```bash
bash tests/cloudflare-worker-config-contract.sh
```

That contract asserts the `wrangler.jsonc` shape and the entrypoint, and it runs
inside `npm run test:cloudflare` along with the other worker contracts.

## Related skills

- `backend-architecture` — route, validation, caching, and response contracts.
- `d1-schema-migrations` — table and column changes, runtime `ensure*` DDL.
- `ai-infrastructure` — provider chain, Workers AI usage, rerank and embed.
- `ask-env-values` — how to ask the user for a missing secret.
