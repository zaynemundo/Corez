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

### 1.3 Official Cloudflare Reference Links
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
| **Idempotency & Workflow ID** | Client-generated UUID `jobId` serves as idempotency key and Workflow instance ID (`env.AI_JOB_WORKFLOW.get(jobId)` or `.create({ id: jobId, params })`). | Identical `jobId` gets or creates deterministic Workflow, never duplicating execution. Mismatched payload parameters return `409 Conflict`. |
| **Dispatch Failure Behavior** | If Workflow creation fails after D1 INSERT, job remains `queued` in D1 and API returns `503 Service Unavailable`. | Allows client to retry the identical idempotent `POST /api/ai/jobs` request safely without creating duplicate jobs. |
| **Security & Token Hash** | High-entropy capability token stored ONLY in client `localStorage`. D1 stores ONLY `token_hash = SHA-256(token)`. | Plain tokens are never written to D1. Unsalted SHA-256 safety depends strictly on 256-bit entropy ($2^{256}$ search space). |
| **Token Transport** | Transmitted exclusively via `X-Job-Token` HTTP header. NEVER in URL query strings. | Avoids leaking capability tokens in browser history, proxy access logs, or referrer headers. |
| **Timing-Safe Auth & 404 Security** | Load D1 row by `jobId` primary key, compute SHA-256 of header token, and compare equal-length bytes with `crypto.subtle.timingSafeEqual()`. Return exact same generic `404 Not Found` for missing, expired, or unauthorized requests. | Prevents timing side-channels and stops unauthorized callers from probing whether a `jobId` exists in D1. |
| **D1 Expiration & Retention** | `expires_at` is **NULL while active** (`queued`/`running`), and set to `terminal_at + 86400` (24h) upon reaching terminal state (`completed`/`failed`). | Clean separation between active jobs and terminal retention windows. |
| **Stuck Active Job Repair** | `active_deadline_at` is set at creation to `created_at + 7200` (at least 2 hours). Hourly cron marks active jobs past `active_deadline_at` as `failed`. | Accommodates long queue times while ensuring orphaned active jobs are eventually repaired. |
| **Workflow Retries & Model Logic** | 5 attempts, 10s exponential backoff, 10m per-attempt timeout (accommodates GLM ~120s latency). Provider calls may run at-least-once within step retries, but atomic D1 update commits exactly one terminal result. | Preserves existing `buildSystemPrompt(intent)` and `choices[0].message.content` response extraction. Stores provider/model metadata (`@cf/workers-ai` / `@cf/zai-org/glm-4.7-flash`). Bounds result text to 500,000 UTF-8 bytes. |
| **Creation Failure Ambiguity** | Network drop / 5xx on creation keeps the same `jobId` and `capabilityToken`, reconciling via `GET` poll and same idempotent `POST`. Definitive failure (400, 409, or terminal failed status) offers fresh "Retry" (generating new UUID/token). | Prevents state divergence or duplicate job creation when network issues obscure creation outcomes. |
| **Recovered Results UI** | Sync all pending jobs on mount/focus. Client records a `reconciled: true` flag in local storage upon terminal state integration. Fallback renders into **one deterministic "Recovered Results" chat session** with prompt/result or failure rendered exactly once. | Ensures crash/refresh after terminal fetch cannot lose results; enforces global `jobId` deduplication without focus stealing. |
| **Local Session Lifecycle** | Deleting a local session/conversation NEVER deletes background execution or D1 records. Token secrets are removed from `localStorage` ONLY after terminal state is saved to chat history. | Guarantees background work completes reliably; avoids loss of credentials before reconciliation. |
| **Strict Zero-Log Policy** | NEVER log conversation IDs, IP addresses, prompt text, result text, HTTP headers, request/response bodies, or capability tokens. | Complete privacy enforcement across Cloudflare Worker console logs, tail logs, and metrics. |
| **Validation & Rate Limiting** | Validate UTF-8 byte limits on prompt (max 100,000 bytes UTF-8); bound result storage (500,000 bytes UTF-8). Use Cloudflare Workers Rate Limiting binding (`env.RATE_LIMITER`). | All rate limits, timeouts, and retention values are labeled as **tunable / per-location**. |

---

## 3. Cloudflare Bindings & Configuration

The configuration below details the bindings for the Worker named `ai` in `wrangler.jsonc`. Standard placeholder binding names are specified without fake IDs.

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
      "database_name": "ai-jobs-db",
      "database_id": "REPLACE_WITH_D1_DATABASE_ID"
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

  // Cloudflare Workers Rate Limiting Binding (Tunable / Per-Location)
  "ratelimits": [
    {
      "binding": "RATE_LIMITER",
      "namespace_id": "REPLACE_WITH_RATE_LIMITER_NAMESPACE_ID",
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
    prompt_text TEXT NOT NULL,                 -- User prompt (max 100,000 bytes UTF-8)
    intent_json TEXT,                          -- Canonical JSON string of optional intent object
    result_text TEXT,                          -- Model completion output (max 500,000 bytes UTF-8)
    provider_meta TEXT,                        -- JSON string: { "provider": "@cf/workers-ai", "model": "@cf/zai-org/glm-4.7-flash" }
    error_code TEXT,                           -- Generic error code on failure
    request_fingerprint TEXT NOT NULL,         -- SHA-256 hash of (conversation_id + prompt_text + canonical_intent_json)
    created_at INTEGER NOT NULL,               -- Unix timestamp in seconds
    updated_at INTEGER NOT NULL,               -- Unix timestamp in seconds
    terminal_at INTEGER,                       -- Unix timestamp in seconds (NULL while active)
    active_deadline_at INTEGER NOT NULL,       -- Unix timestamp (created_at + 7200, at least 2 hours)
    expires_at INTEGER                         -- Logical expiry timestamp (NULL while active; terminal_at + 86400 when terminal)
);

-- Performance Indexes (Note: token_hash index omitted as lookups use Primary Key `id`)
CREATE INDEX IF NOT EXISTS idx_jobs_terminal_at ON jobs(terminal_at);
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

### 4.3 Retention, Expiry & Stuck Job Maintenance

1. **Logical Expiry:** An API status read for a job where `expires_at IS NOT NULL AND unixepoch() > expires_at` is treated as expired and returns `404 Not Found`.
2. **Physical Purge (Hourly Cron):**
   ```sql
   DELETE FROM jobs 
   WHERE terminal_at IS NOT NULL AND terminal_at <= (unixepoch() - 86400);
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
  1. Retrieve row from D1 using `SELECT token_hash, status, ... FROM jobs WHERE id = ?`. If row does not exist, return generic `404`.
  2. Compute `SHA-256` digest of presented `X-Job-Token` header.
  3. Compare computed digest byte array against stored `token_hash` byte array using Workers Web Crypto `crypto.subtle.timingSafeEqual(computedBytes, storedBytes)`.
  4. If comparison fails or job is expired (`expires_at IS NOT NULL AND unixepoch() > expires_at`), return the **exact same generic 404 response** to avoid leaking job existence.

---

### 5.2 Endpoint Specifications

#### 5.2.1 Job Creation: `POST /api/ai/jobs`

- **Headers:** `Content-Type: application/json`, `X-Job-Token: job_sec_...`
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
     `request_fingerprint = SHA256(conversation_id + prompt + canonical_intent_json)`.
  4. **Idempotency & Duplicate Check:**
     - Query D1 for existing row `WHERE id = job_id`.
     - If row exists:
       - Validate `X-Job-Token` via `timingSafeEqual`. If invalid, return `401 Unauthorized`.
       - Compare `request_fingerprint`. If fingerprint does not match, return `409 Conflict`.
       - If fingerprint matches: Ensure Workflow instance exists (`env.AI_JOB_WORKFLOW.get(job_id)` or `.create({ id: job_id })`), and return `200 OK` with current status.
  5. **New Job Processing:**
     - Execute D1 INSERT (`status = 'queued'`, `active_deadline_at = created_at + 7200`, `expires_at = NULL`).
     - Spawn Workflow instance: `await env.AI_JOB_WORKFLOW.create({ id: job_id, params: { jobId: job_id } })`.
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
| **`401 Unauthorized`** | `UNAUTHORIZED` | Missing `X-Job-Token` header or invalid token format. |
| **`404 Not Found`** | `NOT_FOUND` | Job ID absent, expired (`unixepoch() > expires_at`), or token hash mismatch (generic 404 security). |
| **`409 Conflict`** | `IDEMPOTENCY_CONFLICT` | Duplicate `job_id` submitted with conflicting request fingerprint/payload parameters. |
| **`429 Too Many Requests`** | `RATE_LIMIT_EXCEEDED` | Client IP exceeds rate limit (max 10 creations / 60 seconds). |
| **`503 Service Unavailable`**| `SERVICE_UNAVAILABLE` | Workflow creation/dispatch failed after D1 insert or system under maintenance. |

---

## 6. Cloudflare Workflow Execution & Provider Boundaries

### 6.1 Provider Call Semantics & Bounds
- **At-Least-Once Execution:** Step retries mean provider calls (`env.AI.run`) may execute at-least-once. Atomic D1 update guards (`WHERE status IN ('queued', 'running')`) ensure that only **one terminal result** is committed to D1.
- **Model & System Prompt Preservation:** System prompt is generated using existing `buildSystemPrompt(intent)`. Response output is extracted via `choices[0].message.content`. Provider (`@cf/workers-ai`) and model (`@cf/zai-org/glm-4.7-flash`) metadata are persisted alongside result text.
- **Result Size Bound:** Completion result output text written to D1 is strictly bounded to **500,000 UTF-8 bytes** (500KB). Outputs exceeding this bound are truncated safely with a trailing indicator.

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
          // Enforce 500KB UTF-8 result bound
          const encoder = new TextEncoder();
          if (encoder.encode(content).byteLength > 500000) {
            content = content.slice(0, 490000) + "\n\n[Output truncated at 500KB bound]";
          }

          return content;
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
  reconciled: boolean; // Flag set true once terminal result is written to persistent chat history
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

### 7.3 Reconciliation, Recovered Results UI & Session Lifecycle
- **Mount & Focus Sync:** On mount or tab `focus` / `visibilitychange`, client queries pending records where `reconciled === false`.
- **Global `jobId` Deduplication:** Messages are keyed by `jobId` across UI state to guarantee single rendering.
- **Placeholder Sync:** If matching `assistantMessageId` exists in current conversation thread, update its state and output directly.
- **Deterministic Recovered Results Session:** If the user is in a different session or placeholder is absent, terminal completions are rendered into **one dedicated "Recovered Results" chat session** with prompt/result or failure rendered exactly once, without stealing focus or disrupting active typing.
- **Reconciled Flag Protection:** Setting `reconciled: true` in `localStorage` upon persisting result to chat history ensures a crash or refresh immediately following terminal fetch cannot re-process or lose the result.
- **Session Deletion Policy:** Deleting a conversation/session locally **does not remove** unresolved background jobs from `localStorage` or D1 execution.
- **Secret Removal:** Capability tokens are deleted from `localStorage` **only after** `reconciled: true` is committed.

### 7.4 Free Tier Quota & Polling Cost Impact
- Active polling uses exponential backoff (1s → 2s → 4s → max 10s), pausing when `document.hidden === true`.
- Bounded polling intervals protect daily free quotas (100k Worker requests/day, 5M D1 reads/day).

---

## 8. Privacy, Security & Abuse Controls

1. **Strict Zero-Log Policy:** Prohibits logging conversation IDs, IP addresses, prompt text, result text, HTTP headers, request/response bodies, or capability tokens.
2. **UTF-8 Bounds:** Strictly enforces 100,000 UTF-8 bytes max prompt text and 500,000 UTF-8 bytes max result text.
3. **Rate Limiting:** `env.RATE_LIMITER` binding enforces max 10 creations / 60s per IP (tunable).
4. **Timing-Safe Auth:** Web Crypto `crypto.subtle.timingSafeEqual()` prevents timing side-channels during token verification.

---

## 9. Testing, Observability & Operational Risks

### 9.1 Testing Strategy
- **Contract Tests:** Validate `POST /api/ai/jobs` and `GET /api/ai/jobs/:jobId` schemas, header validation, rate limits, 409 conflict responses, and 503 dispatch failure retries.
- **D1 & Workflow Integration:** Test conditional state updates, `expires_at` nullability while active, `active_deadline_at` stuck job repair, and idempotent POST duplicate recovery.

### 9.2 Observability Metrics (Zero PII / Zero Content)
- `ai_jobs_created_total` (Counter)
- `ai_jobs_terminal_total` (Counter by status)
- `ai_jobs_stuck_repaired_total` (Counter)
- `ai_job_execution_seconds` (Histogram)

### 9.3 Operational Risks & Mitigations

| Risk | Mitigation |
| :--- | :--- |
| **Workflow Dispatch Failure** | D1 row stays `queued`, endpoint returns 503. Client retries identical idempotent `POST`. |
| **Crash After Terminal Fetch** | Client sets `reconciled: true` in `localStorage` atomically with chat history write. |
| **D1 Storage Growth** | Strict 24-hour retention after `terminal_at` enforced via hourly cron purge. |

---

## 10. Product Acceptance Criteria Checklist

- [ ] **Worker Specification:** Applies specifically to Worker `ai` with main entrypoint `./worker/index.js`.
- [ ] **Routes:** Endpoints implemented at `POST /api/ai/jobs` and `GET /api/ai/jobs/:jobId`. Synchronous `POST /api/ai` preserved intact.
- [ ] **Pre-POST Client State:** Browser generates UUID `jobId`, 256-bit token, session ID, message IDs, prompt, and optional intent into `localStorage` prior to dispatch.
- [ ] **Idempotency & Workflow ID:** Client UUID `jobId` serves as idempotency key and Workflow instance ID with duplicate recovery.
- [ ] **Timing-Safe Auth & Security:** SHA-256 token verification uses `timingSafeEqual()`. Absent, expired, or unauthorized reads return uniform generic 404.
- [ ] **Retention & Purge:** `expires_at` is NULL while active. Retention is 24 hours after `terminal_at`. Hourly cron purges expired jobs and repairs active jobs past `active_deadline_at` (at least 2 hours).
- [ ] **D1 Schema & Guards:** Includes `terminal_at`, `active_deadline_at`, `intent_json`, `provider_meta`, and `request_fingerprint`. Conditional updates prevent terminal regressions.
- [ ] **Workflow Guidance:** Uses 5 attempts, 10s exponential backoff, 10m step timeout to accommodate empirical GLM ~120s latency. Provider calls may run at-least-once; atomic D1 update commits single terminal result. Result bounded to 500KB UTF-8.
- [ ] **Creation Ambiguity Handling:** Network drops / 5xx retain same `jobId`/token and reconcile via `GET` poll & same idempotent `POST`. Definitive failure offers fresh Retry (new UUID/token).
- [ ] **Recovered Results UI:** Local `reconciled` flag prevents loss. Sync updates placeholders or renders into one deterministic Recovered Results session without focus stealing. Global `jobId` deduplication enforced.
- [ ] **Session & Cleanup Lifecycle:** Session deletion leaves background jobs running. Token secrets deleted from `localStorage` only after `reconciled: true` is set.
- [ ] **Validation & Rate Limiting:** Prompts capped at 100,000 UTF-8 bytes. `RATE_LIMITER` binding configured with tunable numbers.
- [ ] **Strict Zero Logging:** No conversation IDs, IPs, prompts, results, headers, bodies, or tokens in logs.
- [ ] **Official Documentation Links:** Includes correct official Cloudflare documentation links for Workflows Workers API, sleeping/retrying, rules, limits, pricing, D1, Web Crypto, Rate Limiting, and Wrangler.

---

## 11. Document Metadata & Final Review

- **Status:** For User Review
- **Author:** AGY
- **Date:** 2026-07-18
