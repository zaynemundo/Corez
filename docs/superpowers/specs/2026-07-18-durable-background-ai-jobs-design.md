# Technical Design Specification: Durable Anonymous Background AI Jobs via Cloudflare Workflows & D1

- **Document Path:** `docs/superpowers/specs/2026-07-18-durable-background-ai-jobs-design.md`
- **Date:** 2026-07-18
- **Status:** For User Review
- **Author:** AGY
- **Target Worker:** `ai` (`./worker/index.js`)
- **Target Endpoints:** `POST /api/ai/jobs`, `GET /api/ai/jobs/:jobId` (Preserving `POST /api/ai`)
- **Target Stack:** Cloudflare Workers, Cloudflare Workflows, Cloudflare D1, Workers AI (`@cf/zai-org/glm-4.7-flash`), Workers Rate Limiting

---

## 1. Executive Summary & Objective

### 1.1 Objective
Provide an implementation-ready design for durable, anonymous, background AI jobs for the Cloudflare Worker named `ai` (entrypoint `./worker/index.js`). 

Synchronous requests to `POST /api/ai` block the client interface and remain susceptible to network timeouts, tab closures, and page reloads. This specification transitions client interaction to an asynchronous job pipeline powered by **Cloudflare Workflows** and **Cloudflare D1**.

Job creation is accessed at `POST /api/ai/jobs` and status polling at `GET /api/ai/jobs/:jobId`. Client requests generate UUID job IDs and 256-bit capability tokens prior to transmission. The background execution runs on Cloudflare Workflows, persists state to D1, and delivers resilient recovery across browser reloads.

### 1.2 Non-Goals & Scope Boundaries
- **No Cross-Device Account Syncing:** Anonymous jobs are strictly scoped to local device storage (`localStorage`). No user accounts or cross-device state syncing are introduced.
- **No Job Cancellation in v1:** Cancellation endpoints (`DELETE /api/ai/jobs/:jobId` or cancel UI triggers) are out of scope for v1. Workflows run to a terminal state (`completed` or `failed`).
- **No OpenRouter Model Implementation:** The active provider for background jobs remains the free-tier Workers AI binding (`env.AI`) using `@cf/zai-org/glm-4.7-flash`. The OpenRouter `deepseek/deepseek-v4-pro` specification is not implemented in this active pipeline.
- **No Removal of Synchronous `POST /api/ai`:** The existing `POST /api/ai` route remains intact and operational for legacy or fallback synchronous invocation.

### 1.3 Official Cloudflare Reference Links
- [Cloudflare Workflows Documentation](https://developers.cloudflare.com/workflows/)
- [Cloudflare Workflows Rules & Retries](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
- [Cloudflare Workflows Limits & Pricing](https://developers.cloudflare.com/workflows/platform/limits/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Workers Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Cloudflare Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/rate-limiting/)
- [Cloudflare Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

---

## 2. Core Architectural Decisions

| Decision Area | Specification Rule | Justification / Technical Details |
| :--- | :--- | :--- |
| **Worker Identity** | Worker name `ai`, main entrypoint `./worker/index.js`. | Aligns strictly with repository configuration and Wrangler environment specifications. |
| **API Endpoints** | `POST /api/ai/jobs` (Creation) and `GET /api/ai/jobs/:jobId` (Polling). | Namespaced under `/api/ai/jobs` while leaving synchronous `POST /api/ai` unchanged. |
| **Pre-POST Persistence** | Client MUST generate UUID `jobId`, 256-bit capability token, session ID, message IDs, and prompt, persisting all to `localStorage` **before** dispatching `POST`. | Guarantees local state integrity if network drops during or immediately after request dispatch. |
| **Idempotency & Workflow ID** | Client-generated UUID `jobId` serves as the required idempotency key and Workflow instance ID (`env.AI_JOB_WORKFLOW.create({ id: jobId, params })`). | Prevents duplicate workflow execution on network retry; enables safe recovery from partial failures. |
| **Security & Token Hash** | High-entropy capability token stored ONLY in client `localStorage`. D1 stores ONLY `token_hash = SHA-256(token)`. | Plain tokens are never written to D1. Unsalted SHA-256 safety depends strictly on 256-bit entropy (making rainbow/pre-image attacks computationally infeasible). |
| **Token Transport** | Transmitted exclusively via `X-Job-Token` HTTP header. NEVER in URL query strings. | Avoids leaking capability tokens in browser history, proxy access logs, or referrer headers. |
| **Timing-Safe Auth & 404 Security** | Load D1 row by `jobId` primary key, compute SHA-256 of header token, and compare equal-length bytes with `crypto.subtle.timingSafeEqual()`. Return exact same generic `404 Not Found` for missing, expired, or unauthorized requests. | Prevents timing side-channels and stops unauthorized callers from probing whether a `jobId` exists in D1. |
| **Retention Policy** | Retention is **exactly 24 hours after `terminal_at`** (not `created_at`). | Jobs remain accessible for 24 hours after finishing. API enforces logical expiry; hourly cron executes physical `DELETE`. |
| **Stuck Active Job Repair** | Scheduled maintenance query marks active jobs (`queued`/`running`) stuck past a threshold (e.g., 30 min) as `failed` with `terminal_at = unixepoch()`. | Prevents orphaned jobs from remaining in non-terminal states indefinitely if a worker crashes unexpectedly. |
| **Workflow Timing & Retries** | Use documented Cloudflare Workflow guidance: 5 attempts (4 retries), 10s exponential backoff, 10m per-attempt timeout. | Accommodates empirical GLM latency (GLM-4.7-Flash has taken ~120s in diagnostic testing) without premature timeouts. |
| **Recovered Results UI** | Sync all pending jobs on mount/focus. Update matching placeholder if present; otherwise render to a deterministic "Recovered Results" area without stealing focus. Dedupe `jobId` globally. | Ensures UI stays responsive and background completions are recovered across tabs/reloads cleanly. |
| **Local Session Lifecycle** | Deleting a local session/conversation NEVER deletes background execution or D1 records. Token secrets are removed from `localStorage` ONLY after terminal state is saved to chat history. | Guarantees background work completes reliably; avoids loss of credentials before reconciliation. |
| **Strict Zero-Log Policy** | NEVER log conversation IDs, IP addresses, prompt text, result text, HTTP headers, request/response bodies, or capability tokens. | Complete privacy enforcement across Cloudflare Worker console logs, tail logs, and metrics. |
| **Validation & Rate Limiting** | Validate UTF-8 byte limits on prompt (max 100,000 bytes UTF-8); bound result storage. Use Cloudflare Workers Rate Limiting binding (`env.RATE_LIMITER`). | All rate limits, timeouts, and retention values are labeled as **tunable / per-location**. |

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
    result_text TEXT,                          -- Model completion output (bounded)
    error_code TEXT,                           -- Generic error code on failure
    request_fingerprint TEXT NOT NULL,         -- SHA-256 hash of (conversation_id + prompt_text)
    created_at INTEGER NOT NULL,               -- Unix timestamp in seconds
    updated_at INTEGER NOT NULL,               -- Unix timestamp in seconds
    terminal_at INTEGER,                       -- Unix timestamp in seconds (NULL while active)
    expires_at INTEGER NOT NULL                -- Logical expiry timestamp: terminal_at + 86400 (or created_at + 172800 if active)
);

-- Performance Indexes (Note: token_hash index omitted as lookups use Primary Key `id`)
CREATE INDEX IF NOT EXISTS idx_jobs_terminal_at ON jobs(terminal_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);
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

1. **Logical Expiry:** An API status read for a job where `unixepoch() > expires_at` or `terminal_at` is older than 24 hours (86,400 seconds) is treated as expired and returns `404 Not Found`.
2. **Physical Purge (Hourly Cron):**
   ```sql
   DELETE FROM jobs 
   WHERE terminal_at IS NOT NULL AND terminal_at <= (unixepoch() - 86400);
   ```
3. **Stuck Active Job Repair (Hourly Cron):** Active jobs stuck in `queued` or `running` without updates for >30 minutes (1,800 seconds, tunable) are transitioned to `failed`:
   ```sql
   UPDATE jobs 
   SET status = 'failed', 
       error_code = 'JOB_TIMEOUT_STUCK', 
       terminal_at = unixepoch(), 
       expires_at = (unixepoch() + 86400), 
       updated_at = unixepoch() 
   WHERE status IN ('queued', 'running') AND updated_at <= (unixepoch() - 1800);
   ```

---

## 5. API Interface, Token Transport & Security Specifications

### 5.1 Capability Token & Authentication Security
- **Token Generation:** Client creates a 256-bit cryptographically secure token (e.g., 64-char hex string with prefix `job_sec_...`).
- **Unsalted Hash Rationale:** Unsalted SHA-256 is used for D1 token matching. Because the token has 256 bits of cryptographic entropy, pre-computation, rainbow table, and brute-force attacks are computationally impossible ($2^{256}$ search space).
- **Constant-Time Verification:**
  1. Retrieve row from D1 using `SELECT token_hash, status, ... FROM jobs WHERE id = ?`. If row does not exist, return generic `404`.
  2. Compute `SHA-256` digest of presented `X-Job-Token` header.
  3. Compare computed digest byte array against stored `token_hash` byte array using Workers Web Crypto `crypto.subtle.timingSafeEqual(computedBytes, storedBytes)`.
  4. If comparison fails or job is expired, return the **exact same generic 404 response** to avoid leaking job existence.

### 5.2 Partial Failure & Idempotent Creation (`POST /api/ai/jobs`)

When a client sends `POST /api/ai/jobs` with a client-generated UUID `jobId`:

1. **Rate Limiting Check:** Check `env.RATE_LIMITER.limit({ key: ip })`. If exceeded, return `429 Too Many Requests`.
2. **UTF-8 Byte Check:** Validate prompt text length $\le$ 100,000 UTF-8 bytes (tunable).
3. **Duplicate / Partial Failure Detection:**
   - Compute `request_fingerprint = SHA256(conversation_id + prompt_text)`.
   - Query D1: `SELECT status, token_hash, request_fingerprint FROM jobs WHERE id = ?`.
   - If row exists:
     - Verify presented `X-Job-Token` hash using `timingSafeEqual`. If invalid, return `401 Unauthorized`.
     - If token is valid and fingerprint matches: This is a duplicate submission (e.g. network retry). Ensure Workflow instance exists (`env.AI_JOB_WORKFLOW.get(jobId)` or create if missing), and return `200 OK` with existing job status.
4. **New Job Insertion & Workflow Creation:**
   - Execute D1 INSERT (`status = 'queued'`).
   - Spawn Workflow instance: `await env.AI_JOB_WORKFLOW.create({ id: jobId, params: { jobId } })`.
   - If Workflow creation fails after D1 INSERT, catch error, update D1 row status to `failed` (`error_code = 'WORKFLOW_DISPATCH_FAILED'`), set `terminal_at = unixepoch()`, and return `500 Internal Server Error`.

#### Endpoint Contract: `POST /api/ai/jobs`
- **Headers:** `Content-Type: application/json`, `X-Job-Token: job_sec_...`
- **Request Body:**
  ```json
  {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "conversation_id": "conv_8832a...",
    "prompt": "User prompt text (max 100,000 UTF-8 bytes)"
  }
  ```
- **Response (`201 Created` / `200 OK`):**
  ```json
  {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "queued",
    "created_at": 1773870913
  }
  ```

---

### 5.3 Job Status Query (`GET /api/ai/jobs/:jobId`)

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
      "model": "@cf/zai-org/glm-4.7-flash"
    }
  }
  ```
- **Response — Generic 404 (Absent, Expired, or Unauthorized):**
  ```json
  {
    "error": {
      "code": "NOT_FOUND",
      "message": "The requested job was not found or has expired."
    }
  }
  ```

---

## 6. Cloudflare Workflow Execution & Retry Boundaries

### 6.1 Workflow Design Guidance & Empirical Context
- **Guidance & Limits:** Following [Cloudflare Workflows Rules & Limits](https://developers.cloudflare.com/workflows/platform/limits/), steps run with documented default guidance:
  - Max Attempt Retries: **5 attempts** (4 retries).
  - Retry Delay: **10-second exponential backoff** (tunable).
  - Per-Attempt Timeout: **10-minute timeout**.
- **Empirical Execution Context:** Diagnostic testing of `@cf/zai-org/glm-4.7-flash` via Workers AI shows execution latency can reach ~120 seconds under load. The step timeout is explicitly set to 10 minutes to prevent premature step aborts.

### 6.2 Workflow Implementation Structure

```javascript
import { WorkflowEntrypoint } from 'cloudflare:workers';

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
          const job = await this.env.DB.prepare("SELECT prompt_text FROM jobs WHERE id = ?").bind(jobId).first();
          if (!job) throw new Error("JOB_NOT_FOUND_FATAL");

          const response = await this.env.AI.run('@cf/zai-org/glm-4.7-flash', {
            messages: [{ role: 'user', content: job.prompt_text }]
          });

          if (!response || !response.choices || !response.choices[0]?.message?.content) {
            throw new Error("EMPTY_MODEL_RESPONSE"); // Triggers step retry
          }

          return response.choices[0].message.content.trim();
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
    await step.do('mark-completed', async () => {
      await this.env.DB.prepare(
        `UPDATE jobs 
         SET status = 'completed', result_text = ?, terminal_at = unixepoch(), expires_at = (unixepoch() + 86400), updated_at = unixepoch() 
         WHERE id = ? AND status IN ('queued', 'running')`
      ).bind(aiOutput, jobId).run();
    });
  }
}
```

---

## 7. Client Architecture, Local Persistence & Reconciliation

### 7.1 Client Pre-POST Persistence Sequence
Before dispatching `POST /api/ai/jobs`, the client MUST perform the following synchronous sequence:

1. Generate UUID `jobId` (e.g. `crypto.randomUUID()`).
2. Generate 256-bit `capabilityToken` (`job_sec_...`).
3. Generate `userMessageId` and `assistantMessageId`.
4. Construct `LocalJobRecord`:
   ```typescript
   interface LocalJobRecord {
     jobId: string;
     capabilityToken: string;
     conversationId: string;
     userMessageId: string;
     assistantMessageId: string;
     promptText: string;
     status: 'queued' | 'running' | 'completed' | 'failed';
     createdAt: number;
   }
   ```
5. Save `LocalJobRecord` to `localStorage.ai_jobs_v1`.
6. Append placeholder message (`status: "queued"`) to active chat UI feed.
7. Clear input field immediately and set `inputDisabled = false`.
8. Dispatch `POST /api/ai/jobs` asynchronously.

### 7.2 Initial Submission Failure & Retry Handling
- **Creation Network Failure / 5xx:** If `POST /api/ai/jobs` fails to respond or returns 5xx, the client marks the local `LocalJobRecord.status = 'failed'` and updates the placeholder UI message to generic `failed`.
- **User Retry Action:** Clicking "Retry" on a failed message:
  - Generates a **brand-new UUID `jobId`**, fresh 256-bit token, fresh message IDs.
  - Supersedes the old failed message in UI and `localStorage`.
  - Dispatches a new `POST /api/ai/jobs` request.

### 7.3 Reconciliation, Recovered Results UI & Session Lifecycle
- **Mount & Focus Sync:** On application mount or window `focus` / `visibilitychange`, client iterates all active records in `localStorage.ai_jobs_v1`.
- **Deduplication:** `jobId` is globally deduped in UI state to prevent duplicate rendering.
- **Placeholder Sync:** If matching `assistantMessageId` exists in active conversation thread, update its status/content directly.
- **Recovered Results Container:** If user is in a different session or placeholder message is absent, completion results are rendered into a dedicated "Recovered Results" section/drawer without stealing focus or interrupting current user typing.
- **Session Deletion Policy:** Deleting a conversation/session locally **does not remove** unresolved background jobs from `localStorage.ai_jobs_v1` or D1 execution. Jobs run to completion on Cloudflare edge.
- **Secret Cleanup:** Capability tokens are deleted from `localStorage` **only after** terminal result is successfully reconciled and written into persistent chat history.
- **Handling 404 Response:** If poll returns generic 404 (expired or lost), local job status updates to `failed` (`error: "Job expired or unretrievable"`).

### 7.4 Polling Strategy & Free Tier Cost Impact
- **Active Polling Schedule:** Initial poll at +1s, then +2s, +4s, capping at **10-second intervals** (tunable).
- **Hidden Tab:** Polling pauses when `document.hidden === true` and resumes immediately on tab focus.
- **Quota & Cost Note:** On Cloudflare Workers Free plan, high-frequency polling consumes Worker requests and D1 read operations. Bounded polling intervals (max 10s active, paused when hidden) protect against exhausting daily free quotas (100k Worker requests/day, 5M D1 reads/day).

### 7.5 XSS Threat Model Acknowledgment
- **Security Trade-Off:** Storing 256-bit capability tokens in `localStorage` exposes them to potential exfiltration if an XSS vulnerability exists in the web application.
- **Mitigation:** Strict Content Security Policy (CSP), HTML sanitization of model outputs, and zero inclusion of third-party unsafe scripts.

---

## 8. Privacy, Security & Abuse Controls

1. **Strict Zero-Log Policy:**
   - **Prohibited Log Targets:** Conversation IDs, IP addresses, prompt text, result text, HTTP headers, request/response bodies, capability tokens.
   - **Allowed Metric Logs:** Anonymous counters and durations (`job_status`, `duration_ms`, `error_code`).
2. **UTF-8 Byte Validation:**
   - Server strictly rejects prompts exceeding 100,000 UTF-8 bytes with `400 Bad Request`.
3. **Rate Limiting:**
   - `env.RATE_LIMITER` binding enforces max 10 job creations per 60 seconds per IP address (tunable).
4. **Timing-Safe Digest Comparisons:**
   - `crypto.subtle.timingSafeEqual()` prevents timing side-channel attacks during token authorization.

---

## 9. Testing, Observability & Operational Risks

### 9.1 Testing Strategy
- **Contract Tests:** Verify `POST /api/ai/jobs` and `GET /api/ai/jobs/:jobId` schemas, header requirements, rate limits, and generic 404 responses.
- **Timing-Safe Unit Tests:** Test `timingSafeEqual` with matching and non-matching SHA-256 token hashes.
- **Workflow Resilience Tests:** Test D1 conditional updates, step retries, and stuck job cleanup.

### 9.2 Observability Metrics (Zero PII / Zero Content)
- `ai_jobs_created_total` (Counter)
- `ai_jobs_terminal_total` (Counter by status: `completed`, `failed`)
- `ai_jobs_stuck_repaired_total` (Counter)
- `ai_job_execution_seconds` (Histogram)

### 9.3 Operational Risks & Mitigations

| Risk | Mitigation |
| :--- | :--- |
| **Partial Failure (D1 insert ok, Workflow fail)** | API catches dispatch error, sets D1 status to `failed` immediately, returns 500. Duplicate POST retries check D1 and recover. |
| **Worker Quota Depletion on Free Tier** | Bounded polling backoff (max 10s), pause when tab hidden, immediate stop upon terminal state. |
| **State Regression on Out-of-Order Updates** | D1 updates use conditional `WHERE status IN ('queued', 'running')` guards to ensure terminal states are immutable. |

---

## 10. Product Acceptance Criteria Checklist

- [ ] **Worker Specification:** Applies specifically to Worker `ai` with main entrypoint `./worker/index.js`.
- [ ] **Routes:** Endpoints implemented at `POST /api/ai/jobs` and `GET /api/ai/jobs/:jobId`. Synchronous `POST /api/ai` preserved intact.
- [ ] **Client Pre-POST State:** Browser generates UUID `jobId`, 256-bit token, session ID, message IDs, and prompt into `localStorage` prior to dispatch.
- [ ] **Idempotency & Workflow ID:** Client UUID `jobId` serves as idempotency key and Workflow instance ID with duplicate recovery.
- [ ] **Timing-Safe Auth & Security:** SHA-256 token verification uses `timingSafeEqual()`. Absent, expired, or unauthorized reads return uniform generic 404.
- [ ] **Retention & Purge:** 24-hour retention after `terminal_at`. Hourly cron purges expired jobs and repairs stuck active jobs.
- [ ] **D1 Schema & Guards:** Includes `terminal_at` and `request_fingerprint`. Conditional state updates prevent terminal regressions. No `token_hash` index.
- [ ] **Workflow Guidance:** Uses 5 attempts, 10s exponential backoff, 10m step timeout to accommodate empirical GLM ~120s latency.
- [ ] **Recovered Results UI:** Mount/focus sync updates placeholders or populates deterministic Recovered Results area without stealing focus. Global `jobId` deduplication enforced.
- [ ] **Session & Cleanup Lifecycle:** Session deletion leaves background jobs running. Token secrets deleted from `localStorage` only after terminal reconciliation.
- [ ] **Retry as Fresh Job:** Creation failure marks local status `failed`. Retrying generates fresh UUID, token, and message IDs.
- [ ] **Validation & Rate Limiting:** Prompts capped at 100,000 UTF-8 bytes. `RATE_LIMITER` binding configured with tunable numbers.
- [ ] **Strict Zero Logging:** No conversation IDs, IPs, prompts, results, headers, bodies, or tokens in logs.
- [ ] **Official Documentation Links:** Includes official Cloudflare documentation markdown links for Workflows, limits, D1, Web Crypto, Rate Limiting, and Wrangler.

---

## 11. Document Metadata & Final Review

- **Status:** For User Review
- **Author:** AGY
- **Date:** 2026-07-18
