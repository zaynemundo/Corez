---
name: backend-architecture
description: Specialized skill for back-end architecture with a strict hierarchy prioritizing Security (validation, secret isolation, CORS, rate limiting) over Functionality (API contracts, resilience, fallbacks, caching, database indexing).
---

# Back-End Architecture & Design Hierarchy Skill

Use this skill whenever designing, building, reviewing, or refactoring APIs, serverless functions, Cloudflare Workers, Node.js services, database schemas, and microservices.

## Strict Design Hierarchy

```
  ┌─────────────────────────────────────────────────────────┐
  │  LEVEL 1: SECURITY (Strict Guardrails & Zero-Trust)     │
  ├─────────────────────────────────────────────────────────┤
  │  LEVEL 2: FUNCTIONALITY & CONTRACT RELIABILITY          │
  ├─────────────────────────────────────────────────────────┤
  │  LEVEL 3: PERFORMANCE, CACHING & SCALABILITY            │
  └─────────────────────────────────────────────────────────┘
```

---

## Level 1: Security (Highest Priority)

> **Canonical security:** General secret, injection, destructive-op, and supply-chain rules live in `cursor-security-rules` (canonical). This Level deduplicates that contract and adds only backend-specific enforcement. When general rules change, update `cursor-security-rules`; when backend API rules change, update here and keep cross-links in sync.

### 1. Input Validation & Schema Sanitization
- Validate all incoming parameters, query strings, headers, and request bodies before executing database or upstream service calls.
- Enforce strict JSON schema parsing and reject unexpected properties or malformed types (`400 Bad Request`).
- Escape or sanitize input strings to eliminate SQL injection, XSS, command injection, and SSRF vulnerabilities — see `cursor-security-rules: §2 & §4` for injection/XSS canonical checks.

### 2. Secret Isolation & Zero-Leakage Logs
- Store environment keys, database URIs, API tokens, and secrets strictly in server/worker environment variables or secret vaults — canonical rules in `cursor-security-rules: §1`.
- Never mirror raw request headers, bearer tokens, authorization headers, or database strings into public response payloads or client-facing logs.
- Use explicit error sanitization wrappers (`safeErrorMessage(err)` / `safeErrorDetail`) to suppress stack traces and database internal error details in production responses (see `worker/utils.js`).

### 3. Authentication, Authorization & Rate Limiting
- Authenticate requests using stateless tokens (JWT, OAuth2, signed API keys) with time-bound expirations.
- Enforce tenant isolation in all database queries (`WHERE tenant_id = ?`) to prevent unauthorized cross-tenant data access.
- Implement rate limiting per IP / API key (e.g., `createRateLimiter` via KV, as used on `/api/ai`, `/api/image`, `/api/publish`) to protect endpoints from denial-of-service or brute force attacks — see `cursor-security-rules: §4`.

### 4. CORS & Network Defense
- Enforce explicit CORS origins (`Access-Control-Allow-Origin: https://yourdomain.com`). Avoid wildcard `*` headers on sensitive write/mutational routes.
- Restrict permitted HTTP methods (`GET`, `POST`, `OPTIONS`) and request headers (`Content-Type`, `Authorization`) — canonical web safety in `cursor-security-rules: §4`.

---

## Level 2: Functionality & Reliability

### 1. Robust API Contracts & Standardized Responses
- Return structured JSON payloads with uniform top-level keys across success and error responses:
  ```json
  {
    "success": true,
    "data": { ... },
    "meta": { "timestamp": "2026-07-23T10:00:00Z", "source": "primary" }
  }
  ```
- Use semantically accurate HTTP status codes:
  - `200 OK` / `201 Created` / `204 No Content` for success
  - `400 Bad Request` / `401 Unauthorized` / `403 Forbidden` / `404 Not Found` for client issues
  - `500 Internal Error` / `502 Bad Gateway` / `503 Service Unavailable` for upstream failures

### 2. Upstream Failover & Resilience
- Implement primary-to-secondary fallback routing for AI LLM APIs and critical third-party dependencies.
- Set explicit request timeouts (e.g., `AbortController` signal with 8–15s limit) to prevent hung main event loops.
- Use retry mechanisms with exponential backoff and jitter for transient 502/503 network glitches.

### 3. Idempotency & Transactional Integrity
- Ensure state-changing operations (`POST`, `PUT`, `DELETE`) support idempotency keys to prevent duplicate transactions upon client retries.
- Wrap multi-step database mutations in atomic transactions with explicit rollback on error.

---

## Level 3: Performance & Scalability

### 1. Stateless Execution & Distributed Caching
- Design APIs to be stateless so Cloudflare Workers or server instances can scale horizontally.
- Cache read-heavy or deterministic responses in edge KV, Redis, or HTTP `Cache-Control` headers (e.g., `public, max-age=300, s-maxage=3600`).

### 2. Database & Search Optimization
- Add indexes on frequently queried foreign keys, filter attributes, and timestamp sort fields.
- Avoid N+1 query patterns; use batch joins or single-query data fetching.

---

## Repository integration (CoreZ worker)

- Entry point is `worker/swarm-index.js`; route dispatch lives in `worker/index.js`. Wrap storage handlers with `runJsonSafe`, return uniform payloads via `jsonResponse`, parse bodies with `readBoundedJson`, and reuse `safeErrorDetail` for sanitized error messages — all from `worker/utils.js`.
- Validate every path segment / storage key against `SAFE_STORAGE_SEGMENT` (letters, digits, dots, dashes, underscores; no slashes or leading dots) before touching R2 — this blocks `../` traversal on `/api/apps`, `/api/memory`, and `/api/assets`.
- Rate limit public endpoints with `createRateLimiter` (see `/api/publish`, `/api/ai`, `/api/image`) and return HTTP 429 with `Retry-After`.
- Env bindings: `ASSET_BUCKET` (R2, required for storage/memory/publish endpoints), `GAME_ROOMS` (Durable Object for multiplayer), `ASSETS` (static SPA).
- Verify changes with `npm test` plus the worker contract suite: `npm run test:cloudflare` (includes `tests/cloudflare-worker-contract.mjs`).
