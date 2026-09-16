---
name: verify
description: Use when launching CoreZ with wrangler dev and npm run dev, driving /api/ai, /api/image, or /api/memory, reproducing 429/503 or retry-scheduled responses, or checking rate limits and the 24 MB body cap. Not for isolated unit debugging - use `auto-debugging` instead.
---

# Verifying COREZ end-to-end

> Config note: worker config lives in `wrangler.jsonc` (not `wrangler.toml`) and the worker
> entry is `./worker/entry.js`. `wrangler dev` uses port 8787 by default.

## When to use

- Launching CoreZ locally (`npx wrangler dev --host localhost` plus `npm run dev`) to watch the app run.
- Driving `POST /api/ai`, `POST /api/image`, `/api/memory/*`, or `/api/apps/*` and checking real responses.
- Reproducing a runtime failure such as a 503, 429, or `retry-scheduled` response.
- Confirming the pre-built static path (`npm run build`, `npm run deploy`) before shipping.
- Validating gotchas such as the 24 MB body limit or the greeting short-circuit.

## When not to use

- Isolated stack-trace debugging with a reproduction script - use `auto-debugging`.
- Diff review or unit test coverage - use `code-review-testing`.
- Visual or art-direction inspection of the running screen - use `visual-creative`.
- Committing and pushing the verified result - use `git-superpowers`.

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

Requires a `.dev.vars` file (or env var) with `OPENCODE_GO_API_KEY`.
Chat uses OpenCode Go only — no DeepSeek or OpenRouter fallback for
`/api/ai` (disable with `OPENCODE_GO_DISABLED`). `OPENROUTER_API_KEY` is
only for image generation (`/api/image`).

### 2. Pre-built static + deployed worker

```bash
npm run build
npm run deploy   # deploys worker + dist assets to Cloudflare
```

## Drive

- Chat: open http://localhost:3000, send a message; watch Network for
  `POST /api/ai` returning `{content, model}` (chat is `opencode:deepseek-flash` only).
- Images: prompts matching the image intent hit `POST /api/image` and
  return `{image, model}` — the OpenRouter path uses
  `google/gemini-3.1-flash-lite-image` (`OPENROUTER_IMAGE_MODEL` overrides)
  and reports the model that served the image (R2 URL when `ASSET_BUCKET`
  is configured; honest 503 without `OPENROUTER_API_KEY`). `POST /api/image/cf`
  is the keyless Workers AI path (`flux-2-klein-4b` primary, `flux-1-schnell`
  fallback) and needs the `AI` binding.
- Memory/apps: `/api/memory/*` and `/api/apps/*` require the `ASSET_BUCKET`
  binding (503/530 without it); `wrangler dev` only provides real R2 with
  `--remote` and a deployed bucket.

## Automated verification (fast feedback)

```bash
npm run lint
npm test                              # 1,000+ unit tests
npm run test:cloudflare               # all worker + contract suites
npm run build
```

## Gotchas

- Greeting prompts ("hello") short-circuit in the worker with
  `model: 'corez-greeting'` — no LLM call.
- Request bodies over 24 MB are rejected (`Request body rejected: ...
  byte limit`); the frontend trims history, so this only appears from raw
  API calls.
- The public `/api/ai` path no longer routes to a multi-agent swarm
  (`worker/entry.js`). The creation harness runs a parallel specialist
  pre-pass for non-fast-path website/app builds when `AI_SWARM_ENABLED` is
  not false (`worker/harness.js`, `worker/swarm.js`).
- `/api/ai` transient provider failures (429/5xx/network) are retried with
  adaptive backoff; when one request's practical window is exceeded the
  worker returns `200 {taskId, status: "retry-scheduled",
  retryAfterSeconds}` and resending the same messages resumes the task.
- `/api/ai` and `/api/image` are rate limited per client IP
  (20/min and 30/min; HTTP 429 with `Retry-After`).

## Related skills

- `auto-debugging` - isolation of a failure before this end-to-end pass.
- `code-review-testing` - unit and static checks that precede runtime verification.
- `git-superpowers` - commits the verified state on `main`.
