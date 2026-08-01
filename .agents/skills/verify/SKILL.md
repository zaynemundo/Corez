---
name: verify
description: How to launch and drive COREZ end-to-end for runtime verification
---

# Verifying COREZ end-to-end

> Config note: worker config lives in `wrangler.jsonc` (not `wrangler.toml`) and the worker
> entry is `./worker/swarm-index.js`. `wrangler dev` uses port 8787 by default.

## Launch

CoreZ is a Vite SPA + Cloudflare Worker. Two ways to verify locally:

### 1. Fully local (no Cloudflare)

```bash
# Terminal A: worker on :8787 (serves /api/ai, /api/image, /api/market,
# /api/apps, /api/memory, /api/assets)
DEEPSEEK_API_KEY=sk-... npx wrangler dev

# Terminal B: Vite dev server on :3000 (proxies /api/* to :8787)
npm run dev
```

Requires a `.dev.vars` file (or env var) with at least one AI provider key.
Provider chain: DeepSeek (`DEEPSEEK_API_KEY`) -> OpenCode Go
(`OPENCODE_GO_API_KEY`) -> OpenRouter (`OPENROUTER_API_KEY`) -> Workers AI
binding (wrangler dev provides a real `AI` binding only when authenticated).

### 2. Pre-built static + deployed worker

```bash
npm run build
npm run deploy   # deploys worker + dist assets to Cloudflare
```

## Drive

- Chat: open http://localhost:3000, send a message; watch Network for
  `POST /api/ai` returning `{content, model}` (model names the provider,
  e.g. `deepseek:deepseek-v4-flash`).
- Images: prompts matching the image intent hit `POST /api/image` and
  return `{image}` (R2 URL when `ASSET_BUCKET` is configured).
- Market: `POST /api/market` requires `TWELVE_DATA_API_KEY` (returns 503
  `not_configured` without it).
- Memory/apps: `/api/memory/*` and `/api/apps/*` require the `ASSET_BUCKET`
  binding (503/530 without it); `wrangler dev` only provides real R2 with
  `--remote` and a deployed bucket.

## Automated verification (fast feedback)

```bash
npm run lint
npm test                              # 626+ unit tests
npm run test:cloudflare               # all worker + contract suites
npm run build
```

## Gotchas

- Greeting prompts ("hello") short-circuit in the worker with
  `model: 'corez-greeting'` — no LLM call.
- Request bodies over 256 KB are rejected (`Request body rejected: ...
  byte limit`); the frontend trims history, so this only appears from raw
  API calls.
- The swarm path only activates for `complexity: high/epic` app/code-help
  requests or explicit `swarm: true`; it fans out to the same provider key.
- `/api/ai` and `/api/image` are rate limited per client IP
  (20/min and 30/min; HTTP 429 with `Retry-After`).
