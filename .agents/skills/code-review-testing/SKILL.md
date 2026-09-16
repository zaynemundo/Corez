---
name: code-review-testing
description: Use when reviewing code changes or diffs, auditing logic and security, writing unit or contract tests, preventing regressions, or verifying fixes with clean exit codes. Not for new feature implementation - use `software-engineering` instead.
---

# Code Review & Automated Testing Skill

Use this skill whenever analyzing, auditing, reviewing code changes, debugging, or validating features. Code review MUST always go hand-in-hand with automated testing and empirical verification.

```
  ┌─────────────────────────────────────────────────────────────┐
  │  CODE REVIEW & VERIFICATION WORKFLOW                        │
  │  1. Code Inspection & Architectural Review                  │
  │  2. Static Analysis & Linting Audit                        │
  │  3. Boundary & Contract Test Suite Execution                 │
  │  4. Empirical Runtime Verification                           │
  └─────────────────────────────────────────────────────────────┘
```

---

## When to use

- Reviewing code changes or a diff for contract integrity, SOLID structure, and clean naming.
- Auditing security during review (secrets, injection, XSS, CORS, rate limits).
- Writing or extending Vitest/Jest unit and integration tests.
- Maintaining repository contract scripts and verifying DOM classes, ARIA attributes, and API status codes.
- Confirming a task resolved only after commands return clean exit codes (`0`).

## When not to use

- Implementing a new feature from scratch - use `software-engineering` instead.
- Diagnosing a runtime crash or build error end-to-end - use `auto-debugging` instead.
- Defining canonical secret, injection, and XSS policy - use `cursor-security-rules` instead.
- Designing backend resilience, caching, or rate limiting - use `backend-architecture` instead.

---

## 1. Code Inspection & Architectural Review

- **Contract Integrity**: Verify function signatures, prop types, and return values match callers across all invocation sites.
- **Root Cause Resolution**: NEVER resolve errors by masking symptoms, swallowing exceptions, returning dummy fallbacks, or disabling broken test assertions. Trace upstream data sources to resolve underlying bugs.
- **Code Cleanliness & SOLID**: Ensure single responsibility, modular component separation, reusable utility functions, and clean variable naming.

---

## 2. Code Quality & Security Audit Checklist

> **Canonical security:** Detailed secret/injection/XSS/destructive-op checks live in `cursor-security-rules` (canonical). This checklist references that contract and adds only review-specific gates. Run the canonical verification in `cursor-security-rules: Verification` for every review.

### Security & Privacy
- [ ] No API keys, credentials, or environment secrets exposed in public code, client bundles, or response logs — see `cursor-security-rules: §1`.
- [ ] User inputs sanitized before database queries, shell execution, or DOM insertion (`dangerouslySetInnerHTML`) — see `cursor-security-rules: §2 & §4`.
- [ ] Public error payloads sanitized (`safeErrorMessage` / `safeErrorDetail`) to prevent stack trace disclosures — see `backend-architecture: Level 1 §2`.
- [ ] Web/API safety (CORS, rate limiting, request size limits, HTTPS) verified — see `cursor-security-rules: §4` + `backend-architecture: Level 1 §3- §4`.

### Logic & Performance
- [ ] Asynchronous operations properly handled (`async/await`, `try/catch`, `AbortController` cancellation).
- [ ] Event listeners, timers, and subscriptions cleaned up on unmount (`useEffect` cleanup functions).
- [ ] Minimal re-renders in React via memoization (`useMemo`, `useCallback`) where computationally significant.

---

## 3. Automated Testing Guidelines

### Unit & Integration Tests (Vitest / Jest)
- Write tests that cover happy paths, edge cases, zero-values, null/undefined properties, and error states.
- Mock network APIs cleanly without altering component integration contracts.
- Ensure test suites are fast, deterministic, and isolated (no state leaks between tests).

### Contract Tests & Bash Verification Scripts
- Maintain repository contract scripts (e.g. `tests/ui-responsive-contract.sh`, `tests/cloudflare-worker-contract.mjs`, `tests/search-worker-contract.mjs`, `tests/workers-ai-rerank-embed-contract.mjs`).
- Verify CSS design tokens, DOM classes, ARIA attributes, responsive layout breakpoints, and API status codes against explicit contract specs.
- The worker suites run fully offline. When a change is already deployed, confirm the real surface read-only through the Cloudflare MCP servers (`cloudflare-observability` for Worker logs, `cloudflare-bindings` for D1/R2) — see `verify`.

---

## 4. Verification Protocol (Empirical Proof Required)

- **Rule**: NEVER declare a task resolved, a bug fixed, or a code review complete until empirical execution commands (build scripts, test scripts, linters) have been run and returned clean exit codes (`0`).
- **Commands** (this repo):
  ```bash
  # Run applicable tests and contract checks
  npm test
  npm run test:cloudflare   # worker + contract suites (node/bash scripts)

  # Validate build compilation and linting
  npm run build
  npm run lint
  ```

---

## Related skills

- `software-engineering` - implementation and refactoring workflow this skill reviews.
- `auto-debugging` - log-first root cause tracing when a test failure needs diagnosis.
- `cursor-security-rules` - canonical secret, injection, and XSS checks cited by the audit checklist.
- `git-superpowers` - commits verified work on `main` once review gates pass.
