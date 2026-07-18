# Technical Design Specification: OpenRouter DeepSeek-V4 Pro Integration for AI Proxy Worker

- **Document Path:** `docs/superpowers/specs/2026-07-18-openrouter-deepseek-v4-pro-design.md`
- **Date:** 2026-07-18
- **Status:** For User Review
- **Target Endpoint:** `POST /api/ai` (`https://ai.zayne-mayo.workers.dev/api/ai`)
- **Upstream Model:** `deepseek/deepseek-v4-pro` via OpenRouter Chat Completions API

---

## 1. Executive Summary & Objective

### 1.1 Objective
Migrate the Cloudflare Worker AI proxy endpoint (`/api/ai`) from the Cloudflare Workers AI GLM model binding (`env.AI`) to OpenRouter's native `deepseek/deepseek-v4-pro` model using worker `fetch`. Provider routing changes to OpenRouter. This specification enforces strict runtime secret validation (`OPENROUTER_API_KEY`), preserves existing public endpoint contracts, and establishes TDD verification across test contracts.

### 1.2 Non-Goals
- **No API Contract Changes:** The public request schema (`{ prompt: string, intent?: object }`) and success response schema (`{ content: string, model: string }`) remain unchanged.
- **No Client Timeout / UI Redesign:** No new client-side timeout logic, custom spinner components, or fallback progress UI will be invented in the frontend. Existing synthesized system prompts and frontend fallbacks are preserved as-is. Note that existing frontend fallback can run only after a completed non-OK/error path; it does not resolve an indefinitely pending request.
- **No Worker Fetch Timeout:** No artificial `AbortController` or custom timeout wrapper will be added to the Worker's upstream `fetch` call to OpenRouter.
- **No Re-enabling `/api/openrouter`:** The `/api/openrouter` endpoint remains disabled.
- **No Historical Spec Modifications:** Previous architectural specifications for GLM or legacy providers remain unmodified historical records.
- **No Model Quality Claims:** This design does not claim superior intelligence, reasoning quality, or code generation capability over previous models.

---

## 2. Observed Evidence & Operational Context

### 2.1 GLM Empirical Performance Evidence
During diagnostic testing of the Cloudflare Workers AI GLM binding:
- A `curl` client request with a 15-second timeout returned zero bytes before curl timed out.
- A separate standalone execution completed successfully after approximately two minutes (~120 seconds).
- **Conclusion:** It appeared unresponsive to the 15-second diagnostic client due to execution latency exceeding the client execution window.

### 2.2 Provider Transition Boundaries
- Provider routing changes to OpenRouter `deepseek/deepseek-v4-pro`.
- **Crucial Disclaimer:** Moving to OpenRouter does **not** eliminate potential network timeouts or guarantee absolute upstream uptime/reliability. High reasoning effort levels (`effort: "xhigh"`) incur execution latency, which clients must accommodate.

### 2.3 Time-Sensitive Model Reference Data (Verified 2026-07-18)
- **Model Identifier:** `deepseek/deepseek-v4-pro`
- **Release Date:** 2026-04-24
- **Context Window:** 1,000,000 tokens (1M context)
- **Operational Pricing (Reference Only):** $0.435 per 1M input tokens / $0.870 per 1M output tokens
- **Canonical Model Documentation:** [OpenRouter DeepSeek-V4 Pro](https://openrouter.ai/deepseek/deepseek-v4-pro)
- **Reasoning Guide Documentation:** [OpenRouter Reasoning Best Practices](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- **Cloudflare Secrets Documentation:** [Cloudflare Workers Secrets Configuration](https://developers.cloudflare.com/workers/configuration/secrets/)

---

## 3. System Architecture & Data Flow

```
[ Client / Browser ]
        │
        │ 1. POST /api/ai
        │    Header: Content-Type: application/json
        │    Body: { "prompt": "User request", "intent": {} }
        ▼
[ Cloudflare Worker (worker/index.js) ]
        │
        ├─► Validate HTTP Method (POST only; non-POST -> 405 Method Not Allowed)
        ├─► Validate Payload & Prompt (Non-empty string; malformed/missing -> 400 Bad Request)
        ├─► Check Secret: env.OPENROUTER_API_KEY
        │    ├─► Missing / Blank / Whitespace -> 503 Service Unavailable
        │    └─► Present -> Continue Upstream Dispatch
        │
        │ 2. Native fetch() via HTTPS/TLS
        │    POST https://openrouter.ai/api/v1/chat/completions
        │    Headers: Authorization: Bearer ${env.OPENROUTER_API_KEY}
        │             Content-Type: application/json
        │    Body: {
        │      "model": "deepseek/deepseek-v4-pro",
        │      "messages": [
        │        { "role": "system", "content": "Existing Corez system prompt" },
        │        { "role": "user", "content": "User request" }
        │      ],
        │      "reasoning": { "effort": "xhigh", "exclude": true }
        │    }
        ▼
[ OpenRouter API Engine ]
        │
        │ 3. Returns 200 OK with choices[0].message.content
        ▼
[ Cloudflare Worker (worker/index.js) ]
        │
        │ 4. Extract content ("Generated answer"), trim whitespace, return HTTP 200 OK
        │    Body: { "content": "Generated answer", "model": "deepseek/deepseek-v4-pro" }
        ▼
[ Client / Browser ]
```

---

## 4. Upstream Request & Response Adaptation

### 4.1 Upstream Dispatch Protocol
The Worker issues a native global `fetch()` call to OpenRouter over secure HTTPS/TLS. No TLS version pinning or custom HTTP transport agent is applied.

- **URL:** `https://openrouter.ai/api/v1/chat/completions`
- **HTTP Method:** `POST`
- **Request Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer ${env.OPENROUTER_API_KEY}`

### 4.2 Exact JSON Request Body Construction
```json
{
  "model": "deepseek/deepseek-v4-pro",
  "messages": [
    {
      "role": "system",
      "content": "Existing Corez system prompt"
    },
    {
      "role": "user",
      "content": "User request"
    }
  ],
  "reasoning": {
    "effort": "xhigh",
    "exclude": true
  }
}
```

#### Field Construction Rules:
1. `model`: Exact string `"deepseek/deepseek-v4-pro"`.
2. `messages`: Array containing system prompt (retaining existing intent/system prompt synthesis) and trimmed user prompt string.
3. `reasoning`: Object explicitly setting `effort: "xhigh"` and `exclude: true` to request deep reasoning while excluding reasoning tokens from final returned content.
4. **Parameter Omissions:** `temperature` and `max_tokens` are **deliberately omitted** as an approved request-shape decision.

### 4.3 Response Extraction Logic
1. Parse upstream JSON response body.
2. Extract text content from `choices[0].message.content`.
3. If `choices[0].message.content` is missing, null, non-string, or empty after trimming whitespace, throw an upstream extraction error (mapped to HTTP `502 Bad Gateway`).
4. Construct public `200 OK` JSON response:
```json
{
  "content": "Generated answer",
  "model": "deepseek/deepseek-v4-pro"
}
```

---

## 5. HTTP Status Mapping & Error Handling

All error responses returned by `/api/ai` MUST use generic public error messages. Detailed internal errors, stack traces, or upstream error payloads must never be exposed to clients or logged.

| Scenario / Condition | HTTP Status Code | Public JSON Response Payload | Bounded Event Logging |
| :--- | :--- | :--- | :--- |
| **HTTP Method != POST** | `405 Method Not Allowed` | `{"error": "Method Not Allowed"}` | `[AI Proxy] Method Not Allowed` |
| **Malformed JSON body / Missing `prompt` / Non-string `prompt` / Blank `prompt`** | `400 Bad Request` | `{"error": "Invalid request payload"}` | `[AI Proxy] Invalid request payload` |
| **Missing Secret:** `env.OPENROUTER_API_KEY` is undefined, empty, or whitespace | `503 Service Unavailable` | `{"error": "Service misconfigured"}` | `[AI Proxy] missing_runtime_configuration` |
| **Upstream HTTP Non-2xx Status** (e.g., 401 invalid token, 429, 500, 503) | `502 Bad Gateway` | `{"error": "Upstream AI service error"}` | `[AI Proxy] Upstream status 429` |
| **Upstream Fetch Exception** (e.g., network error) | `502 Bad Gateway` | `{"error": "Upstream AI service error"}` | `[AI Proxy] Upstream exception FetchError` |
| **Invalid Upstream JSON / Missing or Blank Content** | `502 Bad Gateway` | `{"error": "Upstream AI service error"}` | `[AI Proxy] Upstream payload invalid or empty` |

---

## 6. Worker Secrets & Configuration (`wrangler.jsonc`)

### 6.1 `wrangler.jsonc` Replacement Fragments
To configure secret requirements and remove the legacy binding, apply the following exact replacement fragments to `wrangler.jsonc`.

#### Fragment to Remove:
```jsonc
  "ai": {
    "binding": "AI"
  },
```

#### Fragment to Add:
```jsonc
  "secrets": {
    "required": [
      "OPENROUTER_API_KEY"
    ]
  },
```

Every other current field in `wrangler.jsonc` remains byte-for-byte unchanged, including `name`, `main`, `compatibility_date`, and the complete `assets` block (`directory`, `binding`, `not_found_handling`, and `run_worker_first`). No shortened `assets` object is introduced.

### 6.2 Secret Lifecycle & Safety Rules
1. **Runtime Verification:** An encrypted runtime secret named `OPENROUTER_API_KEY` exists in the target Cloudflare Workers production environment (`ai.zayne-mayo.workers.dev`).
2. **Deployment Preservation:** Wrangler deployment automatically preserves pre-existing encrypted runtime secrets.
3. **Zero Leaks Standard:** The secret value MUST NEVER be:
   - Hardcoded in source code files or test mocks.
   - Output in logs or error traces.
   - Exposed to the frontend client or browser responses.
   - Committed to Git version control.
   - Stored in test artifacts, environment files, or GitHub Actions workflow logs.

---

## 7. Scope of Impacted Implementation Files

Execution is strictly bounded to the following **10 expected implementation files**:

1. `worker/index.js`
2. `wrangler.jsonc`
3. `tests/cloudflare-worker-contract.mjs`
4. `tests/workers-ai-provider-contract.sh`
5. `tests/public-ai-proxy-contract.sh`
6. `tests/cloudflare-worker-config-contract.sh`
7. `tests/env-question-skill-contract.sh`
8. `src/components/SettingsModal.jsx`
9. `README.md`
10. `.agents/skills/ask-env-values/SKILL.md`

*Note:* `tests/ai-live-intent-eval-contract.sh` remains unchanged unless deployed-endpoint contracts truly change. Historical GLM spec files remain untouched. This spec document itself (`docs/superpowers/specs/2026-07-18-openrouter-deepseek-v4-pro-design.md`) is not an implementation file.

---

## 8. TDD Workflow & Multi-Agent Collaboration Protocol

AGY and Codex operate under a Test-Driven Development (TDD) protocol:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Phase 1: Test Authorization                     │
│  AGY updates authorized test contract files to expect                  │
│  "deepseek/deepseek-v4-pro" and OPENROUTER_API_KEY validation.         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Phase 2: Red Phase Verification                   │
│  Codex runs local contract scripts against current GLM implementation  │
│  and observes RED (contract failures due to legacy GLM logic).         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Phase 3: Implementation Edits                     │
│  AGY updates authorized implementation files (worker/index.js,         │
│  wrangler.jsonc, SettingsModal.jsx, README.md, SKILL.md).               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Phase 4: Green Phase Verification                 │
│  Codex reviews every code diff line-by-line and independently runs     │
│  local test contracts to verify GREEN (all tests pass cleanly).        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Comprehensive Verification Plan

Verification must execute sequentially. Every applicable step must complete successfully before proceeding to deployment.

### 9.1 Step 1: Focused Test Contracts
Run local contract scripts:
```bash
node tests/cloudflare-worker-contract.mjs
bash tests/workers-ai-provider-contract.sh
bash tests/public-ai-proxy-contract.sh
bash tests/cloudflare-worker-config-contract.sh
bash tests/env-question-skill-contract.sh
```

### 9.2 Step 2: Package Script Execution
Execute all applicable scripts defined in `package.json`. If any standard script name (such as `test` or `lint`) is absent in `package.json`, report its absence explicitly.

### 9.3 Step 3: Codebase Validation & Typechecks
Execute configured linters or static type analyzers (`npm run lint`, `npm run typecheck` if configured).

### 9.4 Step 4: Intent Validation & Intent Evaluation
Run intent processing evaluations to verify prompt synthesis compatibility.

### 9.5 Step 5: Production Application Build
```bash
npm run build
```

### 9.6 Step 6: Wrangler Deployment Dry-Run
```bash
npx wrangler deploy --dry-run
```

### 9.7 Step 7: Live Cloudflare Worker Deployment
```bash
npx wrangler deploy
```

### 9.8 Step 8: Live Production Smoke Test
Execute a live smoke test against the deployed Worker endpoint with an extended client execution timeout (`--max-time 180`):

```bash
curl -i -X POST https://ai.zayne-mayo.workers.dev/api/ai \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test hello from production verification", "intent": {}}' \
  --max-time 180
```

#### Acceptance Criteria for Live Smoke Test:
- **HTTP Status Code:** `200 OK`
- **Response Header:** `Content-Type: application/json`
- **Response JSON:**
  - `content`: Non-empty, trimmed string.
  - `model`: Exactly `"deepseek/deepseek-v4-pro"`.
- *Note:* The `--max-time 180` curl flag bounds client execution only, allowing sufficient headroom for upstream reasoning completion.

---

## 10. Rollout & Non-Destructive Rollback Procedures

### 10.1 Version Control & Git Commit Standard
- Commit changes directly to local `main` branch.
- Push to `origin/main` without generating merge commits.

### 10.2 Non-Destructive Rollback Procedure
Codex resolves an existing known-good Cloudflare version or Git revision, confirms exact target/read-only state, then performs a documented non-destructive redeploy/revert only with proper authorization, verifies live health, and preserves secrets.

---

## 11. Security, Privacy & Logging Controls

### 11.1 Bounded Logging Policy
Worker logging must balance operational diagnostic needs against user data privacy and security requirements.

#### ALLOWED Log Statements (Generic Bounded Events):
- `[AI Proxy] Method Not Allowed`
- `[AI Proxy] Invalid request payload`
- `[AI Proxy] missing_runtime_configuration`
- `[AI Proxy] Upstream status 429`
- `[AI Proxy] Upstream exception FetchError`
- `[AI Proxy] Upstream payload invalid or empty`

#### FORBIDDEN Log Content (Strict Zero Leak):
- User prompts or intent payload contents.
- AI completion text outputs or intermediate tokens.
- Full HTTP request/response JSON bodies.
- Bearer tokens or `OPENROUTER_API_KEY` secret strings.
- HTTP header dictionaries.
- Unhandled Exception Stack Traces containing request payloads.

---

## 12. Acceptance Criteria Checklist (Future Implementation Verification)

- [ ] **Public Endpoint Preservation:** `POST /api/ai` accepts `{prompt: string, intent?: object}` and returns `{content: string, model: "deepseek/deepseek-v4-pro"}` on success.
- [ ] **HTTP Status Code Compliance:**
  - Non-POST requests return `405 Method Not Allowed`.
  - Malformed or blank prompts return `400 Bad Request`.
  - Missing `OPENROUTER_API_KEY` returns `503 Service Unavailable`.
  - Upstream non-2xx / fetch failures / empty content return `502 Bad Gateway`.
- [ ] **Upstream Dispatch Verification:**
  - Target: `https://openrouter.ai/api/v1/chat/completions`.
  - Headers: Only `Content-Type: application/json` and `Authorization: Bearer ${env.OPENROUTER_API_KEY}`.
  - Body: `model: "deepseek/deepseek-v4-pro"`, synthesized system prompt + trimmed user prompt, `reasoning: { effort: "xhigh", exclude: true }`.
  - `temperature` and `max_tokens` are omitted.
- [ ] **Config Cleanliness:** `wrangler.jsonc` contains `secrets.required: ["OPENROUTER_API_KEY"]` and no `ai` binding.
- [ ] **Privacy Integrity:** Zero leaks of prompts, completions, tokens, or headers in logs.
- [ ] **Live Smoke Verification:** Live `curl` to `https://ai.zayne-mayo.workers.dev/api/ai` returns `200 OK` with model `"deepseek/deepseek-v4-pro"`.

---

## 13. Honest Risk Assessment & Mitigations

| Risk Domain | Risk Severity | Failure Mode | Technical Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **1. High Reasoning Latency** | High | `xhigh` reasoning effort may be slow, causing extended client wait times. | Accepted by design. Measure via bounded live smoke and operational monitoring without logging prompts or content. No artificial Worker timeout injected. |
| **2. Lack of Client-Side Timeout** | Medium | Browser frontend has no timeout limit; pending UI state persists indefinitely if network hangs. | Preserved existing frontend fallback behavior, which can run only after a completed non-OK/error path (it does not resolve an indefinitely pending request). Out-of-scope for this Worker spec. |
| **3. Upstream Service Outage / Rate Limit** | Medium | OpenRouter returns HTTP 429, 500, or 503 during peak traffic. | Cloudflare Worker catches non-2xx responses, logs bounded event, and returns clean generic `502 Bad Gateway`. |
| **4. Operational Financial Costs** | Low / Medium | High-volume usage accumulates token charges ($0.435/1M input, $0.870/1M output). | Configure and monitor account limits as an operational mitigation. |
| **5. Secret Misconfiguration / Invalid Secret** | High | `OPENROUTER_API_KEY` missing, blank, or invalid. | Presence validation catches missing/blank tokens and returns 503; an invalid present token is rejected upstream by OpenRouter (e.g. HTTP 401) and maps to generic 502 Bad Gateway. |
