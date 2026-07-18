# Cloudflare Worker OpenRouter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the existing Corez Vite SPA and its private OpenRouter proxy as one native Cloudflare Worker at the existing `new-corez` Worker URL.

**Architecture:** A module Worker at `worker/index.js` handles `/api/openrouter` with Web Platform `Request` and `Response` APIs and reads runtime bindings from its `env` parameter. A root `wrangler.jsonc` routes `/api/*` through that Worker first and delegates all other requests to the `dist` asset binding with SPA fallback.

**Tech Stack:** JavaScript ES modules, Cloudflare Workers static assets, Wrangler, Vite, Node's built-in assertions, Bash contract tests

## Global Constraints

- Keep the public URL and Worker name `new-corez`.
- Never store `OPENROUTER_API_KEY` or any secret value in Git.
- Preserve the frontend request contract: `POST /api/openrouter` with `{ prompt, model, intent }`.
- Preserve `deepseek/deepseek-v4-flash` as the default model.
- Preserve `xhigh` as the default reasoning effort.
- Keep `api/openrouter.js` for Vercel-style deployment compatibility.
- Keep static frontend routing as a single-page application.

---

### Task 1: Cloudflare Worker OpenRouter Handler

**Files:**
- Create: `tests/cloudflare-worker-contract.mjs`
- Create: `worker/index.js`

**Interfaces:**
- Consumes: Cloudflare module Worker call `worker.fetch(request, env)` where `env` contains `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL`, optional `OPENROUTER_REASONING_EFFORT`, and `ASSETS.fetch(request)`.
- Produces: a default Worker export with `async fetch(request, env)`; JSON responses for `/api/openrouter`; asset responses for all non-API paths.

- [ ] **Step 1: Write the failing Worker behavior test**

Create `tests/cloudflare-worker-contract.mjs` with Node built-in assertions. The test must import `../worker/index.js`, provide an in-memory `ASSETS` binding, replace `globalThis.fetch` only while checking the OpenRouter call, and assert:

```javascript
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const originalFetch = globalThis.fetch;

function env(overrides = {}) {
  return {
    OPENROUTER_API_KEY: 'test-secret',
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

async function json(response) {
  return response.json();
}

async function run() {
  const assetResponse = await worker.fetch(
    new Request('https://corez.test/dashboard'),
    env()
  );
  assert.equal(await assetResponse.text(), 'asset:/dashboard');

  const methodResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter'),
    env()
  );
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get('content-type'), 'application/json');

  const missingKeyResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' })
    }),
    env({ OPENROUTER_API_KEY: '' })
  );
  assert.equal(missingKeyResponse.status, 503);

  const missingPromptResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' })
    }),
    env()
  );
  assert.equal(missingPromptResponse.status, 400);

  const malformedResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    }),
    env()
  );
  assert.equal(malformedResponse.status, 400);

  let upstreamRequest;
  globalThis.fetch = async (request, init) => {
    upstreamRequest = { request, init };
    return Response.json({
      choices: [{ message: { content: '  Worker response  ' } }]
    });
  };

  const successResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Build a timer',
        intent: { type: 'app', summary: 'Build a timer app.' }
      })
    }),
    env({
      OPENROUTER_MODEL: 'test/model',
      OPENROUTER_REASONING_EFFORT: 'invalid'
    })
  );

  assert.equal(successResponse.status, 200);
  assert.deepEqual(await json(successResponse), {
    content: 'Worker response',
    model: 'test/model'
  });
  assert.equal(
    upstreamRequest.init.headers.Authorization,
    'Bearer test-secret'
  );
  const upstreamBody = JSON.parse(upstreamRequest.init.body);
  assert.equal(upstreamBody.model, 'test/model');
  assert.equal(upstreamBody.reasoning_effort, 'xhigh');
  assert.equal(upstreamBody.max_tokens, 3200);
  assert.match(upstreamBody.messages[0].content, /Build a timer app/);

  globalThis.fetch = async () => new Response('rate limited', { status: 429 });
  const upstreamFailureResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' })
    }),
    env()
  );
  assert.equal(upstreamFailureResponse.status, 502);
  assert.equal((await json(upstreamFailureResponse)).status, 429);

  console.log('Cloudflare Worker behavior contract passed.');
}

try {
  await run();
} finally {
  globalThis.fetch = originalFetch;
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node tests/cloudflare-worker-contract.mjs
```

Expected: non-zero exit because `worker/index.js` does not exist.

- [ ] **Step 3: Implement the minimal Worker handler**

Create `worker/index.js` with:

```javascript
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash';
const DEFAULT_OPENROUTER_REASONING_EFFORT = 'xhigh';
const ALLOWED_REASONING_EFFORTS = new Set([
  'none', 'minimal', 'low', 'medium', 'high', 'xhigh'
]);

function jsonResponse(status, body) {
  return Response.json(body, { status });
}

function getReasoningEffort(env) {
  const effort = (
    env.OPENROUTER_REASONING_EFFORT || DEFAULT_OPENROUTER_REASONING_EFFORT
  ).trim().toLowerCase();
  return ALLOWED_REASONING_EFFORTS.has(effort)
    ? effort
    : DEFAULT_OPENROUTER_REASONING_EFFORT;
}

function buildSystemPrompt(intent) {
  const intentSummary = intent?.summary
    || 'Understand the public user goal and give a useful next step.';
  const intentType = intent?.type || 'general';

  return `You are Corez AI inside a public web app.

Your job is to understand what the public user is trying to do and answer with more detail than a short chatbot reply.

Response style:
- Be detailed, structured, and practical.
- Start with the direct answer.
- Add useful context, steps, examples, or tradeoffs when they help.
- For plans, include concrete ordered steps and likely risks.
- For explanations, define the idea plainly, then show a small example.
- For writing tasks, provide a usable draft and explain the tone or structure briefly.
- For code help, identify the likely cause, show a corrected snippet when possible, and mention how to verify it.
- Avoid vague filler.
- If the user asks to build a website, landing page, dashboard, app, game, widget, or tool, return one complete runnable HTML document inside a fenced html code block.
- Keep generated apps minimalist, monochrome, responsive, and self-contained.

Inferred intent: ${intentType} - ${intentSummary}`;
}

async function handleOpenRouter(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }
  if (!env.OPENROUTER_API_KEY) {
    return jsonResponse(503, { error: 'OpenRouter is not configured.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return jsonResponse(400, { error: 'Prompt is required.' });
  }

  const intent = body.intent && typeof body.intent === 'object'
    ? body.intent
    : null;
  const model = typeof body.model === 'string' && body.model.trim()
    ? body.model.trim()
    : env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;

  try {
    const upstream = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'Corez'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt(intent) },
          { role: 'user', content: prompt }
        ],
        reasoning_effort: getReasoningEffort(env),
        temperature: 0.72,
        max_tokens: intent?.type === 'app' ? 3200 : 1800
      })
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 500);
      return jsonResponse(502, {
        error: 'OpenRouter request failed.',
        status: upstream.status,
        detail
      });
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return jsonResponse(502, { error: 'OpenRouter returned an empty response.' });
    }

    return jsonResponse(200, { content, model });
  } catch (error) {
    return jsonResponse(500, {
      error: 'Unable to generate AI response.',
      detail: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/openrouter') {
      return handleOpenRouter(request, env);
    }
    if (pathname.startsWith('/api/')) {
      return jsonResponse(404, { error: 'API route not found.' });
    }
    return env.ASSETS.fetch(request);
  }
};
```

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```bash
node tests/cloudflare-worker-contract.mjs
```

Expected: `Cloudflare Worker behavior contract passed.` and exit code `0`.

- [ ] **Step 5: Inspect the Worker behavior checkpoint**

```bash
git diff --check
git diff -- tests/cloudflare-worker-contract.mjs worker/index.js
```

Expected: no whitespace errors and no changes outside the Worker behavior and
its test. Leave the changes uncommitted so AGY can review the complete current
diff before final verification.

---

### Task 2: Wrangler Static-Asset Deployment Configuration

**Files:**
- Create: `tests/cloudflare-worker-config-contract.sh`
- Create: `wrangler.jsonc`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: `worker/index.js` from Task 1 and Vite output at `dist`.
- Produces: `npx wrangler deploy` configuration for Worker `new-corez`; package scripts `test:cloudflare`, `dev:worker`, and `deploy`.

- [ ] **Step 1: Write the failing Wrangler configuration contract**

Create executable `tests/cloudflare-worker-config-contract.sh`:

```bash
#!/usr/bin/env bash
set -u

config="wrangler.jsonc"
package="package.json"
readme="README.md"
failures=0

check() {
  local description="$1"
  local pattern="$2"
  local file="$3"
  if ! grep -Eq -- "$pattern" "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check 'Worker name matches the deployed Worker' '"name"[[:space:]]*:[[:space:]]*"new-corez"' "$config"
check 'Worker entrypoint is configured' '"main"[[:space:]]*:[[:space:]]*"[.]/worker/index[.]js"' "$config"
check 'Vite dist is the asset directory' '"directory"[[:space:]]*:[[:space:]]*"[.]/dist"' "$config"
check 'ASSETS binding is configured' '"binding"[[:space:]]*:[[:space:]]*"ASSETS"' "$config"
check 'SPA fallback is configured' '"not_found_handling"[[:space:]]*:[[:space:]]*"single-page-application"' "$config"
check 'API routes run Worker-first' '"run_worker_first"[[:space:]]*:[[:space:]]*\[[[:space:]]*"/api/[*]"' "$config"
check 'Cloudflare contract script exists' 'cloudflare-worker-contract[.]mjs' "$package"
check 'Wrangler local development script exists' '"dev:worker"' "$package"
check 'Wrangler deploy script exists' '"deploy"' "$package"
check 'README documents Cloudflare deployment' 'Cloudflare Worker' "$readme"
check 'README documents the build command' 'npm run build' "$readme"
check 'README documents the deploy command' 'npx wrangler deploy' "$readme"

if (( failures > 0 )); then
  printf '%d Cloudflare Worker configuration contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Cloudflare Worker configuration contract passed.\n'
```

- [ ] **Step 2: Run the configuration test and verify RED**

Run:

```bash
bash tests/cloudflare-worker-config-contract.sh
```

Expected: non-zero exit with failures because `wrangler.jsonc` and the package scripts do not exist.

- [ ] **Step 3: Add Wrangler and package scripts**

Run:

```bash
npm install --save-dev wrangler
```

Update `package.json` scripts to include:

```json
"test:cloudflare": "node tests/cloudflare-worker-contract.mjs && bash tests/cloudflare-worker-config-contract.sh",
"dev:worker": "npm run build && wrangler dev",
"deploy": "npm run build && wrangler deploy"
```

This command updates both `package.json` and `package-lock.json` with an exact compatible Wrangler dependency resolution.

- [ ] **Step 4: Add the Wrangler configuration**

Create `wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "new-corez",
  "main": "./worker/index.js",
  "compatibility_date": "2026-07-18",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  }
}
```

- [ ] **Step 5: Document Cloudflare deployment without secret values**

Extend `README.md` with a `Cloudflare Worker deployment` section containing:

````markdown
## Cloudflare Worker deployment

Corez deploys the Vite SPA and `/api/openrouter` together as the `new-corez`
Cloudflare Worker. Configure the connected Worker build with:

```text
Build command: npm run build
Deploy command: npx wrangler deploy
Root directory: /
Production branch: main
```

Add `OPENROUTER_API_KEY` as an encrypted runtime secret under **Settings →
Variables & Secrets**. `OPENROUTER_MODEL` and `OPENROUTER_REASONING_EFFORT` are
optional runtime variables. Do not add the API key to `wrangler.jsonc`.
````

- [ ] **Step 6: Run the Cloudflare contracts and verify GREEN**

Run:

```bash
npm run test:cloudflare
```

Expected: both Cloudflare contract tests pass and exit code is `0`.

- [ ] **Step 7: Inspect the deployment configuration checkpoint**

```bash
git diff --check
git diff -- tests/cloudflare-worker-config-contract.sh wrangler.jsonc package.json package-lock.json README.md
```

Expected: no whitespace errors, no secret values, and no unrelated changes.
Leave the changes uncommitted for the independent diff review.

---

### Task 3: Independent Review and Full Verification

**Files:**
- Review: all tracked staged and unstaged changes
- Modify only if review or verification identifies a scoped defect

**Interfaces:**
- Consumes: Worker and configuration from Tasks 1 and 2.
- Produces: independently reviewed, verified changes ready for `main` deployment.

- [ ] **Step 1: Run AGY diff review in analysis-only mode**

Use the repository wrapper where available:

```powershell
./scripts/agy-delegate.ps1 -Mode ReviewDiff -Task 'Review the Cloudflare Worker OpenRouter implementation for routing correctness, secret handling, runtime compatibility, error mapping, and missing tests.'
```

If PowerShell remains unavailable, use safe `agy --mode plan --sandbox --print` with a non-secret diff embedded in the prompt. Never use `--dangerously-skip-permissions`.

- [ ] **Step 2: Critically review AGY findings and the complete diff**

Run:

```bash
git diff --check
git diff --stat
git diff -- worker/index.js wrangler.jsonc package.json package-lock.json README.md tests/cloudflare-worker-contract.mjs tests/cloudflare-worker-config-contract.sh
```

Expected: no whitespace errors; every change stays within the approved design; no secret values appear.

- [ ] **Step 3: Run all repository contract tests**

Run:

```bash
for test_script in tests/*.sh; do bash "$test_script" || exit 1; done
node tests/cloudflare-worker-contract.mjs
```

Expected: every shell contract and the Worker behavior contract passes.

- [ ] **Step 4: Run lint and production build**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit `0` with no lint errors and Vite produces `dist`.

- [ ] **Step 5: Validate Wrangler configuration**

Run:

```bash
npx wrangler deploy --dry-run
```

Expected: Wrangler validates `wrangler.jsonc`, bundles `worker/index.js`, finds the `dist` assets, and exits `0` without deploying.

- [ ] **Step 6: Confirm clean task state and push**

Confirm the branch is `main`, stage all verified task files, and commit with:

```bash
git add worker/index.js wrangler.jsonc package.json package-lock.json README.md tests/cloudflare-worker-contract.mjs tests/cloudflare-worker-config-contract.sh docs/superpowers/plans/2026-07-18-cloudflare-worker-openrouter.md
git commit -m "feat: deploy OpenRouter through Cloudflare Worker"
```

Then fetch `origin/main`, rebase without merge commits, and push `main:main`
using the repository-local `git-superpowers` procedure.
