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

**Goal:** Build D1 database migration SQL script `migrations/0001_create_ai_jobs.sql`, prepared statement D1 job store `worker/jobStore.js` with BLOB normalization for raw 32-byte SHA-256 token hashes, jobs API handlers `worker/jobs.js` (`POST /api/ai/jobs` and `GET /api/ai/jobs/:jobId`) built with method-level dependency injection (`store`, `dispatch`, `limiter`, `clock`, `logger`), update pure fetch router `worker/app.js` to route jobs API endpoints with dependency-injected parameters, and write comprehensive contract/unit tests `tests/ai-jobs-api-contract.mjs` using pure in-memory store methods without inspecting SQL strings.

**Files:**
- Create: `migrations/0001_create_ai_jobs.sql`
- Create: `worker/jobStore.js`
- Create: `worker/jobs.js`
- Modify: `worker/app.js`
- Create: `tests/ai-jobs-api-contract.mjs`

**Interfaces & Requirements:**
- `migrations/0001_create_ai_jobs.sql`: Table `jobs` with `token_hash BLOB NOT NULL` storing raw 32-byte `sha256Bytes` output, plus indices (`idx_jobs_expires_at`, `idx_jobs_status_created`, `idx_jobs_active_deadline`).
- `worker/jobStore.js`: `normalizeBlob` helper converting ArrayBuffer/View/Array to `Uint8Array`, `createD1Store(db)` returning store methods (`getJob`, `insertJob`, `markJobRunning`, `markJobCompleted`, `markJobFailed`, `repairStuckJobs`, `purgeExpiredJobs`) and exported standalone functions.
- `worker/jobs.js`: `resolveDependencies(env, customDeps)`, `handleCreateJob(request, env, customDeps)`, `handleGetJob(request, env, jobId, customDeps)`. Method-level injected dependencies default to D1/Workflow/RateLimiter production adapters when custom dependencies are unprovided. Dependency overrides allow explicit `null` supplies to test missing services (`'store' in customDeps ? customDeps.store : ...`).
- `worker/app.js`: pure fetch router passing `customDeps` to `handleCreateJob` and `handleGetJob`.
- Auth & Security: Strict 72-char `job_sec_` token header shape (`X-Job-Token`) and UUIDv4 `job_id`. 401 returns ONLY on missing or malformed `X-Job-Token` prior to DB lookup. Identical generic 404 (`{ error: 'Job not found.', code: 'NOT_FOUND' }`) for absent job, expired job, wrong token, or malformed GET `job_id`. Zero secrets, tokens, raw prompts, or provider error secrets returned in responses or logged. Fail-closed error handling with no silent catches swallowing errors and no external error details logged (`safeErrorDetail` removed; log only internal fixed error codes and messages).
- Validation: 400 validation on body payload: malformed JSON; non-object or array body (`Request body must be a JSON object.`); `job_id` must be valid UUIDv4; `conversation_id` non-empty string <= 256 chars; `prompt` non-empty string <= 100,000 UTF-8 bytes; `intent` optional plain JSON object or null (`Intent must be a plain JSON object or null.`).
- Retention & Idempotency: `AI_JOB_WORKFLOW.createBatch([{ id: jobId, params: { jobId }, retention: { successRetention: '1 day', errorRetention: '1 day' } }])`. Canonical SHA-256 request fingerprint over `canonicalJson({ conversation_id, prompt, intent })`. Rate limiting check (`limiter(clientIp)`) runs ONLY for new jobs; idempotent retries bypass rate limiter. Existing `job_id` with token or fingerprint mismatch returns 409 Conflict (`{ error: 'Idempotency conflict for submitted job_id.', code: 'IDEMPOTENCY_CONFLICT' }`).
- Insert-Race Recovery: Primary key collision during `insertJob` re-reads job from store, authenticates token & fingerprint, dispatches workflow, and surfaces dispatch failure if workflow creation throws. Race reread failures are explicitly logged without leaking error details.
- Database & Limiter & Workflow Failures:
  - Missing/failing database or crypto error returns 503 (`SERVICE_UNAVAILABLE`).
  - Missing/failing rate limiter for new job returns 503 (`SERVICE_UNAVAILABLE`).
  - Workflow dispatch error for new or existing job returns queued status with 503 (`SERVICE_UNAVAILABLE`).
  - GET request database failure returns 503 (`SERVICE_UNAVAILABLE`).
- Method Handling: Unsupported HTTP methods return 405 (`Method not allowed.`).

- [ ] **Step 1: Write failing contract test `tests/ai-jobs-api-contract.mjs`**

Create `tests/ai-jobs-api-contract.mjs` using pure in-memory store and method-level dependency injection:

```javascript
// tests/ai-jobs-api-contract.mjs
import assert from 'node:assert/strict';
import app from '../worker/app.js';
import { sha256Bytes, computeRequestFingerprint } from '../worker/jobUtils.js';

function createInMemoryStore() {
  const jobs = new Map();
  let insertShouldFailWithRace = false;
  let queryShouldFailWithDbError = false;

  return {
    _jobs: jobs,
    _setInsertShouldFailWithRace(val) { insertShouldFailWithRace = val; },
    _setQueryShouldFailWithDbError(val) { queryShouldFailWithDbError = val; },
    async getJob(jobId) {
      if (queryShouldFailWithDbError) {
        throw new Error('SECRET_DATABASE_KEY_12345 D1 DATABASE_ERROR: Connection failed');
      }
      const job = jobs.get(jobId);
      return job ? { ...job } : null;
    },
    async insertJob(job) {
      if (queryShouldFailWithDbError) {
        throw new Error('SECRET_DATABASE_KEY_12345 D1 DATABASE_ERROR: Connection failed');
      }
      if (insertShouldFailWithRace || jobs.has(job.id)) {
        throw new Error('SECRET_DATABASE_KEY_12345 D1 UNIQUE_CONSTRAINT: Primary key collision on jobs.id');
      }
      jobs.set(job.id, { ...job });
    }
  };
}

function createFakeDeps(overrides = {}) {
  const store = createInMemoryStore();
  let limitCalledCount = 0;
  let dispatchCalls = [];
  let limiterShouldFail = false;
  let limiterExceeded = false;
  let dispatchShouldFail = false;
  let loggedErrors = [];

  const defaultDispatch = async (jobId) => {
    if (dispatchShouldFail) {
      throw new Error('BEARER_PROVIDER_TOKEN_XYZ WORKFLOW_DISPATCH_ERROR: Cluster timeout');
    }
    dispatchCalls.push({ jobId, retention: { successRetention: '1 day', errorRetention: '1 day' } });
  };

  const defaultLimiter = async (ip) => {
    limitCalledCount++;
    if (limiterShouldFail) {
      throw new Error('SECRET_LIMITER_KEY_999 RATE_LIMITER_ERROR: Service unavailable');
    }
    if (limiterExceeded) {
      return { success: false };
    }
    return { success: true };
  };

  const defaultClock = {
    now: () => 1770000000
  };

  const defaultLogger = {
    error: (msg, meta = {}) => {
      loggedErrors.push({ msg, meta });
    }
  };

  return {
    store: 'store' in overrides ? overrides.store : store,
    dispatch: 'dispatch' in overrides ? overrides.dispatch : defaultDispatch,
    limiter: 'limiter' in overrides ? overrides.limiter : defaultLimiter,
    clock: 'clock' in overrides ? overrides.clock : defaultClock,
    logger: 'logger' in overrides ? overrides.logger : defaultLogger,
    _store: store,
    _dispatchCalls: dispatchCalls,
    _loggedErrors: loggedErrors,
    _getLimitCalledCount: () => limitCalledCount,
    _setLimiterShouldFail: (val) => { limiterShouldFail = val; },
    _setLimiterExceeded: (val) => { limiterExceeded = val; },
    _setDispatchShouldFail: (val) => { dispatchShouldFail = val; }
  };
}

async function run() {
  const deps = createFakeDeps();
  const token = 'job_sec_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const jobId = '550e8400-e29b-41d4-a716-446655440000';

  // Test 1: POST /api/ai/jobs requires X-Job-Token header before DB lookup (401)
  const noTokenRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, conversation_id: 'c1', prompt: 'test' })
    }),
    {},
    deps
  );
  assert.equal(noTokenRes.status, 401);

  const malformedTokenRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': 'bad_prefix_1234567890abcdef1234567890abcdef1234567890abcdef1234' },
      body: JSON.stringify({ job_id: jobId, conversation_id: 'c1', prompt: 'test' })
    }),
    {},
    deps
  );
  assert.equal(malformedTokenRes.status, 401);

  // Test 2: Validation 400 for bad UUID, conversation, prompt, malformed JSON, non-object body, array body, and intent
  const badUuidRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: 'not-a-uuid', conversation_id: 'c1', prompt: 'test' })
    }),
    {},
    deps
  );
  assert.equal(badUuidRes.status, 400);

  const missingConvRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: jobId, conversation_id: '', prompt: 'test' })
    }),
    {},
    deps
  );
  assert.equal(missingConvRes.status, 400);

  const overlongConvRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: jobId, conversation_id: 'c'.repeat(257), prompt: 'test' })
    }),
    {},
    deps
  );
  assert.equal(overlongConvRes.status, 400);

  const emptyPromptRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: jobId, conversation_id: 'c1', prompt: '   ' })
    }),
    {},
    deps
  );
  assert.equal(emptyPromptRes.status, 400);

  const hugePromptRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: jobId, conversation_id: 'c1', prompt: 'a'.repeat(100001) })
    }),
    {},
    deps
  );
  assert.equal(hugePromptRes.status, 400);

  const malformedJsonRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: '{ invalid json'
    }),
    {},
    deps
  );
  assert.equal(malformedJsonRes.status, 400);

  const nonObjectBodyRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: '"just a string"'
    }),
    {},
    deps
  );
  assert.equal(nonObjectBodyRes.status, 400);

  const arrayBodyRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: '[1, 2, 3]'
    }),
    {},
    deps
  );
  assert.equal(arrayBodyRes.status, 400);

  const stringIntentRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: jobId, conversation_id: 'c1', prompt: 'test', intent: 'not-an-object' })
    }),
    {},
    deps
  );
  assert.equal(stringIntentRes.status, 400);

  const arrayIntentRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: jobId, conversation_id: 'c1', prompt: 'test', intent: [1, 2] })
    }),
    {},
    deps
  );
  assert.equal(arrayIntentRes.status, 400);

  // Test 3: POST 201 creation and exact createBatch retention
  const createRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({
        job_id: jobId,
        conversation_id: 'c1',
        prompt: 'test prompt SECRET_USER_PROMPT_KEY_123',
        intent: { mode: 'code' }
      })
    }),
    {},
    deps
  );
  assert.equal(createRes.status, 201);
  const createBody = await createRes.json();
  assert.equal(createBody.job_id, jobId);
  assert.equal(createBody.status, 'queued');
  assert.equal(createBody.created_at, 1770000000);
  assert.equal(deps._getLimitCalledCount(), 1);
  assert.equal(deps._dispatchCalls.length, 1);
  assert.deepEqual(deps._dispatchCalls[0].retention, { successRetention: '1 day', errorRetention: '1 day' });

  // Test 4: Idempotent 200 retry bypasses rate limiter
  const initialLimitCount = deps._getLimitCalledCount();
  const retryRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({
        job_id: jobId,
        conversation_id: 'c1',
        prompt: 'test prompt SECRET_USER_PROMPT_KEY_123',
        intent: { mode: 'code' }
      })
    }),
    {},
    deps
  );
  assert.equal(retryRes.status, 200);
  assert.equal(deps._getLimitCalledCount(), initialLimitCount, 'Rate limiter must NOT be called for idempotent retry');
  assert.equal(deps._dispatchCalls.length, 2, 'Workflow dispatch must be called again on retry');

  // Test 5: Existing-idempotent job dispatch failure surfaces queued status with 503 SERVICE_UNAVAILABLE
  deps._setDispatchShouldFail(true);
  const existingDispatchFailRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({
        job_id: jobId,
        conversation_id: 'c1',
        prompt: 'test prompt SECRET_USER_PROMPT_KEY_123',
        intent: { mode: 'code' }
      })
    }),
    {},
    deps
  );
  assert.equal(existingDispatchFailRes.status, 503);
  const existingDispatchFailBody = await existingDispatchFailRes.json();
  assert.equal(existingDispatchFailBody.job_id, jobId);
  assert.equal(existingDispatchFailBody.status, 'queued');
  assert.equal(existingDispatchFailBody.code, 'SERVICE_UNAVAILABLE');
  deps._setDispatchShouldFail(false);

  // Test 6: Duplicate POST with valid-shaped wrong token or changed fingerprint returns 409
  const diffToken = 'job_sec_9999997890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const conflictTokenRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': diffToken },
      body: JSON.stringify({
        job_id: jobId,
        conversation_id: 'c1',
        prompt: 'test prompt SECRET_USER_PROMPT_KEY_123',
        intent: { mode: 'code' }
      })
    }),
    {},
    deps
  );
  assert.equal(conflictTokenRes.status, 409);

  const conflictFingerprintRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({
        job_id: jobId,
        conversation_id: 'c1',
        prompt: 'different prompt',
        intent: { mode: 'code' }
      })
    }),
    {},
    deps
  );
  assert.equal(conflictFingerprintRes.status, 409);

  // Test 7: Rate limit exceeded (429) for new jobs only
  const newJobIdFor429 = '660e8400-e29b-41d4-a716-446655440000';
  deps._setLimiterExceeded(true);
  const rateLimitedRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: newJobIdFor429, conversation_id: 'c1', prompt: 'test' })
    }),
    {},
    deps
  );
  assert.equal(rateLimitedRes.status, 429);
  deps._setLimiterExceeded(false);

  // Test 8: Missing or throwing rate limiter returns 503 for new jobs
  const newJobIdForLimiterFail = '770e8400-e29b-41d4-a716-446655440000';
  deps._setLimiterShouldFail(true);
  const limiterFailRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: newJobIdForLimiterFail, conversation_id: 'c1', prompt: 'test' })
    }),
    {},
    deps
  );
  assert.equal(limiterFailRes.status, 503);
  deps._setLimiterShouldFail(false);

  const missingLimiterDeps = createFakeDeps({ limiter: null });
  const missingLimiterRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: newJobIdForLimiterFail, conversation_id: 'c1', prompt: 'test' })
    }),
    {},
    missingLimiterDeps
  );
  assert.equal(missingLimiterRes.status, 503);

  // Test 9: Insert race rereads, authenticates, dispatches, and surfaces dispatch failure
  const raceJobId = '880e8400-e29b-41d4-a716-446655440000';
  const tokenHashBytes = await sha256Bytes(token);
  const fingerprint = await computeRequestFingerprint('c1', 'race prompt', null);
  deps.store._jobs.set(raceJobId, {
    id: raceJobId,
    token_hash: tokenHashBytes,
    conversation_id: 'c1',
    status: 'queued',
    prompt_text: 'race prompt',
    intent_json: null,
    request_fingerprint: fingerprint,
    created_at: 1770000000
  });
  deps.store._setInsertShouldFailWithRace(true);

  const raceRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: raceJobId, conversation_id: 'c1', prompt: 'race prompt' })
    }),
    {},
    deps
  );
  assert.equal(raceRes.status, 200);

  // Insert-race recovery dispatch failure test
  deps._setDispatchShouldFail(true);
  const raceDispatchFailRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: raceJobId, conversation_id: 'c1', prompt: 'race prompt' })
    }),
    {},
    deps
  );
  assert.equal(raceDispatchFailRes.status, 503);
  const raceDispatchFailBody = await raceDispatchFailRes.json();
  assert.equal(raceDispatchFailBody.job_id, raceJobId);
  assert.equal(raceDispatchFailBody.status, 'queued');
  deps._setDispatchShouldFail(false);

  // Test 10: Workflow dispatch failure for new job surfaces queued+503
  deps.store._setInsertShouldFailWithRace(false);
  deps._setDispatchShouldFail(true);
  const newJobIdForDispatchFail = '990e8400-e29b-41d4-a716-446655440000';
  const dispatchFailRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: newJobIdForDispatchFail, conversation_id: 'c1', prompt: 'test' })
    }),
    {},
    deps
  );
  assert.equal(dispatchFailRes.status, 503);
  const dispatchFailBody = await dispatchFailRes.json();
  assert.equal(dispatchFailBody.status, 'queued');
  deps._setDispatchShouldFail(false);

  // Test 11: Missing DB store dependency or DB query failure returns 503
  const missingStoreDeps = createFakeDeps({ store: null });
  const missingStoreRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: 'aa0e8400-e29b-41d4-a716-446655440000', conversation_id: 'c1', prompt: 'test' })
    }),
    {},
    missingStoreDeps
  );
  assert.equal(missingStoreRes.status, 503);

  deps.store._setQueryShouldFailWithDbError(true);
  const dbFailRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Job-Token': token },
      body: JSON.stringify({ job_id: 'aa0e8400-e29b-41d4-a716-446655440000', conversation_id: 'c1', prompt: 'test' })
    }),
    {},
    deps
  );
  assert.equal(dbFailRes.status, 503);
  deps.store._setQueryShouldFailWithDbError(false);

  // Test 12: GET assertions for queued, running, completed, and failed status jobs
  const queuedJobId = 'b00e8400-e29b-41d4-a716-446655440000';
  deps.store._jobs.set(queuedJobId, {
    id: queuedJobId,
    token_hash: tokenHashBytes,
    conversation_id: 'c1',
    status: 'queued',
    prompt_text: 'test',
    created_at: 1770000000,
    updated_at: 1770000000
  });

  const getQueuedRes = await app.fetch(
    new Request(`https://corez.test/api/ai/jobs/${queuedJobId}`, {
      method: 'GET',
      headers: { 'X-Job-Token': token }
    }),
    {},
    deps
  );
  assert.equal(getQueuedRes.status, 200);
  const queuedBody = await getQueuedRes.json();
  assert.equal(queuedBody.job_id, queuedJobId);
  assert.equal(queuedBody.status, 'queued');

  const runningJobId = 'b10e8400-e29b-41d4-a716-446655440000';
  deps.store._jobs.set(runningJobId, {
    id: runningJobId,
    token_hash: tokenHashBytes,
    conversation_id: 'c1',
    status: 'running',
    prompt_text: 'test',
    created_at: 1770000000,
    updated_at: 1770000005
  });

  const getRunningRes = await app.fetch(
    new Request(`https://corez.test/api/ai/jobs/${runningJobId}`, {
      method: 'GET',
      headers: { 'X-Job-Token': token }
    }),
    {},
    deps
  );
  assert.equal(getRunningRes.status, 200);
  const runningBody = await getRunningRes.json();
  assert.equal(runningBody.job_id, runningJobId);
  assert.equal(runningBody.status, 'running');

  const statusJobId = 'bb0e8400-e29b-41d4-a716-446655440000';
  deps.store._jobs.set(statusJobId, {
    id: statusJobId,
    token_hash: tokenHashBytes,
    conversation_id: 'c1',
    status: 'completed',
    prompt_text: 'test',
    result_text: 'AI response text',
    provider_meta: JSON.stringify({ model: '@cf/zai-org/glm-4.7-flash', provider: '@cf/workers-ai' }),
    created_at: 1770000000,
    updated_at: 1770000010,
    terminal_at: 1770000010,
    expires_at: 1770086410
  });

  const getCompletedRes = await app.fetch(
    new Request(`https://corez.test/api/ai/jobs/${statusJobId}`, {
      method: 'GET',
      headers: { 'X-Job-Token': token }
    }),
    {},
    deps
  );
  assert.equal(getCompletedRes.status, 200);
  const completedBody = await getCompletedRes.json();
  assert.equal(completedBody.job_id, statusJobId);
  assert.equal(completedBody.status, 'completed');
  assert.equal(completedBody.result.content, 'AI response text');
  assert.equal(completedBody.result.model, '@cf/zai-org/glm-4.7-flash');

  // Completed job with malformed provider_meta JSON falls back cleanly
  const malformedMetaJobId = 'b20e8400-e29b-41d4-a716-446655440000';
  deps.store._jobs.set(malformedMetaJobId, {
    id: malformedMetaJobId,
    token_hash: tokenHashBytes,
    conversation_id: 'c1',
    status: 'completed',
    prompt_text: 'test',
    result_text: 'AI response text',
    provider_meta: '{ malformed json',
    created_at: 1770000000,
    updated_at: 1770000010,
    terminal_at: 1770000010,
    expires_at: 1770086410
  });
  const getMalformedMetaRes = await app.fetch(
    new Request(`https://corez.test/api/ai/jobs/${malformedMetaJobId}`, {
      method: 'GET',
      headers: { 'X-Job-Token': token }
    }),
    {},
    deps
  );
  assert.equal(getMalformedMetaRes.status, 200);
  const malformedMetaBody = await getMalformedMetaRes.json();
  assert.equal(malformedMetaBody.result.model, '@cf/zai-org/glm-4.7-flash');

  const failedJobId = 'b30e8400-e29b-41d4-a716-446655440000';
  deps.store._jobs.set(failedJobId, {
    id: failedJobId,
    token_hash: tokenHashBytes,
    conversation_id: 'c1',
    status: 'failed',
    prompt_text: 'test',
    error_code: 'MODEL_EXECUTION_FAILED',
    created_at: 1770000000,
    updated_at: 1770000012,
    terminal_at: 1770000012,
    expires_at: 1770086412
  });

  const getFailedRes = await app.fetch(
    new Request(`https://corez.test/api/ai/jobs/${failedJobId}`, {
      method: 'GET',
      headers: { 'X-Job-Token': token }
    }),
    {},
    deps
  );
  assert.equal(getFailedRes.status, 200);
  const failedBody = await getFailedRes.json();
  assert.equal(failedBody.job_id, failedJobId);
  assert.equal(failedBody.status, 'failed');
  assert.equal(failedBody.error.code, 'MODEL_EXECUTION_FAILED');

  // Test 13: GET returns generic 404 for absent, expired, wrong token, or invalid UUID
  const getAbsentRes = await app.fetch(
    new Request('https://corez.test/api/ai/jobs/cc0e8400-e29b-41d4-a716-446655440000', {
      method: 'GET',
      headers: { 'X-Job-Token': token }
    }),
    {},
    deps
  );
  assert.equal(getAbsentRes.status, 404);

  const getWrongTokenRes = await app.fetch(
    new Request(`https://corez.test/api/ai/jobs/${statusJobId}`, {
      method: 'GET',
      headers: { 'X-Job-Token': diffToken }
    }),
    {},
    deps
  );
  assert.equal(getWrongTokenRes.status, 404);

  const expiredJobId = 'dd0e8400-e29b-41d4-a716-446655440000';
  deps.store._jobs.set(expiredJobId, {
    id: expiredJobId,
    token_hash: tokenHashBytes,
    conversation_id: 'c1',
    status: 'completed',
    result_text: 'expired',
    created_at: 1770000000,
    updated_at: 1770000010,
    terminal_at: 1770000010,
    expires_at: 1769999999
  });

  const getExpiredRes = await app.fetch(
    new Request(`https://corez.test/api/ai/jobs/${expiredJobId}`, {
      method: 'GET',
      headers: { 'X-Job-Token': token }
    }),
    {},
    deps
  );
  assert.equal(getExpiredRes.status, 404);

  // Test 14: GET DB error returns 503
  deps.store._setQueryShouldFailWithDbError(true);
  const getDbErrorRes = await app.fetch(
    new Request(`https://corez.test/api/ai/jobs/${statusJobId}`, {
      method: 'GET',
      headers: { 'X-Job-Token': token }
    }),
    {},
    deps
  );
  assert.equal(getDbErrorRes.status, 503);
  deps.store._setQueryShouldFailWithDbError(false);

  // Test 15: Method handling 405
  const postGetEndpoint = await app.fetch(
    new Request(`https://corez.test/api/ai/jobs/${statusJobId}`, {
      method: 'POST',
      headers: { 'X-Job-Token': token }
    }),
    {},
    deps
  );
  assert.equal(postGetEndpoint.status, 405);

  const getPostEndpoint = await app.fetch(
    new Request('https://corez.test/api/ai/jobs', {
      method: 'GET',
      headers: { 'X-Job-Token': token }
    }),
    {},
    deps
  );
  assert.equal(getPostEndpoint.status, 405);

  // Test 16: Zero secrets, tokens, user prompts, or provider/database error details logged or returned in responses
  for (const log of deps._loggedErrors) {
    const serialized = JSON.stringify(log);
    assert.equal(serialized.includes(token), false, 'Token must never be logged');
    assert.equal(serialized.includes('SECRET_USER_PROMPT_KEY_123'), false, 'User prompt content must never be logged');
    assert.equal(serialized.includes('SECRET_DATABASE_KEY_12345'), false, 'Database error details must never be logged');
    assert.equal(serialized.includes('BEARER_PROVIDER_TOKEN_XYZ'), false, 'Provider secrets must never be logged');
    assert.equal(serialized.includes('SECRET_LIMITER_KEY_999'), false, 'Limiter secrets must never be logged');
  }

  console.log('AI jobs API contract passed.');
}

await run();
```

Run test to verify failure (RED):
```bash
node tests/ai-jobs-api-contract.mjs
```
*Expected Output:* `Error: Cannot find module` or assertion failure until implementation is created.

- [ ] **Step 2: Create `migrations/0001_create_ai_jobs.sql`**

```sql
-- migrations/0001_create_ai_jobs.sql
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,                       -- UUID v4 generated by client
    token_hash BLOB NOT NULL,                  -- Raw 32-byte SHA-256 hash of capability token
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
export function normalizeBlob(blob) {
  if (!blob) return null;
  if (blob instanceof Uint8Array) return blob;
  if (blob instanceof ArrayBuffer) return new Uint8Array(blob);
  if (ArrayBuffer.isView(blob)) return new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength);
  if (Array.isArray(blob)) return Uint8Array.from(blob);
  return null;
}

export function createD1Store(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('D1_BINDING_MISSING');
  }

  return {
    async getJob(jobId) {
      const sql = `SELECT * FROM jobs WHERE id = ?`;
      const row = await db.prepare(sql).bind(jobId).first();
      if (!row) return null;
      return {
        ...row,
        token_hash: normalizeBlob(row.token_hash)
      };
    },

    async insertJob(job) {
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
    },

    async markJobRunning(jobId) {
      const sql = `UPDATE jobs SET status = 'running', updated_at = unixepoch() WHERE id = ? AND status = 'queued'`;
      return db.prepare(sql).bind(jobId).run();
    },

    async markJobCompleted(jobId, resultText, providerMeta) {
      const sql = `
        UPDATE jobs 
        SET status = 'completed', result_text = ?, provider_meta = ?, terminal_at = unixepoch(), expires_at = (unixepoch() + 86400), updated_at = unixepoch() 
        WHERE id = ? AND status IN ('queued', 'running')
      `;
      return db.prepare(sql).bind(resultText, providerMeta, jobId).run();
    },

    async markJobFailed(jobId, errorCode) {
      const sql = `
        UPDATE jobs 
        SET status = 'failed', error_code = ?, terminal_at = unixepoch(), expires_at = (unixepoch() + 86400), updated_at = unixepoch() 
        WHERE id = ? AND status IN ('queued', 'running')
      `;
      return db.prepare(sql).bind(errorCode, jobId).run();
    },

    async repairStuckJobs() {
      const sql = `
        UPDATE jobs 
        SET status = 'failed', error_code = 'ACTIVE_DEADLINE_EXCEEDED', terminal_at = unixepoch(), expires_at = (unixepoch() + 86400), updated_at = unixepoch() 
        WHERE status IN ('queued', 'running') AND active_deadline_at <= unixepoch()
      `;
      return db.prepare(sql).run();
    },

    async purgeExpiredJobs() {
      const sql = `DELETE FROM jobs WHERE expires_at IS NOT NULL AND expires_at <= unixepoch()`;
      return db.prepare(sql).run();
    }
  };
}

export async function insertJob(db, job) {
  const store = createD1Store(db);
  return store.insertJob(job);
}

export async function getJobById(db, jobId) {
  const store = createD1Store(db);
  return store.getJob(jobId);
}

export async function markJobRunning(db, jobId) {
  const store = createD1Store(db);
  return store.markJobRunning(jobId);
}

export async function markJobCompleted(db, jobId, resultText, providerMeta) {
  const store = createD1Store(db);
  return store.markJobCompleted(jobId, resultText, providerMeta);
}

export async function markJobFailed(db, jobId, errorCode) {
  const store = createD1Store(db);
  return store.markJobFailed(jobId, errorCode);
}

export async function repairStuckJobs(db) {
  const store = createD1Store(db);
  return store.repairStuckJobs();
}

export async function purgeExpiredJobs(db) {
  const store = createD1Store(db);
  return store.purgeExpiredJobs();
}
```

- [ ] **Step 4: Create `worker/jobs.js`**

```javascript
// worker/jobs.js
import { jsonResponse } from './ai.js';
import {
  sha256Bytes,
  computeRequestFingerprint,
  timingSafeEqualBytes,
  isValidUuid,
  isValidToken,
  getUtf8ByteLength,
  canonicalJson
} from './jobUtils.js';
import { createD1Store, normalizeBlob } from './jobStore.js';

export function resolveDependencies(env, customDeps = {}) {
  const store = 'store' in customDeps ? customDeps.store : (env?.DB ? createD1Store(env.DB) : null);

  const dispatch = 'dispatch' in customDeps ? customDeps.dispatch : (async (jobId) => {
    if (!env?.AI_JOB_WORKFLOW || typeof env.AI_JOB_WORKFLOW.createBatch !== 'function') {
      throw new Error('WORKFLOW_BINDING_MISSING');
    }
    return env.AI_JOB_WORKFLOW.createBatch([{
      id: jobId,
      params: { jobId },
      retention: { successRetention: '1 day', errorRetention: '1 day' }
    }]);
  });

  const limiter = 'limiter' in customDeps ? customDeps.limiter : (async (ip) => {
    if (!env?.RATE_LIMITER || typeof env.RATE_LIMITER.limit !== 'function') {
      throw new Error('LIMITER_BINDING_MISSING');
    }
    return env.RATE_LIMITER.limit({ key: ip });
  });

  const clock = 'clock' in customDeps ? customDeps.clock : {
    now: () => Math.floor(Date.now() / 1000)
  };

  const logger = 'logger' in customDeps ? customDeps.logger : {
    error: (message, meta = {}) => {
      console.error(JSON.stringify({ message, ...meta }));
    }
  };

  return { store, dispatch, limiter, clock, logger };
}

export async function handleCreateJob(request, env, customDeps = {}) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const { store, dispatch, limiter, clock, logger } = resolveDependencies(env, customDeps);

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

  let requestFingerprint;
  let presentedTokenHash;
  try {
    requestFingerprint = await computeRequestFingerprint(conversationId, prompt, intent);
    presentedTokenHash = await sha256Bytes(tokenHeader);
  } catch (err) {
    logger.error('Crypto processing failed', { code: 'CRYPTO_PROCESSING_FAILED' });
    return jsonResponse(503, { error: 'Service unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  if (!store || typeof store.getJob !== 'function' || typeof store.insertJob !== 'function') {
    logger.error('Job store service missing or unconfigured', { code: 'STORE_MISSING' });
    return jsonResponse(503, { error: 'Database service unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  let existingJob = null;
  try {
    existingJob = await store.getJob(jobId);
  } catch (err) {
    logger.error('Database query failed', { code: 'DATABASE_QUERY_FAILED' });
    return jsonResponse(503, { error: 'Database service unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  if (existingJob) {
    const storedTokenHash = normalizeBlob(existingJob.token_hash);
    const tokenMatch = storedTokenHash ? timingSafeEqualBytes(storedTokenHash, presentedTokenHash) : false;
    const fingerprintMatch = existingJob.request_fingerprint === requestFingerprint;

    if (!tokenMatch || !fingerprintMatch) {
      return jsonResponse(409, { error: 'Idempotency conflict for submitted job_id.', code: 'IDEMPOTENCY_CONFLICT' });
    }

    let dispatchFailed = false;
    if (!dispatch || typeof dispatch !== 'function') {
      dispatchFailed = true;
    } else {
      try {
        await dispatch(jobId);
      } catch (err) {
        logger.error('Workflow dispatch failed on idempotent retry', { code: 'WORKFLOW_DISPATCH_FAILED' });
        dispatchFailed = true;
      }
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

  if (!limiter || typeof limiter !== 'function') {
    logger.error('Rate limiter check failed for new job', { code: 'RATE_LIMITER_FAILED' });
    return jsonResponse(503, { error: 'Rate limiting service unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  try {
    const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
    const limitResult = await limiter(clientIp);
    if (limitResult && limitResult.success === false) {
      return jsonResponse(429, { error: 'Rate limit exceeded. Try again later.', code: 'RATE_LIMIT_EXCEEDED' });
    }
  } catch (err) {
    logger.error('Rate limiter check failed for new job', { code: 'RATE_LIMITER_FAILED' });
    return jsonResponse(503, { error: 'Rate limiting service unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  const now = clock.now();
  const newJob = {
    id: jobId,
    token_hash: presentedTokenHash,
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
    await store.insertJob(newJob);
  } catch (err) {
    try {
      const raceJob = await store.getJob(jobId);
      if (raceJob) {
        const storedTokenHash = normalizeBlob(raceJob.token_hash);
        const tokenMatch = storedTokenHash ? timingSafeEqualBytes(storedTokenHash, presentedTokenHash) : false;
        const fingerprintMatch = raceJob.request_fingerprint === requestFingerprint;

        if (!tokenMatch || !fingerprintMatch) {
          return jsonResponse(409, { error: 'Idempotency conflict for submitted job_id.', code: 'IDEMPOTENCY_CONFLICT' });
        }

        let raceDispatchFailed = false;
        if (!dispatch || typeof dispatch !== 'function') {
          raceDispatchFailed = true;
        } else {
          try {
            await dispatch(jobId);
          } catch (dispatchErr) {
            logger.error('Workflow dispatch failed on insert-race recovery', { code: 'WORKFLOW_DISPATCH_FAILED' });
            raceDispatchFailed = true;
          }
        }

        if (raceDispatchFailed) {
          return jsonResponse(503, {
            error: 'Workflow dispatch failed. Please retry.',
            code: 'SERVICE_UNAVAILABLE',
            job_id: raceJob.id,
            status: raceJob.status
          });
        }

        return jsonResponse(200, {
          job_id: raceJob.id,
          status: raceJob.status,
          created_at: raceJob.created_at
        });
      }
    } catch (raceErr) {
      logger.error('Insert-race re-read failed', { code: 'INSERT_RACE_REREAD_FAILED' });
    }

    logger.error('Database insert failed', { code: 'DATABASE_INSERT_FAILED' });
    return jsonResponse(503, { error: 'Database service unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  let newDispatchFailed = false;
  if (!dispatch || typeof dispatch !== 'function') {
    newDispatchFailed = true;
  } else {
    try {
      await dispatch(jobId);
    } catch (err) {
      logger.error('Workflow dispatch failed for new job', { code: 'WORKFLOW_DISPATCH_FAILED' });
      newDispatchFailed = true;
    }
  }

  if (newDispatchFailed) {
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

export async function handleGetJob(request, env, jobId, customDeps = {}) {
  if (request.method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const { store, clock, logger } = resolveDependencies(env, customDeps);

  const tokenHeader = request.headers.get('X-Job-Token');
  if (!isValidToken(tokenHeader) || !isValidUuid(jobId)) {
    return jsonResponse(404, { error: 'Job not found.', code: 'NOT_FOUND' });
  }

  if (!store || typeof store.getJob !== 'function') {
    logger.error('Job store service missing or unconfigured', { code: 'STORE_MISSING' });
    return jsonResponse(503, { error: 'Database service unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  let job = null;
  try {
    job = await store.getJob(jobId);
  } catch (err) {
    logger.error('Database query failed in handleGetJob', { code: 'DATABASE_QUERY_FAILED' });
    return jsonResponse(503, { error: 'Database service unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  if (!job) {
    return jsonResponse(404, { error: 'Job not found.', code: 'NOT_FOUND' });
  }

  let presentedTokenHash;
  try {
    presentedTokenHash = await sha256Bytes(tokenHeader);
  } catch (err) {
    logger.error('Crypto processing failed', { code: 'CRYPTO_PROCESSING_FAILED' });
    return jsonResponse(503, { error: 'Service unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  const storedTokenHash = normalizeBlob(job.token_hash);
  const tokenMatch = storedTokenHash ? timingSafeEqualBytes(storedTokenHash, presentedTokenHash) : false;
  const now = clock.now();
  const isExpired = job.expires_at !== null && job.expires_at <= now;

  if (!tokenMatch || isExpired) {
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
    } catch {
      logger.error('Failed to parse provider_meta JSON', { code: 'PROVIDER_META_PARSE_FAILED' });
    }

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

- [ ] **Step 5: Update `worker/app.js` to route `/api/ai/jobs` with customDeps support**

```javascript
// worker/app.js
import { handleAi, jsonResponse } from './ai.js';
import { handleCreateJob, handleGetJob } from './jobs.js';

export default {
  async fetch(request, env, customDeps = {}) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/api/ai') {
      return handleAi(request, env);
    }
    if (pathname === '/api/ai/jobs') {
      return handleCreateJob(request, env, customDeps);
    }
    if (pathname.startsWith('/api/ai/jobs/')) {
      const jobId = pathname.slice('/api/ai/jobs/'.length);
      return handleGetJob(request, env, jobId, customDeps);
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

> **Codex Review Gate:** Codex inspects `worker/jobStore.js`, `worker/jobs.js`, `worker/app.js`, and `tests/ai-jobs-api-contract.mjs` for routing precision, BLOB normalization, dependency injection, rate limit bypass on retries, and timing-safe auth logic.

Commit changes:
```bash
git add migrations/0001_create_ai_jobs.sql worker/jobStore.js worker/jobs.js worker/app.js tests/ai-jobs-api-contract.mjs
git commit -m "feat(worker): add D1 migration, job store with BLOB token hashes, and jobs API endpoints"
```

---

### Task 4: Pure Workflow Runner Implementation & Worker Entrypoint Export

**Goal:** Implement pure Cloudflare Workflow execution runner `worker/jobWorkflow.js` with separate durable steps (`load-job`, `mark-running`, `provider-call`, `mark-completed`, `mark-failed`) using method-level dependency injection, a production runner resolving D1 store plus shared `invokeWorkersAi`, documented provider retry configuration, and export `AiJobWorkflow` class from `worker/index.js`.

**Files:**
- Create: `tests/ai-job-workflow-contract.mjs`
- Create: `worker/jobWorkflow.js`
- Modify: `worker/index.js`

**Interfaces:**
- `worker/jobWorkflow.js`:
  ```javascript
  export function resolveWorkflowDependencies(env, customDeps = {});
  export async function runAiJobWorkflow(env, event, step, customDeps = {});
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

function createStepTracker() {
  const executedSteps = [];
  const capturedConfigs = {};

  const step = {
    _executedSteps: executedSteps,
    _capturedConfigs: capturedConfigs,
    async do(name, configOrFn, fn) {
      executedSteps.push(name);
      if (typeof configOrFn === 'object' && configOrFn !== null) {
        capturedConfigs[name] = configOrFn;
      }
      const handler = typeof configOrFn === 'function' ? configOrFn : fn;
      return handler();
    }
  };

  return step;
}

async function run() {
  // Test 1: Happy path and shared invoke arguments, retry config capture, and step order
  {
    const step = createStepTracker();
    let getJobCalled = false;
    let markRunningCalled = false;
    let invokeAiArgs = null;
    let markCompletedArgs = null;

    const customDeps = {
      async getJob(jobId) {
        getJobCalled = true;
        return {
          id: jobId,
          prompt_text: 'Explain quantum computing',
          intent_json: JSON.stringify({ mode: 'explain' }),
          status: 'queued'
        };
      },
      async markRunning(jobId) {
        markRunningCalled = true;
      },
      async invokeAi(prompt, intent) {
        invokeAiArgs = { prompt, intent };
        return { content: 'Quantum computing is fascinating.' };
      },
      async markCompleted(jobId, resultText, providerMeta) {
        markCompletedArgs = { jobId, resultText, providerMeta };
      },
      async markFailed(jobId, errorCode) {
        assert.fail('markFailed should not be called on happy path');
      }
    };

    const event = { payload: { jobId: 'job-1' } };
    await runAiJobWorkflow({}, event, step, customDeps);

    assert.equal(getJobCalled, true);
    assert.equal(markRunningCalled, true);
    assert.deepEqual(invokeAiArgs, {
      prompt: 'Explain quantum computing',
      intent: { mode: 'explain' }
    });
    assert.equal(markCompletedArgs.jobId, 'job-1');
    assert.equal(markCompletedArgs.resultText, 'Quantum computing is fascinating.');

    const metaObj = JSON.parse(markCompletedArgs.providerMeta);
    assert.equal(metaObj.provider, '@cf/workers-ai');
    assert.equal(metaObj.model, '@cf/workers-ai/glm-4.7-flash');

    assert.deepEqual(step._executedSteps, ['load-job', 'mark-running', 'provider-call', 'mark-completed']);
    assert.deepEqual(step._capturedConfigs['provider-call'], {
      retries: {
        limit: 5,
        delay: '10 seconds',
        backoff: 'exponential'
      },
      timeout: '10 minutes'
    });
  }

  // Test 2: Already completed/failed terminal no-op
  {
    for (const terminalStatus of ['completed', 'failed']) {
      const step = createStepTracker();
      let providerCalled = false;
      let markRunningCalled = false;

      const customDeps = {
        async getJob(jobId) {
          return {
            id: jobId,
            prompt_text: 'Prompt',
            intent_json: null,
            status: terminalStatus
          };
        },
        async markRunning() { markRunningCalled = true; },
        async invokeAi() { providerCalled = true; },
        async markCompleted() {},
        async markFailed() {}
      };

      await runAiJobWorkflow({}, { payload: { jobId: 'job-terminal' } }, step, customDeps);

      assert.equal(markRunningCalled, false);
      assert.equal(providerCalled, false);
      assert.deepEqual(step._executedSteps, ['load-job']);
    }
  }

  // Test 3: Missing row fatal
  {
    const step = createStepTracker();
    const customDeps = {
      async getJob(jobId) {
        return null;
      },
      async markRunning() {},
      async invokeAi() {},
      async markCompleted() {},
      async markFailed() {}
    };

    await assert.rejects(
      async () => runAiJobWorkflow({}, { payload: { jobId: 'job-missing' } }, step, customDeps),
      (err) => err.message === 'JOB_NOT_FOUND_FATAL'
    );
    assert.deepEqual(step._executedSteps, ['load-job']);
  }

  // Test 4: Corrupt intent/prompt handling
  {
    const step = createStepTracker();
    let passedIntent = undefined;

    const customDeps = {
      async getJob(jobId) {
        return {
          id: jobId,
          prompt_text: 'Valid prompt',
          intent_json: '{ corrupt json string',
          status: 'queued'
        };
      },
      async markRunning() {},
      async invokeAi(prompt, intent) {
        passedIntent = intent;
        return { content: 'OK answer' };
      },
      async markCompleted() {},
      async markFailed() {}
    };

    await runAiJobWorkflow({}, { payload: { jobId: 'job-corrupt-intent' } }, step, customDeps);
    assert.equal(passedIntent, null);
    assert.deepEqual(step._executedSteps, ['load-job', 'mark-running', 'provider-call', 'mark-completed']);
  }

  // Test 5: Provider retry exhaustion marks failed
  {
    const step = createStepTracker();
    let markFailedArgs = null;

    const customDeps = {
      async getJob(jobId) {
        return {
          id: jobId,
          prompt_text: 'Prompt',
          intent_json: null,
          status: 'queued'
        };
      },
      async markRunning() {},
      async invokeAi() {
        throw new Error('WORKERS_AI_RETRY_EXHAUSTED');
      },
      async markCompleted() {},
      async markFailed(jobId, errorCode) {
        markFailedArgs = { jobId, errorCode };
      }
    };

    await runAiJobWorkflow({}, { payload: { jobId: 'job-failed' } }, step, customDeps);

    assert.deepEqual(markFailedArgs, { jobId: 'job-failed', errorCode: 'MODEL_EXECUTION_FAILED' });
    assert.deepEqual(step._executedSteps, ['load-job', 'mark-running', 'provider-call', 'mark-failed']);
  }

  // Test 6: 500,000-byte safe truncation
  {
    const step = createStepTracker();
    let completedResultText = '';

    const hugeContent = 'A'.repeat(600000);
    const customDeps = {
      async getJob(jobId) {
        return {
          id: jobId,
          prompt_text: 'Huge prompt',
          intent_json: null,
          status: 'queued'
        };
      },
      async markRunning() {},
      async invokeAi() {
        return { content: hugeContent };
      },
      async markCompleted(jobId, resultText) {
        completedResultText = resultText;
      },
      async markFailed() {}
    };

    await runAiJobWorkflow({}, { payload: { jobId: 'job-huge' } }, step, customDeps);

    const byteLen = new TextEncoder().encode(completedResultText).byteLength;
    assert.ok(byteLen <= 500000, `Truncated byte length ${byteLen} must be <= 500000`);
    assert.ok(completedResultText.endsWith('\n\n[Output truncated at 500KB bound]'));
    assert.deepEqual(step._executedSteps, ['load-job', 'mark-running', 'provider-call', 'mark-completed']);
  }

  console.log('AI job workflow contract passed.');
}

await run();
```

- [ ] **Step 2: Create `worker/jobWorkflow.js`**

```javascript
// worker/jobWorkflow.js
import { WORKERS_AI_MODEL, invokeWorkersAi } from './ai.js';
import { getJobById, markJobRunning, markJobCompleted, markJobFailed } from './jobStore.js';
import { truncateToUtf8ByteLimit } from './jobUtils.js';

export function resolveWorkflowDependencies(env, customDeps = {}) {
  const getJob = 'getJob' in customDeps ? customDeps.getJob : (async (jobId) => {
    if (!env?.DB) throw new Error('D1_BINDING_MISSING');
    return getJobById(env.DB, jobId);
  });

  const markRunning = 'markRunning' in customDeps ? customDeps.markRunning : (async (jobId) => {
    if (!env?.DB) throw new Error('D1_BINDING_MISSING');
    return markJobRunning(env.DB, jobId);
  });

  const markCompleted = 'markCompleted' in customDeps ? customDeps.markCompleted : (async (jobId, resultText, providerMeta) => {
    if (!env?.DB) throw new Error('D1_BINDING_MISSING');
    return markJobCompleted(env.DB, jobId, resultText, providerMeta);
  });

  const markFailed = 'markFailed' in customDeps ? customDeps.markFailed : (async (jobId, errorCode) => {
    if (!env?.DB) throw new Error('D1_BINDING_MISSING');
    return markJobFailed(env.DB, jobId, errorCode);
  });

  const invokeAi = 'invokeAi' in customDeps ? customDeps.invokeAi : (async (prompt, intent) => {
    return invokeWorkersAi(env, { prompt, intent });
  });

  return { getJob, markRunning, markCompleted, markFailed, invokeAi };
}

export async function runAiJobWorkflow(env, event, step, customDeps = {}) {
  const { jobId } = event?.payload || {};
  if (!jobId) {
    throw new Error('MISSING_JOB_ID_FATAL');
  }

  const { getJob, markRunning, markCompleted, markFailed, invokeAi } = resolveWorkflowDependencies(env, customDeps);

  // Step 1: load-job
  const job = await step.do('load-job', async () => {
    const row = await getJob(jobId);
    if (!row) {
      throw new Error('JOB_NOT_FOUND_FATAL');
    }
    return row;
  });

  if (!job) return;

  if (job.status === 'completed' || job.status === 'failed') {
    return;
  }

  // Step 2: mark-running
  await step.do('mark-running', async () => {
    await markRunning(jobId);
  });

  // Step 3: provider-call
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
        if (job.intent_json && typeof job.intent_json === 'string') {
          try {
            intent = JSON.parse(job.intent_json);
          } catch (parseErr) {
            intent = null;
          }
        }

        const result = await invokeAi(job.prompt_text, intent);
        const rawContent = typeof result?.content === 'string' ? result.content : '';
        return truncateToUtf8ByteLimit(rawContent, 500000);
      }
    );
  } catch (err) {
    // Step 4a: mark-failed
    await step.do('mark-failed', async () => {
      await markFailed(jobId, 'MODEL_EXECUTION_FAILED');
    });
    return;
  }

  // Step 4b: mark-completed
  const providerMeta = JSON.stringify({
    provider: '@cf/workers-ai',
    model: WORKERS_AI_MODEL
  });

  await step.do('mark-completed', async () => {
    await markCompleted(jobId, completionResult, providerMeta);
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

**Goal:** Configure `wrangler.jsonc` with D1 database `cloud-service`, Workflows binding `AI_JOB_WORKFLOW` with class `AiJobWorkflow`, Rate Limiter binding `RATE_LIMITER` with namespace `1000` (limit 10, period 60), update `tests/cloudflare-worker-config-contract.sh`, and update `.github/workflows/deploy.yml` to apply remote D1 migrations before deployment using `preCommands`. Resource provisioning and configuration occur strictly after `AiJobWorkflow` entrypoint export exists in `worker/index.js` (completed in Task 4).

**Files:**
- Modify: `tests/cloudflare-worker-config-contract.sh`
- Modify: `wrangler.jsonc`
- Modify: `.github/workflows/deploy.yml`

**Interfaces & Requirements:**
- Provisioning Order: Resource creation and binding configuration happen strictly after `AiJobWorkflow` exists in `worker/index.js`.
- D1 Database Name: `cloud-service`.
- D1 Database ID: RED must run before provisioning and config update. After `npx wrangler d1 create cloud-service` returns, the implementer must add a literal `database_id` property containing the actual returned value directly after `database_name` without echoing the value into logs or artifacts. GREEN runs only after the actual property is inserted. Codex must validate UUID shape and exact provisioned-versus-configured match before commit. The plan contains no empty database ID, no sample UUID, no placeholder token, no template interpolation, and no fake value.
- Workflows Binding: `binding: "AI_JOB_WORKFLOW"`, `class_name: "AiJobWorkflow"`.
- Rate Limiter Binding: `name: "RATE_LIMITER"`, `namespace_id: "1000"`, `simple: { limit: 10, period: 60 }`.
- Config Contract Test: Retain every existing assertion in `tests/cloudflare-worker-config-contract.sh` and append assertions for D1 binding `DB`, `cloud-service`, `database_id` UUID shape (inspecting actual configured value via regex without embedding any value), `AI_JOB_WORKFLOW`, `AiJobWorkflow`, `RATE_LIMITER`, `1000`, `10`, and `60`.
- CI Pipeline: Minimal edit to `.github/workflows/deploy.yml` preserving `checkout`, `setup-node`, `npm ci`, `test:cloudflare`, `build`, and existing `cloudflare/wrangler-action@v3` secret mappings (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). Add `preCommands: npx wrangler d1 migrations apply DB --remote` to the existing action. No separate deploy step or cron/scheduled handler.

- [ ] **Step 1: Update `tests/cloudflare-worker-config-contract.sh` and verify RED status**

Edit `tests/cloudflare-worker-config-contract.sh` to retain all existing checks and append checks for D1, Workflows, and Rate Limiter:

```bash
#!/usr/bin/env bash
set -u

config="wrangler.jsonc"
package="package.json"
readme="README.md"
workflow=".github/workflows/deploy.yml"
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

check 'Worker name matches the deployed Worker' '"name"[[:space:]]*:[[:space:]]*"ai"' "$config"
check 'Worker entrypoint is configured' '"main"[[:space:]]*:[[:space:]]*"[.]/worker/index[.]js"' "$config"
check 'Vite dist is the asset directory' '"directory"[[:space:]]*:[[:space:]]*"[.]/dist"' "$config"
check 'ASSETS binding is configured' '"binding"[[:space:]]*:[[:space:]]*"ASSETS"' "$config"
check 'SPA fallback is configured' '"not_found_handling"[[:space:]]*:[[:space:]]*"single-page-application"' "$config"
check 'API routes run Worker-first' '"run_worker_first"[[:space:]]*:[[:space:]]*\[[[:space:]]*"/api/[*]"' "$config"
check 'Workers AI binding is configured' '"ai"[[:space:]]*:[[:space:]]*\{' "$config"
check 'Workers AI binding is named AI' '"binding"[[:space:]]*:[[:space:]]*"AI"' "$config"
check 'Cloudflare contract script exists' 'cloudflare-worker-contract[.]mjs' "$package"
check 'Workers AI provider contract runs in the standard suite' 'workers-ai-provider-contract[.]sh' "$package"
check 'public AI proxy contract runs in the standard suite' 'public-ai-proxy-contract[.]sh' "$package"
check 'live AI contracts run in the standard suite' 'ai-live-intent-eval-contract[.]sh.*ai-live-intent-eval-response-contract[.]mjs' "$package"
check 'environment skill contract runs in the standard suite' 'env-question-skill-contract[.]sh' "$package"
check 'Wrangler local development script exists' '"dev:worker"' "$package"
check 'Wrangler deploy script exists' '"deploy"' "$package"
check 'README documents Cloudflare deployment' 'Cloudflare Worker' "$readme"
check 'README documents the build command' 'npm run build' "$readme"
check 'README documents the deploy command' 'npx wrangler deploy' "$readme"
check 'GitHub Actions uses the current setup-node action' 'actions/setup-node@v4' "$workflow"
check 'deployment runs the hosted AI contract suite' 'npm run test:cloudflare' "$workflow"
check 'D1 binding DB is configured' '"binding"[[:space:]]*:[[:space:]]*"DB"' "$config"
check 'D1 database_name cloud-service is configured' '"database_name"[[:space:]]*:[[:space:]]*"cloud-service"' "$config"
check 'D1 database_id has UUID shape' '"database_id"[[:space:]]*:[[:space:]]*"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"' "$config"
check 'Workflows binding AI_JOB_WORKFLOW is configured' '"binding"[[:space:]]*:[[:space:]]*"AI_JOB_WORKFLOW"' "$config"
check 'Workflows class_name AiJobWorkflow is configured' '"class_name"[[:space:]]*:[[:space:]]*"AiJobWorkflow"' "$config"
check 'Rate Limiter name RATE_LIMITER is configured' '"name"[[:space:]]*:[[:space:]]*"RATE_LIMITER"' "$config"
check 'Rate Limiter namespace_id 1000 is configured' '"namespace_id"[[:space:]]*:[[:space:]]*"1000"' "$config"
check 'Rate Limiter limit 10 is configured' '"limit"[[:space:]]*:[[:space:]]*10' "$config"
check 'Rate Limiter period 60 is configured' '"period"[[:space:]]*:[[:space:]]*60' "$config"

if (( failures > 0 )); then
  printf '%d Cloudflare Worker configuration contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Cloudflare Worker configuration contract passed.\n'
```

Run contract test to verify RED failure status before provisioning and config update:
```bash
bash tests/cloudflare-worker-config-contract.sh
```
*Expected Output:* `FAIL: D1 binding DB is configured...`

- [ ] **Step 2: D1 Database Provisioning Execution Procedure**

Run D1 creation command in shell:
```bash
npx wrangler d1 create cloud-service
```

After the real `npx wrangler d1 create cloud-service` command returns, instruct the implementer to add a literal `database_id` property containing the actual returned value directly after `database_name` in `wrangler.jsonc`, without echoing the value into logs or artifacts.

- [ ] **Step 3: Update `wrangler.jsonc`**

Edit `wrangler.jsonc` to preserve all existing fields (`$schema`, `name`, `main`, `compatibility_date`, `ai`, `assets`) and add minimal bindings for D1, Workflows, and Rate Limiter:

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
      "database_name": "cloud-service"
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
*(After `npx wrangler d1 create cloud-service` returns, add a literal `database_id` property containing the actual returned value directly after `database_name` prior to contract verification).*

- [ ] **Step 4: Update `.github/workflows/deploy.yml`**

Edit `.github/workflows/deploy.yml` to preserve `checkout`, `setup-node`, `npm ci`, `npm run test:cloudflare`, `npm run build`, and existing `cloudflare/wrangler-action@v3` secret mappings (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), appending `preCommands: npx wrangler d1 migrations apply DB --remote` to the deployment action:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run hosted AI contract suite
        run: npm run test:cloudflare

      - name: Run build
        run: npm run build

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          preCommands: npx wrangler d1 migrations apply DB --remote
```

- [ ] **Step 5: Verify GREEN test status**

Run configuration contract check (GREEN runs only after the actual `database_id` property is inserted):
```bash
bash tests/cloudflare-worker-config-contract.sh
### Task 6: Client Services — Background Job Registry & Polling Sync

**Goal:** Implement `src/services/backgroundJobs.js` and `src/services/backgroundJobSync.js` alongside comprehensive contract tests in `tests/background-jobs-client-contract.mjs`. Manage client job registry records in `localStorage` key `corez_background_ai_jobs_v1`, mandate Web Crypto for non-predictable UUID v4 and capability token generation, enforce pre-POST persistence order (job record and conversation history written before network fetch), preserve identical job identity and increment attempt count across retries and ambiguous network/5xx failures, reload fresh sessions from `corez_sessions` on every reconciliation pass using strict chat schema (`role` and `content` only), handle all job statuses (`queued`, `running`, `completed`, `failed`, `expired`, `404`, `410`), enforce strict terminal persistence ordering (save history before clearing credentials), retain credentials if storage read or history write fails, recover missing origin sessions into a dedicated recovered session with deterministic clock timestamps, gate executable preview/canvas callbacks to the active origin session, global duplicate job ID deduplication per pass, and surface storage errors without empty catch blocks or sensitive token/prompt logging.

**Files:**
- Create: `tests/background-jobs-client-contract.mjs`
- Create: `src/services/backgroundJobs.js`
- Create: `src/services/backgroundJobSync.js`

**Interfaces:**
- `src/services/backgroundJobs.js`:
  ```javascript
  export const BACKGROUND_JOBS_STORAGE_KEY = 'corez_background_ai_jobs_v1';
  export function checkWebCryptoAvailable(cryptoObj);
  export function generateJobId(cryptoObj);
  export function generateCapabilityToken(cryptoObj);
  export function getStoredJobs(deps);
  export function saveJobRecord(record, deps);
  export function updateJobRecord(jobId, updates, deps);
  export function removeJobRecord(jobId, deps);
  export async function dispatchBackgroundJob(params, deps);
  export async function fetchJobStatus(jobId, capabilityToken, deps);
  ```
- `src/services/backgroundJobSync.js`:
  ```javascript
  export const SESSIONS_STORAGE_KEY = 'corez_sessions';
  export function calculatePollingDelay(attemptCount);
  export function getFreshSessions(deps);
  export function saveFreshSessions(sessions, deps);
  export function applyTerminalStateToSessions(params);
  export async function reconcileBackgroundJobs(options, deps);
  ```

- [ ] **Step 1: Write failing contract test `tests/background-jobs-client-contract.mjs`**

Create `tests/background-jobs-client-contract.mjs` with comprehensive executable test coverage:

```javascript
// tests/background-jobs-client-contract.mjs
import assert from 'node:assert/strict';
import {
  BACKGROUND_JOBS_STORAGE_KEY,
  checkWebCryptoAvailable,
  generateJobId,
  generateCapabilityToken,
  getStoredJobs,
  saveJobRecord,
  updateJobRecord,
  removeJobRecord,
  dispatchBackgroundJob,
  fetchJobStatus
} from '../src/services/backgroundJobs.js';
import {
  SESSIONS_STORAGE_KEY,
  calculatePollingDelay,
  getFreshSessions,
  saveFreshSessions,
  reconcileBackgroundJobs,
  applyTerminalStateToSessions
} from '../src/services/backgroundJobSync.js';

function createMockStorage() {
  const store = new Map();
  let shouldFailSet = false;
  let shouldFailGet = false;

  return {
    _store: store,
    _setShouldFailSet(val) { shouldFailSet = val; },
    _setShouldFailGet(val) { shouldFailGet = val; },
    getItem(key) {
      if (shouldFailGet) {
        throw new Error('STORAGE_READ_DENIED: Access control error');
      }
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (shouldFailSet) {
        throw new Error('STORAGE_QUOTA_EXCEEDED: LocalStorage quota reached');
      }
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

async function run() {
  const storage = createMockStorage();
  const logs = [];
  const logger = {
    error: (msg, meta) => logs.push({ level: 'error', msg, meta }),
    info: (msg, meta) => logs.push({ level: 'info', msg, meta })
  };

  let currentTime = 1770000000000;
  const clock = { now: () => currentTime };
  const cryptoObj = globalThis.crypto;

  // ---------------------------------------------------------------------------
  // Test 1: Mandatory Web Crypto & Exception on Missing Crypto
  // ---------------------------------------------------------------------------
  assert.doesNotThrow(() => checkWebCryptoAvailable(cryptoObj));
  const validUuid = generateJobId(cryptoObj);
  assert.match(validUuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  const validToken = generateCapabilityToken(cryptoObj);
  assert.equal(validToken.length, 72);
  assert.ok(validToken.startsWith('job_sec_'));

  assert.throws(
    () => checkWebCryptoAvailable(null),
    /CRYPTO_UNAVAILABLE/,
    'Must throw CRYPTO_UNAVAILABLE if crypto is null'
  );
  assert.throws(
    () => generateJobId({}),
    /CRYPTO_UNAVAILABLE/,
    'Must throw CRYPTO_UNAVAILABLE if randomUUID missing'
  );

  // ---------------------------------------------------------------------------
  // Test 2: Storage Failures Surfaced & Strict getFreshSessions Error Handling
  // ---------------------------------------------------------------------------
  storage._setShouldFailSet(true);
  assert.throws(
    () => saveJobRecord({ jobId: 'j-1', capabilityToken: validToken, prompt: 'p' }, { storage }),
    /STORAGE_ERROR/,
    'saveJobRecord must surface storage errors'
  );
  assert.throws(
    () => saveFreshSessions([{ id: 's1', messages: [] }], { storage }),
    /STORAGE_ERROR/,
    'saveFreshSessions must surface storage errors'
  );
  storage._setShouldFailSet(false);

  assert.throws(
    () => getFreshSessions({ storage: null }),
    /STORAGE_UNAVAILABLE/,
    'getFreshSessions must throw on missing storage'
  );

  storage._setShouldFailGet(true);
  assert.throws(
    () => getFreshSessions({ storage }),
    /STORAGE_ERROR/,
    'getFreshSessions must throw on read failure'
  );
  storage._setShouldFailGet(false);

  storage.setItem(SESSIONS_STORAGE_KEY, 'invalid-json-{');
  assert.throws(
    () => getFreshSessions({ storage }),
    /STORAGE_ERROR/,
    'getFreshSessions must throw on malformed JSON'
  );

  storage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify({ not: 'an array' }));
  assert.throws(
    () => getFreshSessions({ storage }),
    /STORAGE_ERROR/,
    'getFreshSessions must throw on non-array data'
  );

  storage.removeItem(SESSIONS_STORAGE_KEY);
  assert.deepEqual(
    getFreshSessions({ storage }),
    [],
    'getFreshSessions must return [] when key is genuinely absent'
  );

  // ---------------------------------------------------------------------------
  // Test 3: Pre-POST Persistence Order & Pre-POST History Failure Handling
  // ---------------------------------------------------------------------------
  storage.clear();
  const sequence = [];
  let fetchCalled = false;

  const mockFetchForDispatch = async () => {
    fetchCalled = true;
    const inFlightJobs = getStoredJobs({ storage });
    assert.equal(inFlightJobs.length, 1, 'Registry record must be stored before POST');
    sequence.push('fetch_post');
    return new Response(JSON.stringify({ status: 'queued' }), { status: 200 });
  };

  const saveHistoryCallback = () => {
    sequence.push('save_history');
  };

  const dispatchRes = await dispatchBackgroundJob({
    conversationId: 'conv-100',
    userMessageId: 'msg-u1',
    assistantMessageId: 'msg-a1',
    prompt: 'Write a python script',
    saveConversationHistory: saveHistoryCallback
  }, {
    crypto: cryptoObj,
    storage,
    fetch: mockFetchForDispatch,
    clock
  });

  assert.equal(dispatchRes.status, 'queued');
  assert.deepEqual(sequence, ['save_history', 'fetch_post'], 'History save must execute before POST fetch');

  storage.clear();
  fetchCalled = false;

  const failingHistoryCallback = () => {
    throw new Error('HISTORY_WRITE_FAILED: Disk full');
  };

  await assert.rejects(
    () => dispatchBackgroundJob({
      conversationId: 'conv-101',
      userMessageId: 'msg-u101',
      assistantMessageId: 'msg-a101',
      prompt: 'Test prompt history failure',
      saveConversationHistory: failingHistoryCallback
    }, {
      crypto: cryptoObj,
      storage,
      fetch: () => { fetchCalled = true; return new Response('{}', { status: 200 }); },
      clock
    }),
    /HISTORY_PERSISTENCE_ERROR/
  );

  assert.equal(fetchCalled, false, 'Fetch must never be called when history persistence fails');
  const storedJobsAfterHistoryFail = getStoredJobs({ storage });
  assert.equal(storedJobsAfterHistoryFail.length, 1, 'Registry identity must be retained when history persistence fails');

  // ---------------------------------------------------------------------------
  // Test 4: Ambiguous Network / 5xx Failure Identity Retention & Retry Attempt Count Increment
  // ---------------------------------------------------------------------------
  storage.clear();
  const ambiguousJobId = '550e8400-e29b-41d4-a716-446655440099';
  const ambiguousToken = generateCapabilityToken(cryptoObj);

  const failingFetch = async () => {
    throw new TypeError('Failed to fetch (NetworkOffline)');
  };

  await assert.rejects(
    () => dispatchBackgroundJob({
      conversationId: 'conv-100',
      userMessageId: 'msg-u2',
      assistantMessageId: 'msg-a2',
      prompt: 'Retry prompt',
      existingJobId: ambiguousJobId,
      existingCapabilityToken: ambiguousToken
    }, {
      crypto: cryptoObj,
      storage,
      fetch: failingFetch,
      clock
    }),
    /DISPATCH_AMBIGUOUS/
  );

  const storedJobsAfterFailure = getStoredJobs({ storage });
  const failedRecord = storedJobsAfterFailure.find(j => j.jobId === ambiguousJobId);
  assert.ok(failedRecord, 'Ambiguous failed job must remain in registry storage');
  assert.equal(failedRecord.capabilityToken, ambiguousToken, 'Capability token must be preserved for retry');
  assert.equal(failedRecord.attemptCount, 1, 'Initial dispatch attemptCount is 1');

  const successfulFetchForRetry = async () => new Response(JSON.stringify({ status: 'queued' }), { status: 200 });

  const retryRes = await dispatchBackgroundJob({
    conversationId: 'conv-100',
    userMessageId: 'msg-u2',
    assistantMessageId: 'msg-a2',
    prompt: 'Retry prompt',
    existingJobId: ambiguousJobId,
    existingCapabilityToken: ambiguousToken
  }, {
    crypto: cryptoObj,
    storage,
    fetch: successfulFetchForRetry,
    clock
  });

  assert.equal(retryRes.jobId, ambiguousJobId);
  const retriedRecord = getStoredJobs({ storage }).find(j => j.jobId === ambiguousJobId);
  assert.equal(retriedRecord.attemptCount, 2, 'Attempt count must increment to 2 on re-dispatching existing identity');

  // ---------------------------------------------------------------------------
  // Test 5: Polling Delay Exponential Backoff
  // ---------------------------------------------------------------------------
  assert.equal(calculatePollingDelay(1), 1000);
  assert.equal(calculatePollingDelay(2), 2000);
  assert.equal(calculatePollingDelay(3), 4000);
  assert.equal(calculatePollingDelay(4), 8000);
  assert.equal(calculatePollingDelay(5), 10000);
  assert.equal(calculatePollingDelay(10), 10000);

  // ---------------------------------------------------------------------------
  // Test 6: Separate Status Handling in Reconciliation (Queued, Running, Completed, Failed, Expired)
  // ---------------------------------------------------------------------------
  storage.clear();

  saveFreshSessions([
    {
      id: 'conv-statuses',
      title: 'Status Test Session',
      messages: [
        { id: 'm-u1', role: 'user', content: 'Job 1' },
        { id: 'm-a1', role: 'assistant', content: '...', status: 'queued' },
        { id: 'm-u2', role: 'user', content: 'Job 2' },
        { id: 'm-a2', role: 'assistant', content: '...', status: 'queued' },
        { id: 'm-u3', role: 'user', content: 'Job 3' },
        { id: 'm-a3', role: 'assistant', content: '...', status: 'queued' },
        { id: 'm-u4', role: 'user', content: 'Job 4' },
        { id: 'm-a4', role: 'assistant', content: '...', status: 'queued' },
        { id: 'm-u5', role: 'user', content: 'Job 5' },
        { id: 'm-a5', role: 'assistant', content: '...', status: 'queued' }
      ]
    }
  ], { storage });

  const j1 = generateJobId(cryptoObj);
  const j2 = generateJobId(cryptoObj);
  const j3 = generateJobId(cryptoObj);
  const j4 = generateJobId(cryptoObj);
  const j5 = generateJobId(cryptoObj);

  const token1 = generateCapabilityToken(cryptoObj);
  const token2 = generateCapabilityToken(cryptoObj);
  const token3 = generateCapabilityToken(cryptoObj);
  const token4 = generateCapabilityToken(cryptoObj);
  const token5 = generateCapabilityToken(cryptoObj);

  saveJobRecord({ jobId: j1, capabilityToken: token1, conversationId: 'conv-statuses', assistantMessageId: 'm-a1', userMessageId: 'm-u1', prompt: 'Job 1', status: 'queued', attemptCount: 1 }, { storage, clock });
  saveJobRecord({ jobId: j2, capabilityToken: token2, conversationId: 'conv-statuses', assistantMessageId: 'm-a2', userMessageId: 'm-u2', prompt: 'Job 2', status: 'queued', attemptCount: 1 }, { storage, clock });
  saveJobRecord({ jobId: j3, capabilityToken: token3, conversationId: 'conv-statuses', assistantMessageId: 'm-a3', userMessageId: 'm-u3', prompt: 'Job 3', status: 'queued', attemptCount: 1 }, { storage, clock });
  saveJobRecord({ jobId: j4, capabilityToken: token4, conversationId: 'conv-statuses', assistantMessageId: 'm-a4', userMessageId: 'm-u4', prompt: 'Job 4', status: 'queued', attemptCount: 1 }, { storage, clock });
  saveJobRecord({ jobId: j5, capabilityToken: token5, conversationId: 'conv-statuses', assistantMessageId: 'm-a5', userMessageId: 'm-u5', prompt: 'Job 5', status: 'queued', attemptCount: 1 }, { storage, clock });

  let canvasUpdatedContent = null;

  const mockMultiStatusFetch = async (url) => {
    if (url.includes(j1)) return new Response(JSON.stringify({ status: 'queued' }), { status: 200 });
    if (url.includes(j2)) return new Response(JSON.stringify({ status: 'running' }), { status: 200 });
    if (url.includes(j3)) return new Response(JSON.stringify({ status: 'completed', result: { content: 'Result 3', model: 'm3' } }), { status: 200 });
    if (url.includes(j4)) return new Response(JSON.stringify({ status: 'failed', error: { message: 'Failed 4' } }), { status: 200 });
    if (url.includes(j5)) return new Response(JSON.stringify({ status: 'expired' }), { status: 200 });
    return new Response('{}', { status: 404 });
  };

  const statusSyncRes = await reconcileBackgroundJobs({
    activeSessionId: 'conv-statuses',
    onActiveSessionResult: (c) => { canvasUpdatedContent = c; }
  }, {
    storage,
    fetch: mockMultiStatusFetch,
    logger,
    clock
  });

  assert.equal(statusSyncRes.reconciledCount, 3, 'Completed, failed, and expired jobs reconciled');
  assert.equal(canvasUpdatedContent, 'Result 3', 'Active session result callback updated with completed output');

  const remainingJobs = getStoredJobs({ storage });
  assert.equal(remainingJobs.length, 2, 'Queued and running jobs remain in registry storage');
  assert.ok(remainingJobs.some(j => j.jobId === j1 && j.status === 'queued'));
  assert.ok(remainingJobs.some(j => j.jobId === j2 && j.status === 'running'));

  const sessionsAfterStatusSync = getFreshSessions({ storage });
  const msgs = sessionsAfterStatusSync[0].messages;

  const m1 = msgs.find(m => m.id === 'm-a1');
  const m2 = msgs.find(m => m.id === 'm-a2');
  const m3 = msgs.find(m => m.id === 'm-a3');
  const m4 = msgs.find(m => m.id === 'm-a4');
  const m5 = msgs.find(m => m.id === 'm-a5');

  assert.equal(m1.status, 'queued');
  assert.equal(m2.status, 'running');
  assert.equal(m3.status, 'completed');
  assert.equal(m3.content, 'Result 3');
  assert.equal(m3.model, 'm3');
  assert.equal(m4.status, 'failed');
  assert.equal(m4.content, 'Failed 4');
  assert.equal(m5.status, 'expired');

  for (const m of msgs) {
    assert.equal(m.sender, undefined, 'Must not introduce legacy sender key');
    assert.equal(m.text, undefined, 'Must not introduce legacy text key');
  }

  // ---------------------------------------------------------------------------
  // Test 7: HTTP 404 & HTTP 410 Handling in Reconciliation
  // ---------------------------------------------------------------------------
  storage.clear();

  saveFreshSessions([
    {
      id: 'conv-http-err',
      title: 'HTTP Errors Session',
      messages: [
        { id: 'm-a404', role: 'assistant', content: '...', status: 'queued' },
        { id: 'm-a410', role: 'assistant', content: '...', status: 'queued' }
      ]
    }
  ], { storage });

  const j404 = generateJobId(cryptoObj);
  const j410 = generateJobId(cryptoObj);
  const t404 = generateCapabilityToken(cryptoObj);
  const t410 = generateCapabilityToken(cryptoObj);

  saveJobRecord({ jobId: j404, capabilityToken: t404, conversationId: 'conv-http-err', assistantMessageId: 'm-a404', status: 'queued' }, { storage, clock });
  saveJobRecord({ jobId: j410, capabilityToken: t410, conversationId: 'conv-http-err', assistantMessageId: 'm-a410', status: 'queued' }, { storage, clock });

  const httpErrFetch = async (url) => {
    if (url.includes(j404)) return new Response('Not Found', { status: 404 });
    if (url.includes(j410)) return new Response('Gone', { status: 410 });
    return new Response('{}', { status: 200 });
  };

  const httpErrRes = await reconcileBackgroundJobs({}, {
    storage,
    fetch: httpErrFetch,
    logger,
    clock
  });

  assert.equal(httpErrRes.reconciledCount, 2);
  assert.equal(getStoredJobs({ storage }).length, 0, '404 and 410 job records removed from storage after terminal history save');

  const httpSessions = getFreshSessions({ storage });
  const m404Res = httpSessions[0].messages.find(m => m.id === 'm-a404');
  const m410Res = httpSessions[0].messages.find(m => m.id === 'm-a410');

  assert.equal(m404Res.status, 'failed');
  assert.ok(m404Res.content.includes('not found'));
  assert.equal(m410Res.status, 'expired');
  assert.ok(m410Res.content.includes('24 hours'));

  // ---------------------------------------------------------------------------
  // Test 8: Global Duplicate Job ID Handling
  // ---------------------------------------------------------------------------
  storage.clear();

  saveFreshSessions([{ id: 'conv-dup', messages: [{ id: 'm-adup', role: 'assistant', content: '...', status: 'queued' }] }], { storage });

  const dupJobId = generateJobId(cryptoObj);
  const dupToken = generateCapabilityToken(cryptoObj);

  const dupRecord = { jobId: dupJobId, capabilityToken: dupToken, conversationId: 'conv-dup', assistantMessageId: 'm-adup', status: 'queued' };
  saveJobRecord(dupRecord, { storage, clock });
  const rawJobs = getStoredJobs({ storage });
  rawJobs.push({ ...dupRecord });
  storage.setItem(BACKGROUND_JOBS_STORAGE_KEY, JSON.stringify(rawJobs));

  let dupFetchCount = 0;
  const dupFetch = async () => {
    dupFetchCount++;
    return new Response(JSON.stringify({ status: 'completed', result: { content: 'Dup done' } }), { status: 200 });
  };

  const dupRes = await reconcileBackgroundJobs({}, { storage, fetch: dupFetch, logger, clock });
  assert.equal(dupFetchCount, 1, 'Duplicate job ID must trigger fetch exactly ONCE per reconciliation pass');
  assert.deepEqual(dupRes.processedJobIds, [dupJobId]);

  // ---------------------------------------------------------------------------
  // Test 9: Fresh corez_sessions Reload Changed Between Reconciliation Passes
  // ---------------------------------------------------------------------------
  storage.clear();

  saveFreshSessions([{ id: 'conv-pass', messages: [{ id: 'm-apass', role: 'assistant', content: '...', status: 'queued' }] }], { storage });
  const passJobId = generateJobId(cryptoObj);
  const passToken = generateCapabilityToken(cryptoObj);
  saveJobRecord({ jobId: passJobId, capabilityToken: passToken, conversationId: 'conv-pass', assistantMessageId: 'm-apass', status: 'queued' }, { storage, clock });

  await reconcileBackgroundJobs({}, {
    storage,
    fetch: async () => new Response(JSON.stringify({ status: 'queued' }), { status: 200 }),
    logger,
    clock
  });

  const sessionsBeforePass2 = getFreshSessions({ storage });
  sessionsBeforePass2[0].messages.unshift({ id: 'm-ext', role: 'user', content: 'External message added' });
  saveFreshSessions(sessionsBeforePass2, { storage });

  await reconcileBackgroundJobs({}, {
    storage,
    fetch: async () => new Response(JSON.stringify({ status: 'completed', result: { content: 'Pass 2 done' } }), { status: 200 }),
    logger,
    clock
  });

  const sessionsAfterPass2 = getFreshSessions({ storage });
  assert.equal(sessionsAfterPass2[0].messages.length, 2, 'Reconciliation must preserve externally added message');
  assert.equal(sessionsAfterPass2[0].messages[0].id, 'm-ext');
  assert.equal(sessionsAfterPass2[0].messages[1].content, 'Pass 2 done');

  // ---------------------------------------------------------------------------
  // Test 10: Credentials Retained on Fresh Read Failure & History Write Failure
  // ---------------------------------------------------------------------------
  storage.clear();

  const errJobId = generateJobId(cryptoObj);
  const errToken = generateCapabilityToken(cryptoObj);
  saveJobRecord({ jobId: errJobId, capabilityToken: errToken, conversationId: 'conv-err', assistantMessageId: 'm-err', status: 'queued' }, { storage, clock });

  saveFreshSessions([{ id: 'conv-err', messages: [] }], { storage });
  storage._setShouldFailGet(true);

  const readFailRes = await reconcileBackgroundJobs({}, {
    storage,
    fetch: async () => new Response(JSON.stringify({ status: 'completed', result: { content: 'Done' } }), { status: 200 }),
    logger,
    clock
  });

  assert.equal(readFailRes.reconciledCount, 0, 'Reconciliation must return early when fresh sessions read fails');
  storage._setShouldFailGet(false);
  const retainedJobsAfterReadFail = getStoredJobs({ storage });
  assert.equal(retainedJobsAfterReadFail.length, 1, 'Job record must be retained when fresh sessions read fails');
  assert.equal(retainedJobsAfterReadFail[0].capabilityToken, errToken);

  const historyWriteFailSave = () => {
    throw new Error('STORAGE_WRITE_DENIED: Disk quota exceeded');
  };

  await reconcileBackgroundJobs({
    saveSessions: historyWriteFailSave
  }, {
    storage,
    fetch: async () => new Response(JSON.stringify({ status: 'completed', result: { content: 'Done' } }), { status: 200 }),
    logger,
    clock
  });

  const retainedJobsAfterWriteFail = getStoredJobs({ storage });
  assert.equal(retainedJobsAfterWriteFail.length, 1, 'Job record must be retained when history persistence fails');
  assert.equal(retainedJobsAfterWriteFail[0].capabilityToken, errToken);

  // ---------------------------------------------------------------------------
  // Test 11: Missing Origin Session (Deleted Session Recovery)
  // ---------------------------------------------------------------------------
  storage.clear();
  saveFreshSessions([{ id: 'conv-other', title: 'Other Session', messages: [] }], { storage });

  const orphanJobId = generateJobId(cryptoObj);
  const orphanToken = generateCapabilityToken(cryptoObj);

  saveJobRecord({
    jobId: orphanJobId,
    capabilityToken: orphanToken,
    conversationId: 'conv-deleted-300',
    userMessageId: 'msg-u-orphan',
    assistantMessageId: 'msg-a-orphan',
    prompt: 'Orphaned prompt',
    status: 'queued',
    attemptCount: 1
  }, { storage, clock });

  await reconcileBackgroundJobs({}, {
    storage,
    fetch: async () => new Response(JSON.stringify({ status: 'completed', result: { content: 'Recovered text' } }), { status: 200 }),
    logger,
    clock
  });

  const recoveredSessions = getFreshSessions({ storage });
  const recoveredSession = recoveredSessions.find(s => s.id === 'session-recovered-results');
  assert.ok(recoveredSession, 'Must create Recovered Results session when origin session deleted');
  assert.equal(recoveredSession.createdAt, currentTime, 'Recovered session createdAt must use clock.now');
  assert.equal(recoveredSession.messages[0].id, 'msg-u-orphan');
  assert.equal(recoveredSession.messages[0].role, 'user');
  assert.equal(recoveredSession.messages[0].content, 'Orphaned prompt');
  assert.equal(recoveredSession.messages[1].id, 'msg-a-orphan');
  assert.equal(recoveredSession.messages[1].role, 'assistant');
  assert.equal(recoveredSession.messages[1].content, 'Recovered text');

  const termRes = applyTerminalStateToSessions({
    sessions: [],
    conversationId: 'missing-conv',
    prompt: 'Det prompt',
    status: 'completed',
    content: 'Det content',
    clock
  });
  const detSession = termRes.updatedSessions[0];
  assert.equal(detSession.createdAt, currentTime);
  assert.equal(detSession.messages[0].id, `user-recovered-${currentTime}`);
  assert.equal(detSession.messages[1].id, `assistant-recovered-${currentTime}`);

  // ---------------------------------------------------------------------------
  // Test 12: Active Session Result Callback Gating
  // ---------------------------------------------------------------------------
  storage.clear();
  saveFreshSessions([{ id: 'conv-inactive', messages: [{ id: 'm-ainact', role: 'assistant', content: '...', status: 'queued' }] }], { storage });

  const inactJobId = generateJobId(cryptoObj);
  const inactToken = generateCapabilityToken(cryptoObj);
  saveJobRecord({ jobId: inactJobId, capabilityToken: inactToken, conversationId: 'conv-inactive', assistantMessageId: 'm-ainact', status: 'queued' }, { storage, clock });

  let gatedCallbackCalled = false;
  await reconcileBackgroundJobs({
    activeSessionId: 'conv-active-different',
    onActiveSessionResult: () => { gatedCallbackCalled = true; }
  }, {
    storage,
    fetch: async () => new Response(JSON.stringify({ status: 'completed', result: { content: 'Inactive res' } }), { status: 200 }),
    logger,
    clock
  });

  assert.equal(gatedCallbackCalled, false, 'onActiveSessionResult must NOT be called when job conversationId does not match activeSessionId');

  // ---------------------------------------------------------------------------
  // Test 13: Privacy & No Sensitive Logs
  // ---------------------------------------------------------------------------
  const allLogStrings = JSON.stringify(logs);
  assert.equal(allLogStrings.includes(errToken), false, 'Capability token must never appear in logs');
  assert.equal(allLogStrings.includes('Orphaned prompt'), false, 'Prompt must never appear in logs');

  console.log('Background jobs client contract passed.');
}

await run();
```

- [ ] **Step 2: Create `src/services/backgroundJobs.js`**

```javascript
// src/services/backgroundJobs.js

export const BACKGROUND_JOBS_STORAGE_KEY = 'corez_background_ai_jobs_v1';

export function checkWebCryptoAvailable(cryptoObj = globalThis.crypto) {
  if (!cryptoObj || typeof cryptoObj.randomUUID !== 'function' || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('CRYPTO_UNAVAILABLE: Web Crypto API (randomUUID and getRandomValues) is required');
  }
}

export function generateJobId(cryptoObj = globalThis.crypto) {
  checkWebCryptoAvailable(cryptoObj);
  return cryptoObj.randomUUID();
}

export function generateCapabilityToken(cryptoObj = globalThis.crypto) {
  checkWebCryptoAvailable(cryptoObj);
  const bytes = new Uint8Array(32);
  cryptoObj.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `job_sec_${hex}`;
}

export function getStoredJobs(deps = {}) {
  const storage = deps.storage || globalThis.localStorage;
  if (!storage) {
    throw new Error('STORAGE_UNAVAILABLE: Storage dependency is missing');
  }
  let raw;
  try {
    raw = storage.getItem(BACKGROUND_JOBS_STORAGE_KEY);
  } catch (err) {
    throw new Error(`STORAGE_ERROR: Failed to read background jobs registry - ${err.message}`);
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    throw new Error(`STORAGE_ERROR: Corrupted background jobs registry JSON - ${err.message}`);
  }
}

export function saveJobRecord(record, deps = {}) {
  const storage = deps.storage || globalThis.localStorage;
  if (!storage) {
    throw new Error('STORAGE_UNAVAILABLE: Storage dependency is missing');
  }
  const jobs = getStoredJobs(deps);
  const existingIndex = jobs.findIndex(j => j.jobId === record.jobId);
  const now = deps.clock ? deps.clock.now() : Date.now();
  const updatedRecord = {
    jobId: record.jobId,
    capabilityToken: record.capabilityToken,
    conversationId: record.conversationId,
    userMessageId: record.userMessageId,
    assistantMessageId: record.assistantMessageId,
    prompt: record.prompt,
    intent: record.intent || null,
    status: record.status || 'queued',
    attemptCount: typeof record.attemptCount === 'number' ? record.attemptCount : 1,
    lastAttemptAt: typeof record.lastAttemptAt === 'number' ? record.lastAttemptAt : now,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : now,
    updatedAt: now,
    error: record.error || null
  };

  if (existingIndex >= 0) {
    jobs[existingIndex] = { ...jobs[existingIndex], ...updatedRecord };
  } else {
    jobs.push(updatedRecord);
  }

  try {
    storage.setItem(BACKGROUND_JOBS_STORAGE_KEY, JSON.stringify(jobs));
  } catch (err) {
    throw new Error(`STORAGE_ERROR: Failed to save background job record - ${err.message}`);
  }
  return updatedRecord;
}

export function updateJobRecord(jobId, updates, deps = {}) {
  const storage = deps.storage || globalThis.localStorage;
  if (!storage) {
    throw new Error('STORAGE_UNAVAILABLE: Storage dependency is missing');
  }
  const jobs = getStoredJobs(deps);
  const index = jobs.findIndex(j => j.jobId === jobId);
  if (index < 0) {
    throw new Error(`JOB_NOT_FOUND: Job record ${jobId} not found in registry`);
  }
  const now = deps.clock ? deps.clock.now() : Date.now();
  jobs[index] = {
    ...jobs[index],
    ...updates,
    updatedAt: now
  };

  try {
    storage.setItem(BACKGROUND_JOBS_STORAGE_KEY, JSON.stringify(jobs));
  } catch (err) {
    throw new Error(`STORAGE_ERROR: Failed to update background job record - ${err.message}`);
  }
  return jobs[index];
}

export function removeJobRecord(jobId, deps = {}) {
  const storage = deps.storage || globalThis.localStorage;
  if (!storage) {
    throw new Error('STORAGE_UNAVAILABLE: Storage dependency is missing');
  }
  const jobs = getStoredJobs(deps).filter(j => j.jobId !== jobId);
  try {
    storage.setItem(BACKGROUND_JOBS_STORAGE_KEY, JSON.stringify(jobs));
  } catch (err) {
    throw new Error(`STORAGE_ERROR: Failed to remove background job record - ${err.message}`);
  }
}

export async function dispatchBackgroundJob({
  conversationId,
  userMessageId,
  assistantMessageId,
  prompt,
  intent = null,
  existingJobId = null,
  existingCapabilityToken = null,
  saveConversationHistory = null
}, deps = {}) {
  const cryptoObj = deps.crypto || globalThis.crypto;
  checkWebCryptoAvailable(cryptoObj);

  const fetchImpl = deps.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('FETCH_UNAVAILABLE: Fetch implementation is required');
  }

  const clock = deps.clock || { now: () => Date.now() };
  const now = clock.now();

  const jobId = existingJobId || generateJobId(cryptoObj);
  const capabilityToken = existingCapabilityToken || generateCapabilityToken(cryptoObj);

  let existingRecord = null;
  if (existingJobId) {
    const existingJobs = getStoredJobs(deps);
    existingRecord = existingJobs.find(j => j.jobId === existingJobId) || null;
  }

  const attemptCount = existingRecord && typeof existingRecord.attemptCount === 'number'
    ? existingRecord.attemptCount + 1
    : 1;

  const record = {
    jobId,
    capabilityToken,
    conversationId,
    userMessageId,
    assistantMessageId,
    prompt,
    intent,
    status: 'queued',
    attemptCount,
    lastAttemptAt: now,
    createdAt: existingRecord && typeof existingRecord.createdAt === 'number' ? existingRecord.createdAt : now,
    updatedAt: now,
    error: null
  };

  saveJobRecord(record, deps);

  if (typeof saveConversationHistory === 'function') {
    try {
      saveConversationHistory();
    } catch (err) {
      throw new Error(`HISTORY_PERSISTENCE_ERROR: Pre-POST history save failed - ${err.message}`);
    }
  }

  const payload = {
    job_id: jobId,
    conversation_id: conversationId,
    prompt,
    intent
  };

  let response;
  try {
    response = await fetchImpl('/api/ai/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Job-Token': capabilityToken
      },
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    updateJobRecord(jobId, {
      status: 'queued',
      attemptCount,
      lastAttemptAt: clock.now(),
      error: 'NETWORK_ERROR'
    }, deps);
    throw new Error(`DISPATCH_AMBIGUOUS: Network fetch failed during dispatch - ${netErr.message}`);
  }

  if (response.status >= 500) {
    updateJobRecord(jobId, {
      status: 'queued',
      attemptCount,
      lastAttemptAt: clock.now(),
      error: `SERVER_ERROR_${response.status}`
    }, deps);
    throw new Error(`DISPATCH_AMBIGUOUS: Server returned status ${response.status}`);
  }

  if (!response.ok) {
    let errBody = null;
    try {
      errBody = await response.json();
    } catch (parseErr) {
      errBody = { error: 'PARSE_ERROR: Unable to parse error response JSON.' };
    }
    const errMsg = (errBody && typeof errBody.error === 'string') ? errBody.error : `Client error ${response.status}`;
    updateJobRecord(jobId, {
      status: 'failed',
      error: errMsg
    }, deps);
    throw new Error(`DISPATCH_TERMINAL_FAILURE: ${errMsg}`);
  }

  let responseData;
  try {
    responseData = await response.json();
  } catch (parseErr) {
    responseData = { status: 'queued' };
  }

  updateJobRecord(jobId, {
    status: responseData.status || 'queued',
    updatedAt: clock.now()
  }, deps);

  return {
    jobId,
    capabilityToken,
    status: responseData.status || 'queued'
  };
}

export async function fetchJobStatus(jobId, capabilityToken, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('FETCH_UNAVAILABLE: Fetch implementation is required');
  }

  const response = await fetchImpl(`/api/ai/jobs/${jobId}`, {
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
import {
  getStoredJobs,
  updateJobRecord,
  removeJobRecord,
  fetchJobStatus
} from './backgroundJobs.js';

export function calculatePollingDelay(attemptCount) {
  const count = typeof attemptCount === 'number' && attemptCount > 0 ? attemptCount : 1;
  const baseDelay = 1000;
  const calculated = baseDelay * Math.pow(2, Math.max(0, count - 1));
  return Math.min(calculated, 10000);
}

export const SESSIONS_STORAGE_KEY = 'corez_sessions';

export function getFreshSessions(deps = {}) {
  const storage = deps.storage || globalThis.localStorage;
  if (!storage) {
    throw new Error('STORAGE_UNAVAILABLE: Storage dependency is missing');
  }
  let raw;
  try {
    raw = storage.getItem(SESSIONS_STORAGE_KEY);
  } catch (err) {
    throw new Error(`STORAGE_ERROR: Failed to read sessions - ${err.message}`);
  }
  if (raw === null || raw === undefined) {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`STORAGE_ERROR: Corrupted sessions JSON - ${err.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('STORAGE_ERROR: Sessions storage data is not an array');
  }
  return parsed;
}

export function saveFreshSessions(sessions, deps = {}) {
  const storage = deps.storage || globalThis.localStorage;
  if (!storage) {
    throw new Error('STORAGE_UNAVAILABLE: Storage dependency is missing');
  }
  try {
    storage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    throw new Error(`STORAGE_ERROR: Failed to save sessions - ${err.message}`);
  }
}

export async function reconcileBackgroundJobs(options = {}, deps = {}) {
  const storage = deps.storage || globalThis.localStorage;
  const logger = deps.logger || { error: () => {}, info: () => {} };
  const clock = deps.clock || { now: () => Date.now() };

  let sessions;
  try {
    sessions = options.getSessions ? options.getSessions() : getFreshSessions({ storage, logger });
  } catch (err) {
    logger.error('Failed to load fresh sessions during reconciliation');
    return { reconciledCount: 0, processedJobIds: [] };
  }

  const saveSessionsImpl = options.saveSessions || ((updated) => saveFreshSessions(updated, { storage }));

  const pendingJobs = getStoredJobs({ storage }).filter(j => j.status === 'queued' || j.status === 'running');
  if (pendingJobs.length === 0) {
    return { reconciledCount: 0, processedJobIds: [] };
  }

  const processedJobIds = new Set();
  let reconciledCount = 0;

  for (const job of pendingJobs) {
    if (processedJobIds.has(job.jobId)) {
      continue;
    }
    processedJobIds.add(job.jobId);

    let response;
    try {
      response = await fetchJobStatus(job.jobId, job.capabilityToken, deps);
    } catch (netErr) {
      updateJobRecord(job.jobId, {
        attemptCount: (job.attemptCount || 0) + 1,
        lastAttemptAt: clock.now()
      }, { storage, clock });
      continue;
    }

    if (response.status === 404 || response.status === 410) {
      const terminalStatus = response.status === 410 ? 'expired' : 'failed';
      const fallbackContent = response.status === 410
        ? 'Background job expired after 24 hours.'
        : 'Background job not found on server.';

      const { updatedSessions } = applyTerminalStateToSessions({
        sessions,
        conversationId: job.conversationId,
        assistantMessageId: job.assistantMessageId,
        userMessageId: job.userMessageId,
        prompt: job.prompt,
        status: terminalStatus,
        content: fallbackContent,
        model: undefined,
        clock
      });

      try {
        saveSessionsImpl(updatedSessions);
        sessions = updatedSessions;
      } catch (saveErr) {
        logger.error('Failed to persist history during 404/410 handling');
        continue;
      }

      removeJobRecord(job.jobId, { storage });
      reconciledCount++;
      continue;
    }

    if (!response.ok) {
      updateJobRecord(job.jobId, {
        attemptCount: (job.attemptCount || 0) + 1,
        lastAttemptAt: clock.now()
      }, { storage, clock });
      continue;
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      updateJobRecord(job.jobId, {
        attemptCount: (job.attemptCount || 0) + 1,
        lastAttemptAt: clock.now(),
        error: 'PARSE_ERROR: Unable to parse status response JSON.'
      }, { storage, clock });
      continue;
    }

    const currentStatus = data.status;

    if (currentStatus === 'queued' || currentStatus === 'running') {
      updateJobRecord(job.jobId, {
        status: currentStatus,
        attemptCount: (job.attemptCount || 0) + 1,
        lastAttemptAt: clock.now()
      }, { storage, clock });
      continue;
    }

    if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'expired') {
      const isSuccess = currentStatus === 'completed';
      const resultContent = isSuccess
        ? (data.result?.content || '')
        : (data.error?.message || 'Job execution failed.');
      const resultModel = isSuccess ? data.result?.model : undefined;

      const { updatedSessions, isOriginMatch } = applyTerminalStateToSessions({
        sessions,
        conversationId: job.conversationId,
        assistantMessageId: job.assistantMessageId,
        userMessageId: job.userMessageId,
        prompt: job.prompt,
        status: currentStatus,
        content: resultContent,
        model: resultModel,
        clock
      });

      try {
        saveSessionsImpl(updatedSessions);
        sessions = updatedSessions;
      } catch (saveErr) {
        logger.error('Failed to persist history for terminal job completion');
        continue;
      }

      if (isSuccess && isOriginMatch && job.conversationId === options.activeSessionId && typeof options.onActiveSessionResult === 'function') {
        try {
          options.onActiveSessionResult(resultContent);
        } catch (cbErr) {
          logger.error('Active session result callback failed');
        }
      }

      removeJobRecord(job.jobId, { storage });
      reconciledCount++;
    }
  }

  return {
    reconciledCount,
    processedJobIds: Array.from(processedJobIds)
  };
}

export function applyTerminalStateToSessions({
  sessions,
  conversationId,
  assistantMessageId,
  userMessageId,
  prompt,
  status,
  content,
  model,
  clock
}) {
  const now = clock && typeof clock.now === 'function' ? clock.now() : Date.now();
  let originFound = false;

  const updatedSessions = sessions.map(session => {
    if (session.id === conversationId) {
      originFound = true;
      const updatedMessages = (session.messages || []).map(msg => {
        if (msg.id === assistantMessageId) {
          return {
            ...msg,
            role: 'assistant',
            content: content,
            status: status,
            ...(model ? { model } : {})
          };
        }
        return msg;
      });
      return { ...session, messages: updatedMessages };
    }
    return session;
  });

  if (originFound) {
    return { updatedSessions, isOriginMatch: true };
  }

  const RECOVERED_SESSION_ID = 'session-recovered-results';
  let recoveredFound = false;

  const userMsg = {
    id: userMessageId || `user-recovered-${now}`,
    role: 'user',
    content: prompt
  };

  const assistantMsg = {
    id: assistantMessageId || `assistant-recovered-${now}`,
    role: 'assistant',
    content: content,
    status: status,
    ...(model ? { model } : {})
  };

  const finalSessions = updatedSessions.map(session => {
    if (session.id === RECOVERED_SESSION_ID) {
      recoveredFound = true;
      return {
        ...session,
        messages: [...(session.messages || []), userMsg, assistantMsg]
      };
    }
    return session;
  });

  if (!recoveredFound) {
    finalSessions.unshift({
      id: RECOVERED_SESSION_ID,
      title: 'Recovered Results',
      createdAt: now,
      messages: [userMsg, assistantMsg]
    });
  }

  return { updatedSessions: finalSessions, isOriginMatch: false };
}
```

- [ ] **Step 4: Verify GREEN test status**

Run client service contract tests:
```bash
node tests/background-jobs-client-contract.mjs
```
*Expected Output:* `Background jobs client contract passed.`

- [ ] **Step 5: Review Gate & Bounded Commit**

> **Codex Review Gate:** Codex inspects `src/services/backgroundJobs.js`, `src/services/backgroundJobSync.js`, and `tests/background-jobs-client-contract.mjs` for mandatory Web Crypto, pre-POST and terminal persistence ordering, chat schema compliance, error surfacing without empty catch blocks, deterministic terminal session recovery with injected clock, and absence of token/prompt logging.

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
