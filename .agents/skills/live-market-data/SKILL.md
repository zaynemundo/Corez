---
name: live-market-data
description: Use for current CoreZ quotes, conversions, and 1D, 1W, or 1M series for supported metals, crypto, stocks, and FX; require freshness metadata and never present indicative data as executable advice.
---

# Live Market Data

Use `live-utilities` for ordinary arithmetic, weather, time, and general unit
conversion. Use this skill only for the dedicated `/api/market` path.

## Supported catalog

- Metals: gold and silver; troy ounce, gram, or kilogram.
- Crypto: Bitcoin, Ethereum, and Solana.
- Stocks: Apple, NVIDIA, Tesla, Microsoft, Alphabet, and Amazon.
- FX bases and display currencies: USD, AED, EUR, GBP, and JPY.
- Series ranges: `1D`, `1W`, and `1M`.

The Worker uses Twelve Data and requires `TWELVE_DATA_API_KEY`. Do not route a
supported current quote through model memory when the market endpoint applies.

## Workflow

1. Normalize the asset, amount, unit, display currency, and range through
   `src/services/marketIntent.js`; reject ambiguous or historical/forecast
   requests from the direct-current path.
2. Call `/api/market` through `src/services/marketService.js`.
3. Validate that the echoed request, asset identity, quote currency, conversion
   arithmetic, timestamps, and series all match the request.
4. Display `live`, `delayed`, or `stale` status, quote timestamp, market-open
   state, source, and delay metadata.
5. If the provider is unavailable or not configured, report that state rather
   than substituting a remembered value.

## Guardrails

- Quotes are indicative, not executable offers or personalized financial
  advice.
- Never label delayed, closed-market, cached, or stale data as live.
- Do not forecast or answer unsupported assets through this endpoint.
- Keep conversion math deterministic and preserve units.

## Verification

Run `npm run test:market`.
