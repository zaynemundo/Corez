# New-Corez

## Slash commands

Type a command at the start of any chat message for an explicit, unambiguous intent — the command token is stripped before the prompt reaches any model, so the AI is never confused by it:

- **`/website <description>`** — creates a website or web page (forces the app/website creation path with Awwwards design inspiration).
- **`/game <description>`** — creates a game (forces the game creation path).
- **`/research <topic>`** — runs a full research pipeline: searches the web (DuckDuckGo + Wikipedia through the worker), writes a comprehensive report grounded in the real results with cited sources, and delivers it as a downloadable PDF in the preview canvas (`Download .pdf` / `Print / Save as PDF`). The PDF is generated client-side with no API keys; if no reliable results come back, CoreZ reports honestly instead of inventing content.

## Hosted AI routing

Corez deploys the Vite application and its AI endpoints together as a Cloudflare Worker. Public users call `/api/ai` for text and multimodal conversations and `/api/image` for image generation. Model selection is controlled server-side and cannot be overridden by the browser.

### Text and multimodal requests

When `OPENCODE_GO_API_KEY` (or `OPENCODE_API_KEY`) is configured, `/api/ai` routes through the **OpenCode Go API** first (it serves the latest DeepSeek V4 Flash builds). OpenCode Go is preferred and stays preferred; the official DeepSeek API and OpenRouter are fallbacks tried in order only when the preferred provider cannot serve:

1. **OpenCode Go** — `OPENCODE_GO_API_KEY` / `OPENCODE_API_KEY`, endpoint `OPENCODE_ENDPOINT` (default `https://opencode.ai/zen/go/v1/chat/completions`), model `OPENCODE_MODEL` (default `deepseek-v4-flash`).
2. **Official DeepSeek API** — `DEEPSEEK_API_KEY`, endpoint `DEEPSEEK_ENDPOINT` (default `https://api.deepseek.com/chat/completions`), model `DEEPSEEK_MODEL` (default `deepseek-v4-flash`).
3. **OpenRouter** — `OPENROUTER_API_KEY`, endpoint `https://openrouter.ai/api/v1/chat/completions`, model `OPENROUTER_MODEL` (default `deepseek-v4-flash`).

All chat, coding, app & swarm requests use `deepseek-v4-flash` unless overridden per provider. The model list is server-controlled: client-supplied `body.model` is never trusted. Individual providers can be disabled with `OPENCODE_GO_DISABLED`, `DEEPSEEK_DISABLED`, or `OPENROUTER_DISABLED` (any truthy value). Provider keys never leave the worker, each provider gets its own `Authorization` header, and the content returned to users is provider-neutral.

Transient failures (408, 429, 5xx, network) are retried with adaptive exponential backoff (750 ms base, doubling, jittered, honouring each provider's `Retry-After`, single sleeps capped at 30 s) until the provider recovers, the client disconnects, or the failure is classified permanent (401/403/400/unsupported model — never retried). Reasoning-only replies get one continuation nudge. When a provider cannot recover within one request's practical window, the retry schedule is persisted (`retry/<provider>/<task>` records) and the request answers `200 { taskId, status: "retry-scheduled", retryAfterSeconds }`; resending the same messages resumes the exact task, so no work is restarted. Permanent exhaustion of every provider ends in an honest `502`. Cloudflare Workers AI is not used anywhere.

Generations run as long as the model needs: no timeouts and no output token caps (`max_tokens` is never sent to any provider). The only abort is the client disconnecting (Stop button).

Conversation history is sent in full below the platform body guard; only when a request approaches the guard are older redundant turns compacted with a real generated summary and persisted retrievable records (exact code, errors, requirements and the latest user turn are always preserved verbatim).

### Publishing creations

The canvas preview's **Publish** button shares the current creation as a short public link (`corez.pro/asyag23-123`). The worker stores the formatted preview document in R2 under `publish/<slug>.json` and serves it at the bare root path to anyone, sandboxed with the same CSP as the in-app preview. Publishing again under the same slug updates the existing link.

Only the app document itself is published: conversation history, session IDs, and prompts are never sent to `/api/publish` (the endpoint ignores them even if a client sends them), and the shared page contains nothing but the app.

### Image generation

`/api/image` generates images with **FLUX 1 Schnell** (`black-forest-labs/flux-1-schnell`) through OpenRouter when `OPENROUTER_API_KEY` is configured (the same key also serves as the text fallback). The image is stored in R2 when `ASSET_BUCKET` is available and returned as a public `/api/assets/...` URL; otherwise the provider's image URL is returned directly. Client disconnects abort generation. Without `OPENROUTER_API_KEY` the endpoint returns an honest `503` — no image provider is configured and text providers are never used as fake image providers.

`OPENCODE_GO_API_KEY` (or `OPENCODE_API_KEY`) is the only required Worker secret for text AI; `OPENROUTER_API_KEY` is optional (text fallback + FLUX images) and `DEEPSEEK_API_KEY` is optional (text fallback).

### Online multiplayer

Generated games can request real online multiplayer via the COREZ game protocol. A Cloudflare Durable Object (`GameRoom`) is the authoritative server for each room; clients connect over WebSocket at `wss://<host>/api/game/ws/<roomId>` where `<roomId>` is a short lowercase id (e.g. `dm-123`).

Client → server messages (JSON):

- `{"type":"join","name":"PlayerOne"}` — join the room (up to 8 players)
- `{"type":"input","keys":{"up":true,"down":false,"left":false,"right":true}}` — movement input
- `{"type":"shoot","dx":1,"dy":0.2}` — fire toward the direction vector

Server → client messages (JSON):

- `{"type":"welcome","playerId":"a1b2c3d4","roomId":"dm-123","players":[...]}` — on join
- `{"type":"state","tick":42,"players":[{"id","name","x","y","color","score"}],"bullets":[{"x","y","ownerId"}]}` — ~20 Hz authoritative state in normalized 0..1 arena coordinates
- `{"type":"kill","killerId","victimId","killerName","victimName"}`
- `{"type":"player_joined","player":{...}}` / `{"type":"player_left","playerId","name"}`
- `{"type":"error","message":"Room is full."}`

The server simulates movement and bullet hits authoritatively; clients render the received state and map 0..1 coordinates onto their canvas. The system prompt instructs the model to use this protocol instead of inventing a backend.

## Security notes

- AI-generated apps and games render inside sandboxed iframes (`allow-scripts`, no same-origin, no modals/popups). Generated code cannot read the page, cookies, or local storage, and it cannot navigate the parent.
- `/api/apps` and `/api/memory` are anonymous: the `sessionId`/`userId` string is the only access credential, so choose unguessable values — anyone who knows one can read or delete that data. All storage key segments are validated (`[A-Za-z0-9._-]`, no slashes, no leading dots) on every R2-backed endpoint.
- Provider requests abort when the client disconnects (Stop button), so no tokens are spent on abandoned generations.

## Local Intent Training & Classification

Corez routes public user prompts using a deterministic local text classifier trained on a synthetic, reviewed dataset. This classifier operates entirely in-browser and requires no network calls, API keys, or external npm dependencies.

### Intent Taxonomy

Corez uses six canonical runtime intent labels:

- `app`: Interactive web tools, applications, games, calculators, prototypes, and dashboards.
- `code-help`: Code diagnosis, explanation, fixing, testing, and refactoring.
- `writing`: Drafting, rewriting, summarising, and polishing prose.
- `explanation`: Plain-language explanations and comparisons.
- `general`: Greetings, advice, ambiguity, and requests without a specialist deliverable.
- `swarm`: Complex requests that explicitly require multi-agent orchestration or planning.

The trained classifier covers the five deliverable labels (`app`, `code-help`, `writing`, `explanation`, and `general`). The deterministic rule fallback can additionally emit `swarm`. Unsupported or retired client intent values are normalised to `general` by the Worker.

### Training & Evaluation Commands

- **Train Model**: `npm run train:intents`
  Validates `data/intents-dataset.json`, trains the deterministic multinomial Naive Bayes classifier, evaluates its metric gates, verifies byte-for-byte determinism, and updates `src/data/intent-classifier-model.json`.
- **Offline Evaluation**: `npm run evaluate:intents`
  Evaluates the committed classifier against its held-out examples without modifying the model artifact.
- **Hosted Quality Evaluation**: `npm run evaluate:ai -- https://<deployed-worker-host>`
  Evaluates the public `/api/ai` endpoint against the live intent suite.

### Runtime and fallback behaviour

`analyzePublicUserIntent(prompt)` uses the trained model when its confidence and out-of-vocabulary gates are satisfied. Otherwise, Corez uses deterministic pattern rules for novel or ambiguous prompts. The Worker independently validates the supplied intent label before adding adaptive instructions to the system prompt.

## Live market data

Supported market-price and currency-conversion prompts are handled before the general AI route and render as structured cards in chat. The same-origin Cloudflare Worker calls Twelve Data through `POST /api/market`; the browser never receives the provider credential.

Configure the production Worker secret interactively:

```text
npx wrangler secret put TWELVE_DATA_API_KEY
```

Enter the value only at Wrangler's hidden prompt. Do not add it to `.env`, `wrangler.jsonc`, source files, tests, logs, or GitHub Actions variables exposed to builds. If the secret is absent, the endpoint returns a safe `not_configured` response with no fallback price.

Successful provider responses are cached by canonical request for 60 seconds. If Twelve Data later fails, the Worker may serve the most recent validated quote for up to 15 minutes while retaining its original provider timestamp and clearly marking it as stale; older quotes are not returned as market values. Cards identify Twelve Data as the source, distinguish live, delayed, closed, stale, and unavailable states, and label every price as indicative data rather than an executable quote. If no trustworthy provider or eligible cached value exists, the card shows an unavailable state without a guessed price or a general-AI price fallback.

## Live web search

Requests that need current information ("latest news", "search the web", "what happened in 2026", live weather/scores/prices) route to `POST /api/search` before the general AI route. The Worker searches with a provider chain that requires **no API keys**:

- **DuckDuckGo Instant Answer** first.
- **Wikipedia** as the second provider.

The browser never receives provider credentials. The hosted AI answers using the real results as grounding and cites its sources; when the hosted AI is unavailable the user is shown the actual sources (title + URL) instead of fabricated facts. If every provider returns nothing, CoreZ reports honestly — it never invents search results.

## Awwwards design inspiration

App/site/game requests are enriched with real award-winning site references from **Awwwards**. CoreZ fetches the matching Awwwards category page (`/api/inspiration`), extracts the actual award-site slugs from the server-rendered HTML, and injects `{ title, url }` references into the design prompt — so the model has concrete visual direction (layout, typography, colour, interaction quality) instead of only generic design tokens. Category detection covers e-commerce, portfolio, agency, gaming, SaaS, editorial, architecture, art, fashion, food, travel, music, mobile, web3, education, events, and wellness.

The client-computed execution prompt (with the Awwwards design principles) now also reaches the model via `/api/ai`. Inspiration is strictly best-effort: an unreachable Awwwards page yields an empty reference list and the request continues with static design tokens — CoreZ never fabricates inspiration sites.

## Cloudflare Worker deployment

Corez deploys the Vite SPA, `/api/ai`, and `/api/image` together as the `ai` Cloudflare Worker. Local Wrangler commands require Node.js 22 or later.

```text
Build command: npm run build
Deploy command: npx wrangler deploy
Root directory: /
Production branch: main
```
