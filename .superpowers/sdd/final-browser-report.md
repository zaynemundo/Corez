# Final browser market response hardening

## Files changed

- `src/services/marketService.js`
- `tests/market-service.test.js`

No Git index, commit, remote, secret, or other tracked file was touched by this task.

## Implementation

- Replaced the minimal `kind`/`status`/positive-price success check with a provider-independent validator for the complete normalized Worker success envelope.
- Bound the response request and asset identity to the exact normalized request submitted by the browser and the shared market catalog.
- Required direct FX assets to use the requested `FROM/TO` symbol, canonical `fx-<from>` identity, forex class, and exact `FROM to TO` name.
- Validated supported currency/range/unit fields, finite quote and conversion numbers, complete movement/high/low/previous-close fields, boolean market status, and conversion arithmetic.
- Anchored quote/series plausibility to the Worker's canonical `meta.servedAt`, eliminating browser-clock skew. Open quotes are bounded to 15 minutes, closed quotes to four days, and future skew to five minutes.
- Required 1–500 strictly ascending unique series points within the request-specific 1D/1W/1M windows, latest-point proximity appropriate to open/closed markets, and latest-value agreement with the quote.
- Enforced exact Twelve Data attribution and coherent live/delayed/stale, cache, delay, stale, and served-at metadata.
- Sanitized every non-2xx JSON error through status/code allowlists and canonical messages; arbitrary server code/message text is never returned, and retry delays are retained only when they are integer seconds in the safe bound.
- Rejected underflowed, overflowed, zero, or otherwise non-finite expected conversion arithmetic before applying a relative-plus-small-absolute comparison tolerance.
- Aligned delayed open quotes to the Worker rule: `max(15 minutes, delayMinutes + 2 minutes)`, capped at 60 minutes. Closed-market latest series points are bounded to 12 hours from the quote.
- Required normalized delayed metadata to report at least the full ceil-rounded servedAt-relative quote age; the two-minute grace remains only an upstream acceptance allowance.
- Accepted stale open quotes beyond 15 minutes only when cached/stale metadata carries a positive delay covering the observed age, while preserving closed-market stale behavior.
- Matched Worker stale rebind semantics exactly: open stale quotes within 15 minutes may omit delay metadata; when delay is present it must be positive and cover observed age. Open stale quotes beyond 15 minutes require that sufficient delay metadata. Closed stale responses remain unchanged.
- Removed the fixed absolute conversion tolerance floor. Positive finite expected values now use relative-only comparison, including very small magnitudes.
- Preserved existing AbortError propagation and safe handling of successful non-JSON bodies and non-JSON HTTP errors.
- Expanded happy-path fixtures to the complete envelope and added table-driven malformed/mismatch coverage plus the AI interception regression proving mismatched successes become `invalid_market_response` before persistence/rendering.

## TDD evidence

- RED: `npx vitest run tests/market-service.test.js` produced 31 expected failures because malformed and mismatched complete envelopes were accepted by the old minimal check.
- Review RED: the expanded suite produced 16 expected failures for spoofed attribution/FX names, absent serve time, malformed series, servedAt-relative age, browser clock skew, and unsafe HTTP error text/retry values.
- Third review RED: six expected failures proved delayed-open boundaries, the closed-series 12-hour bound, conversion underflow/overflow, and small-value relative tolerance were not yet enforced.
- Final exact RED: three expected failures proved delayed understatement was accepted, feasible stale-open delayed cache data was rejected, and the absolute tolerance floor accepted a large relative error.
- Final stale-open RED: the over-strict prior rule rejected valid five- and ten-minute open stale responses without delay metadata. The final probes also preserve rejection of meta-1 at ten minutes, acceptance of meta-10, and rejection beyond 15 minutes without delay.
- GREEN: the focused service suite passed after the validator implementation.

## Final verification

- `npx vitest run tests/market-service.test.js tests/market-card.test.jsx` — PASS, 140/140 tests (110 service, 30 card).
- `node tests/market-worker-contract.mjs` — PASS (`Market Worker contract passed.`), including the shared `servedAt` envelope.
- `npx eslint src/services/marketService.js tests/market-service.test.js` — PASS, zero diagnostics.
- `git diff --check -- src/services/marketService.js tests/market-service.test.js` — PASS.
- `npm run test:market` — PASS: 323/323 Vitest cases (183 intent, 110 service, 30 card) and the Market Worker contract.

## Concerns

- No browser-contract concern remains from this review pass.
