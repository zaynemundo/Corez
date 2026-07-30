---
name: verify
description: How to launch and drive COREZ end-to-end for runtime verification
---

# Verifying COREZ end-to-end

## Launch

Chat persistence (threads/tasks API) requires PostgreSQL, and the owner login
comes from env vars. A disposable stack that works in this codespace:

```bash
docker run -d --name relay-verify-pg -e POSTGRES_PASSWORD=verify \
  -e POSTGRES_DB=relay -p 5433:5432 postgres:16-alpine

RELAY_PROVIDER=codex \
RELAY_WORKER_MODEL=gpt-5.5 RELAY_LEAD_MODEL=gpt-5.5 \
RELAY_FREE_FALLBACK_MODEL=gpt-5.5 RELAY_AUTHENTICATED_MODEL=gpt-5.5 \
DATABASE_URL='postgres://postgres:verify@127.0.0.1:5433/relay' \
RELAY_ADMIN_USERNAME=verifyowner RELAY_ADMIN_PASSWORD='verify-pass-123456' \
npm run dev   # run in background; web on :5000, API proxied to :4317
```

Gotchas:
- The default models (`deepseek/…`) are rejected by a ChatGPT-account Codex
  login — override all four model vars as above. `~/.codex/auth.json` is the
  codex credential; `RELAY_PROVIDER=codex` is required or the server stays in
  demo mode (default provider is openrouter, which needs a key).
- Without `DATABASE_URL`, `POST /api/threads/:id/tasks` returns 503.

## Drive

- Login: `POST /api/auth/login` with the admin username/password; keep the
  cookie. The SPA reads the token from `localStorage["relay:auth-token"]`.
- Routing checks: `POST /api/route {prompt}` (owner-only) returns
  `{"kind":"general"|"workspace"}` deterministically for prototype prompts.
- Chat flow: `POST /api/threads` → `POST /api/threads/:id/tasks
  {prompt, context:[]}` → poll `GET /api/tasks/:id`; general answers arrive as
  `chat.chunk` events (concatenate their `text`).
- UI: Playwright is in the repo's node_modules
  (`import ... from "/workspaces/New-Corez/node_modules/playwright/index.mjs"`,
  chromium already installed). Artifact previews render in
  `.artifact-iframe`, sandboxed without `allow-same-origin`, so the frame DOM
  is unreachable from the parent — interact by mouse coordinates and verify
  via screenshots. Artifact cards are `.artifact-bubble-card`; the side panel
  download button is `button[title="Download App"]`.

## Cleanup

`pkill -f "tsx watch server/index.ts"; pkill -f vite;
docker rm -f relay-verify-pg`
