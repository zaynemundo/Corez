# Inline Live Market Card Design

**Date:** 2026-07-22  
**Status:** Approved for implementation planning

## Purpose

COREZ currently allows a general hosted assistant response to answer market-price
questions before its local financial interceptor runs. The local fallback also
contains hardcoded values presented as live data. As a result, a user asking
"What is the price of gold?" may either receive a refusal or see an unverified
price.

This feature replaces that behavior with a native, provider-backed market card
rendered directly inside the chat. The card will support metals, currencies,
cryptocurrencies, and stocks through one normalized data contract.

## Goals

- Intercept supported market-price requests before the general AI path.
- Fetch current market data server-side from Twelve Data.
- Render a responsive, accessible native React card inside the conversation.
- Support prices, movement, charts, conversion, currency selection, and refresh.
- Keep provider credentials out of browser code, responses, logs, and Git.
- Never fabricate a quote or label a hardcoded value as live.
- Preserve ordinary chat behavior for non-market questions.

## Non-goals

- Trading, brokerage integration, order placement, or executable quotes.
- Portfolio tracking, watchlists, alerts, or account-specific financial advice.
- A full-screen financial terminal or iframe-based market application.
- Automatic selection of an unsupported or ambiguous symbol without user input.

## Approved product decisions

- The result appears as a native structured card inside chat.
- The initial asset families are precious metals, fiat currencies, crypto, and
  stocks supported by the provider and COREZ allowlist.
- Twelve Data is the single primary provider.
- USD is the default display currency. Users may select AED, EUR, GBP, and other
  currencies explicitly supported by the normalized catalog.
- The provider credential is stored as the Cloudflare Worker secret
  `TWELVE_DATA_API_KEY`; documentation uses placeholders only.
- Price responses are indicative market data, not executable quotes.

## Architecture

### 1. Market intent parsing

A deterministic parser runs before `generateHostedAIResponse`. It recognizes
supported price and conversion requests such as:

- "What is the price of gold?"
- "BTC price in AED"
- "How much is 10 grams of gold in EUR?"
- "AAPL quote"
- "Convert 100 EUR to AED"

The parser returns either a normalized market request or `null`. A normalized
request contains the asset class, canonical symbol, display currency, amount,
unit, and requested chart range where present. Company names and common aliases
map through an explicit catalog. Ambiguous or unsupported input does not guess;
it returns suggestions or continues through the normal AI path as appropriate.

### 2. Market API

The Cloudflare Worker exposes a same-origin `POST /api/market` endpoint. The
request body contains only normalized fields, for example:

```json
{
  "symbol": "XAU/USD",
  "currency": "USD",
  "amount": 1,
  "unit": "troy_ounce",
  "range": "1D"
}
```

The Worker validates every field against fixed symbol, currency, unit, range,
and size limits. It never accepts an arbitrary upstream URL. It calls Twelve
Data with the server-side secret, applies timeouts, validates the response, and
normalizes provider-specific fields before returning them to the browser.

### 3. Normalized response

Successful responses use a stable contract independent of provider field names:

```json
{
  "kind": "market",
  "status": "live",
  "asset": {
    "class": "metal",
    "symbol": "XAU/USD",
    "name": "Gold Spot"
  },
  "quote": {
    "price": 0,
    "currency": "USD",
    "change": 0,
    "changePercent": 0,
    "high": 0,
    "low": 0,
    "previousClose": 0,
    "marketOpen": true,
    "timestamp": "2026-07-22T00:00:00Z"
  },
  "series": {
    "range": "1D",
    "points": []
  },
  "conversion": {
    "amount": 1,
    "unit": "troy_ounce",
    "value": 0,
    "currency": "USD"
  },
  "meta": {
    "source": "Twelve Data",
    "cached": false,
    "stale": false
  }
}
```

The numeric zeroes above document types only; they are not fallback market
values. A success response is emitted only after validated provider data exists.

### 4. Chat message model

Assistant messages become a small discriminated union:

- `text`: the existing Markdown response.
- `market`: normalized data rendered by `MarketCard`.
- Existing historical text messages remain supported without migration.

The market request bypasses the hosted AI response entirely. This prevents the
model from refusing live-data access, paraphrasing a quote incorrectly, or
inventing missing values. The existing AI route remains unchanged for ordinary
questions.

### 5. UI components

`MarketCard` is a native React component rendered by `ChatMessage`. It is split
into focused parts where helpful:

- Identity and market-status header.
- Current price, absolute movement, and percentage movement.
- Compact chart with 1D, 1W, and 1M ranges.
- Asset and display-currency selectors.
- Quantity converter appropriate to the asset class.
- Timestamp, source, indicative-data disclosure, and refresh action.

Gold supports troy ounces, grams, and kilograms. Stocks and crypto support unit
quantities. Forex supports source and destination amounts. Controls stack on
small screens and preserve the current COREZ light/dark theme.

The card uses text and icons in addition to color for movement. All controls
have visible focus states, keyboard operation, accessible names, and suitable
screen-reader status announcements.

## Caching and refresh

- Successful normalized quotes are cached for 60 seconds by canonical request.
- Manual refresh is temporarily disabled after activation to prevent rapid
  repeated requests and still respects server-side rate controls.
- When the provider fails, the Worker may serve the most recent successful quote
  for up to 15 minutes only when it retains the original timestamp and marks the
  response `stale`.
- Quotes older than the stale window are not returned as market values.
- Chart-range and currency changes request a new canonical cache key.

## Error handling

The UI distinguishes these states:

- Missing server credential: market data is not configured.
- Unsupported or ambiguous asset: show safe suggestions.
- Provider timeout or outage: retry, or show clearly labeled stale data.
- Provider rate limit: show a retry time when available.
- Closed market or delayed feed: retain the provider timestamp and status.
- Invalid provider schema or non-numeric quote: reject the response.
- No trustworthy data: show "Market data temporarily unavailable" without a
  numeric fallback.

The general AI must not be used as a fallback source for a failed market quote.

## Security and privacy

- `TWELVE_DATA_API_KEY` exists only in the Cloudflare Worker secret store.
- The browser never sends, receives, logs, or bundles the credential.
- Provider errors are sanitized before logging or returning a response.
- Symbols, currencies, ranges, units, and amounts are allowlisted and bounded.
- The endpoint is same-origin and does not proxy arbitrary user-supplied URLs.
- No user portfolio, payment, or brokerage data is collected.
- Secret values are never committed to Git or written into test fixtures.

## Existing behavior to retire

The hardcoded local "live market snapshot" and price-query path that creates a
canvas financial terminal are removed from new market-price responses. The
terminal may remain available for explicit app-building prompts only if it no
longer labels hardcoded values as live. Existing stored text conversations stay
readable.

## Testing strategy

### Intent tests

- Gold, silver, fiat pairs, crypto names and tickers, company names and tickers.
- Requested currencies and supported quantity units.
- Ambiguous assets, unsupported symbols, unrelated questions, and prompt text
  that merely mentions a market without requesting market data.

### Worker contract tests

- Valid quotes and time series for each supported asset class.
- Input allowlists and bounds.
- Missing credential, timeout, provider error, rate limit, malformed JSON,
  missing fields, non-numeric values, and timestamp validation.
- Fresh cache, stale cache, expired cache, and cache-key separation.
- Sanitized logs and responses that cannot expose credentials.

### UI tests

- Market-card rendering and historical text-message compatibility.
- Price and movement formatting, range changes, selectors, conversions, and
  refresh behavior.
- Loading, live, delayed, closed, stale, rate-limited, and unavailable states.
- Mobile layout, keyboard interaction, focus order, accessible labels, and
  non-color movement indicators.

### End-to-end and repository verification

- "What is the price of gold?" renders a market card without calling the
  general hosted AI endpoint.
- A non-market question still follows the existing AI path.
- The provider credential is absent from source, built assets, responses, logs,
  snapshots, and Git diff.
- Run the full hosted AI contract suite, new market contracts, lint, build, and
  production-style Worker verification.

## Acceptance criteria

1. Supported market-price queries render a native inline card in chat.
2. Displayed numeric values originate from a validated provider response or a
   clearly labeled cache entry within the approved stale window.
3. USD is the default and supported display currencies include AED, EUR, and
   GBP.
4. Gold conversion supports troy ounces, grams, and kilograms.
5. The card works on mobile, with keyboard navigation and screen readers.
6. Failed live lookups never produce a guessed price or general-AI price answer.
7. The provider credential remains server-side and absent from repository data.
8. Existing non-market chat behavior and historical text messages remain intact.
9. Applicable tests, lint, and build complete successfully before deployment.

