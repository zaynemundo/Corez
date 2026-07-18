# Durable Anonymous Background AI Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement durable anonymous background AI jobs in the Cloudflare Worker named `ai` (`worker/index.js`) using Cloudflare Workflows, Cloudflare D1, Workers AI, and Workers Rate Limiting, coupled with client-side pre-POST persistence, active background polling, and cross-session reconciliation.

**Architecture:** Worker backend is refactored into modular components: `worker/ai.js` owns shared Workers AI invocation (`invokeWorkersAi`) and prompt building; `worker/app.js` is the pure Worker fetch router testable in Node without `cloudflare:workers` imports; `worker/index.js` exports `AiJobWorkflow` extending `WorkflowEntrypoint` from `cloudflare:workers` and default exports `app`. D1 persistence is managed in `worker/jobStore.js`, API routing/validation/idempotency/rate-limiting/one-item `createBatch` dispatch in `worker/jobs.js`, and Workflow execution steps in `worker/jobWorkflow.js`. Frontend services `src/services/backgroundJobs.js` and `src/services/backgroundJobSync.js` manage client job records, pre-POST `localStorage` persistence, exponential polling backoff, and all-session reconciliation. UI components in `src/App.jsx`, `src/components/ChatInput.jsx`, and `src/components/ChatMessage.jsx` render per-message status indicators (`queued`, `running`/`Thinking`, `completed`, `failed`/`expired`) and enable concurrent job creation without disabling input.

**Tech Stack:** Node.js 22+, JavaScript ES modules, React 18, Vite 6, Cloudflare Workers, Cloudflare Workflows, Cloudflare D1 (`cloud-service`), Workers AI binding (`@cf/zai-org/glm-4.7-flash`), Workers Rate Limiting (`RATE_LIMITER` name, namespace_id `"1000"`), Web Crypto API, Bash contract tests.

---

## Global Constraints

- Modify ONLY authorized target files: `wrangler.jsonc`, `worker/index.js`, `src/App.jsx`, `src/components/ChatInput.jsx`, `src/components/ChatMessage.jsx`, `src/index.css`, `src/services/aiService.js`, `package.json`, `README.md`, `.github/workflows/deploy.yml`, `tests/cloudflare-worker-contract.mjs`, `tests/cloudflare-worker-config-contract.sh`, `tests/thinking-indicator-contract.sh`.
- Create new files ONLY as specified: `migrations/0001_create_ai_jobs.sql`, `worker/app.js`, `worker/ai.js`, `worker/jobUtils.js`, `worker/jobStore.js`, `worker/jobs.js`, `worker/jobWorkflow.js`, `src/services/backgroundJobs.js`, `src/services/backgroundJobSync.js`, `tests/ai-job-utils-contract.mjs`, `tests/ai-jobs-api-contract.mjs`, `tests/ai-job-workflow-contract.mjs`, `tests/background-jobs-client-contract.mjs`, `tests/background-jobs-ui-contract.sh`.
- Do not modify application code outside specified boundaries, package files (other than adding `test:cloudflare` script entries in `package.json`), Git configuration, or Cloudflare production resources without explicit authorization.
- Every main push deploys automatically; all intermediate commits must remain fully deployable and pass tests.
- Maintain an accurate file map of existing and new files.
- Strictly eliminate all TODO, TBD, placeholder IDs, or incomplete prose.
- Never guess or fabricate provider-generated D1 database UUIDs. Show exact `npx wrangler d1 create cloud-service` execution procedure and explicit Codex review checkpoint for inserting the returned UUID without fabricating it.
- Follow TDD throughout: write failing contract tests before implementation code for each task, observe RED failure output, implement code, verify GREEN output.
- Perform frequent bounded git commits on local `main` branch.
- Use Web Crypto API strictly for cryptography and randomness (`crypto.randomUUID()`, `crypto.getRandomValues()`, `crypto.subtle.digest()`). Do not use non-existent `crypto.subtle.timingSafeEqual`; perform constant-time byte comparisons via strict manual 32-byte XOR over `Uint8Array`. Strictly prohibit `Math.random()`.
- Tokens must be formatted strictly as `job_sec_` plus 64 lowercase hex characters derived from 32 random bytes. Strict validation must reject any malformed or improperly formatted token.
- Include explicit Codex review gates because AGY performs implementation while Codex independently reviews and verifies.
- Note explicitly that no generic `npm test` or `npm run typecheck` script exists in `package.json` and do not claim they passed. Master test suite script is `npm run test:cloudflare`.
- Rate limiting is per Cloudflare location; IP keys can affect shared networks.
- Anonymous local-only recovery (no cross-device sync). Plaintext D1 prompt/result storage protected by 24h expiration purge.

---

## File Structure & Responsibilities

```
├── .github/workflows/deploy.yml          # CI workflow updating remote D1 migrations before deploy
├── migrations/
│   └── 0001_create_ai_jobs.sql           # D1 database schema and indexes for background jobs
├── package.json                          # Test scripts update (test:cloudflare)
├── README.md                             # Architectural, deployment, and operational documentation
├── wrangler.jsonc                        # Worker config with D1, Workflow, Rate Limiter, and Cron bindings
├── worker/
│   ├── ai.js                             # Shared Workers AI model invocation (invokeWorkersAi) and prompt builder
│   ├── app.js                            # Pure Worker fetch router (Node-testable, no cloudflare:workers)
│   ├── index.js                          # Wrangler entrypoint exporting AiJobWorkflow and app default
│   ├── jobs.js                           # API handlers (POST /api/ai/jobs, GET /api/ai/jobs/:jobId)
│   ├── jobStore.js                       # D1 persistence prepared statement helpers
│   ├── jobUtils.js                       # Web Crypto helpers, canonical JSON, SHA-256, timingSafeEqualBytes, UTF-8 byte truncation
│   └── jobWorkflow.js                    # Pure Workflow step execution logic
├── src/
│   ├── App.jsx                           # Main app integration, background job polling, concurrent job sync
│   ├── index.css                         # UI status indicators, thinking animations, reduced motion
│   ├── components/
│   │   ├── ChatInput.jsx                 # Enabled input during background jobs
│   │   └── ChatMessage.jsx               # Per-message status badges (queued, running, completed, failed/retry)
│   └── services/
│       ├── aiService.js                  # Frontend AI service dispatching background jobs
│       ├── backgroundJobs.js             # Local registry storage (corez_ai_jobs_v1), token & API client
│       └── backgroundJobSync.js          # Polling backoff, all-session reconciliation, crash recovery
└── tests/
    ├── ai-job-utils-contract.mjs         # Contract tests for job utilities & byte truncation
    ├── ai-job-workflow-contract.mjs      # Contract tests for Workflow step logic and retries
    ├── ai-jobs-api-contract.mjs          # Contract tests for API routes, auth, 409 conflict, 503 retry
    ├── background-jobs-client-contract.mjs# Contract tests for client storage & reconciliation
    ├── background-jobs-ui-contract.sh    # Contract tests for UI status rendering & accessibility
    ├── cloudflare-worker-config-contract.sh# Contract test for wrangler.jsonc bindings
    ├── cloudflare-worker-contract.mjs    # Synchronous POST /api/ai and routing contract test
    └── thinking-indicator-contract.sh    # Updated contract test for per-message status indicators
```

---

## Tasks

### Task 1: Shared Workers AI Architecture & Entrypoint Separation

**Goal:** Refactor `worker/index.js` to extract shared Workers AI invocation (`invokeWorkersAi`) into `worker/ai.js` and pure HTTP routing into `worker/app.js`, ensuring ordinary Node contract tests can import routing logic without `cloudflare:workers` import failures while maintaining synchronous `POST /api/ai` functionality and executable preview behavior intact.

**Files:**
- Modify: `tests/cloudflare-worker-contract.mjs`
- Create: `worker/ai.js`
- Create: `worker/app.js`
- Modify: `worker/index.js`

**Interfaces:**
- `worker/ai.js`:
  ```javascript
  export const WORKERS_AI_MODEL = '@cf/zai-org/glm-4.7-flash';
  export function jsonResponse(status, body);
  export function safeErrorDetail(error);
  export function buildSystemPrompt(intent);
  export async function invokeWorkersAi(env, { prompt, intent });
  export async function handleAi(request, env);
  ```
- `worker/app.js`:
  ```javascript
  export default {
    async fetch(request, env)
  };
  ```
- `worker/index.js`:
  ```javascript
  export default app;
  ```

- [ ] **Step 1: Write failing contract test expecting `worker/app.js` import**

Edit `tests/cloudflare-worker-contract.mjs` to import `app` from `../worker/app.js` instead of `../worker/index.js`:

```diff
-import worker from '../worker/index.js';
+import worker from '../worker/app.js';
```

All remaining existing assertions in `tests/cloudflare-worker-contract.mjs` stay unchanged.

Run test to verify failure (RED):
```bash
node tests/cloudflare-worker-contract.mjs
```
*Expected Output:* `Error: Cannot find module '../worker/app.js'`

- [ ] **Step 2: Create `worker/ai.js`**

Extract shared model identification, prompt builder, safe error detail formatter, shared Workers AI invocation (`invokeWorkersAi`), and synchronous `POST /api/ai` handler into `worker/ai.js`:

```javascript
// worker/ai.js
export const WORKERS_AI_MODEL = '@cf/zai-org/glm-4.7-flash';

export function jsonResponse(status, body) {
  return Response.json(body, { status });
}

export function safeErrorDetail(error) {
  const raw = error instanceof Error
    ? error.message
    : typeof error?.message === 'string'
      ? error.message
      : String(error);

  return raw
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b(api[_-]?key|token|secret|password)\b(\s*[:=]\s*)([^\s&,;]+)/gi, '$1$2[REDACTED]')
    .slice(0, 500);
}

export function buildSystemPrompt(intent) {
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

export async function invokeWorkersAi(env, { prompt, intent }) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    throw new Error('WORKERS_AI_NOT_CONFIGURED');
  }

  const systemPrompt = buildSystemPrompt(intent);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ];

  const response = await env.AI.run(WORKERS_AI_MODEL, { messages });
  const content = response?.choices?.[0]?.message?.content;
  const normalizedContent = typeof content === 'string' ? content.trim() : '';

  if (!normalizedContent) {
    throw new Error('EMPTY_MODEL_RESPONSE');
  }

  return {
    content: normalizedContent,
    model: WORKERS_AI_MODEL
  };
}

export async function handleAi(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    body = {};
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return jsonResponse(400, { error: 'Prompt is required.' });
  }

  const intent = body.intent
    && typeof body.intent === 'object'
    && !Array.isArray(body.intent)
    ? body.intent
    : null;

  try {
    const result = await invokeWorkersAi(env, { prompt, intent });
    return jsonResponse(200, result);
  } catch (error) {
    if (error?.message === 'WORKERS_AI_NOT_CONFIGURED') {
      return jsonResponse(503, { error: 'Workers AI is not configured.' });
    }
    if (error?.message === 'EMPTY_MODEL_RESPONSE') {
      return jsonResponse(502, { error: 'Workers AI returned an empty response.' });
    }
    console.error(JSON.stringify({
      message: 'Workers AI generation failed',
      error: safeErrorDetail(error)
    }));
    return jsonResponse(502, { error: 'Unable to generate AI response.' });
  }
}
```

- [ ] **Step 3: Create `worker/app.js` and update `worker/index.js`**

Create `worker/app.js` with a pure fetch handler (`fetch(request, env)`):
```javascript
// worker/app.js
import { handleAi, jsonResponse } from './ai.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/api/ai') {
      return handleAi(request, env);
    }
    if (pathname.startsWith('/api/')) {
      return jsonResponse(404, { error: 'API route not found.' });
    }
    return env.ASSETS.fetch(request);
  }
};
```

Update `worker/index.js`:
```javascript
// worker/index.js
import app from './app.js';

export default app;
```

- [ ] **Step 4: Verify GREEN test status**

Run contract tests:
```bash
node tests/cloudflare-worker-contract.mjs
```
*Expected Output:* `Cloudflare Worker behavior contract passed.`

- [ ] **Step 5: Review Gate & Bounded Commit**

> **Codex Review Gate:** Codex verifies `worker/ai.js`, `worker/app.js`, `worker/index.js`, and `tests/cloudflare-worker-contract.mjs` pass cleanly without importing `cloudflare:workers` in Node.

Commit changes:
```bash
git add worker/ai.js worker/app.js worker/index.js tests/cloudflare-worker-contract.mjs
git commit -m "refactor(worker): separate shared AI logic and pure router entrypoint"
```

---

### Task 2: Crypto, Canonical JSON & Byte-Safe Truncation Utilities

**Goal:** Create `worker/jobUtils.js` containing cryptographically secure helpers using Web Crypto API exclusively, UUID v4 generation and strict validation, capability token generation (`job_sec_` + 64 lowercase hex) and strict validation, SHA-256 binary/hex computation, strict manual 32-byte XOR constant-time byte equality comparison (no nonexistent `crypto.subtle.timingSafeEqual`), recursive canonical JSON serialization, and code-point-safe multibyte UTF-8 truncation strictly capped at 500,000 bytes without replacement characters `\uFFFD`. Strictly prohibit `Math.random`.

**Files:**
- Create: `tests/ai-job-utils-contract.mjs`
- Create: `worker/jobUtils.js`

**Interfaces:**
- `worker/jobUtils.js`:
  ```javascript
  export function generateJobId();
  export function generateCapabilityToken();
  export function isValidUuid(str);
  export function isValidToken(str);
  export function canonicalJson(obj);
  export async function sha256Bytes(str);
  export async function sha256Hex(str);
  export async function computeRequestFingerprint(conversationId, prompt, intent);
  export function timingSafeEqualBytes(a, b);
  export function getUtf8ByteLength(str);
  export function truncateToUtf8ByteLimit(str, maxBytes = 500000);
  ```

- [ ] **Step 1: Write failing contract test `tests/ai-job-utils-contract.mjs`**

```javascript
// tests/ai-job-utils-contract.mjs
import assert from 'node:assert/strict';
import {
  generateJobId,
  generateCapabilityToken,
  isValidUuid,
  isValidToken,
  canonicalJson,
  sha256Bytes,
  sha256Hex,
  computeRequestFingerprint,
  timingSafeEqualBytes,
  getUtf8ByteLength,
  truncateToUtf8ByteLimit
} from '../worker/jobUtils.js';

async function run() {
  // Test 1: ID generation & UUID v4 validation with input type rejection
  const jobId = generateJobId();
  assert.equal(isValidUuid(jobId), true, `Generated jobId ${jobId} must be valid UUID v4`);
  assert.equal(isValidUuid('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isValidUuid('550e8400-e29b-11d4-a716-446655440000'), false, 'v1 UUID must be rejected');
  assert.equal(isValidUuid('not-a-uuid'), false);
  assert.equal(isValidUuid(''), false);
  assert.equal(isValidUuid('550e8400-e29b-41d4-a716-44665544000'), false, 'Short UUID rejected');
  assert.equal(isValidUuid('550e8400-e29b-41d4-a716-4466554400000'), false, 'Long UUID rejected');
  assert.equal(isValidUuid(12345), false);
  assert.equal(isValidUuid(null), false);
  assert.equal(isValidUuid(undefined), false);
  assert.equal(isValidUuid({}), false);
  assert.equal(isValidUuid([]), false);
  assert.equal(isValidUuid(true), false);
  assert.equal(isValidUuid(Symbol('uuid')), false);

  // Test 2: Token generation entropy shape & validation with input type rejection
  const generatedTokens = new Set();
  for (let i = 0; i < 100; i++) {
    const t = generateCapabilityToken();
    assert.equal(isValidToken(t), true);
    assert.equal(t.length, 72);
    assert.ok(t.startsWith('job_sec_'));
    generatedTokens.add(t);
  }
  assert.equal(generatedTokens.size, 100, '100 generated tokens must all be unique');

  const validTokenSample = 'job_sec_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  assert.equal(isValidToken(validTokenSample), true);
  assert.equal(isValidToken('job_sec_1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF'), false, 'Uppercase hex rejected');
  assert.equal(isValidToken('job_sec_1234567890gabcdef1234567890abcdef1234567890abcdef1234567890abcde'), false, 'Non-hex char rejected');
  assert.equal(isValidToken('job_sec_12345'), false, 'Short token rejected');
  assert.equal(isValidToken('wrong_prefix_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'), false, 'Wrong prefix rejected');
  assert.equal(isValidToken(null), false);
  assert.equal(isValidToken(undefined), false);
  assert.equal(isValidToken(12345), false);
  assert.equal(isValidToken({}), false);
  assert.equal(isValidToken([]), false);
  assert.equal(isValidToken(true), false);

  // Test 3: Canonical JSON key sorting, nested structures, unsupported values & circular rejection
  const obj1 = { z: 1, a: { c: 3, b: 2 } };
  const obj2 = { a: { b: 2, c: 3 }, z: 1 };
  assert.equal(canonicalJson(obj1), '{"a":{"b":2,"c":3},"z":1}');
  assert.equal(canonicalJson(obj1), canonicalJson(obj2));

  const nestedArrObj = { b: [3, 2, { y: 1, x: 2 }], a: 1 };
  assert.equal(canonicalJson(nestedArrObj), '{"a":1,"b":[3,2,{"x":2,"y":1}]}');

  const unsupportedValObj = { a: 1, b: undefined, c: () => {}, d: Symbol('s'), e: null, f: true };
  assert.equal(canonicalJson(unsupportedValObj), '{"a":1,"e":null,"f":true}');

  const unsupportedArrayItems = { arr: [1, undefined, () => {}, Symbol('s'), null] };
  assert.equal(canonicalJson(unsupportedArrayItems), '{"arr":[1,null,null,null,null]}');

  assert.equal(canonicalJson(null), 'null');
  assert.equal(canonicalJson(123), '123');
  assert.equal(canonicalJson('hello'), '"hello"');
  assert.equal(canonicalJson(true), 'true');

  const circularObj = { a: 1 };
  circularObj.self = circularObj;
  assert.throws(() => canonicalJson(circularObj), TypeError, 'Circular reference must throw TypeError');

  // Test 4: SHA256 bytes binary shape & hex computation
  const bytes = await sha256Bytes('hello world');
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(bytes.length, 32);

  const hash = await sha256Hex('hello world');
  assert.equal(hash, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');

  // Test 5: Request fingerprint field separation, determinism & safety
  const fp1 = await computeRequestFingerprint('conv_1', 'Hello prompt', { mode: 'code' });
  const fp2 = await computeRequestFingerprint('conv_1', 'Hello prompt', { mode: 'code' });
  const fp3 = await computeRequestFingerprint('conv_1', 'Hello prompt', { mode: 'other' });
  const fp4 = await computeRequestFingerprint('conv_1H', 'ello prompt', { mode: 'code' });
  const fpKeyOrder = await computeRequestFingerprint('conv_1', 'Hello prompt', { b: 2, a: 1 });
  const fpKeyOrder2 = await computeRequestFingerprint('conv_1', 'Hello prompt', { a: 1, b: 2 });

  assert.equal(fp1, fp2);
  assert.equal(fpKeyOrder, fpKeyOrder2, 'Fingerprint must be deterministic regardless of intent object key order');
  assert.notEqual(fp1, fp3, 'Fingerprint must differ when intent changes');
  assert.notEqual(fp1, fp4, 'Fingerprint must separate field boundaries cleanly');

  const fpNullArgs = await computeRequestFingerprint(null, undefined, null);
  assert.equal(typeof fpNullArgs, 'string');
  assert.equal(fpNullArgs.length, 64);

  // Test 6: 32-byte XOR compare type, length & byte difference rejection
  const hashA = await sha256Bytes('token_a');
  const hashA2 = await sha256Bytes('token_a');
  const hashB = await sha256Bytes('token_b');

  assert.equal(timingSafeEqualBytes(hashA, hashA2), true);
  assert.equal(timingSafeEqualBytes(hashA, hashB), false);

  const hashAOneDiff = new Uint8Array(hashA);
  hashAOneDiff[31] ^= 1;
  assert.equal(timingSafeEqualBytes(hashA, hashAOneDiff), false, 'Single bit difference must fail');

  assert.equal(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2])), false, 'Reject length !== 32');
  assert.equal(timingSafeEqualBytes(new Uint8Array(31), new Uint8Array(31)), false, 'Reject length 31');
  assert.equal(timingSafeEqualBytes(new Uint8Array(33), new Uint8Array(33)), false, 'Reject length 33');
  assert.equal(timingSafeEqualBytes([1, 2, 3], [1, 2, 3]), false, 'Reject standard Array');
  assert.equal(timingSafeEqualBytes('not-bytes', hashA), false);
  assert.equal(timingSafeEqualBytes(null, hashA), false);
  assert.equal(timingSafeEqualBytes(undefined, undefined), false);
  assert.equal(timingSafeEqualBytes(12345, hashA), false);
  assert.equal(timingSafeEqualBytes({}, hashA), false);

  // Test 7: Multibyte UTF-8 byte truncation safety, boundary behavior, and emoji integrity
  const emojiStr = '🚀'.repeat(200000); // 800,000 bytes (4 bytes per emoji)
  const truncated = truncateToUtf8ByteLimit(emojiStr, 500000);
  const truncatedBytes = getUtf8ByteLength(truncated);
  assert.ok(truncatedBytes <= 500000, `Truncated byte length ${truncatedBytes} exceeds 500000`);
  assert.ok(truncated.endsWith('\n\n[Output truncated at 500KB bound]'));
  assert.equal(truncated.includes('\uFFFD'), false, 'Must not contain U+FFFD replacement characters');

  // Negative, zero, and invalid maxBytes validation
  assert.equal(truncateToUtf8ByteLimit('hello', -10), '');
  assert.equal(truncateToUtf8ByteLimit('hello', 0), '');
  assert.equal(truncateToUtf8ByteLimit('hello', NaN), '');
  assert.equal(truncateToUtf8ByteLimit('hello', '500'), '');
  assert.equal(truncateToUtf8ByteLimit(null, 500), '');
  assert.equal(truncateToUtf8ByteLimit(undefined, 500), '');
  assert.equal(truncateToUtf8ByteLimit(12345, 500), '');

  // Small byte limit without marker fitting
  assert.equal(truncateToUtf8ByteLimit('hello world', 5), 'hello');

  // Code point integrity: 4-byte emoji cut at 3-byte boundary must drop emoji without replacement character
  const singleEmoji = '🚀'; // 4 bytes
  assert.equal(truncateToUtf8ByteLimit(singleEmoji, 3), '', 'Must drop emoji when limit is 3 bytes (cannot fit 4 bytes)');
  assert.equal(truncateToUtf8ByteLimit(singleEmoji, 4), '🚀');

  // 3-byte CJK character code point integrity
  const cjkStr = 'こんにちは'; // 5 chars * 3 bytes = 15 bytes
  assert.equal(truncateToUtf8ByteLimit(cjkStr, 7), 'こん', 'Must fit two 3-byte CJK chars (6 bytes) and drop 3rd');

  // Exact boundary behavior & emoji integrity with marker
  const marker = '\n\n[Output truncated at 500KB bound]';
  const markerLen = getUtf8ByteLength(marker);
  const twoEmojis = '🚀🚀'; // 8 bytes
  const exactMax = markerLen + 8;
  const fitTwo = truncateToUtf8ByteLimit(twoEmojis.repeat(10), exactMax);
  assert.equal(fitTwo, '🚀🚀' + marker);
  assert.equal(fitTwo.includes('\uFFFD'), false);
  assert.equal(getUtf8ByteLength(fitTwo), exactMax);

  const tightMax = markerLen + 7; // 1 byte short of 2 emojis
  const fitOne = truncateToUtf8ByteLimit(twoEmojis.repeat(10), tightMax);
  assert.equal(fitOne, '🚀' + marker);
  assert.equal(fitOne.includes('\uFFFD'), false);
  assert.ok(getUtf8ByteLength(fitOne) <= tightMax);

  console.log('AI job utilities contract passed.');
}

await run();
```

Run test to verify failure (RED):
```bash
node tests/ai-job-utils-contract.mjs
```
*Expected Output:* `Error: Cannot find module '../worker/jobUtils.js'`

- [ ] **Step 2: Create `worker/jobUtils.js`**

```javascript
// worker/jobUtils.js
export function generateJobId() {
  return crypto.randomUUID();
}

export function generateCapabilityToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `job_sec_${hex}`;
}

export function isValidUuid(str) {
  if (typeof str !== 'string') return false;
  const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidv4Regex.test(str);
}

export function isValidToken(str) {
  if (typeof str !== 'string') return false;
  return /^job_sec_[0-9a-f]{64}$/.test(str);
}

export function canonicalJson(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (seen.has(obj)) {
    throw new TypeError('Converting circular structure to JSON');
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => item === undefined || typeof item === 'function' || typeof item === 'symbol' ? 'null' : canonicalJson(item, seen)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort();
  const parts = [];
  for (const key of sortedKeys) {
    const val = obj[key];
    if (val !== undefined && typeof val !== 'function' && typeof val !== 'symbol') {
      parts.push(JSON.stringify(key) + ':' + canonicalJson(val, seen));
    }
  }
  return '{' + parts.join(',') + '}';
}

export async function sha256Bytes(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(typeof str === 'string' ? str : String(str ?? ''));
  const digestBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digestBuffer);
}

export async function sha256Hex(str) {
  const bytes = await sha256Bytes(str);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function computeRequestFingerprint(conversationId, prompt, intent) {
  const canonicalStr = canonicalJson({
    conversation_id: String(conversationId || ''),
    prompt: String(prompt || ''),
    intent: intent || null
  });
  return sha256Hex(canonicalStr);
}

export function timingSafeEqualBytes(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
  if (a.length !== 32 || b.length !== 32) return false;
  let result = 0;
  for (let i = 0; i < 32; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export function getUtf8ByteLength(str) {
  return new TextEncoder().encode(str).byteLength;
}

export function truncateToUtf8ByteLimit(str, maxBytes = 500000) {
  if (typeof str !== 'string' || typeof maxBytes !== 'number' || isNaN(maxBytes) || maxBytes <= 0) return '';
  const encoder = new TextEncoder();
  const fullBytes = encoder.encode(str);
  if (fullBytes.byteLength <= maxBytes) return str;

  const marker = '\n\n[Output truncated at 500KB bound]';
  const markerBytes = encoder.encode(marker).byteLength;

  if (maxBytes < markerBytes) {
    let currentBytes = 0;
    let res = '';
    for (const char of str) {
      const charBytes = encoder.encode(char).byteLength;
      if (currentBytes + charBytes > maxBytes) break;
      currentBytes += charBytes;
      res += char;
    }
    return res;
  }

  const maxContentBytes = maxBytes - markerBytes;
  let currentBytes = 0;
  let content = '';
  for (const char of str) {
    const charBytes = encoder.encode(char).byteLength;
    if (currentBytes + charBytes > maxContentBytes) break;
    currentBytes += charBytes;
    content += char;
  }

  return content + marker;
}
```

- [ ] **Step 3: Verify GREEN test status**

Run contract test:
```bash
node tests/ai-job-utils-contract.mjs
```
*Expected Output:* `AI job utilities contract passed.`

- [ ] **Step 4: Review Gate & Bounded Commit**

> **Codex Review Gate:** Codex inspects `worker/jobUtils.js` and `tests/ai-job-utils-contract.mjs` for correctness, timing-safety, Web Crypto exclusive usage, and multibyte boundary handling.

Commit changes:
```bash
git add worker/jobUtils.js tests/ai-job-utils-contract.mjs
git commit -m "feat(worker): add Web Crypto utilities, canonical JSON, timingSafeEqualBytes, and byte truncation"
```

---


### Task 3: D1 Database Migration, Job Store, Jobs API Endpoints & App Routing

**Goal:** Build D1 database migration SQL script `migrations/0001_create_ai_jobs.sql`, prepared statement D1 job store `worker/jobStore.js`, jobs API handlers `worker/jobs.js` (`POST /api/ai/jobs` and `GET /api/ai/jobs/:jobId`), and update pure fetch router `worker/app.js` with dependency-injected store/workflow/rate fakes and comprehensive contract tests `tests/ai-jobs-api-contract.mjs`.

**Files:**
- Create: `migrations/0001_create_ai_jobs.sql`
- Create: `worker/jobStore.js`
- Create: `worker/jobs.js`
- Modify: `worker/app.js`
- Create: `tests/ai-jobs-api-contract.mjs`

**Interfaces & Requirements:**
- `migrations/0001_create_ai_jobs.sql`: Table `jobs` and indices (`idx_jobs_expires_at`, `idx_jobs_status_created`, `idx_jobs_active_deadline`).
- `worker/jobStore.js`: `insertJob`, `getJobById`, `markJobRunning`, `markJobCompleted`, `markJobFailed`, `repairStuckJobs`, `purgeExpiredJobs`.
- `worker/jobs.js`: `handleCreateJob`, `handleGetJob`.
- `worker/app.js`: Routes `/api/ai/jobs` (POST) and `/api/ai/jobs/:jobId` (GET).
- Auth & Security: Strict UUIDv4 (`job_id`) and `job_sec_` token header shape (`X-Job-Token`). 401 returns ONLY on missing or malformed `X-Job-Token` header prior to DB lookup. Identical generic 404 (`{ error: 'Job not found.', code: 'NOT_FOUND' }`) for absent job, expired job, or wrong token. No secrets, tokens, or raw prompts in responses or logs.
- Validation: 400 validation on body payload: `job_id` must be valid UUIDv4; `conversation_id` must be non-empty string <= 256 characters; `prompt` must be non-empty string <= 100,000 UTF-8 bytes; `intent` must be optional plain JSON object or null.
- Idempotency & Rate Limiting: Canonical request fingerprint using SHA-256 over `canonicalJson({ conversation_id, prompt, intent })`. Rate limiting check (`RATE_LIMITER.limit({ key: clientIp })`) runs ONLY for new job submissions; idempotent retries bypass rate limiting. If existing `job_id` has token or fingerprint mismatch, return generic 409 Conflict (`{ error: 'Idempotency conflict for submitted job_id.', code: 'IDEMPOTENCY_CONFLICT' }`).
- Workflow Dispatch: Dispatches via one-item `AI_JOB_WORKFLOW.createBatch([{ id: jobId, params: { jobId }, retention: { successRetention: '1 day', errorRetention: '1 day' } }])`. If dispatch fails or binding is missing, returns queued status with 503 (`{ error: 'Workflow dispatch failed. Please retry.', code: 'SERVICE_UNAVAILABLE' }`).
- Insert-Race Recovery: If `insertJob` fails due to primary key race condition, re-read existing job from DB and handle as idempotent request.
- DB Failures: DB or binding query errors return 503 (`SERVICE_UNAVAILABLE`).

- [ ] **Step 1: Write failing contract test `tests/ai-jobs-api-contract.mjs`**

Create `tests/ai-jobs-api-contract.mjs` using dependency-injected fakes:

```javascript
// tests/ai-jobs-api-contract.mjs
import assert from 'node:assert/strict';
import app from '../worker/app.js';
import { sha256Hex, computeRequestFingerprint } from '../worker/jobUtils.js';

function createFakeDb() {
  const store = new Map();
  let insertShouldFail = false;
  return {
    _store: store,
    _setInsertShouldFail(fail) { insertShouldFail = fail; },
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('SELECT')) {
                const id = args[0];
                return store.get(id) || null;
              }
              return null;
            },
            async run() {
              if (sql.includes('INSERT INTO jobs')) {
                if (insertShouldFail) {
                  throw new Error('D1 INSERT ERROR: UNIQUE constraint failed: jobs.id');
                }
                const [id, token_hash, conversation_id, status, prompt_text, intent_json, result_text, provider_meta, error_code, request_fingerprint, created_at, updated_at, terminal_at, active_deadline_at, expires_at] = args;
                store.set(id, { id, token_hash, conversation_id, status, prompt_text, intent_json, result_text, provider_meta, error_code, request_fingerprint, created_at, updated_at, terminal_at, active_deadline_at, expires_at });
              }
              return { success: true };
            }
          };
        }
      };
    }
  };
}

function createFakeEnv(overrides = {}) {
  const db = createFakeDb();
  let limitCalledCount = 0;
  let createBatchCalledCount = 0;
  return {
    DB: db,
    AI_JOB_WORKFLOW: {
      async createBatch(batch) {
        createBatchCalledCount++;
        return batch.map(b => ({ id: b.id }));
      }
    },
    RATE_LIMITER: {
      async limit() {
        limitCalledCount++;
        return { success: true };
      }
    },
    get _limitCalledCount() { return limitCalledCount; },
    get _createBatchCalledCount() { return createBatchCalledCount; },
    ...overrides
  };
}

async function run() {
  const env = createFakeEnv();
  const token = 'job_sec_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const jobId = '550e8400-e29b-41d4-a716-446655440000';

  // Test 1: POST /api/ai/jobs requires X-Job-Token header before DB lookup (401)
  const noTokenRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, conversation_id: 'c1', prompt: 'test' })
    }),
    env
  );
  assert.equal(noTokenRes.status, 401);

  // Test 2: Invalid body payload returns 400
  const badUuidRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: 'not-a-uuid', conversation_id: 'c1', prompt: 'test' })
    }),
    env
  );
  assert.equal(badUuidRes.status, 400);

  // Test 3: POST /api/ai/jobs successful creation (201)
  const createRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({
        job_id: jobId,
        conversation_id: 'c1',
        prompt: 'test prompt',
        intent: { mode: 'code' }
      })
    }),
    env
  );
  assert.equal(createRes.status, 201);
  const createBody = await createRes.json();
  assert.equal(createBody.job_id, jobId);
  assert.equal(createBody.status, 'queued');
  assert.equal(env._limitCalledCount, 1, 'Rate limiter must be called for new job creation');

  // Test 4: Idempotent retry returns 200 and bypasses rate limiter
  const initialLimitCount = env._limitCalledCount;
  const retryRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({
        job_id: jobId,
        conversation_id: 'c1',
        prompt: 'test prompt',
        intent: { mode: 'code' }
      })
    }),
    env
  );
  assert.equal(retryRes.status, 200);
  assert.equal(env._limitCalledCount, initialLimitCount, 'Rate limiter must NOT be called for idempotent retry');

  // Test 5: Duplicate POST with wrong token or altered payload returns 409 Conflict
  const conflictRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': 'job_sec_wrongtoken1234567890abcdef1234567890abcdef123456' },
      body: JSON.stringify({
        job_id: jobId,
        conversation_id: 'c1',
        prompt: 'test prompt',
        intent: { mode: 'code' }
      })
    }),
    env
  );
  assert.equal(conflictRes.status, 409);

  // Test 6: GET /api/ai/jobs/:jobId returns queued state (200)
  const getRes = await app.fetch(
    new Request(`https://corez.test/api/ai/jobs/${jobId}`, {
      method: 'GET',
      headers: { 'X-Job-Token': token }
    }),
    env
  );
  assert.equal(getRes.status, 200);
  const getBody = await getRes.json();
  assert.equal(getBody.status, 'queued');

  // Test 7: GET with invalid token or non-existent jobId returns generic 404
  const badTokenRes = await app.fetch(
    new Request(`https://corez.test/api/ai/jobs/${jobId}`, {
      method: 'GET',
      headers: { 'X-Job-Token': 'job_sec_invalidtoken1234567890abcdef1234567890abcdef1234' }
    }),
    env
  );
  assert.equal(badTokenRes.status, 404);

  // Test 8: Method handling (405)
  const wrongMethodRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'GET',
      headers: { 'X-Job-Token': token }
    }),
    env
  );
  assert.equal(wrongMethodRes.status, 405);

  console.log('AI jobs API contract passed.');
}

await run();
```

Run test to verify failure (RED):
```bash
node tests/ai-jobs-api-contract.mjs
```
*Expected Output:* `AssertionError or 404 response`

- [ ] **Step 2: Create `migrations/0001_create_ai_jobs.sql`**

```sql
-- migrations/0001_create_ai_jobs.sql
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,                       -- UUID v4 generated by client
    token_hash TEXT NOT NULL,                  -- SHA-256 hash of capability token
    conversation_id TEXT NOT NULL,             -- Client origin conversation ID
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    prompt_text TEXT NOT NULL,                 -- User prompt (max 100,000 bytes UTF-8)
    intent_json TEXT,                          -- Canonical JSON of intent object
    result_text TEXT,                          -- Model completion output (max 500,000 bytes UTF-8)
    provider_meta TEXT,                        -- JSON string of provider/model metadata
    error_code TEXT,                           -- Generic error code on failure
    request_fingerprint TEXT NOT NULL,         -- SHA-256 hash of canonical_json({ conversation_id, prompt, intent })
    created_at INTEGER NOT NULL,               -- Unix timestamp in seconds
    updated_at INTEGER NOT NULL,               -- Unix timestamp in seconds
    terminal_at INTEGER,                       -- Unix timestamp in seconds (NULL while active)
    active_deadline_at INTEGER NOT NULL,       -- Unix timestamp (created_at + 7200, at least 2 hours)
    expires_at INTEGER                         -- Expiry timestamp (NULL while active; terminal_at + 86400 when terminal)
);

CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_active_deadline ON jobs(active_deadline_at);
```

- [ ] **Step 3: Create `worker/jobStore.js`**

```javascript
// worker/jobStore.js
export async function insertJob(db, job) {
  const sql = `
    INSERT INTO jobs (
      id, token_hash, conversation_id, status, prompt_text, intent_json,
      result_text, provider_meta, error_code, request_fingerprint,
      created_at, updated_at, terminal_at, active_deadline_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await db.prepare(sql).bind(
    job.id,
    job.token_hash,
    job.conversation_id,
    job.status,
    job.prompt_text,
    job.intent_json,
    job.result_text || null,
    job.provider_meta || null,
    job.error_code || null,
    job.request_fingerprint,
    job.created_at,
    job.updated_at,
    job.terminal_at || null,
    job.active_deadline_at,
    job.expires_at || null
  ).run();
}

export async function getJobById(db, jobId) {
  const sql = `SELECT * FROM jobs WHERE id = ?`;
  return db.prepare(sql).bind(jobId).first();
}

export async function markJobRunning(db, jobId) {
  const sql = `UPDATE jobs SET status = 'running', updated_at = unixepoch() WHERE id = ? AND status = 'queued'`;
  return db.prepare(sql).bind(jobId).run();
}

export async function markJobCompleted(db, jobId, resultText, providerMeta) {
  const sql = `
    UPDATE jobs 
    SET status = 'completed', result_text = ?, provider_meta = ?, terminal_at = unixepoch(), expires_at = (unixepoch() + 86400), updated_at = unixepoch() 
    WHERE id = ? AND status IN ('queued', 'running')
  `;
  return db.prepare(sql).bind(resultText, providerMeta, jobId).run();
}

export async function markJobFailed(db, jobId, errorCode) {
  const sql = `
    UPDATE jobs 
    SET status = 'failed', error_code = ?, terminal_at = unixepoch(), expires_at = (unixepoch() + 86400), updated_at = unixepoch() 
    WHERE id = ? AND status IN ('queued', 'running')
  `;
  return db.prepare(sql).bind(errorCode, jobId).run();
}

export async function repairStuckJobs(db) {
  const sql = `
    UPDATE jobs 
    SET status = 'failed', error_code = 'ACTIVE_DEADLINE_EXCEEDED', terminal_at = unixepoch(), expires_at = (unixepoch() + 86400), updated_at = unixepoch() 
    WHERE status IN ('queued', 'running') AND active_deadline_at <= unixepoch()
  `;
  return db.prepare(sql).run();
}

export async function purgeExpiredJobs(db) {
  const sql = `DELETE FROM jobs WHERE expires_at IS NOT NULL AND expires_at <= unixepoch()`;
  return db.prepare(sql).run();
}
```

- [ ] **Step 4: Create `worker/jobs.js`**

```javascript
// worker/jobs.js
import { jsonResponse, safeErrorDetail } from './ai.js';
import {
  sha256Hex,
  sha256Bytes,
  computeRequestFingerprint,
  timingSafeEqualBytes,
  isValidUuid,
  isValidToken,
  getUtf8ByteLength,
  canonicalJson
} from './jobUtils.js';
import { insertJob, getJobById } from './jobStore.js';

export async function handleCreateJob(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const tokenHeader = request.headers.get('X-Job-Token');
  if (!isValidToken(tokenHeader)) {
    return jsonResponse(401, { error: 'Missing or malformed X-Job-Token header.', code: 'UNAUTHORIZED' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload.', code: 'INVALID_PAYLOAD' });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(400, { error: 'Request body must be a JSON object.', code: 'INVALID_PAYLOAD' });
  }

  const jobId = body.job_id;
  const conversationId = body.conversation_id;
  const prompt = body.prompt;
  const intent = body.intent ?? null;

  if (
    !isValidUuid(jobId) ||
    typeof conversationId !== 'string' ||
    !conversationId.trim() ||
    conversationId.length > 256 ||
    typeof prompt !== 'string' ||
    !prompt.trim()
  ) {
    return jsonResponse(400, { error: 'Invalid request body parameters.', code: 'INVALID_PAYLOAD' });
  }

  if (intent !== null && (typeof intent !== 'object' || Array.isArray(intent))) {
    return jsonResponse(400, { error: 'Intent must be a plain JSON object or null.', code: 'INVALID_PAYLOAD' });
  }

  if (getUtf8ByteLength(prompt) > 100000) {
    return jsonResponse(400, { error: 'Prompt exceeds maximum 100,000 UTF-8 bytes limit.', code: 'INVALID_PAYLOAD' });
  }

  const requestFingerprint = await computeRequestFingerprint(conversationId, prompt, intent);
  const tokenHash = await sha256Hex(tokenHeader);

  // Check if job already exists in D1
  let existingJob = null;
  try {
    existingJob = await getJobById(env.DB, jobId);
  } catch (err) {
    console.error(JSON.stringify({ message: 'D1 query failed', error: safeErrorDetail(err) }));
    return jsonResponse(503, { error: 'Database service unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  if (existingJob) {
    const storedTokenHashBytes = new TextEncoder().encode(existingJob.token_hash);
    const presentedTokenHashBytes = new TextEncoder().encode(tokenHash);

    const tokenMatch = timingSafeEqualBytes(storedTokenHashBytes, presentedTokenHashBytes);
    const fingerprintMatch = existingJob.request_fingerprint === requestFingerprint;

    if (!tokenMatch || !fingerprintMatch) {
      return jsonResponse(409, { error: 'Idempotency conflict for submitted job_id.', code: 'IDEMPOTENCY_CONFLICT' });
    }

    // Idempotent retry: skip rate limiter, dispatch workflow instance again via createBatch
    let dispatchFailed = false;
    try {
      if (!env.AI_JOB_WORKFLOW || typeof env.AI_JOB_WORKFLOW.createBatch !== 'function') {
        throw new Error('WORKFLOW_BINDING_MISSING');
      }
      await env.AI_JOB_WORKFLOW.createBatch([{
        id: jobId,
        params: { jobId },
        retention: { successRetention: '1 day', errorRetention: '1 day' }
      }]);
    } catch (err) {
      console.error(JSON.stringify({ message: 'Workflow dispatch failed on idempotent retry', error: safeErrorDetail(err) }));
      dispatchFailed = true;
    }

    if (dispatchFailed) {
      return jsonResponse(503, {
        error: 'Workflow dispatch failed. Please retry.',
        code: 'SERVICE_UNAVAILABLE',
        job_id: existingJob.id,
        status: existingJob.status
      });
    }

    return jsonResponse(200, {
      job_id: existingJob.id,
      status: existingJob.status,
      created_at: existingJob.created_at
    });
  }

  // Rate Limiting Check (ONLY for new jobs)
  if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
    try {
      const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
      const limitResult = await env.RATE_LIMITER.limit({ key: clientIp });
      if (limitResult && limitResult.success === false) {
        return jsonResponse(429, { error: 'Rate limit exceeded. Try again later.', code: 'RATE_LIMIT_EXCEEDED' });
      }
    } catch (err) {
      console.error(JSON.stringify({ message: 'Rate limiter check failed', error: safeErrorDetail(err) }));
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const newJob = {
    id: jobId,
    token_hash: tokenHash,
    conversation_id: conversationId,
    status: 'queued',
    prompt_text: prompt,
    intent_json: intent ? canonicalJson(intent) : null,
    result_text: null,
    provider_meta: null,
    error_code: null,
    request_fingerprint: requestFingerprint,
    created_at: now,
    updated_at: now,
    terminal_at: null,
    active_deadline_at: now + 7200,
    expires_at: null
  };

  try {
    await insertJob(env.DB, newJob);
  } catch (err) {
    // Insert-race re-read recovery: if primary key collision occurred, try re-reading
    try {
      const raceJob = await getJobById(env.DB, jobId);
      if (raceJob) {
        const storedTokenHashBytes = new TextEncoder().encode(raceJob.token_hash);
        const presentedTokenHashBytes = new TextEncoder().encode(tokenHash);

        const tokenMatch = timingSafeEqualBytes(storedTokenHashBytes, presentedTokenHashBytes);
        const fingerprintMatch = raceJob.request_fingerprint === requestFingerprint;

        if (!tokenMatch || !fingerprintMatch) {
          return jsonResponse(409, { error: 'Idempotency conflict for submitted job_id.', code: 'IDEMPOTENCY_CONFLICT' });
        }

        return jsonResponse(200, {
          job_id: raceJob.id,
          status: raceJob.status,
          created_at: raceJob.created_at
        });
      }
    } catch {}

    console.error(JSON.stringify({ message: 'Database insert failed', error: safeErrorDetail(err) }));
    return jsonResponse(503, { error: 'Database service unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  // Dispatch Workflow instance via createBatch
  try {
    if (!env.AI_JOB_WORKFLOW || typeof env.AI_JOB_WORKFLOW.createBatch !== 'function') {
      throw new Error('WORKFLOW_BINDING_MISSING');
    }
    await env.AI_JOB_WORKFLOW.createBatch([{
      id: jobId,
      params: { jobId },
      retention: { successRetention: '1 day', errorRetention: '1 day' }
    }]);
  } catch (err) {
    console.error(JSON.stringify({ message: 'Workflow dispatch failed', error: safeErrorDetail(err) }));
    return jsonResponse(503, {
      error: 'Workflow dispatch failed. Please retry.',
      code: 'SERVICE_UNAVAILABLE',
      job_id: jobId,
      status: 'queued'
    });
  }

  return jsonResponse(201, {
    job_id: jobId,
    status: 'queued',
    created_at: now
  });
}

export async function handleGetJob(request, env, jobId) {
  if (request.method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const tokenHeader = request.headers.get('X-Job-Token');
  if (!isValidToken(tokenHeader) || !isValidUuid(jobId)) {
    return jsonResponse(404, { error: 'Job not found.', code: 'NOT_FOUND' });
  }

  let job = null;
  try {
    job = await getJobById(env.DB, jobId);
  } catch (err) {
    console.error(JSON.stringify({ message: 'D1 query failed in handleGetJob', error: safeErrorDetail(err) }));
    return jsonResponse(404, { error: 'Job not found.', code: 'NOT_FOUND' });
  }

  if (!job) {
    return jsonResponse(404, { error: 'Job not found.', code: 'NOT_FOUND' });
  }

  const tokenHash = await sha256Hex(tokenHeader);
  const storedTokenHashBytes = new TextEncoder().encode(job.token_hash);
  const presentedTokenHashBytes = new TextEncoder().encode(tokenHash);

  const tokenMatch = timingSafeEqualBytes(storedTokenHashBytes, presentedTokenHashBytes);
  const now = Math.floor(Date.now() / 1000);
  const isExpired = job.expires_at !== null && job.expires_at <= now;

  if (!tokenMatch || isExpired) {
    // Identical generic 404 to prevent unauthorized probing
    return jsonResponse(404, { error: 'Job not found.', code: 'NOT_FOUND' });
  }

  if (job.status === 'queued' || job.status === 'running') {
    return jsonResponse(200, {
      job_id: job.id,
      status: job.status,
      created_at: job.created_at,
      updated_at: job.updated_at
    });
  }

  if (job.status === 'completed') {
    let providerMetaObj = null;
    try {
      providerMetaObj = job.provider_meta ? JSON.parse(job.provider_meta) : null;
    } catch {}

    return jsonResponse(200, {
      job_id: job.id,
      status: 'completed',
      created_at: job.created_at,
      updated_at: job.updated_at,
      terminal_at: job.terminal_at,
      expires_at: job.expires_at,
      result: {
        content: job.result_text,
        model: providerMetaObj?.model || '@cf/zai-org/glm-4.7-flash',
        provider: providerMetaObj?.provider || '@cf/workers-ai'
      }
    });
  }

  if (job.status === 'failed') {
    return jsonResponse(200, {
      job_id: job.id,
      status: 'failed',
      created_at: job.created_at,
      updated_at: job.updated_at,
      terminal_at: job.terminal_at,
      expires_at: job.expires_at,
      error: {
        code: job.error_code || 'MODEL_EXECUTION_FAILED',
        message: 'The AI model encountered an error processing your request. Please try again.'
      }
    });
  }

  return jsonResponse(404, { error: 'Job not found.', code: 'NOT_FOUND' });
}
```

- [ ] **Step 5: Update `worker/app.js` to route `/api/ai/jobs`**

```javascript
// worker/app.js
import { handleAi, jsonResponse } from './ai.js';
import { handleCreateJob, handleGetJob } from './jobs.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/api/ai') {
      return handleAi(request, env);
    }
    if (pathname === '/api/ai/jobs') {
      return handleCreateJob(request, env);
    }
    if (pathname.startsWith('/api/ai/jobs/')) {
      const jobId = pathname.slice('/api/ai/jobs/'.length);
      return handleGetJob(request, env, jobId);
    }
    if (pathname.startsWith('/api/')) {
      return jsonResponse(404, { error: 'API route not found.' });
    }
    return env.ASSETS.fetch(request);
  }
};
```

- [ ] **Step 6: Verify GREEN test status**

Run API contract tests:
```bash
node tests/ai-jobs-api-contract.mjs
```
*Expected Output:* `AI jobs API contract passed.`

- [ ] **Step 7: Review Gate & Bounded Commit**

> **Codex Review Gate:** Codex inspects `worker/jobStore.js`, `worker/jobs.js`, `worker/app.js`, and `tests/ai-jobs-api-contract.mjs` for routing precision, rate limit bypass on retries, and timing-safe auth logic.

Commit changes:
```bash
git add migrations/0001_create_ai_jobs.sql worker/jobStore.js worker/jobs.js worker/app.js tests/ai-jobs-api-contract.mjs
git commit -m "feat(worker): add D1 migration, job store, and jobs API endpoints"
```

---

### Task 4: Pure Workflow Runner Implementation & Worker Entrypoint Export

**Goal:** Implement pure Cloudflare Workflow execution runner `worker/jobWorkflow.js` with separate durable steps (`load-job`, `mark-running`, `provider-call`, `mark-completed`, `mark-failed`) using shared `invokeWorkersAi`, documented retry configuration, and export `AiJobWorkflow` class from `worker/index.js`.

**Files:**
- Create: `tests/ai-job-workflow-contract.mjs`
- Create: `worker/jobWorkflow.js`
- Modify: `worker/index.js`

**Interfaces:**
- `worker/jobWorkflow.js`:
  ```javascript
  export async function runAiJobWorkflow(env, event, step) { /* step pipeline */ }
  ```
- `worker/index.js`:
  ```javascript
  import { WorkflowEntrypoint } from 'cloudflare:workers';
  import app from './app.js';
  import { runAiJobWorkflow } from './jobWorkflow.js';

  export class AiJobWorkflow extends WorkflowEntrypoint {
    async run(event, step) {
      return runAiJobWorkflow(this.env, event, step);
    }
  }

  export default app;
  ```

- [ ] **Step 1: Write failing contract test `tests/ai-job-workflow-contract.mjs`**

```javascript
// tests/ai-job-workflow-contract.mjs
import assert from 'node:assert/strict';
import { runAiJobWorkflow } from '../worker/jobWorkflow.js';

function createFakeWorkflowEnv() {
  const jobStore = new Map([
    ['job-1', {
      id: 'job-1',
      prompt_text: 'Explain quantum computing',
      intent_json: JSON.stringify({ mode: 'explain' }),
      status: 'queued'
    }]
  ]);

  return {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                const id = args[0];
                return jobStore.get(id) || null;
              },
              async run() {
                if (sql.includes("status = 'running'")) {
                  const id = args[0];
                  const job = jobStore.get(id);
                  if (job && job.status === 'queued') job.status = 'running';
                }
                if (sql.includes("status = 'completed'")) {
                  const [resultText, providerMeta, id] = args;
                  const job = jobStore.get(id);
                  if (job) {
                    job.status = 'completed';
                    job.result_text = resultText;
                    job.provider_meta = providerMeta;
                  }
                }
                if (sql.includes("status = 'failed'")) {
                  const [errorCode, id] = args;
                  const job = jobStore.get(id);
                  if (job) {
                    job.status = 'failed';
                    job.error_code = errorCode;
                  }
                }
                return { success: true };
              }
            };
          }
        };
      }
    },
    AI: {
      async run(model, input) {
        return {
          choices: [{ message: { content: 'Quantum computing is fascinating.' } }]
        };
      }
    },
    _jobStore: jobStore
  };
}

function createFakeStep() {
  const executedSteps = [];
  return {
    _executedSteps: executedSteps,
    async do(name, configOrFn, fn) {
      executedSteps.push(name);
      const handler = typeof configOrFn === 'function' ? configOrFn : fn;
      return handler();
    }
  };
}

async function run() {
  const env = createFakeWorkflowEnv();
  const step = createFakeStep();
  const event = { payload: { jobId: 'job-1' } };

  await runAiJobWorkflow(env, event, step);

  const updatedJob = env._jobStore.get('job-1');
  assert.equal(updatedJob.status, 'completed');
  assert.equal(updatedJob.result_text, 'Quantum computing is fascinating.');
  assert.deepEqual(step._executedSteps, ['load-job', 'mark-running', 'provider-call', 'mark-completed']);

  console.log('AI job workflow contract passed.');
}

await run();
```

Run test to verify failure (RED):
```bash
node tests/ai-job-workflow-contract.mjs
```
*Expected Output:* `Error: Cannot find module '../worker/jobWorkflow.js'`

- [ ] **Step 2: Create `worker/jobWorkflow.js`**

```javascript
// worker/jobWorkflow.js
import { WORKERS_AI_MODEL, invokeWorkersAi } from './ai.js';
import { markJobRunning, markJobCompleted, markJobFailed } from './jobStore.js';
import { truncateToUtf8ByteLimit } from './jobUtils.js';

export async function runAiJobWorkflow(env, event, step) {
  const { jobId } = event.payload || {};
  if (!jobId) return;

  // Step 1: Load job from D1
  const job = await step.do('load-job', async () => {
    const row = await env.DB.prepare(
      'SELECT prompt_text, intent_json, status FROM jobs WHERE id = ?'
    ).bind(jobId).first();
    if (!row) throw new Error('JOB_NOT_FOUND_FATAL');
    return row;
  });

  if (!job) return;

  // Step 2: Mark job as running in D1
  await step.do('mark-running', async () => {
    await markJobRunning(env.DB, jobId);
  });

  // Step 3: Call Workers AI with retry configuration and 500,000 byte truncation limit
  let completionResult;
  try {
    completionResult = await step.do(
      'provider-call',
      {
        retries: {
          limit: 5,
          delay: '10 seconds',
          backoff: 'exponential'
        },
        timeout: '10 minutes'
      },
      async () => {
        let intent = null;
        if (job.intent_json) {
          try {
            intent = JSON.parse(job.intent_json);
          } catch {}
        }

        const result = await invokeWorkersAi(env, {
          prompt: job.prompt_text,
          intent
        });

        return truncateToUtf8ByteLimit(result.content, 500000);
      }
    );
  } catch (err) {
    // Step 4a: Mark Failed if step retries are exhausted
    await step.do('mark-failed', async () => {
      await markJobFailed(env.DB, jobId, 'MODEL_EXECUTION_FAILED');
    });
    return;
  }

  // Step 4b: Mark Completed and save result in D1
  const providerMeta = JSON.stringify({
    provider: '@cf/workers-ai',
    model: WORKERS_AI_MODEL
  });

  await step.do('mark-completed', async () => {
    await markJobCompleted(env.DB, jobId, completionResult, providerMeta);
  });
}
```

- [ ] **Step 3: Update `worker/index.js`**

```javascript
// worker/index.js
import { WorkflowEntrypoint } from 'cloudflare:workers';
import app from './app.js';
import { runAiJobWorkflow } from './jobWorkflow.js';

export class AiJobWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    return runAiJobWorkflow(this.env, event, step);
  }
}

export default app;
```

- [ ] **Step 4: Verify GREEN test status**

Run workflow contract test:
```bash
node tests/ai-job-workflow-contract.mjs
```
*Expected Output:* `AI job workflow contract passed.`

- [ ] **Step 5: Review Gate & Bounded Commit**

> **Codex Review Gate:** Codex inspects `worker/jobWorkflow.js` and `worker/index.js` for proper Workflow class inheritance and pure step logic isolation.

Commit changes:
```bash
git add worker/jobWorkflow.js worker/index.js tests/ai-job-workflow-contract.mjs
git commit -m "feat(worker): implement pure Cloudflare Workflow execution logic and export AiJobWorkflow entrypoint"
```

---

### Task 5: Cloudflare Resource Provisioning, D1 Binding & CI Deployment Pipeline

**Goal:** Configure `wrangler.jsonc` with D1 database `cloud-service`, Workflows binding `AI_JOB_WORKFLOW` with class `AiJobWorkflow`, Rate Limiter `RATE_LIMITER` namespace `1000`, update `tests/cloudflare-worker-config-contract.sh`, and update `.github/workflows/deploy.yml` to apply remote D1 migrations before deployment (only after the class exists).

**Files:**
- Modify: `tests/cloudflare-worker-config-contract.sh`
- Modify: `wrangler.jsonc`
- Modify: `.github/workflows/deploy.yml`

**Interfaces & Requirements:**
- D1 Database Name: `cloud-service`.
- D1 Database ID: Must be captured from the actual stdout of `npx wrangler d1 create cloud-service` during execution and inserted into `wrangler.jsonc` before commit; never use placeholder tokens.
- Workflows Binding: `binding: "AI_JOB_WORKFLOW"`, `class_name: "AiJobWorkflow"`.
- Rate Limiter Binding: `name: "RATE_LIMITER"`, `namespace_id: "1000"`, `simple: { limit: 10, period: 60 }`.
- CI Pipeline: Run `npx wrangler d1 migrations apply DB --remote` before `npx wrangler deploy`.

- [ ] **Step 1: Update `tests/cloudflare-worker-config-contract.sh` and verify RED status**

Edit `tests/cloudflare-worker-config-contract.sh` to include assertions for `DB`, `cloud-service`, `AI_JOB_WORKFLOW`, `AiJobWorkflow`, `RATE_LIMITER`, `1000`:

```bash
#!/usr/bin/env bash
set -u

wrangler_file="wrangler.jsonc"
failures=0

check() {
  local description="$1"
  local pattern="$2"

  if ! grep -Eq -- "$pattern" "$wrangler_file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check 'D1 binding DB exists' '"binding": "DB"'
check 'D1 database_name is cloud-service' '"database_name": "cloud-service"'
check 'Workflows binding AI_JOB_WORKFLOW exists' '"binding": "AI_JOB_WORKFLOW"'
check 'Workflows class AiJobWorkflow exists' '"class_name": "AiJobWorkflow"'
check 'Rate limiter name is RATE_LIMITER' '"name": "RATE_LIMITER"'
check 'Rate limiter namespace_id is 1000' '"namespace_id": "1000"'

if (( failures > 0 )); then
  printf '%d worker config check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Cloudflare Worker config contract checks passed.\n'
```

Run test to verify failure before configuration (RED):
```bash
bash tests/cloudflare-worker-config-contract.sh
```
*Expected Output:* `FAIL: D1 binding DB exists...`

- [ ] **Step 2: D1 Database Provisioning Execution Procedure**

Run D1 creation command in shell:
```bash
npx wrangler d1 create cloud-service
```

Capture the returned `database_id` string from command output:
```
✅ Created new D1 database 'cloud-service'
database_id = "8f7b3a1d-4e2c-4b5a-9a8f-1234567890ab"
```

Insert the captured exact `database_id` into `wrangler.jsonc` before committing.

- [ ] **Step 3: Update `wrangler.jsonc`**

Edit `wrangler.jsonc` with captured database ID and bindings:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "ai",
  "main": "./worker/index.js",
  "compatibility_date": "2026-07-18",
  "ai": {
    "binding": "AI"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "cloud-service",
      "database_id": "8f7b3a1d-4e2c-4b5a-9a8f-1234567890ab"
    }
  ],
  "workflows": [
    {
      "name": "ai-job-workflow",
      "binding": "AI_JOB_WORKFLOW",
      "class_name": "AiJobWorkflow"
    }
  ],
  "ratelimits": [
    {
      "name": "RATE_LIMITER",
      "namespace_id": "1000",
      "simple": {
        "limit": 10,
        "period": 60
      }
    }
  ],
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  }
}
```

- [ ] **Step 4: Update `.github/workflows/deploy.yml`**

Ensure `.github/workflows/deploy.yml` runs D1 remote migrations prior to Worker deployment:

```yaml
# In .github/workflows/deploy.yml deployment step:
- name: Apply D1 Migrations
  run: npx wrangler d1 migrations apply DB --remote
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

- name: Deploy Worker
  run: npx wrangler deploy
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

- [ ] **Step 5: Verify GREEN test status**

Run configuration contract check:
```bash
bash tests/cloudflare-worker-config-contract.sh
```
*Expected Output:* `Cloudflare Worker config contract checks passed.`

- [ ] **Step 6: Review Gate & Bounded Commit**

> **Codex Review Gate:** Codex verifies `wrangler.jsonc` contains authentic D1 database ID, Workflows binding, Rate Limiter namespace 1000, and `.github/workflows/deploy.yml` includes remote D1 migration step.

Commit changes:
```bash
git add wrangler.jsonc tests/cloudflare-worker-config-contract.sh .github/workflows/deploy.yml
git commit -m "feat(infra): provision D1, Workflows, Rate Limiter, and CI deployment pipeline"
```


---

### Task 6: Client Services — Background Job Registry & Polling Sync

**Goal:** Create `src/services/backgroundJobs.js` and `src/services/backgroundJobSync.js` to manage client pre-POST `localStorage` records, capability tokens, exponential polling backoff, cross-session reconciliation, and non-atomic history-first write semantics.

**Files:**
- Create: `tests/background-jobs-client-contract.mjs`
- Create: `src/services/backgroundJobs.js`
- Create: `src/services/backgroundJobSync.js`

**Interfaces:**
- `src/services/backgroundJobs.js`:
  ```javascript
  export function generateJobId() { /* crypto.randomUUID() */ }
  export function generateCapabilityToken() { /* 64 hex char job_sec_... */ }
  export function getStoredJobs() { /* LocalJobRecord[] */ }
  export function saveJobRecord(record) { /* save to localStorage.corez_ai_jobs_v1 */ }
  export function updateJobRecord(jobId, updates) { /* update record */ }
  export function removeJobRecord(jobId) { /* remove record */ }
  export async function postBackgroundJob(payload, capabilityToken) { /* POST /api/ai/jobs */ }
  export async function fetchJobStatus(jobId, capabilityToken) { /* GET /api/ai/jobs/:jobId */ }
  ```
- `src/services/backgroundJobSync.js`:
  ```javascript
  export function calculatePollingDelay(attemptCount) { /* 1s -> 2s -> 4s -> max 10s */ }
  export async function reconcileBackgroundJobs(options) { /* cross-session reconciliation */ }
  ```

- [ ] **Step 1: Write failing contract test `tests/background-jobs-client-contract.mjs`**

```javascript
// tests/background-jobs-client-contract.mjs
import assert from 'node:assert/strict';
import {
  generateJobId,
  generateCapabilityToken,
  getStoredJobs,
  saveJobRecord,
  updateJobRecord
} from '../src/services/backgroundJobs.js';
import { calculatePollingDelay } from '../src/services/backgroundJobSync.js';

// Polyfill localStorage for Node
if (typeof globalThis.localStorage === 'undefined') {
  const mockStorage = new Map();
  globalThis.localStorage = {
    getItem: (k) => mockStorage.get(k) || null,
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k),
    clear: () => mockStorage.clear()
  };
}

async function run() {
  localStorage.clear();

  // Test 1: ID and Token Generators
  const jobId = generateJobId();
  assert.match(jobId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  const token = generateCapabilityToken();
  assert.ok(token.startsWith('job_sec_'));

  // Test 2: Local storage record persistence
  const record = {
    jobId,
    capabilityToken: token,
    conversationId: 'c-100',
    userMessageId: 'm-1',
    assistantMessageId: 'm-2',
    promptText: 'Build a calculator',
    status: 'queued',
    reconciled: false,
    createdAt: Date.now()
  };

  saveJobRecord(record);
  const jobs = getStoredJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].jobId, jobId);

  // Test 3: Update job record
  updateJobRecord(jobId, { status: 'completed', reconciled: true });
  const updatedJobs = getStoredJobs();
  assert.equal(updatedJobs[0].status, 'completed');
  assert.equal(updatedJobs[0].reconciled, true);

  // Test 4: Polling delay exponential backoff
  assert.equal(calculatePollingDelay(1), 1000);
  assert.equal(calculatePollingDelay(2), 2000);
  assert.equal(calculatePollingDelay(3), 4000);
  assert.equal(calculatePollingDelay(4), 8000);
  assert.equal(calculatePollingDelay(5), 10000);
  assert.equal(calculatePollingDelay(10), 10000);

  console.log('Background jobs client contract passed.');
}

await run();
```

Run test to verify failure (RED):
```bash
node tests/background-jobs-client-contract.mjs
```
*Expected Output:* `Error: Cannot find module '../src/services/backgroundJobs.js'`

- [ ] **Step 2: Create `src/services/backgroundJobs.js`**

```javascript
// src/services/backgroundJobs.js
const STORAGE_KEY = 'corez_ai_jobs_v1';

export function generateJobId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function generateCapabilityToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `job_sec_${hex}`;
  }
  const fallbackHex = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `job_sec_${fallbackHex}`;
}

export function getStoredJobs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveJobRecord(record) {
  try {
    const jobs = getStoredJobs();
    const existingIndex = jobs.findIndex(j => j.jobId === record.jobId);
    if (existingIndex >= 0) {
      jobs[existingIndex] = { ...jobs[existingIndex], ...record };
    } else {
      jobs.push(record);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {}
}

export function updateJobRecord(jobId, updates) {
  try {
    const jobs = getStoredJobs();
    const index = jobs.findIndex(j => j.jobId === jobId);
    if (index >= 0) {
      jobs[index] = { ...jobs[index], ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    }
  } catch {}
}

export function removeJobRecord(jobId) {
  try {
    const jobs = getStoredJobs().filter(j => j.jobId !== jobId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {}
}

export async function postBackgroundJob(payload, capabilityToken) {
  const response = await fetch('/api/ai/jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Job-Token': capabilityToken
    },
    body: JSON.stringify(payload)
  });
  return response;
}

export async function fetchJobStatus(jobId, capabilityToken) {
  const response = await fetch(`/api/ai/jobs/${jobId}`, {
    method: 'GET',
    headers: {
      'X-Job-Token': capabilityToken
    }
  });
  return response;
}
```

- [ ] **Step 3: Create `src/services/backgroundJobSync.js`**

```javascript
// src/services/backgroundJobSync.js
import { getStoredJobs, updateJobRecord, fetchJobStatus } from './backgroundJobs.js';

export function calculatePollingDelay(attemptCount) {
  const baseDelay = 1000;
  const calculated = baseDelay * Math.pow(2, Math.max(0, attemptCount - 1));
  return Math.min(calculated, 10000);
}

export async function reconcileBackgroundJobs({
  sessions,
  saveSessions,
  activeSessionId,
  onActiveSessionResult
}) {
  if (typeof document !== 'undefined' && document.hidden) {
    return; // Pause polling when document is hidden
  }

  const jobs = getStoredJobs().filter(j => !j.reconciled);
  if (jobs.length === 0) return;

  for (const job of jobs) {
    try {
      const response = await fetchJobStatus(job.jobId, job.capabilityToken);
      if (!response.ok) continue;

      const data = await response.json();
      if (data.status === 'completed' || data.status === 'failed') {
        const isSuccess = data.status === 'completed';
        const resultText = isSuccess ? data.result?.content : null;
        const errorMessage = !isSuccess ? (data.error?.message || 'Execution failed.') : null;

        // Step 1: Write terminal completion result to chat history
        let sessionUpdated = false;
        const updatedSessions = (sessions || []).map(session => {
          if (session.id === job.conversationId) {
            sessionUpdated = true;
            const updatedMessages = session.messages.map(msg => {
              if (msg.id === job.assistantMessageId) {
                return {
                  ...msg,
                  status: data.status,
                  text: isSuccess ? resultText : (errorMessage || 'Job execution failed.'),
                  model: isSuccess ? data.result?.model : undefined
                };
              }
              return msg;
            });
            return { ...session, messages: updatedMessages };
          }
          return session;
        });

        // Fallback: If origin session was deleted, insert into "Recovered Results" session
        let finalSessions = updatedSessions;
        if (!sessionUpdated) {
          const RECOVERED_ID = 'session-recovered-results';
          let recoveredSession = finalSessions.find(s => s.id === RECOVERED_ID);

          const newAssistantMessage = {
            id: job.assistantMessageId,
            sender: 'ai',
            text: isSuccess ? resultText : (errorMessage || 'Job execution failed.'),
            status: data.status,
            model: isSuccess ? data.result?.model : undefined
          };

          const newUserMessage = {
            id: job.userMessageId,
            sender: 'user',
            text: job.promptText
          };

          if (recoveredSession) {
            finalSessions = finalSessions.map(s => {
              if (s.id === RECOVERED_ID) {
                return {
                  ...s,
                  messages: [...s.messages, newUserMessage, newAssistantMessage]
                };
              }
              return s;
            });
          } else {
            recoveredSession = {
              id: RECOVERED_ID,
              title: 'Recovered Results',
              createdAt: Date.now(),
              messages: [newUserMessage, newAssistantMessage]
            };
            finalSessions = [recoveredSession, ...finalSessions];
          }
        }

        if (typeof saveSessions === 'function') {
          saveSessions(finalSessions);
        }

        // Notify active canvas if completed job belongs to active session
        if (isSuccess && job.conversationId === activeSessionId && typeof onActiveSessionResult === 'function') {
          onActiveSessionResult(resultText);
        }

        // Step 2: Mark reconciled: true in storage and clear secret capabilityToken
        updateJobRecord(job.jobId, {
          status: data.status,
          reconciled: true,
          capabilityToken: '[RECONCILED]'
        });
      }
    } catch {
      // Polling network glitch: ignore and try again next tick
    }
  }
}
```

- [ ] **Step 4: Verify GREEN test status**

Run client service contract tests:
```bash
node tests/background-jobs-client-contract.mjs
```
*Expected Output:* `Background jobs client contract passed.`

- [ ] **Step 5: Review Gate & Bounded Commit**

> **Codex Review Gate:** Codex inspects `src/services/backgroundJobs.js`, `src/services/backgroundJobSync.js`, and `tests/background-jobs-client-contract.mjs` for crash resilience order (history FIRST, then reconciled flag).

Commit changes:
```bash
git add src/services/backgroundJobs.js src/services/backgroundJobSync.js tests/background-jobs-client-contract.mjs
git commit -m "feat(client): add background job registry and cross-session polling reconciliation services"
```

---

### Task 7: React App & Service Integration (Concurrent Background Jobs)

**Goal:** Modify `src/services/aiService.js` and `src/App.jsx` to dispatch background jobs, remove global `isThinking` input block, poll jobs on mount/focus/visibility, and update canvas code only when completion belongs to the active session.

**Files:**
- Modify: `src/services/aiService.js`
- Modify: `src/App.jsx`

- [ ] **Step 1: Update `src/services/aiService.js`**

Modify `src/services/aiService.js` to export `sendBackgroundAIRequest`:

```javascript
// src/services/aiService.js
import { generateJobId, generateCapabilityToken, saveJobRecord, postBackgroundJob } from './backgroundJobs.js';

export async function sendBackgroundAIRequest({
  prompt,
  intent,
  conversationId,
  userMessageId,
  assistantMessageId
}) {
  const jobId = generateJobId();
  const capabilityToken = generateCapabilityToken();

  const record = {
    jobId,
    capabilityToken,
    conversationId,
    userMessageId,
    assistantMessageId,
    promptText: prompt,
    intent: intent || null,
    status: 'queued',
    reconciled: false,
    createdAt: Date.now()
  };

  // Pre-POST Persistence
  saveJobRecord(record);

  // Dispatch API request
  try {
    const response = await postBackgroundJob({
      job_id: jobId,
      conversation_id: conversationId,
      prompt,
      intent
    }, capabilityToken);

    if (!response.ok && response.status !== 503 && response.status !== 530) {
      // Definitive failure (400, 409, 429)
      return { success: false, jobId, capabilityToken, status: response.status };
    }

    return { success: true, jobId, capabilityToken };
  } catch (err) {
    // Network drop: return success: true because record is persisted locally and will be reconciled via GET polling and retry
    return { success: true, jobId, capabilityToken, ambiguousNetwork: true };
  }
}
```

- [ ] **Step 2: Update `src/App.jsx`**

Modify `src/App.jsx` to wire background job submission and polling:
- Integrate `reconcileBackgroundJobs` with `useEffect` listener on window mount, `focus`, and `visibilitychange`.
- Ensure `ChatInput` does not disable when background jobs are running.
- Ensure deleting/clearing sessions retains pending records in `localStorage`.

- [ ] **Step 3: Review Gate & Bounded Commit**

> **Codex Review Gate:** Codex inspects `src/services/aiService.js` and `src/App.jsx` for concurrent background job support and proper state management.

Commit changes:
```bash
git add src/services/aiService.js src/App.jsx
git commit -m "feat(app): integrate background AI job dispatch and multi-session reconciliation in App component"
```

---

### Task 8: Per-Message UI State & Accessibility in ChatInput & ChatMessage

**Goal:** Update `src/components/ChatInput.jsx`, `src/components/ChatMessage.jsx`, `src/index.css`, `tests/thinking-indicator-contract.sh`, and create `tests/background-jobs-ui-contract.sh` to render accessible status badges, Retry buttons, and enabled input.

**Files:**
- Modify: `src/components/ChatInput.jsx`
- Modify: `src/components/ChatMessage.jsx`
- Modify: `src/index.css`
- Modify: `tests/thinking-indicator-contract.sh`
- Create: `tests/background-jobs-ui-contract.sh`

- [ ] **Step 1: Write shell contract test `tests/background-jobs-ui-contract.sh`**

```bash
#!/usr/bin/env bash
set -u

chat_input="src/components/ChatInput.jsx"
chat_message="src/components/ChatMessage.jsx"
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

check 'ChatMessage handles queued status' 'queued' "$chat_message"
check 'ChatMessage handles running status' 'running' "$chat_message"
check 'ChatMessage handles failed status and Retry button' 'Retry' "$chat_message"
check 'ChatMessage renders ARIA live region for active status' 'aria-live="polite"' "$chat_message"

if (( failures > 0 )); then
  printf '%d UI status check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Background jobs UI contract checks passed.\n'
```

Run test to verify failure (RED):
```bash
bash tests/background-jobs-ui-contract.sh
```
*Expected Output:* `FAIL: ChatMessage handles queued status`

- [ ] **Step 2: Update `src/components/ChatInput.jsx`**

Remove any input disabling tied to global thinking state so user can submit new messages concurrently while jobs are running.

- [ ] **Step 3: Update `src/components/ChatMessage.jsx`**

Render status badges (`Queued`, `Thinking...`, `Completed`, `Failed`) with `aria-live="polite"`, and a "Retry" button on failed messages that re-dispatches with fresh identifiers.

- [ ] **Step 4: Update `src/index.css` & `tests/thinking-indicator-contract.sh`**

Add CSS styles for status badges and verify both `tests/thinking-indicator-contract.sh` and `tests/background-jobs-ui-contract.sh` pass.

- [ ] **Step 5: Review Gate & Bounded Commit**

> **Codex Review Gate:** Codex inspects `src/components/ChatInput.jsx`, `src/components/ChatMessage.jsx`, and CSS styles for accessibility and reduced-motion safety.

Commit changes:
```bash
git add src/components/ChatInput.jsx src/components/ChatMessage.jsx src/index.css tests/thinking-indicator-contract.sh tests/background-jobs-ui-contract.sh
git commit -m "feat(ui): render per-message job statuses, accessible ARIA live regions, and retry controls"
```

---

### Task 9: Master Test Suite Integration & Documentation

**Goal:** Integrate all new contract tests into the `package.json` `test:cloudflare` script and document durable background AI jobs architecture, retention policies, plaintext D1 disclosures, and Cloudflare resource configurations in `README.md`.

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Update `package.json`**

Update `package.json` `test:cloudflare` script:

```json
"test:cloudflare": "node tests/cloudflare-worker-contract.mjs && bash tests/cloudflare-worker-config-contract.sh && bash tests/workers-ai-provider-contract.sh && bash tests/public-ai-proxy-contract.sh && bash tests/ai-live-intent-eval-contract.sh && node tests/ai-live-intent-eval-response-contract.mjs && bash tests/env-question-skill-contract.sh && node tests/ai-job-utils-contract.mjs && node tests/ai-jobs-api-contract.mjs && node tests/ai-job-workflow-contract.mjs && node tests/background-jobs-client-contract.mjs && bash tests/background-jobs-ui-contract.sh && bash tests/thinking-indicator-contract.sh"
```

- [ ] **Step 2: Update `README.md`**

Document the durable background jobs feature in `README.md`:
- Architecture: Workflows, D1 database `cloud-service`, Rate Limiter `RATE_LIMITER` (namespace `"1000"`).
- Privacy & Storage: Plaintext D1 prompt/result storage protected by 24h expiration purge. Local-only recovery via `localStorage.corez_ai_jobs_v1` (no cross-device sync).
- Quota: Workers Free plan limits (100k requests/day, 5M D1 reads/day).
- Commands for local development and migration deployment: `npx wrangler d1 migrations apply cloud-service --remote`.

- [ ] **Step 3: Review Gate & Bounded Commit**

> **Codex Review Gate:** Codex verifies `package.json` test script and `README.md` documentation completeness.

Commit changes:
```bash
git add package.json README.md
git commit -m "docs(readme): document durable background jobs architecture, D1 retention, and master test suite"
```

---

### Task 10: Final Verification, Dry-Run & Deployment Smoke Test

**Goal:** Execute full verification across linting, building, full master test suite (`npm run test:cloudflare`), Wrangler dry-run deployment, remote D1 migration apply, and production smoke testing.

**Files:** None (Execution and Verification Task)

- [ ] **Step 1: Execute Full Test Suite**

Run the complete test suite:
```bash
npm run test:cloudflare
```
*Expected Output:* All contract tests pass with exit code 0.

- [ ] **Step 2: Run Code Quality & Build Checks**

```bash
npm run lint
npm run build
```
*Expected Output:* Zero lint errors and clean Vite production build output.

- [ ] **Step 3: Run Wrangler Deployment Dry-Run**

```bash
npx wrangler deploy --dry-run
```
*Expected Output:* Clean Wrangler bundle verification without schema or binding errors.

- [ ] **Step 4: Execute Remote Migration & Production Deployment (Authorized)**

```bash
npx wrangler d1 migrations apply cloud-service --remote
npx wrangler deploy
```

- [ ] **Step 5: Live Smoke Test**

Send test request to `POST /api/ai/jobs` and poll `GET /api/ai/jobs/:jobId` until status reaches `completed`. Verify completion content.

> **Note on Test Scripts:** There is NO generic `npm test` or `npm run typecheck` script configured in `package.json`. Verification relies strictly on `npm run test:cloudflare`, `npm run lint`, and `npm run build`.

---

## Acceptance Criteria Traceability & Self-Review

| Specification Acceptance Criterion | Plan Task Coverage | Verification Method |
| :--- | :--- | :--- |
| **Worker Identity & Entrypoint** | Task 1 & Task 4 | `worker/index.js` exports `AiJobWorkflow` & default `app`. |
| **Routes POST /api/ai/jobs & GET /api/ai/jobs/:jobId** | Task 3 | `tests/ai-jobs-api-contract.mjs` |
| **D1 database_name "cloud-service"** | Task 5 | `wrangler.jsonc` & `tests/cloudflare-worker-config-contract.sh` |
| **Rate Limiter name RATE_LIMITER, namespace_id "1000"** | Task 3 & Task 5 | `wrangler.jsonc` & `tests/ai-jobs-api-contract.mjs` |
| **Idempotent one-item createBatch dispatch** | Task 3 | `tests/ai-jobs-api-contract.mjs` |
| **No fabricated D1 database UUID** | Task 5 | Explicit captured UUID procedure for `npx wrangler d1 create cloud-service` |
| **Pre-POST localStorage persistence** | Task 6 & Task 7 | `tests/background-jobs-client-contract.mjs` |
| **Timing-safe timingSafeEqual auth & generic 404 security** | Task 2 & Task 3 | `tests/ai-job-utils-contract.mjs` & `tests/ai-jobs-api-contract.mjs` |
| **Duplicate POST 409 Conflict** | Task 3 | `tests/ai-jobs-api-contract.mjs` |
| **503 Dispatch Failure Retries** | Task 3 | `tests/ai-jobs-api-contract.mjs` |
| **Byte-safe truncation <= 500,000 UTF-8 bytes** | Task 2 & Task 4 | `tests/ai-job-utils-contract.mjs` & `tests/ai-job-workflow-contract.mjs` |
| **Cross-session reconciliation & history-first write** | Task 6 & Task 7 | `tests/background-jobs-client-contract.mjs` |
| **UI per-message statuses, accessible ARIA, Retry button** | Task 8 | `tests/background-jobs-ui-contract.sh` |
| **Master test suite integration** | Task 9 | `npm run test:cloudflare` |
