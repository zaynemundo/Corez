# Final Worker hardening report

## Changed surfaces

- `worker/market.js`
  - Enforces `POST` plus `application/json`, a 4 KiB declared and streamed body cap, exact request/conversion schemas, forbidden prototype-like keys, and explicit allowlist normalization.
  - Validates quote, time-series, and exchange-rate symbol identity against the exact requested provider pair after case/separator/whitespace canonicalization.
  - Requests time series with `timezone=UTC`, rejects contradictory series timezone metadata, and treats timezone-less bars as UTC only under that enforced request contract.
  - Validates provider currency metadata in both code and documented name forms, strict provider booleans, numeric fields, quote ranges, timestamps, strictly ascending unique series, requested-range windows, latest-point proximity, and quote/series price agreement.
  - Uses the injected clock for freshness validation. It rejects data before 2000 and more than five minutes in the future. Open quotes default to a 15-minute maximum; provider-declared delayed quotes receive `min(60 minutes, max(15 minutes, declared delay) + 2 minutes)` grace. This gives flag-only delayed quotes an exact 17-minute limit. Closed quotes remain valid up to four days, but their latest series point must be within 12 hours of the quote (open quotes remain 30 minutes). Every delayed response has a positive `delayMinutes` at least equal to rounded-up quote age.
  - Emits canonical `meta.servedAt` from the injected Worker clock on live, delayed, fresh-cache, coalesced, and stale responses; cached provenance is validated and rebound to the current serve time. Delayed and stale-open cache rebinds normalize `delayMinutes` to the larger of the retained positive delay and observed quote age.
  - Labels direct FX assets with the requested pair (for example `EUR/AED`) while retaining the canonical request identity (`fx-eur`, `EUR/USD`, conversion `EUR` to `AED`).
  - Removes amount/unit from provider and cache identity, rebinds the current validated request, and recomputes conversion values with checked positive finite arithmetic for fresh/stale cache hits and coalesced responses.
  - Coalesces identical same-isolate upstream requests and adds a 20-valid-requests-per-client/minute limiter before cache returns, with `Retry-After`, expired-record pruning, and a 1,000-client cap. Cached requests still avoid provider calls.
- `tests/market-worker-contract.mjs`
  - Aligns the injected test clock with provider fixtures and adds regression coverage for all boundaries above.

## Verification

- Explicit RED observed: content type initially returned `400` instead of `415`; UTC was absent from the provider request; provider-currency conflict, `servedAt`, cached quota, series ordering/range, checked arithmetic, delayed-positive-minute, declared-delay grace, hard-cap, and closed-latest-bound probes failed before their respective implementations.
- `node tests/market-worker-contract.mjs`: pass.
- `npm run test:market`: pass (312 Vitest tests across 3 files, plus Worker contract).
- `npm run test:cloudflare`: pass (the localhost response-contract step was run with the sandbox permission required to bind its temporary test server).
- `npx eslint worker/market.js tests/market-worker-contract.mjs`: pass.
- `git diff --check -- worker/market.js tests/market-worker-contract.mjs`: pass.

## Known limitations

- The quota is intentionally best-effort and per Worker isolate. It resets on cold start and is not a globally coordinated account/billing quota; Durable Objects or an edge rate-limiting product would be required for that without introducing local secrets/configuration.
- `CF-Connecting-IP` is authoritative on Cloudflare. The `X-Forwarded-For`/anonymous fallback is only a local or non-Cloudflare fallback and should not be treated as a strong client identity outside Cloudflare's trusted edge.
- In-flight coalescing is per isolate. Cloudflare Cache still provides cross-isolate reuse where available, but simultaneous cold misses in different isolates can each reach the provider.
- Freshness thresholds intentionally favor rejection over presenting questionable live data. Declared-delay grace never exceeds 60 minutes; closed quotes older than four days and closed series lagging their quote by more than 12 hours are unavailable. The product cache stale window remains exactly 15 minutes where quote-age trust bounds also permit serving it.
- Quote/series agreement allows a 25% relative difference to accommodate volatile assets and non-synchronous final bars; exact symbol/currency/meta checks remain the primary cross-asset defense.
