# Task 3 Report: Browser market service and market-first response union

## Status

Complete and committed locally on `main` as `906c4f00 feat: route market prompts before hosted ai`.

## Scoped changes

- Added the `/api/market` browser client, typed market API error, signal forwarding, and structured unavailable-market normalization.
- Routed deterministic market intents before image and hosted-AI handling, returning the structured market response union and rethrowing aborts.
- Removed the hardcoded local market snapshot response and relabeled the explicitly requested financial terminal as `DEMO DATA` while preserving app generation.
- Added service, interception, error, cancellation, and explicit-dashboard regressions plus static proxy order/retired-claim checks.

## TDD evidence

- RED: `npx vitest run tests/market-service.test.js` failed because `src/services/marketService.js` did not exist.
- GREEN: the focused service suite passed 7/7 after the minimal browser client and interception implementation.

## Verification

- `npx vitest run tests/market-intent.test.js tests/market-service.test.js` — 19/19 passed.
- `bash tests/public-ai-proxy-contract.sh` — passed.
- `npm run build` — passed; 1,602 modules transformed.
- `npx eslint src/services/marketService.js src/services/aiService.js tests/market-service.test.js` — passed after declaring Node 22 web globals in the test.
- Scoped `git diff --check` — passed.
- Built assets contained none of the retired gold/Bitcoin quote strings or `live market snapshot` claim.
- Staged-file audit contained exactly the four brief-listed implementation/test files.

## Self-review and concerns

- Market endpoint failures cannot fall through to hosted AI or invent a price; they return a structured unavailable market result.
- Abort errors remain cancellation signals and are not converted into availability errors.
- The generated financial terminal remains intentionally demo content and still contains illustrative static values, now visibly labeled `DEMO DATA`.
- The required build modified generated `dist` files; those exact artifacts were restored/removed before staging to preserve the authorized file scope.
- No credential or environment-file content was inspected, printed, written, or transmitted.
- No fetch, push, deploy, or other remote action was performed.

## Review-fix follow-up

### Status and commit

Complete and committed locally on `main` as `0e4ec419 fix: harden market response routing`.

### Fix details

- Successful market responses now require a minimal normalized envelope: market kind, supported live/delayed/stale status, and a positive finite quote price.
- Empty, non-JSON, and structurally invalid 2xx bodies become safe `invalid_market_response` availability errors rather than successful empty market results.
- Abort errors from both the fetch operation and response-body parsing remain cancellation signals and are rethrown.
- Existing app intent classification now runs before market parsing, so explicit Bitcoin, gold, and AAPL dashboard creation prompts retain the hosted/local app-generation path without calling `/api/market`.
- The hardcoded financial preview now uses `COREZ Financial Demo Terminal` and `DEMO DATA`; static contracts reject future `Real-Time Financial Terminal` or `LIVE DATA` claims.

### Follow-up TDD evidence

- RED: the expanded service suite failed eight regressions: empty JSON, invalid JSON, `{}` success payload, body-read abort, malformed-success normalization, and three asset-dashboard app prompts.
- GREEN: `npx vitest run tests/market-intent.test.js tests/market-service.test.js` passed 27/27 after the bounded fixes.

### Follow-up verification

- Focused market intent/service suite — 27/27 passed.
- `bash tests/public-ai-proxy-contract.sh` — passed.
- `npm run build` — passed; 1,602 modules transformed.
- Scoped ESLint for the two services and market-service test — passed.
- Scoped `git diff --check` — passed.
- Built assets contained none of the retired quote/snapshot text, `Real-Time Financial Terminal`, or `LIVE DATA` claims.
- The pre-existing dirty `dist` state was snapshotted and restored byte-for-byte after build verification; no out-of-scope artifact change was introduced.
- Staged-file audit contained exactly the four authorized code/test paths.
- No credential/environment-file content was inspected or emitted, and no remote action was performed.

### Remaining concern

- Client validation is intentionally narrower than the Worker schema. It rejects unusable/empty successes without duplicating the full server contract; detailed nested validation remains the Worker boundary's responsibility.
