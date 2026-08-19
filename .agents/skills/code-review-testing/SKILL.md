---
name: code-review-testing
description: Specialized skill for thorough code review paired with automated unit/contract testing, static analysis, regression prevention, and empirical runtime verification.
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
- Maintain repository contract scripts (e.g. `tests/ui-responsive-contract.sh`, `tests/cloudflare-worker-contract.mjs`, `tests/search-worker-contract.mjs`, `tests/market-worker-contract.mjs`).
- Verify CSS design tokens, DOM classes, ARIA attributes, responsive layout breakpoints, and API status codes against explicit contract specs.

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
