# Cloudflare Worker OpenRouter Design

## Goal

Deploy Corez as a Cloudflare Worker that serves the existing Vite SPA and
handles `POST /api/openrouter` server-side with the existing Cloudflare runtime
secret. The public URL remains `https://new-corez.zayne-mayo.workers.dev/`, and
the OpenRouter API key is never exposed to the browser or committed to Git.

## Current Failure

The production Worker currently serves only the contents of `dist`. A request
to `GET /api/openrouter` receives the SPA HTML, while a request to
`POST /api/openrouter` receives `405 Method Not Allowed`. The repository's
`api/openrouter.js` uses a Vercel-style handler and `process.env`, so the current
Cloudflare deployment does not execute it.

## Architecture

Add a native module Worker at `worker/index.js`. Its default `fetch(request,
env)` handler owns `/api/openrouter`; all other paths are delegated to the
`ASSETS` binding with `env.ASSETS.fetch(request)`.

Add `wrangler.jsonc` with:

- Worker name `new-corez`.
- Main module `./worker/index.js`.
- Compatibility date `2026-07-18`.
- Static asset directory `./dist` and binding name `ASSETS`.
- SPA fallback through `not_found_handling: "single-page-application"`.
- Worker-first routing only for `/api/*`.

Keep `api/openrouter.js` for compatibility with Vercel-style hosting. The new
Cloudflare handler will preserve its externally visible request and response
contract rather than changing the frontend.

## API Behavior

`POST /api/openrouter` accepts JSON containing:

- `prompt`: required, non-empty string.
- `model`: optional non-empty string selected by the Corez settings UI.
- `intent`: optional object used to construct the system prompt and token
  allowance.

The Worker reads these runtime bindings:

- `OPENROUTER_API_KEY`: required secret. If absent, return status `503` with a
  generic configuration error.
- `OPENROUTER_MODEL`: optional server model fallback.
- `OPENROUTER_REASONING_EFFORT`: optional reasoning setting. Accepted values
  are `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`.

Model precedence remains request model, then `OPENROUTER_MODEL`, then
`deepseek/deepseek-v4-flash`. Reasoning effort defaults to `xhigh`; invalid
configured values also fall back to `xhigh`.

The Worker calls `https://openrouter.ai/api/v1/chat/completions` with the same
system prompt, temperature, reasoning effort, and token limits as the existing
handler. It returns `{ "content": string, "model": string }` on success.

## Error Handling and Security

- Non-POST requests to `/api/openrouter` return JSON status `405`.
- Missing prompts or malformed JSON return JSON status `400`.
- Missing server secrets return JSON status `503` without naming or exposing
  secret values.
- OpenRouter non-success responses return JSON status `502`, including only a
  bounded upstream response excerpt for diagnosis.
- Empty OpenRouter answers return JSON status `502`.
- Unexpected errors return JSON status `500` with no API key in the response.
- The API key is used only in the upstream `Authorization` header.
- Same-origin frontend requests require no CORS configuration.

## Build and Deployment

Add Wrangler as a development dependency and expose local/deployment scripts:

- `npm run dev:worker` starts the Cloudflare Worker development runtime.
- `npm run deploy` builds the Vite application and deploys it with Wrangler.

The connected Cloudflare build remains automatic from `main` with build command
`npm run build` and deploy command `npx wrangler deploy`. Secrets stay in the
existing Cloudflare Worker runtime settings and are not duplicated in
`wrangler.jsonc`.

## Testing

Add an executable Node contract test that invokes the Worker's exported fetch
handler with in-memory request, environment, asset, and upstream-fetch doubles.
It will verify:

- Static requests delegate to `env.ASSETS.fetch`.
- `/api/openrouter` rejects unsupported methods.
- Missing API keys and prompts return the expected statuses.
- Successful requests use the runtime secret, preserve model precedence and
  reasoning defaults, and return the expected Corez response shape.
- Upstream failures are mapped to status `502`.

Update the existing shell contract to require Cloudflare configuration,
worker-first API routing, and runtime binding access. Verification includes the
new contract test, all repository contract scripts, linting, and a production
build.

## Out of Scope

- Streaming OpenRouter responses.
- Cross-origin API access.
- Changing the Corez UI or frontend API contract.
- Moving secrets into source-controlled configuration.
- Removing the existing Vercel-compatible handler.
