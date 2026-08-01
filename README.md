# New-Corez

## Hosted AI routing

Corez deploys the Vite application and its AI endpoints together as a Cloudflare Worker. Public users call `/api/ai` for text and multimodal conversations and `/api/image` for image generation. Model selection is controlled server-side and cannot be overridden by the browser.

### Text and multimodal requests

When `OPENCODE_GO_API_KEY` (or `OPENCODE_API_KEY`) is configured, `/api/ai` uses the OpenCode Go API provider exclusively (it serves the latest DeepSeek V4 Flash builds):

- All chat, coding, app & swarm requests: `deepseek-v4-flash`

OpenCode Go is the only AI provider: the direct DeepSeek API and OpenRouter integrations have been removed. Transient gateway failures are retried with adaptive backoff (honouring `Retry-After`), and reasoning-only replies get one continuation nudge, before the request is reported as failed. Cloudflare Workers AI is not used anywhere.

Generations run as long as the model needs: no timeouts and no output token caps. The only abort is the client disconnecting (Stop button).

Conversation history is sent in full below the platform body guard; only when a request approaches the guard are older redundant turns compacted with a real generated summary and persisted retrievable records (exact code, errors, requirements and the latest user turn are always preserved verbatim).

### Publishing creations

The canvas preview's **Publish** button shares the current creation as a short public link (`corez.pro/asyag23-123`). The worker stores the formatted preview document in R2 under `publish/<slug>.json` and serves it at the bare root path to anyone, sandboxed with the same CSP as the in-app preview. Publishing again under the same slug updates the existing link.

Only the app document itself is published: conversation history, session IDs, and prompts are never sent to `/api/publish` (the endpoint ignores them even if a client sends them), and the shared page contains nothing but the app.

### Image generation

`/api/image` previously used the OpenRouter FLUX API; OpenRouter has been removed, so image generation is currently unavailable on this deployment and returns an honest error. No image provider credential is configured or accepted.

`OPENCODE_GO_API_KEY` is the only Worker secret required for AI.

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

## Cloudflare Worker deployment

Corez deploys the Vite SPA, `/api/ai`, and `/api/image` together as the `ai` Cloudflare Worker. Local Wrangler commands require Node.js 22 or later.

```text
Build command: npm run build
Deploy command: npx wrangler deploy
Root directory: /
Production branch: main
```
