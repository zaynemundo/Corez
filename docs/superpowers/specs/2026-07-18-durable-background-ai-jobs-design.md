# Technical Design Specification: Durable Anonymous Background AI Jobs via Cloudflare Workflows & D1

- **Document Path:** `docs/superpowers/specs/2026-07-18-durable-background-ai-jobs-design.md`
- **Date:** 2026-07-18
- **Status:** For User Review
- **Author:** AGY
- **Target Worker:** `ai` (`./worker/index.js`)
- **Target Endpoints:** `POST /api/ai/jobs`, `GET /api/ai/jobs/:jobId` (Preserving synchronous `POST /api/ai`)
- **Target Stack:** Cloudflare Workers, Cloudflare Workflows, Cloudflare D1, Workers AI (`@cf/zai-org/glm-4.7-flash`), Workers Rate Limiting

---

## 1. Executive Summary & Objective

### 1.1 Objective
Provide an implementation-ready design for durable, anonymous, background AI jobs for the Cloudflare Worker named `ai` (entrypoint `./worker/index.js`). 

Synchronous requests to `POST /api/ai` block the client interface and remain susceptible to network timeouts, tab closures, and page reloads. This specification transitions client interaction to an asynchronous job pipeline powered by **Cloudflare Workflows** and **Cloudflare D1**.

Job creation is accessed at `POST /api/ai/jobs` and status polling at `GET /api/ai/jobs/:jobId`. Client requests generate UUID job IDs and 256-bit capability tokens prior to transmission. Background executions run on Cloudflare Workflows, persist state to D1, and deliver resilient recovery across browser reloads.

### 1.2 Non-Goals & Scope Boundaries
- **No Cross-Device Account Syncing:** Anonymous jobs are strictly scoped to local device storage (`localStorage`). No user accounts or cross-device state syncing are introduced.
- **No Job Cancellation in v1:** Cancellation endpoints (`DELETE /api/ai/jobs/:jobId` or cancel UI triggers) are out of scope for v1. Workflows run to a terminal state (`completed` or `failed`).
- **No OpenRouter Model Implementation:** The active provider for background jobs remains the free-tier Workers AI binding (`env.AI`) using `@cf/zai-org/glm-4.7-flash`. The OpenRouter `deepseek/deepseek-v4-pro` specification is not implemented in this active pipeline.
- **No Removal of Synchronous `POST /api/ai`:** The existing `POST /api/ai` route remains intact and operational for legacy or fallback synchronous invocation.

### 1.3 Platform Availability & Official Cloudflare References
- **Workers Free Plan Availability:** Cloudflare Workflows and Cloudflare D1 are available on the **Workers Free** plan subject to Cloudflare's documented platform quota limits. Client polling consumes shared Worker request quotas and D1 read operations.
- [Cloudflare Workflows Workers API](https://developers.cloudflare.com/workflows/build/workers-api/)
- [Cloudflare Workflows Sleeping & Retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)
- [Cloudflare Workflows Rules of Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
- [Cloudflare Workflows Reference Limits](https://developers.cloudflare.com/workflows/reference/limits/)
- [Cloudflare Workflows Reference Pricing](https://developers.cloudflare.com/workflows/reference/pricing/)
- [Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/)
- [Cloudflare Workers Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Cloudflare Workers Rate Limiting Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

---

## 2. Core Architectural Decisions

| Decision Area | Specification Rule | Justification / Technical Details |
| :--- | :--- | :--- |
| **Worker Identity** | Worker name `ai`, main entrypoint `./worker/index.js`. | Aligns strictly with repository configuration and Wrangler environment specifications. |
| **API Endpoints** | `POST /api/ai/jobs` (Creation) and `GET /api/ai/jobs/:jobId` (Polling). | Namespaced under `/api/ai/jobs` while leaving synchronous `POST /api/ai` unchanged. |
| **Pre-POST Persistence** | Client MUST generate UUID `jobId`, 256-bit capability token, session ID, message IDs, prompt, and optional intent, persisting all to `localStorage` **before** dispatching `POST`. | Guarantees local state integrity if network drops during or immediately after request dispatch. |
| **Idempotency & Workflow ID** | Client-generated UUID `jobId` serves as idempotency key and Workflow instance ID dispatched via `env.AI_JOB_WORKFLOW.createBatch([{ id: jobId, params: { jobId }, retention: { successRetention: "1 day", errorRetention: "1 day" } }])`. | A one-item `createBatch` skips an existing retained instance ID instead of throwing an instance ID collision error, closing the retry race and guaranteeing deterministic execution. |
| **Canonical Fingerprinting** | Fingerprint is calculated as `SHA256(canonical_json({ conversation_id, prompt, intent }))`. | Uses unambiguous canonical JSON (sorted keys) or length-prefixed fields. Never raw concatenation. |
| **Duplicate POST Error Mapping** | `401 Unauthorized` is reserved ONLY for missing or malformed header tokens **prior** to row lookup. Duplicate `POST` with invalid token or mismatched fingerprint returns generic `409 Conflict`. | Standardizes idempotency violation responses without leaking state details. |
| **Dispatch Failure Behavior** | If Workflow creation fails after D1 INSERT, job remains `queued` in D1 and API returns `503 Service Unavailable`. | Allows client to retry the identical idempotent `POST /api/ai/jobs` request safely without creating duplicate jobs. |
| **Security & Token Hash** | High-entropy capability token stored ONLY in client `localStorage`. D1 stores ONLY `token_hash = SHA-256(token)`. | Plain tokens are never written to D1. Unsalted SHA-256 safety depends strictly on 256-bit entropy ($2^{256}$ search space). |
| **D1 Plaintext Storage** | D1 stores **plaintext prompt text** and **plaintext result text** in database columns during processing and 24h retention. | Required for background processing and client polling retrieval; protected by 24h expiration purge. |
| **Token Transport** | Transmitted exclusively via `X-Job-Token` HTTP header. NEVER in URL query strings. | Avoids leaking capability tokens in browser history, proxy access logs, or referrer headers. |
| **Timing-Safe Auth & 404 Security** | Load D1 row by `jobId` primary key, compute SHA-256 of header token, and compare equal-length bytes with `crypto.subtle.timingSafeEqual()`. Return exact same generic `404 Not Found` for missing, expired, or unauthorized requests. | Prevents timing side-channels and stops unauthorized callers from probing whether a `jobId` exists in D1. |
| **D1 Expiration & Purge** | `expires_at` is **NULL while active** (`queued`/`running`), and set to `terminal_at + 86400` (24h) upon reaching terminal state (`completed`/`failed`). Logical expiry and physical purge queries align strictly on `expires_at IS NOT NULL AND expires_at <= unixepoch()`. | Guarantees consistent 24h retention and purge boundaries. |
| **Stuck Active Job Repair** | `active_deadline_at` is set at creation to `created_at + 7200` (at least 2 hours). Hourly cron marks active jobs past `active_deadline_at` as `failed`. | Accommodates long queue times while ensuring orphaned active jobs are eventually repaired. |
| **Workflow Retries & Model Logic** | 5 attempts, 10s exponential backoff, 10m per-attempt timeout (accommodates GLM ~120s latency). Provider calls may run at-least-once within step retries, but atomic D1 update commits exactly one terminal result. | Preserves existing `buildSystemPrompt(intent)` and `choices[0].message.content` response extraction. Stores provider/model metadata (`@cf/workers-ai` / `@cf/zai-org/glm-4.7-flash`). |
| **UTF-8 Byte-Safe Truncation** | Result text truncation uses a byte endpoint reduction loop (`TextEncoder`/`TextDecoder`) ensuring content plus `"\n\n[Output truncated at 500KB bound]"` is strictly $\le$ **500,000 bytes UTF-8**, even across multibyte boundaries. | Prevents invalid UTF-8 replacement characters (`U+FFFD`) from exceeding the content budget. |
| **Creation Failure Ambiguity** | Network drop / 5xx on creation keeps the same `jobId` and `capabilityToken`, reconciling via `GET` poll and same idempotent `POST`. Definitive failure (400, 409, or terminal failed status) offers fresh "Retry" (generating new UUID/token). | Prevents state divergence or duplicate job creation when network issues obscure creation outcomes. |
| **Reconciliation Search Scope** | Reconciliation searches **every persisted session in storage**, updating origin session placeholders in background storage even when another chat is active, without stealing UI focus. | Ensures completions update their true origin session silently regardless of current user navigation. |
| **Non-Atomic LocalStorage Writes** | Write sequence: 1) Save terminal result into chat history; 2) Set `reconciled: true` and remove capability token from `localStorage`. | Protects against browser crash data loss. Global `jobId` deduplication on mount handles repeat fetches safely. |
| **Recovered Results Session** | Single fallback "Recovered Results" chat session used **only** when origin session was deleted or placeholder is missing. | Prevents orphaned completions from being lost while avoiding UI focus stealing. |
| **Validation & Rate Limiting** | Validate UTF-8 byte limits on prompt (max 100,000 bytes UTF-8); bound result storage (500,000 bytes UTF-8). Use Cloudflare Workers Rate Limiting binding (`env.RATE_LIMITER`). | All rate limits, timeouts, and retention values are labeled as **tunable / per-location**. |

---

## 3. Cloudflare Bindings & Configuration

The configuration below details the bindings for the Worker named `ai` in `wrangler.jsonc`. Standard placeholder binding names are specified without fake IDs. The `database_id` property is intentionally omitted in the design fragment below. During later authorized execution, Codex must run `npx wrangler d1 create cloud-service`, capture the exact returned UUID, insert that exact UUID into `wrangler.jsonc` before any implementation commit, and obtain Codex review.

```jsonc
// wrangler.jsonc
{
  "name": "ai",
  "main": "./worker/index.js",
  "compatibility_date": "2026-07-18",

  // D1 Database Binding for Job Storage
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "cloud-service"
    }
  ],

  // Cloudflare Workflows Binding
  "workflows": [
    {
      "name": "ai-job-workflow",
      "binding": "AI_JOB_WORKFLOW",
      "class_name": "AiJobWorkflow"
    }
  ],

  // Workers AI Binding
  "ai": {
    "binding": "AI"
  },

  // Cloudflare Workers Rate Limiting Binding (Wrangler 4.112.0 schema; Tunable / Per-Location)
  "ratelimits": [
    {
      "name": "RATE_LIMITER",
      "namespace_id": "1000",
      "simple": {
        "limit": 10,       // Tunable: max 10 creations
        "period": 60       // Tunable: per 60 seconds
      }
    }
  ],

  // Cron Trigger for Expiration Purge & Stuck Job Repair
  "triggers": {
    "crons": ["0 * * * *"] // Executes hourly
  }
}
```

---

## 4. D1 Database Schema & State Machine

### 4.1 D1 Table Schema (`jobs`)

```sql
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,                       -- UUID v4 generated by client
    token_hash TEXT NOT NULL,                  -- SHA-256 hash of 256-bit capability token
    conversation_id TEXT NOT NULL,             -- Client origin conversation ID
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    prompt_text TEXT NOT NULL,                 -- User prompt (plaintext, max 100,000 bytes UTF-8)
    intent_json TEXT,                          -- Canonical JSON string of optional intent object
    result_text TEXT,                          -- Model completion output (plaintext, max 500,000 bytes UTF-8)
    provider_meta TEXT,                        -- JSON string: { "provider": "@cf/workers-ai", "model": "@cf/zai-org/glm-4.7-flash" }
    error_code TEXT,                           -- Generic error code on failure
    request_fingerprint TEXT NOT NULL,         -- SHA-256 hash of canonical_json({ conversation_id, prompt, intent })
    created_at INTEGER NOT NULL,               -- Unix timestamp in seconds
    updated_at INTEGER NOT NULL,               -- Unix timestamp in seconds
    terminal_at INTEGER,                       -- Unix timestamp in seconds (NULL while active)
    active_deadline_at INTEGER NOT NULL,       -- Unix timestamp (created_at + 7200, at least 2 hours)
    expires_at INTEGER                         -- Logical expiry timestamp (NULL while active; terminal_at + 86400 when terminal)
);

-- Performance Indexes (Note: token_hash index omitted as lookups use Primary Key `id`)
CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_active_deadline ON jobs(active_deadline_at);
```

### 4.2 State Machine & Conditional Updates

State updates MUST be conditional to ensure that completed or failed terminal rows are never regressed by delayed or out-of-order workflow steps.

```sql
-- Step 1: Transition queued -> running (only if currently queued)
UPDATE jobs 
SET status = 'running', updated_at = unixepoch() 
WHERE id = ? AND status = 'queued';

-- Step 3a: Transition running -> completed (only if not already terminal)
UPDATE jobs 
SET status = 'completed', 
    result_text = ?, 
    provider_meta = ?, 
    terminal_at = unixepoch(), 
    expires_at = (unixepoch() + 86400), 
    updated_at = unixepoch() 
WHERE id = ? AND status IN ('queued', 'running');

-- Step 3b: Transition running -> failed (only if not already terminal)
UPDATE jobs 
SET status = 'failed', 
    error_code = ?, 
    terminal_at = unixepoch(), 
    expires_at = (unixepoch() + 86400), 
    updated_at = unixepoch() 
WHERE id = ? AND status IN ('queued', 'running');
```

### 4.3 Retention, Expiry & Maintenance Queries

1. **API Logical Expiry Check:** An API status read for a job where `expires_at IS NOT NULL AND expires_at <= unixepoch()` is treated as expired and returns `404 Not Found`.
2. **Physical Purge (Hourly Cron):** Aligned strictly on `expires_at`:
   ```sql
   DELETE FROM jobs 
   WHERE expires_at IS NOT NULL AND expires_at <= unixepoch();
   ```
3. **Stuck Active Job Repair (Hourly Cron):** Active jobs (`queued`/`running`) where `unixepoch() >= active_deadline_at` (at least 2 hours after creation) are repaired and transitioned to `failed`:
   ```sql
   UPDATE jobs 
   SET status = 'failed', 
       error_code = 'ACTIVE_DEADLINE_EXCEEDED', 
       terminal_at = unixepoch(), 
       expires_at = (unixepoch() + 86400), 
       updated_at = unixepoch() 
   WHERE status IN ('queued', 'running') AND active_deadline_at <= unixepoch();
   ```

---

## 5. API Interface, Token Transport & Error Mappings

### 5.1 Capability Token & Authentication Security
- **Token Generation:** Client creates a 256-bit cryptographically secure token (e.g., 64-char hex string with prefix `job_sec_...`).
- **Unsalted Hash Rationale:** Unsalted SHA-256 is used for D1 token matching. Because the token has 256 bits of cryptographic entropy, pre-computation, rainbow table, and brute-force attacks are computationally impossible ($2^{256}$ search space).
- **Constant-Time Verification:**
  1. Retrieve row from D1 using `SELECT token_hash, status, expires_at FROM jobs WHERE id = ?`. If row does not exist, return generic `404`.
  2. Compute `SHA-256` digest of presented `X-Job-Token` header.
  3. Compare computed digest byte array against stored `token_hash` byte array using Workers Web Crypto `crypto.subtle.timingSafeEqual(computedBytes, storedBytes)`.
  4. If comparison fails or job is expired (`expires_at IS NOT NULL AND expires_at <= unixepoch()`), return the **exact same generic 404 response** to avoid leaking job existence.

---

### 5.2 Endpoint Specifications

#### 5.2.1 Job Creation: `POST /api/ai/jobs`

- **Headers:** `Content-Type: application/json`, `X-Job-Token: job_sec_...`
- **Header Pre-Check:** If `X-Job-Token` is missing or malformed prior to database lookup, return `401 Unauthorized`.
- **Request Body Schema:**
  ```json
  {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "conversation_id": "conv_8832a...",
    "prompt": "User prompt text (max 100,000 UTF-8 bytes)",
    "intent": { "mode": "code_review" }
  }
  ```

- **Creation & Idempotency Logic:**
  1. **Rate Limiting Check:** Check `env.RATE_LIMITER.limit({ key: ip })`. If exceeded, return `429 Too Many Requests`.
  2. **Payload Validation:** Validate UTF-8 prompt byte length $\le$ 100,000 bytes.
  3. **Canonical Fingerprint Computation:**
     - Compute canonical JSON representation: `canonicalPayload = JSON.stringify({ conversation_id, prompt, intent })` with sorted keys.
     - Compute `request_fingerprint = SHA256(canonicalPayload)`.
  4. **Idempotency & Duplicate Check:**
     - Query D1 for existing row `WHERE id = job_id`.
     - If row exists:
       - Verify presented `X-Job-Token` hash using `timingSafeEqual`. If token is invalid OR if `request_fingerprint` does not match, return generic **`409 Conflict`** (`IDEMPOTENCY_CONFLICT`). (Note: `401` is NOT returned post-lookup on duplicate POST).
       - If token and fingerprint match: Dispatch workflow via `await env.AI_JOB_WORKFLOW.createBatch([{ id: job_id, params: { jobId: job_id }, retention: { successRetention: "1 day", errorRetention: "1 day" } }])` (which safely skips existing retained instances), and return `200 OK` with current status.
  5. **New Job Processing:**
     - Execute D1 INSERT (`status = 'queued'`, `active_deadline_at = created_at + 7200`, `expires_at = NULL`).
     - Spawn Workflow instance: `await env.AI_JOB_WORKFLOW.createBatch([{ id: job_id, params: { jobId: job_id }, retention: { successRetention: "1 day", errorRetention: "1 day" } }])`. A one-item `createBatch` skips an existing retained instance ID instead of throwing an error, closing the retry race.
     - **Dispatch Failure Handling:** If Workflow creation throws an error after D1 INSERT, **do not set status to failed**. Keep the row `queued` in D1 and return `503 Service Unavailable`. The client will retry the same idempotent `POST` request to spawn/get the Workflow.

- **Success Response (`201 Created` / `200 OK`):**
  ```json
  {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "queued",
    "created_at": 1773870913
  }
  ```

---

#### 5.2.2 Job Status Query: `GET /api/ai/jobs/:jobId`

- **Headers Required:** `X-Job-Token: job_sec_...`
- **Response — Active / Running (`200 OK`):**
  ```json
  {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "running",
    "created_at": 1773870913,
    "updated_at": 1773870915
  }
  ```
- **Response — Completed (`200 OK`):**
  ```json
  {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "created_at": 1773870913,
    "updated_at": 1773870925,
    "terminal_at": 1773870925,
    "expires_at": 1773957325,
    "result": {
      "content": "Model response output text...",
      "model": "@cf/zai-org/glm-4.7-flash",
      "provider": "@cf/workers-ai"
    }
  }
  ```
- **Response — Failed (`200 OK`):**
  ```json
  {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "failed",
    "created_at": 1773870913,
    "updated_at": 1773870925,
    "terminal_at": 1773870925,
    "expires_at": 1773957325,
    "error": {
      "code": "MODEL_EXECUTION_FAILED",
      "message": "The AI model encountered an error processing your request. Please try again."
    }
  }
  ```

---

### 5.3 Complete API HTTP Error Mappings

| HTTP Status | Error Code | Trigger Condition |
| :--- | :--- | :--- |
| **`400 Bad Request`** | `INVALID_PAYLOAD` | Missing required fields, prompt > 100,000 UTF-8 bytes, or malformed JSON. |
| **`401 Unauthorized`** | `UNAUTHORIZED` | Missing or malformed `X-Job-Token` header prior to database lookup. |
| **`404 Not Found`** | `NOT_FOUND` | Job ID absent, expired (`expires_at <= unixepoch()`), or token hash mismatch on GET (generic 404 security). |
| **`409 Conflict`** | `IDEMPOTENCY_CONFLICT` | Duplicate `job_id` submitted with invalid token hash OR conflicting request fingerprint parameters. |
| **`429 Too Many Requests`** | `RATE_LIMIT_EXCEEDED` | Client IP exceeds rate limit (max 10 creations / 60 seconds). |
| **`503 Service Unavailable`**| `SERVICE_UNAVAILABLE` | Workflow creation/dispatch failed after D1 insert or system under maintenance. |

---

## 6. Cloudflare Workflow Execution & Byte-Safe Truncation

### 6.1 Provider Call Semantics & Bounds
- **At-Least-Once Execution:** Step retries mean provider calls (`env.AI.run`) may execute at-least-once. Atomic D1 update guards (`WHERE status IN ('queued', 'running')`) ensure that only **one terminal result** is committed to D1.
- **Model & System Prompt Preservation:** System prompt is generated using existing `buildSystemPrompt(intent)`. Response output is extracted via `choices[0].message.content`. Provider (`@cf/workers-ai`) and model (`@cf/zai-org/glm-4.7-flash`) metadata are persisted alongside result text.
- **Byte-Safe Truncation Implementation:** Completion output written to D1 is strictly bounded to **500,000 bytes UTF-8** total (including content and truncation marker).

```javascript
// Byte-Safe Truncation Utility Function
function truncateToUtf8ByteLimit(str, maxBytes = 500000) {
  const encoder = new TextEncoder();
  const fullEncoded = encoder.encode(str);
  if (fullEncoded.byteLength <= maxBytes) return str;

  const marker = "\n\n[Output truncated at 500KB bound]";
  const markerBytes = encoder.encode(marker).byteLength;
  const maxContentBytes = maxBytes - markerBytes;

  let cutoff = maxContentBytes;
  const decoder = new TextDecoder('utf-8', { fatal: false });

  while (cutoff > 0) {
    const sliceBytes = fullEncoded.subarray(0, cutoff);
    const decodedSlice = decoder.decode(sliceBytes);
    if (encoder.encode(decodedSlice).byteLength <= maxContentBytes) {
      return decodedSlice + marker;
    }
    cutoff--;
  }

  return marker;
}
```

### 6.2 Workflow Implementation Structure

```javascript
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { buildSystemPrompt } from './prompt-builder.js';

export class AiJobWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId } = event.payload;

    // Step 1: Mark job as running in D1 (Conditional update)
    await step.do('mark-running', async () => {
      await this.env.DB.prepare(
        "UPDATE jobs SET status = 'running', updated_at = unixepoch() WHERE id = ? AND status = 'queued'"
      ).bind(jobId).run();
    });

    // Step 2: Call Workers AI Model with documented retries & 10m timeout
    let aiOutput;
    try {
      aiOutput = await step.do(
        'call-workers-ai',
        {
          retries: {
            limit: 5,           // 5 attempts total (tunable)
            delay: '10 seconds', // Initial delay (tunable)
            backoff: 'exponential'
          },
          timeout: '10 minutes' // Accommodates ~120s empirical GLM latency
        },
        async () => {
          const job = await this.env.DB.prepare(
            "SELECT prompt_text, intent_json FROM jobs WHERE id = ?"
          ).bind(jobId).first();
          if (!job) throw new Error("JOB_NOT_FOUND_FATAL");

          const intent = job.intent_json ? JSON.parse(job.intent_json) : null;
          const systemPrompt = buildSystemPrompt(intent);

          const messages = [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: job.prompt_text }
          ];

          const response = await this.env.AI.run('@cf/zai-org/glm-4.7-flash', { messages });

          if (!response || !response.choices || !response.choices[0]?.message?.content) {
            throw new Error("EMPTY_MODEL_RESPONSE"); // Triggers step retry
          }

          let content = response.choices[0].message.content.trim();
          return truncateToUtf8ByteLimit(content, 500000);
        }
      );
    } catch (err) {
      // Step 3a: Mark Failed if step retries are exhausted
      await step.do('mark-failed', async () => {
        await this.env.DB.prepare(
          `UPDATE jobs 
           SET status = 'failed', error_code = 'MODEL_EXECUTION_FAILED', terminal_at = unixepoch(), expires_at = (unixepoch() + 86400), updated_at = unixepoch() 
           WHERE id = ? AND status IN ('queued', 'running')`
        ).bind(jobId).run();
      });
      return;
    }

    // Step 3b: Save completion result and mark completed in D1
    const providerMeta = JSON.stringify({ provider: "@cf/workers-ai", model: "@cf/zai-org/glm-4.7-flash" });
    await step.do('mark-completed', async () => {
      await this.env.DB.prepare(
        `UPDATE jobs 
         SET status = 'completed', result_text = ?, provider_meta = ?, terminal_at = unixepoch(), expires_at = (unixepoch() + 86400), updated_at = unixepoch() 
         WHERE id = ? AND status IN ('queued', 'running')`
      ).bind(aiOutput, providerMeta, jobId).run();
    });
  }
}
```

---

## 7. Client Architecture, Local Storage & UI Reconciliation

### 7.1 Client Local Record Schema (`localStorage.ai_jobs_v1`)

```typescript
interface LocalJobRecord {
  jobId: string;
  capabilityToken: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  promptText: string;
  intent?: object;
  status: 'queued' | 'running' | 'completed' | 'failed';
  reconciled: boolean; // Set true ONLY AFTER terminal result is saved to chat history
  createdAt: number;
}
```

### 7.2 Pre-POST Persistence & Creation Ambiguity Flow
1. **Pre-POST Action:** Client generates UUID `jobId`, capability token, message IDs, constructs `LocalJobRecord` (`reconciled: false`), saves to `localStorage`, appends `queued` placeholder to UI, clears input, and dispatches `POST /api/ai/jobs`.
2. **Ambiguous Network Drop / 5xx Error:**
   - If `POST` drops due to offline network or receives 530/503, the client **retains the exact same `jobId` and `capabilityToken`**.
   - Client reconciles by sending polling `GET /api/ai/jobs/:jobId` and retrying the **same idempotent `POST /api/ai/jobs`** request.
3. **Definitive Failure (400, 409, or Terminal Failed Status):**
   - Only when server returns a definitive client error (400, 409) or terminal failed status does the UI display a "Retry" button.
   - Clicking "Retry" generates a **brand-new UUID `jobId`**, new token, and new message IDs.

### 7.3 Reconciliation, Non-Atomic Writes & Fallback Session Rules

- **Mount & Focus Reconciliation Search Scope:**
  On app mount or tab `focus` / `visibilitychange`, the client iterates all pending records in `localStorage.ai_jobs_v1` where `reconciled === false`. The search scans **every persisted session in client storage**, NOT only the currently active conversation.

- **Background Origin Session Updates:**
  If the origin conversation and exact `assistantMessageId` placeholder exist in stored sessions, update that origin session in storage directly **even when another chat is active**, without changing the active UI view or stealing user focus.

- **Deterministic Fallback ("Recovered Results" Session):**
  Use a single fallback "Recovered Results" chat session **only when** the origin conversation was deleted by the user or the placeholder message is missing from storage. Render prompt and completion result (or failure UI) exactly once.

- **Strict Non-Atomic Write Sequence & Crash Recovery:**
  Browser storage writes across chat history and job registries are non-atomic. To prevent loss of completion results during a crash:
  1. **Write Step 1:** Save terminal completion content into the target conversation chat history.
  2. **Write Step 2:** Mark `reconciled: true` in `localStorage.ai_jobs_v1` and delete/clean capability token secret.
  - **Crash Resilience:** If a browser crash occurs between Step 1 and Step 2, global `jobId` deduplication on the next app mount detects that the message already exists in chat history, preventing duplicate insertion and safely proceeding to mark `reconciled: true`. **Never set `reconciled: true` before chat history persistence!**

- **Session Deletion Policy:** Deleting a conversation/session locally **does not remove** unresolved background jobs from `localStorage` or D1 execution.

### 7.4 Free Tier Quota & Polling Cost Impact
- Active polling uses exponential backoff (1s → 2s → 4s → max 10s), pausing when `document.hidden === true`.
- Bounded polling intervals protect daily free quotas (100k Worker requests/day, 5M D1 reads/day).

---

## 8. Privacy, Security & Abuse Controls

1. **Strict Zero-Log Policy:** Prohibits logging conversation IDs, IP addresses, prompt text, result text, HTTP headers, request/response bodies, or capability tokens.
2. **Plaintext D1 Storage Disclosure:** Plaintext prompt text and result text are stored in D1 columns during processing and retention, protected by 24h expiration purge.
3. **UTF-8 Bounds:** Strictly enforces 100,000 UTF-8 bytes max prompt text and 500,000 UTF-8 bytes max result text using `TextEncoder`/`TextDecoder`.
4. **Rate Limiting:** `env.RATE_LIMITER` binding enforces max 10 creations / 60s per IP (tunable).
5. **Timing-Safe Auth:** Web Crypto `crypto.subtle.timingSafeEqual()` prevents timing side-channels during token verification.

---

## 9. Testing, Observability & Operational Risks

### 9.1 Testing Strategy
- **Contract Tests:** Validate `POST /api/ai/jobs` and `GET /api/ai/jobs/:jobId` schemas, header validation, rate limits, 409 conflict responses, and 503 dispatch failure retries.
- **Byte Truncation Unit Tests:** Verify `truncateToUtf8ByteLimit` with multi-byte UTF-8 sequences (e.g., emojis and boundary-split multibyte characters) to ensure the decoded output plus marker is provably valid UTF-8 with TextEncoder byte length $\le$ 500,000 bytes.
- **Reconciliation & Non-Atomic Recovery:** Simulate crash between chat history write and `reconciled` flag update; verify `jobId` deduplication prevents double rendering.

### 9.2 Observability Metrics (Zero PII / Zero Content)
- `ai_jobs_created_total` (Counter)
- `ai_jobs_terminal_total` (Counter by status)
- `ai_jobs_stuck_repaired_total` (Counter)
- `ai_job_execution_seconds` (Histogram)

### 9.3 Operational Risks & Mitigations

| Risk | Mitigation |
| :--- | :--- |
| **Workflow Dispatch Failure** | D1 row stays `queued`, endpoint returns 503. Client retries identical idempotent `POST`. |
| **Browser Crash Mid-Reconciliation** | Save to chat history before setting `reconciled: true`. Global `jobId` dedupe prevents duplicates on remount. |
| **Multi-byte UTF-8 Overflow** | `TextEncoder`/`TextDecoder` byte endpoint reduction loop guarantees strict 500,000 byte limit across multibyte boundaries. |

---

## 10. Product Acceptance Criteria Checklist

- [ ] **Worker Specification:** Applies specifically to Worker `ai` with main entrypoint `./worker/index.js`.
- [ ] **Routes:** Endpoints implemented at `POST /api/ai/jobs` and `GET /api/ai/jobs/:jobId`. Synchronous `POST /api/ai` preserved intact.
- [ ] **Free Tier Availability:** Confirms Workflows and D1 run on Workers Free plan subject to quota limits.
- [ ] **Canonical Fingerprinting:** Uses canonical JSON or length-prefixed fields for request fingerprinting.
- [ ] **Duplicate POST Error:** Mismatched fingerprint or invalid token on duplicate `POST` returns generic `409 Conflict` (not 401). `401` reserved for pre-lookup header issues.
- [ ] **Retention & Purge:** Logical expiry and hourly physical purge queries align on `expires_at IS NOT NULL AND expires_at <= unixepoch()`.
- [ ] **Byte-Safe Truncation:** Uses `TextEncoder`/`TextDecoder` byte endpoint reduction loop ensuring final result text is $\le$ 500,000 bytes UTF-8 total across multibyte boundaries.
- [ ] **Plaintext Storage Disclosure:** Explicitly notes D1 stores plaintext prompt and result text during execution and retention.
- [ ] **Reconciliation Search & Non-Atomic Writes:** Reconciliation searches all stored sessions and updates origin session placeholders in storage without focus stealing. Writes terminal chat history FIRST before setting `reconciled: true`. Fallback to Recovered Results used only when origin/placeholder is missing.
- [ ] **Validation & Rate Limiting:** Prompts capped at 100,000 UTF-8 bytes. `RATE_LIMITER` binding configured with tunable numbers.
- [ ] **Strict Zero Logging:** No conversation IDs, IPs, prompts, results, headers, bodies, or tokens in logs.
- [ ] **Official Documentation Links:** Includes correct official Cloudflare documentation links for Workflows Workers API, sleeping/retrying, rules, limits, pricing, D1, Web Crypto, Rate Limiting, and Wrangler.

---

## 11. Document Metadata & Final Review

- **Status:** For User Review
- **Author:** AGY
- **Date:** 2026-07-18
