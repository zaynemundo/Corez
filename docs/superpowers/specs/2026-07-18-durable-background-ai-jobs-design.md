# Technical Design Specification: Durable Anonymous Background AI Jobs via Cloudflare Workflows & D1

- **Document Path:** `docs/superpowers/specs/2026-07-18-durable-background-ai-jobs-design.md`
- **Date:** 2026-07-18
- **Status:** For User Review
- **Author:** AGY
- **Target Stack:** Cloudflare Workers, Cloudflare Workflows, Cloudflare D1, Workers AI (`@cf/zai-org/glm-4.7-flash`)

---

## 1. Executive Summary & Objective

### 1.1 Objective
Provide an implementation-ready design for durable, anonymous, background AI jobs powered by **Cloudflare Workflows** and **Cloudflare D1**. 

Currently, synchronous AI requests bound to `POST /api/ai` block the client interface and are vulnerable to request timeouts, tab closes, and page refreshes. This specification shifts frontend interaction to an asynchronous job-based architecture where prompt submission creates a durable job managed by Cloudflare Workflows, persisted in D1, and polled securely via client-held capability tokens.

### 1.2 Non-Goals & Scope Boundaries
- **No Cross-Device Account Syncing:** Anonymous jobs are strictly scoped to local device storage (`localStorage`). No account system or cross-device session syncing is introduced.
- **No Job Cancellation in v1:** Explicit cancellation endpoints (`DELETE /api/jobs/:id` or cancel buttons) are out of scope for v1. Workflows run to terminal state (`completed` or `failed`).
- **No OpenRouter Model Implementation:** The active provider for background jobs remains the free-tier Workers AI binding (`env.AI`) using `@cf/zai-org/glm-4.7-flash`. The OpenRouter `deepseek/deepseek-v4-pro` specification is not implemented in this pipeline.
- **No Removal of `POST /api/ai`:** The existing synchronous `POST /api/ai` endpoint is preserved as-is for backwards compatibility and fallback execution.
- **Unverified Implementation File Scope:** Exact codebase file modifications (e.g. specific Worker or React component files) will be verified and authorized when implementation phase begins.

---

## 2. Core Architectural Decisions

| Decision Area | Specification Rule | Justification |
| :--- | :--- | :--- |
| **Input Availability** | Immediate input re-enable upon submission. Prompt field clears and unlocks instantly. | Eliminates UI blocking; allows users to compose and submit multiple prompts concurrently. |
| **Message Statuses** | Granular per-message states: `queued` → `running` → `completed` \| `failed`. | Provides clear visual indicators per chat message bubble without modal overlays. |
| **Resilience & Survival** | Survives tab close, page refresh, and browser navigation. | Workflow executes independently on Cloudflare edge; client reconnects via `localStorage` registry. |
| **Context Scoping** | Tied to exact `conversation_id` in client state and D1 table. | Restores pending/completed messages into their correct conversation threads upon reload. |
| **Concurrency** | Supports multiple simultaneous background jobs per user session. | Workflows execute in parallel; D1 rows and capability tokens isolate job state. |
| **Security & Tokens** | High-entropy capability token stored ONLY in client `localStorage`. D1 stores ONLY `token_hash` (SHA-256). | Prevents unauthorized status querying without session authentication or database leaks exposing tokens. |
| **Token Transport** | Transmitted via `X-Job-Token` HTTP header. NEVER in URL query strings. | Avoids leaking tokens in browser history, proxy access logs, or referrer headers. |
| **Privacy & Logging** | Strict Zero-Log Policy for prompts, results, and capability tokens. | Protects user confidentiality; logs record only job metadata (`job_id`, status, duration, error codes). |
| **Data Retention** | Exact **24-hour retention** (`expires_at = created_at + 86400`). Purged via Scheduled Worker. | Limits D1 storage growth while giving users ample time to retrieve background completions. |
| **Failure Handling** | Display generic error UI. Retrying creates a **brand new job** (`POST /api/jobs`). | Raw errors stay hidden for security; retries receive fresh job IDs, tokens, and workflow instances. |
| **Polling Strategy** | Bounded exponential backoff (1s → 2s → 4s → max 10s) + immediate sync on page load/focus. | Balances real-time responsiveness with minimal edge request volume. |
| **AI Provider** | Provider-neutral Workflow step; active default `@cf/zai-org/glm-4.7-flash` (`env.AI`). | Decouples job orchestration from LLM backend selection. |

---

## 3. System Architecture & Component Interaction Flow

### 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser / Client (React App)                                           │
│ ┌──────────────────────┐  ┌───────────────────────────────────────────┐ │
│ │ Immediate UI Input   │  │ LocalStorage Job Registry                 │ │
│ │ (Re-enabled on submit)│  │ { job_id, capability_token, conv_id }     │ │
│ └──────────┬───────────┘  └─────────────────────┬─────────────────────┘ │
└────────────┼────────────────────────────────────┼───────────────────────┘
             │ 1. POST /api/jobs                  │ 3. GET /api/jobs/:id
             │    Header: X-Job-Token             │    Header: X-Job-Token
             ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Cloudflare Worker API Layer (`/api/jobs`)                               │
│  - Hashes X-Job-Token with SHA-256                                     │
│  - Validates payload size (max 100KB) & rate limits                    │
│  - Writes initial D1 record (`queued`)                                  │
│  - Triggers Cloudflare Workflow (`env.AI_JOB_WORKFLOW.create()`)        │
└────────────┬────────────────────────────────────┬───────────────────────┘
             │ Spawns Execution                   │ Reads Job State
             ▼                                    ▼
┌──────────────────────────────┐         ┌────────────────────────────────┐
│ Cloudflare Workflow Engine   │         │ Cloudflare D1 Database (`jobs`)│
│ ┌──────────────────────────┐ │ Writes  │ ┌────────────────────────────┐ │
│ │ Step 1: Mark `running`   ├─┼─────────┼─► status = 'running'         │ │
│ └──────────┬───────────────┘ │         │ ├────────────────────────────┤ │
│            ▼                 │         │ │ token_hash = SHA256(token) │ │
│ ┌──────────────────────────┐ │         │ ├────────────────────────────┤ │
│ │ Step 2: Call Workers AI  │ │         │ │ prompt_text, result_text   │ │
│ │ (@cf/zai-org/glm-4.7-fl) │ │         │ ├────────────────────────────┤ │
│ └──────────┬───────────────┘ │ Writes  │ │ expires_at = NOW + 86400s   │ │
│            ▼                 │         │ └────────────────────────────┘ │
│ ┌──────────────────────────┐ │         │                                │
│ │ Step 3: Mark `completed` ├─┼─────────┘                                │
│ │ or `failed`              │ │                                          │
│ └──────────────────────────┘ │                                          │
└──────────────────────────────┘                                          │
                                                                          │
┌─────────────────────────────────────────────────────────────────────────┐
│ Cloudflare Scheduled Cron Trigger (Every 1 Hour)                        │
│  - Runs `DELETE FROM jobs WHERE expires_at <= unixepoch()`              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Sequence Walkthrough

1. **Submission:** User enters a prompt and submits. Client generates a 256-bit high-entropy capability token (`job_sec_...`).
2. **Job Creation:** Client sends `POST /api/jobs` containing prompt, `conversation_id`, and `X-Job-Token` header.
3. **Immediate Unblock:** Worker hashes token (`SHA-256`), inserts D1 row with status `queued`, triggers Workflow, and returns `{ job_id, status: "queued", expires_at }`. Client immediately clears input box and appends `queued` message bubble to UI.
4. **Execution:** Cloudflare Workflow starts. Step 1 updates D1 status to `running`. Step 2 invokes `env.AI.run('@cf/zai-org/glm-4.7-flash', { messages })`.
5. **Completion / Failure:** Step 3 saves completion text to D1 and sets status to `completed`. On unrecoverable error, status is set to `failed` with a sanitized error code.
6. **Client Polling & Sync:** Client polls `GET /api/jobs/:id` using `X-Job-Token`. Once `status === "completed"`, result is appended to chat and job token is marked resolved in `localStorage`.

---

## 4. Cloudflare Bindings & Configuration

Configuration must be declared in `wrangler.jsonc` (or `wrangler.toml`) using standard environment binding placeholders. No invented account IDs or database IDs are used.

```jsonc
// wrangler.jsonc snippet
{
  "name": "ai-proxy-worker",
  "main": "src/index.js",
  "compatibility_date": "2026-07-18",
  
  // D1 Database Binding for Job State Storage
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

  // Cron Trigger for 24-Hour Terminal Data Retention Cleanup
  "triggers": {
    "crons": ["0 * * * *"] // Executes hourly
  }
}
```

---

## 5. D1 Database Schema & State Machine

### 5.1 D1 Table Definition (`jobs`)

```sql
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    prompt_text TEXT NOT NULL,
    result_text TEXT,
    error_code TEXT,
    created_at INTEGER NOT NULL, -- Unix timestamp in seconds
    updated_at INTEGER NOT NULL, -- Unix timestamp in seconds
    expires_at INTEGER NOT NULL  -- Unix timestamp in seconds (created_at + 86400)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_token_hash ON jobs(token_hash);
CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);
```

### 5.2 Valid Status Transitions

```
 ┌──────────┐      Step 1 Start       ┌──────────┐
 │  queued  ├────────────────────────►│  running │
 └──────────┘                         └────┬─────┘
                                           │
                         ┌─────────────────┴─────────────────┐
                         │ Step 2 Success                    │ Step 2/3 Fail (Max Retries)
                         ▼                                   ▼
                   ┌───────────┐                       ┌───────────┐
                   │ completed │                       │  failed   │
                   └───────────┘                       └───────────┘
```

- **`queued` → `running`**: Set by Step 1 of Cloudflare Workflow upon execution start.
- **`running` → `completed`**: Set by Step 3 upon successful Workers AI completion.
- **`running` → `failed`**: Set by Step 3 or Workflow error handler if step retries are exhausted.
- **Terminal States:** `completed` and `failed` are terminal. No further state transitions are permitted for a given `job_id`.

### 5.3 Retention & Purge Policy
- **TTL Window:** Exactly 24 hours (`86,400` seconds). Calculated as `expires_at = created_at + 86400`.
- **Purge Execution:** Scheduled Cloudflare Worker trigger runs hourly:
  ```sql
  DELETE FROM jobs WHERE expires_at <= unixepoch();
  ```

---

## 6. API Interface & Token Security Specifications

### 6.1 Authentication & Token Security Architecture
1. **Generation:** High-entropy string generated using cryptographically secure random bytes (e.g. `crypto.getRandomValues()`).
   - Format: `job_sec_` + 64 hexadecimal characters (256 bits of entropy).
2. **Storage:**
   - **Client:** Saved exclusively in `localStorage` under `ai_jobs_v1`.
   - **Database (D1):** `token_hash` = `SHA-256(capability_token)`. Plain text token is NEVER stored in D1.
3. **Transport Header:** `X-Job-Token: job_sec_...`
   - Requests without a valid `X-Job-Token` matching `token_hash` in D1 return `401 Unauthorized`.
4. **Hashing Algorithm:** Web Crypto API `crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))` converted to lower-case hex string.

---

### 6.2 Endpoint Contracts

#### 6.2.1 Job Creation: `POST /api/jobs`

- **Headers Required:**
  - `Content-Type: application/json`
  - `X-Job-Token: <capability_token>` (Required: client-generated high-entropy token)
  - `X-Idempotency-Key: <uuid_v4>` (Optional: prevents duplicate submissions on network retry)

- **Request Body Schema:**
  ```json
  {
    "prompt": "string (1 to 102,400 chars, required)",
    "conversation_id": "string (1 to 128 chars, required)",
    "intent": "object (optional metadata)"
  }
  ```

- **Success Response (`201 Created`):**
  ```json
  {
    "job_id": "job_01J9X8K2M...",
    "status": "queued",
    "conversation_id": "conv_8832a...",
    "created_at": 1773870913,
    "expires_at": 1773957313
  }
  ```

- **Error Responses:**
  - `400 Bad Request`: Invalid payload, missing fields, or prompt > 100KB.
  - `401 Unauthorized`: Missing or malformed `X-Job-Token` header.
  - `429 Too Many Requests`: Rate limit exceeded for IP address.
  - `500 Internal Server Error`: D1 or Workflow dispatch failure.

---

#### 6.2.2 Job Status Query: `GET /api/jobs/:id`

- **Headers Required:**
  - `X-Job-Token: <capability_token>`

- **Success Response — In Progress (`200 OK`):**
  ```json
  {
    "job_id": "job_01J9X8K2M...",
    "status": "running",
    "conversation_id": "conv_8832a...",
    "created_at": 1773870913,
    "updated_at": 1773870915,
    "expires_at": 1773957313
  }
  ```

- **Success Response — Completed (`200 OK`):**
  ```json
  {
    "job_id": "job_01J9X8K2M...",
    "status": "completed",
    "conversation_id": "conv_8832a...",
    "created_at": 1773870913,
    "updated_at": 1773870922,
    "expires_at": 1773957313,
    "result": {
      "content": "Generated text completion output from model...",
      "model": "@cf/zai-org/glm-4.7-flash"
    }
  }
  ```

- **Success Response — Failed (`200 OK`):**
  ```json
  {
    "job_id": "job_01J9X8K2M...",
    "status": "failed",
    "conversation_id": "conv_8832a...",
    "created_at": 1773870913,
    "updated_at": 1773870925,
    "expires_at": 1773957313,
    "error": {
      "code": "MODEL_EXECUTION_FAILED",
      "message": "The AI model encountered an error processing your request. Please try again."
    }
  }
  ```

- **Error Responses:**
  - `401 Unauthorized`: Invalid `X-Job-Token` or token hash does not match `job_id`.
  - `404 Not Found`: Job ID does not exist or has passed 24-hour retention expiration.

---

### 6.3 Standardized Error Schema
All error responses return a uniform JSON payload:

```json
{
  "error": {
    "code": "INVALID_TOKEN | PAYLOAD_TOO_LARGE | RATE_LIMIT_EXCEEDED | JOB_NOT_FOUND | INTERNAL_ERROR",
    "message": "Human-readable sanitized error description."
  }
}
```

---

## 7. Cloudflare Workflow Execution & Retry Boundaries

### 7.1 Workflow Definition Structure

```javascript
import { WorkflowEntrypoint } from 'cloudflare:workers';

export class AiJobWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId } = event.payload;

    // Step 1: Mark job as running in D1
    await step.do('mark-running', async () => {
      await this.env.DB.prepare(
        "UPDATE jobs SET status = 'running', updated_at = unixepoch() WHERE id = ?"
      ).bind(jobId).run();
    });

    // Step 2: Execute Workers AI Model Call with Retries
    let aiResponse;
    try {
      aiResponse = await step.do(
        'call-workers-ai',
        {
          retries: {
            limit: 3,
            delay: '2 seconds',
            backoff: 'exponential'
          },
          timeout: '60 seconds'
        },
        async () => {
          // Fetch prompt from D1
          const job = await this.env.DB.prepare("SELECT prompt_text FROM jobs WHERE id = ?").bind(jobId).first();
          if (!job) throw new NonRetryableError("JOB_NOT_FOUND");

          const response = await this.env.AI.run('@cf/zai-org/glm-4.7-flash', {
            messages: [{ role: 'user', content: job.prompt_text }]
          });

          if (!response || !response.choices || !response.choices[0]?.message?.content) {
            throw new Error("EMPTY_MODEL_RESPONSE"); // Retryable
          }

          return response.choices[0].message.content.trim();
        }
      );
    } catch (err) {
      // Step 3a: Mark Failed on exhausted retries or non-retryable error
      await step.do('mark-failed', async () => {
        await this.env.DB.prepare(
          "UPDATE jobs SET status = 'failed', error_code = 'MODEL_EXECUTION_FAILED', updated_at = unixepoch() WHERE id = ?"
        ).bind(jobId).run();
      });
      return;
    }

    // Step 3b: Save completion result and mark completed in D1
    await step.do('mark-completed', async () => {
      await this.env.DB.prepare(
        "UPDATE jobs SET status = 'completed', result_text = ?, updated_at = unixepoch() WHERE id = ?"
      ).bind(aiResponse, jobId).run();
    });
  }
}
```

### 7.2 Retry Policy & Failure Scenarios

| Failure Mode | Step Boundary Behavior | Workflow Action |
| :--- | :--- | :--- |
| **D1 Read/Write Failure** | Step 1 or Step 3 | Step retries up to 3 times with exponential backoff. |
| **Rate Limit / Upstream 429** | Step 2 (`call-workers-ai`) | Retryable error. Re-executes step after delay (`2s`, `4s`, `8s`). |
| **Upstream 502/503/504** | Step 2 (`call-workers-ai`) | Retryable error. Re-executes step. |
| **Invalid Prompt / 400 Bad Request** | Pre-Workflow API Layer | Fails immediately at `POST /api/jobs`; no Workflow is spawned. |
| **Exhausted Step Retries (3/3)** | Step 2 (`call-workers-ai`) | Workflow catches exception and advances to `mark-failed` step. |

---

## 8. Client Integration, Polling & Reconciliation Logic

### 8.1 LocalStorage Schema (`ai_jobs_v1`)

To support tab survival and session recovery, the frontend manages a job registry in browser `localStorage`:

```typescript
interface LocalJobRecord {
  jobId: string;
  capabilityToken: string;
  conversationId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  promptSnippet: string;
  createdAt: number;
}

// Stored under localStorage key: "ai_jobs_v1"
type JobRegistry = Record<string, LocalJobRecord>; // Keyed by jobId
```

### 8.2 Immediate Input Re-enablement Flow
1. User clicks "Send".
2. Client generates `capabilityToken` (`job_sec_...`) and temporary message ID.
3. Client appends placeholder message (`status: "queued"`) to active conversation feed.
4. Client **immediately clears input box** and sets `inputDisabled = false`.
5. Client sends `POST /api/jobs` asynchronously in the background.
6. Upon receipt of HTTP 201, `jobId` and `capabilityToken` are stored in `localStorage.ai_jobs_v1`.

### 8.3 Bounded Polling Strategy & Visibility Synchronization

To avoid edge hammering while ensuring snappy updates:

1. **Active Tab Polling Interval:**
   - Poll 1: +1.0 sec after creation
   - Poll 2: +2.0 sec
   - Poll 3: +4.0 sec
   - Subsequent Polls: Max interval cap at **10 seconds**.
2. **Tab Visibility & Focus Sync:**
   - Listen to `document.addEventListener('visibilitychange')` and `window.addEventListener('focus')`.
   - When tab becomes visible (`document.visibilityState === 'visible'`), immediately poll all active jobs marked `queued` or `running`.
   - When tab is hidden, pause or slow polling to 30-second intervals.
3. **Terminal Deregistration:**
   - When status reaches `completed` or `failed`, polling stops for that `jobId`.
   - Result is reconciled into conversation history. `localStorage` entry is updated with final status.

### 8.4 Recovered Results Reconciliation & Duplicate Prevention
- **Page Reload / Re-open Tab:**
  1. On application mount, read `localStorage.ai_jobs_v1`.
  2. Filter jobs matching active `conversationId` where status is `queued` or `running`.
  3. Query `GET /api/jobs/:id` for each pending job using stored `capabilityToken`.
  4. If status is `completed`, inject completion into conversation state **if and only if** message with `job_id` does not already exist in conversation state (deduplication check).

### 8.5 Retry Workflow
- If a message shows `failed` status, UI displays a "Retry" button.
- Clicking "Retry" **does not re-query or mutate the old failed job**.
- Instead, it reads the original prompt text and dispatches a **new `POST /api/jobs` request**, creating a fresh job instance with a new `job_id` and capability token.

---

## 9. Security, Privacy & Abuse Controls

1. **Zero-Log Policy:**
   - Prompt text, model output, and capability tokens **MUST NEVER** be printed via `console.log()` or included in Cloudflare Worker tail logs.
   - Allowed Log Metadata: `job_id`, `conversation_id`, `status`, `duration_ms`, `http_status`, `error_code`.
2. **Payload Size Enforcement:**
   - Prompts strictly capped at **102,400 bytes (100KB)** at `POST /api/jobs`. Requests exceeding this threshold fail with `400 Bad Request (PAYLOAD_TOO_LARGE)`.
3. **Rate Limiting:**
   - Cloudflare Worker enforcement: Max **10 job creations (`POST /api/jobs`) per minute per IP address**.
4. **Token Security:**
   - High-entropy tokens (256-bit random hex) prevent brute-forcing `job_id` access.
   - Hash comparison (`SHA-256`) uses constant-time string comparison in Worker code to prevent timing attacks.

---

## 10. Testing, Rollout & Observability Strategy

### 10.1 Testing Plan
- **Unit Contracts:**
  - SHA-256 token hashing verification.
  - Job creation payload validation (size caps, missing headers).
  - 24-hour expiration calculation (`expires_at`).
- **Integration Tests:**
  - D1 state machine transitions (`queued` → `running` → `completed` / `failed`).
  - Cloudflare Workflow step retries and error fallback handling.
  - Verification of `X-Job-Token` authorization checks (`401 Unauthorized` on mismatch).
- **Client Reconciliation & Polling Tests:**
  - Mock tab reload with pending jobs in `localStorage`.
  - Deduplication assertion during result reconciliation.

### 10.2 Observability & Operational Metrics
Observability relies on metadata metrics without exposing user content:

- **Metrics Tracked:**
  - `ai_jobs_created_total` (Counter)
  - `ai_jobs_completed_total` (Counter)
  - `ai_jobs_failed_total` (Counter by `error_code`)
  - `ai_job_execution_duration_seconds` (Histogram)
  - `ai_job_polling_requests_total` (Counter by HTTP status)

### 10.3 Failure Modes & Mitigations

| Risk / Failure Mode | Root Cause | Mitigation Strategy |
| :--- | :--- | :--- |
| **D1 Storage Saturation** | High job volume | Hourly cron trigger purges expired jobs (`expires_at <= NOW`). Strict 24h retention limit. |
| **Orphaned LocalStorage** | User clears site data or changes browser | Jobs continue running on Cloudflare edge and expire naturally in 24 hours. No backend leakage. |
| **Duplicate Message Injection** | Client receives poll completion multiple times | Client reconciles messages using unique `job_id` key guard before appending to UI state. |

---

## 11. Acceptance Criteria & Implementation Verification Checklist

- [ ] **Exact File Authorization:** Specification created at `docs/superpowers/specs/2026-07-18-durable-background-ai-jobs-design.md` with no other files modified.
- [ ] **Immediate Input Re-enable:** UI clears prompt and enables user input immediately upon job creation.
- [ ] **Granular Status Display:** Per-message indicators for `queued`, `running`, `completed`, and `failed`.
- [ ] **Tab & Refresh Survival:** Active background jobs survive page reloads and tab closes, resuming status sync via `localStorage`.
- [ ] **Concurrent Execution:** Multiple background jobs can run concurrently without state collision.
- [ ] **Token Security & Hashing:** High-entropy capability tokens stored only in `localStorage` and sent via `X-Job-Token` header. D1 stores only SHA-256 hash.
- [ ] **Zero Logging:** No prompt text, completion text, or capability tokens appear in Cloudflare logs.
- [ ] **24-Hour Retention:** D1 schema enforces 24-hour TTL with an automated hourly cleanup cron trigger.
- [ ] **Failed State Retry:** Failed jobs display generic error UI; retry creates a new job with a fresh `job_id` and token.
- [ ] **No Cancellation in v1:** Confirmed cancellation is out of scope for v1.
- [ ] **Bounded Polling:** Bounded exponential backoff + immediate sync on page load and window focus (`visibilitychange`).
- [ ] **Model Selection:** Uses `@cf/zai-org/glm-4.7-flash` via Workers AI.
- [ ] **API Backwards Compatibility:** Preserves synchronous `POST /api/ai` endpoint alongside new `/api/jobs` async endpoints.
- [ ] **Implementation Scope Disclaimer:** Code file changes reserved for authorized implementation phase following review.

---

## 12. Verification & Historical Records

- Specification status: **Status: For User Review**
- Author: **AGY**
- Date: **2026-07-18**
