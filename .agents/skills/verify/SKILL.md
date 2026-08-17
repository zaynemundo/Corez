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
# Terminal A: worker on :8787 (serves /api/ai, /api/image,
# /api/apps, /api/memory, /api/assets, /api/publish, /api/game/ws)
# --host localhost is REQUIRED: the custom-domain routes in wrangler.jsonc
# otherwise make wrangler dev redirect every request (301 to itself).
OPENCODE_GO_API_KEY=sk-... npx wrangler dev --host localhost

# Terminal B: Vite dev server on :3000 (proxies /api/* to :8787)
npm run dev
```

Requires a `.dev.vars` file (or env var) with the OpenCode Go provider key.
Provider fallback chain (OpenCode Go is preferred and stays preferred):
1. OpenCode Go (`OPENCODE_GO_API_KEY` / `OPENCODE_API_KEY`)
2. Official DeepSeek API (`DEEPSEEK_API_KEY`)
3. OpenRouter (`OPENROUTER_API_KEY`, also the FLUX 1 Schnell image provider)

Fallbacks are tried only when the preferred provider cannot serve; each can
be disabled with `OPENCODE_GO_DISABLED` / `DEEPSEEK_DISABLED` /
`OPENROUTER_DISABLED`.

### 2. Pre-built static + deployed worker

```bash
npm run build
npm run deploy   # deploys worker + dist assets to Cloudflare
```

## Drive

- Chat: open http://localhost:3000, send a message; watch Network for
  `POST /api/ai` returning `{content, model}` (model names the provider,
  e.g. `opencode:deepseek-v4-flash`, `deepseek:deepseek-v4-flash`,
  `openrouter:deepseek-v4-flash`).
- Images: prompts matching the image intent hit `POST /api/image` and
  return `{image, model}` — the worker tries an image model chain (Google
  Nano Banana 2 first, legacy FLUX last; `OPENROUTER_IMAGE_MODEL` overrides)
  and reports the model that served the image (R2 URL when `ASSET_BUCKET`
  is configured; honest 503 without `OPENROUTER_API_KEY`).
- Memory/apps: `/api/memory/*` and `/api/apps/*` require the `ASSET_BUCKET`
  binding (503/530 without it); `wrangler dev` only provides real R2 with
  `--remote` and a deployed bucket.

## Automated verification (fast feedback)

```bash
npm run lint
npm test                              # 850+ unit tests
npm run test:cloudflare               # all worker + contract suites
npm run build
```

## Gotchas

- Greeting prompts ("hello") short-circuit in the worker with
  `model: 'corez-greeting'` — no LLM call.
- Request bodies over 24 MB are rejected (`Request body rejected: ...
  byte limit`); the frontend trims history, so this only appears from raw
  API calls.
- The swarm path only activates for `complexity: high/epic` app/code-help
  requests or explicit `swarm: true`; it fans out to the same provider key.
- `/api/ai` transient provider failures (429/5xx/network) are retried with
  adaptive backoff; when one request's practical window is exceeded the
  worker returns `200 {taskId, status: "retry-scheduled",
  retryAfterSeconds}` and resending the same messages resumes the task.
- `/api/ai` and `/api/image` are rate limited per client IP
  (20/min and 30/min; HTTP 429 with `Retry-After`).
