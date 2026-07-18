# Cloudflare Workers AI GLM-5.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Corez's OpenRouter text generation with a fixed native Cloudflare Workers AI call to `@cf/zai-org/glm-5.2`.

**Architecture:** The Cloudflare Worker exposes `POST /api/ai`, validates the existing prompt and intent payload, and invokes the `AI` binding directly. The frontend consumes the normalized `{ content, model }` response and retains its local fallback; all Vercel/OpenRouter configuration and model-selection UI are removed.

**Tech Stack:** Node.js 22+, JavaScript ES modules, React 18, Vite 6, Cloudflare Workers, Workers AI binding, Wrangler 4, Node `assert`, Bash contract tests.

## Global Constraints

- The production model is fixed to `@cf/zai-org/glm-5.2`.
- The public hosted-text route is `POST /api/ai`; `/api/openrouter` is not retained.
- No API key, account ID, provider URL, or model environment variable is used for runtime inference.
- Preserve the successful response contract `{ content: string, model: "@cf/zai-org/glm-5.2" }`.
- Preserve the local intent classifier and `generateLocalAIResponse()` fallback behavior.
- Use `reasoning_effort: "high"`, `temperature: 0.72`, and `max_completion_tokens` of `3200` for app intent or `1800` otherwise.
- Do not rewrite historical records under `docs/superpowers/` or `.superpowers/`.
- Do not add dependencies.
- Implement each behavior test-first and observe the intended failure before production edits.
- AGY remains analysis/review-only; Codex owns all edits and independently verifies them.

---

## File Structure

- `worker/index.js`: owns routing, request validation, prompt construction, Workers AI invocation, response normalization, and safe API errors.
- `wrangler.jsonc`: declares the `AI` and `ASSETS` bindings.
- `src/services/aiService.js`: owns the browser call to `/api/ai`, local intent analysis, and fallback orchestration.
- `src/components/SettingsModal.jsx`: owns user-visible preferences; provider model selection is removed.
- `tests/cloudflare-worker-contract.mjs`: executable Worker behavior contract with a fake `AI.run` binding.
- `tests/cloudflare-worker-config-contract.sh`: static deployment/configuration contract.
- `tests/workers-ai-provider-contract.sh`: active-code contract for native Workers AI and absence of OpenRouter runtime dependencies.
- `tests/public-ai-proxy-contract.sh`: frontend/settings contract for the provider-neutral public route and local fallback.
- `scripts/evaluate-ai-intents.mjs`: optional live quality evaluation against an explicitly supplied deployed base URL.
- `tests/ai-live-intent-eval-contract.sh`: static contract for the deployment-targeted live evaluator.
- `.agents/skills/ask-env-values/SKILL.md`: clarifies that native Corez inference requires no runtime secret.
- `tests/env-question-skill-contract.sh`: guards that clarification.
- `README.md`: documents Workers AI, GLM-5.2, `/api/ai`, and deployment.
- Delete `api/openrouter.js`, `tests/openrouter-provider-contract.sh`, `tests/openrouter-reasoning-contract.sh`, and `tests/public-openrouter-proxy-contract.sh`.

### Task 1: Native Workers AI Worker Contract

**Files:**
- Modify: `tests/cloudflare-worker-contract.mjs`
- Modify: `tests/cloudflare-worker-config-contract.sh`
- Modify: `worker/index.js`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Consumes: `worker.fetch(request, env)` where `env.AI.run(model, input)` returns a GLM chat-completion object and `env.ASSETS.fetch(request)` serves static assets.
- Produces: `POST /api/ai` accepting `{ prompt: string, intent?: object }` and returning `{ content: string, model: string }` on success.

- [ ] **Step 1: Replace the Worker behavior test with the native binding contract**

Keep the existing asset, unknown-route, method, malformed-JSON, blank-prompt,
and null-body assertions. Replace the environment helper and hosted-generation
assertions with this structure:

```js
const MODEL = '@cf/zai-org/glm-5.2';

function env(overrides = {}) {
  return {
    AI: {
      async run() {
        return {
          choices: [{ message: { content: '  Worker response  ' } }]
        };
      }
    },
    ASSETS: {
      async fetch(request) {
        return new Response(`asset:${new URL(request.url).pathname}`, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    },
    ...overrides
  };
}

let invocation;
const successResponse = await worker.fetch(
  new Request('https://corez.test/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Build a timer',
      model: 'client/model-must-be-ignored',
      intent: { type: 'app', summary: 'Build a timer app.' }
    })
  }),
  env({
    AI: {
      async run(model, input) {
        invocation = { model, input };
        return {
          choices: [{ message: { content: '  Worker response  ' } }]
        };
      }
    }
  })
);

assert.equal(successResponse.status, 200);
assert.deepEqual(await successResponse.json(), {
  content: 'Worker response',
  model: MODEL
});
assert.equal(invocation.model, MODEL);
assert.equal(invocation.input.reasoning_effort, 'high');
assert.equal(invocation.input.temperature, 0.72);
assert.equal(invocation.input.max_completion_tokens, 3200);
assert.equal(invocation.input.messages[1].content, 'Build a timer');
assert.match(invocation.input.messages[0].content, /Build a timer app/);
assert.equal('model' in invocation.input, false);
```

Add focused cases for a general intent limit of `1800`, missing `AI` binding
returning `503`, a rejected `AI.run()` returning safe `502`, an empty `choices`
array returning `502`, and `/api/openrouter` returning `404`. Assert no thrown
error detail appears in any response body.

- [ ] **Step 2: Add the failing configuration assertion**

Append this exact check to `tests/cloudflare-worker-config-contract.sh`:

```bash
check 'Workers AI binding is configured' '"ai"[[:space:]]*:[[:space:]]*\{' "$config"
check 'Workers AI binding is named AI' '"binding"[[:space:]]*:[[:space:]]*"AI"' "$config"
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
node tests/cloudflare-worker-contract.mjs
bash tests/cloudflare-worker-config-contract.sh
```

Expected: the behavior contract fails because `/api/ai` returns `404`, and the
configuration contract reports the missing Workers AI binding.

- [ ] **Step 4: Implement the minimal native Worker adapter**

Replace the OpenRouter constants, reasoning helper, handler, and route in
`worker/index.js` while retaining `jsonResponse`, `buildSystemPrompt`, unknown
API routing, and asset routing:

```js
const WORKERS_AI_MODEL = '@cf/zai-org/glm-5.2';

async function handleAi(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }
  if (!env.AI || typeof env.AI.run !== 'function') {
    return jsonResponse(503, { error: 'Workers AI is not configured.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return jsonResponse(400, { error: 'Prompt is required.' });

  const intent = body.intent && typeof body.intent === 'object' && !Array.isArray(body.intent)
    ? body.intent
    : null;

  try {
    const result = await env.AI.run(WORKERS_AI_MODEL, {
      messages: [
        { role: 'system', content: buildSystemPrompt(intent) },
        { role: 'user', content: prompt }
      ],
      reasoning_effort: 'high',
      temperature: 0.72,
      max_completion_tokens: intent?.type === 'app' ? 3200 : 1800
    });
    const content = result?.choices?.[0]?.message?.content;
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    if (!normalizedContent) {
      return jsonResponse(502, { error: 'Workers AI returned an empty response.' });
    }
    return jsonResponse(200, {
      content: normalizedContent,
      model: WORKERS_AI_MODEL
    });
  } catch {
    return jsonResponse(502, { error: 'Unable to generate AI response.' });
  }
}
```

Route only `pathname === '/api/ai'` to `handleAi`.

Add the binding to `wrangler.jsonc` beside `assets`:

```jsonc
"ai": {
  "binding": "AI"
}
```

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
npm run test:cloudflare
```

Expected: `Cloudflare Worker behavior contract passed.` and `Cloudflare Worker configuration contract passed.`

### Task 2: Provider-Neutral Frontend and Settings

**Files:**
- Create: `tests/workers-ai-provider-contract.sh`
- Create: `tests/public-ai-proxy-contract.sh`
- Modify: `src/services/aiService.js`
- Modify: `src/components/SettingsModal.jsx`
- Delete: `tests/openrouter-provider-contract.sh`
- Delete: `tests/openrouter-reasoning-contract.sh`
- Delete: `tests/public-openrouter-proxy-contract.sh`

**Interfaces:**
- Consumes: `POST /api/ai` with `{ prompt, intent }` and response `{ content, model }`.
- Produces: `generateHostedAIResponse(prompt, intent): Promise<string | null>` and unchanged `generateAIResponse(prompt): Promise<string>` fallback behavior.

- [ ] **Step 1: Write the failing provider contracts**

Create `tests/workers-ai-provider-contract.sh` using the repository's existing
`check` and `check_absent` helpers. Its assertions must be:

```bash
check 'Worker uses the GLM-5.2 model' '@cf/zai-org/glm-5[.]2' "$worker"
check 'Worker invokes the native AI binding' 'env[.]AI[.]run' "$worker"
check 'Worker sends a system message' "role: 'system'" "$worker"
check 'Worker sends a user message' "role: 'user'" "$worker"
check 'frontend calls the public AI route' "fetch\('/api/ai'" "$service"
check 'frontend retains local fallback' 'generateLocalAIResponse' "$service"
check_absent 'Worker has no OpenRouter endpoint' 'openrouter[.]ai' "$worker"
check_absent 'active source has no OpenRouter key' 'OPENROUTER_API_KEY' "$worker"
check_absent 'frontend has no model override storage' 'corez_openrouter_model|VITE_OPENROUTER_MODEL' "$service"
```

Create `tests/public-ai-proxy-contract.sh` with assertions for
`generateHostedAIResponse`, `/api/ai`, provider-neutral fallback warning text,
Cloudflare Workers AI settings copy, and absence of `OpenRouter model` and
`corez_openrouter_model` from `SettingsModal.jsx`.

- [ ] **Step 2: Run the new contracts and verify RED**

Run:

```bash
bash tests/workers-ai-provider-contract.sh
bash tests/public-ai-proxy-contract.sh
```

Expected: failures for the old route, old names, old model selector, and absent
Workers AI copy.

- [ ] **Step 3: Implement the provider-neutral browser client**

In `src/services/aiService.js`, delete `OPENROUTER_PROXY_ENDPOINT`,
`DEFAULT_OPENROUTER_MODEL`, `readBrowserSetting`, and `getOpenRouterConfig`.
Replace `generateOpenRouterResponse` with:

```js
export const AI_PROXY_ENDPOINT = '/api/ai';

export async function generateHostedAIResponse(
  prompt,
  intent = analyzePublicUserIntent(prompt)
) {
  const response = await fetch(AI_PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, intent })
  });

  if (!response.ok) {
    throw new Error(`Hosted AI request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data?.content?.trim() || null;
}
```

Update `generateAIResponse` to call `generateHostedAIResponse` and use:

```js
console.warn('Hosted AI unavailable; using local Corez fallback.', hostedAiError);
```

- [ ] **Step 4: Remove the model selector from settings**

In `src/components/SettingsModal.jsx`, import only `X`, `Settings`, and
`Trash2`; remove component state, the effect, the model input, and save handler.
Render this provider copy:

```jsx
<div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
  Corez uses Cloudflare Workers AI with GLM-5.2 for hosted text generation.
</div>
```

Retain the clear-history button and close icon. Remove the obsolete Save button
because the modal no longer contains a persisted provider preference.

- [ ] **Step 5: Delete superseded OpenRouter contract files and verify GREEN**

Delete the three OpenRouter-named contract scripts listed in this task, then run:

```bash
bash tests/workers-ai-provider-contract.sh
bash tests/public-ai-proxy-contract.sh
npm run lint
npm run build
```

Expected: both contracts pass, ESLint exits `0`, and Vite reports a successful production build.

### Task 3: Remove Vercel/OpenRouter Runtime and Update Operations

**Files:**
- Delete: `api/openrouter.js`
- Modify: `scripts/evaluate-ai-intents.mjs`
- Modify: `tests/ai-live-intent-eval-contract.sh`
- Modify: `.agents/skills/ask-env-values/SKILL.md`
- Modify: `tests/env-question-skill-contract.sh`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: optional CLI argument `<deployed-base-url>` for live evaluation.
- Produces: `node scripts/evaluate-ai-intents.mjs <deployed-base-url>` calls `<deployed-base-url>/api/ai`; no runtime inference environment variables are required.

- [ ] **Step 1: Rewrite the static operations contracts first**

Change `tests/ai-live-intent-eval-contract.sh` to require:

```bash
check 'live eval requires an explicit deployed URL' 'process[.]argv\[2\]|deployed base URL'
check 'live eval calls the public AI route' '/api/ai'
check 'live eval covers app intent' "id: 'app'"
check 'live eval covers code-help intent' "id: 'code-help'"
check 'live eval covers writing intent' "id: 'writing'"
check 'live eval covers explanation intent' "id: 'explanation'"
check 'live eval covers general intent' "id: 'general'"
check 'live eval scores minimum answer quality' 'minimumScore'
check_absent 'live eval has no OpenRouter key dependency' 'OPENROUTER_API_KEY|OPENROUTER_MODEL|OPENROUTER_REASONING_EFFORT'
```

Change `tests/env-question-skill-contract.sh` so it requires the skill to state
that Corez Workers AI inference needs no runtime API key or model environment
variable, and rejects active `OPENROUTER_*` guidance.

- [ ] **Step 2: Run both contracts and verify RED**

Run:

```bash
bash tests/ai-live-intent-eval-contract.sh
bash tests/env-question-skill-contract.sh
```

Expected: both fail because active files still require OpenRouter values.

- [ ] **Step 3: Convert the live evaluator to the deployed Worker route**

Remove the handler import and provider constants from
`scripts/evaluate-ai-intents.mjs`. Add:

```js
function requireBaseUrl() {
  const value = process.argv[2]?.trim();
  if (!value) {
    throw new Error('Live AI eval requires an explicit deployed base URL argument.');
  }
  return value.replace(/\/$/, '');
}
```

Change `callCorezAi` to accept `baseUrl` and use:

```js
const response = await fetch(`${baseUrl}/api/ai`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: testCase.prompt, intent: testCase.intent })
});
const body = await response.json();
if (!response.ok) {
  throw new Error(`${testCase.id} failed with HTTP ${response.status}: ${body.error || 'unknown error'}`);
}
return body.content || '';
```

Resolve `const baseUrl = requireBaseUrl()` once in `main()` and pass it to each
case. Preserve scoring and snippet-only reporting.

- [ ] **Step 4: Correct the environment-value skill and documentation**

Load `skill-creator` and `superpowers:writing-skills` before changing the
repository-local skill, then follow their validation requirements for this
bounded documentation correction.

Replace the OpenRouter-specific Corez section in
`.agents/skills/ask-env-values/SKILL.md` with:

```markdown
## Corez Workers AI

Corez hosted text generation uses the native Cloudflare Workers AI binding.
Runtime inference requires no API key, account ID, model variable, or provider
URL. Do not ask for legacy external-provider values. Cloudflare deployment
credentials are CI/CD credentials, not public AI runtime configuration, and must never be
committed or exposed to app users.
```

Rewrite the README opening as `## Cloudflare Workers AI setup`, document
`@cf/zai-org/glm-5.2`, `/api/ai`, the `AI` binding, and the lack of runtime
provider secrets. Update the deployment section to refer to `/api/ai` and remove
all OpenRouter variable instructions.

Add this package script:

```json
"evaluate:ai": "node scripts/evaluate-ai-intents.mjs"
```

Document invocation as `npm run evaluate:ai -- https://<deployed-worker-host>`.

- [ ] **Step 5: Delete the Vercel handler and verify GREEN**

Delete `api/openrouter.js`, then run:

```bash
bash tests/ai-live-intent-eval-contract.sh
bash tests/env-question-skill-contract.sh
npm run evaluate:ai
```

Expected: both contracts pass. The evaluator exits nonzero with the exact safe
message `Live AI eval requires an explicit deployed base URL argument.`; this is
the expected no-network verification and is not reported as a successful live
model evaluation.

### Task 4: Full Verification, Independent Review, and Git Completion

**Files:**
- Review: all tracked staged and unstaged implementation changes
- Modify only if verification or review finds a concrete defect

**Interfaces:**
- Consumes: the complete implementation diff from Tasks 1-3.
- Produces: verified Cloudflare-only GLM-5.2 integration committed on local `main` and pushed to `origin/main` without a merge commit.

- [ ] **Step 1: Run every deterministic repository contract**

Run:

```bash
for test_file in tests/*.sh; do bash "$test_file"; done
node tests/cloudflare-worker-contract.mjs
npm run evaluate:intents
npm run lint
npm run build
```

Expected: every shell contract prints its pass message; the Worker contract,
local intent metric gates, ESLint, and Vite build all exit `0`.

- [ ] **Step 2: Validate the Wrangler bundle and binding configuration**

After loading the repository's `wrangler` and `workers-best-practices` skills,
run:

```bash
npx wrangler deploy --dry-run --outdir /tmp/corez-glm-52-dry-run
```

Expected: Wrangler builds the Worker successfully, reports the `AI` and `ASSETS`
bindings, and writes only disposable output under `/tmp/corez-glm-52-dry-run`.

- [ ] **Step 3: Scan active files for stale provider coupling**

Run:

```bash
grep -RInE 'openrouter[.]ai|OPENROUTER_|corez_openrouter_model|VITE_OPENROUTER_MODEL|/api/openrouter' worker src api scripts README.md .agents/skills/ask-env-values/SKILL.md 2>/dev/null
```

Expected: no matches. Test fixtures retain legacy strings only to prove they are
absent from production files and that the removed route returns `404`.
Historical design and review records are intentionally outside this scan.

- [ ] **Step 4: Request AGY's independent analysis-only diff review**

Use `scripts/agy-delegate.ps1 -Mode ReviewDiff` when PowerShell is available.
If it is unavailable, invoke `agy --mode plan --sandbox --print` with the complete
non-secret `git diff HEAD --` embedded and explicit instructions not to call
tools or modify files. Ask for correctness, security, regressions, missing
tests, and maintainability findings. Never use `--dangerously-skip-permissions`.

Codex must inspect every finding against the actual files and independently
rerun affected checks after any correction.

- [ ] **Step 5: Apply review fixes test-first and rerun verification**

For each accepted behavioral defect, add or tighten the failing contract first,
observe the failure, apply the smallest correction, and rerun Steps 1-3. Reject
unsupported or out-of-scope advice with a recorded technical reason.

- [ ] **Step 6: Invoke verification-before-completion and git-superpowers**

Confirm the branch is exactly `main`, inspect `git status --short`, review the
entire diff, and use the repository-local `git-superpowers` skill to commit only
the verified implementation files and push `main` to `origin/main` without a
merge commit.

Suggested commit message:

```text
feat: use Cloudflare GLM-5.2 for text generation
```

- [ ] **Step 7: Verify remote completion**

Run:

```bash
git status --short --branch
git log -2 --oneline --decorate
```

Expected: clean `main`, `main` aligned with `origin/main`, the implementation
commit at `HEAD`, and the design checkpoint immediately behind it.
