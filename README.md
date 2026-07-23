# New-Corez

## Hosted AI routing

Corez deploys the Vite application and its AI endpoints together as a Cloudflare Worker. Public users call `/api/ai` for text and multimodal conversations and `/api/image` for image generation. Model selection is controlled server-side and cannot be overridden by the browser.

### Text and multimodal requests

When `OPENCODE_GO_API_KEY` (or `OPENCODE_API_KEY`) is configured, `/api/ai` uses the OpenCode Go API provider endpoint first:

- Text and multimodal requests: `deepseek/deepseek-v4-flash`

When `OPENROUTER_API_KEY` is configured, `/api/ai` uses OpenRouter next.

If configured API keys are unavailable, missing, or return no usable response, Corez uses the native Cloudflare Workers AI binding in this order:

1. `@cf/moonshotai/kimi-k2.7-code`
2. `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`

### Image generation

`/api/image` uses the Workers AI binding with `@cf/black-forest-labs/flux-1-schnell`.

The `AI` binding is declared in `wrangler.jsonc`. Workers AI does not require a provider API key. `OPENROUTER_API_KEY` is optional and should be configured as a Worker secret when OpenRouter routing is required.

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
