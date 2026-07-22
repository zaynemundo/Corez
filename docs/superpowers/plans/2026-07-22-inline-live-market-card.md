# Inline Live Market Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render trustworthy provider-backed market quotes and conversions as native cards inside COREZ chat before the general AI path can answer a market-price request.

**Architecture:** A deterministic browser-side parser converts supported natural-language prompts into normalized market requests. A same-origin Cloudflare Worker endpoint validates those requests, calls Twelve Data with a server-only secret, normalizes and caches the result, and returns a provider-independent contract. `generateAIResponse` returns either the existing text response or a structured market response that `App`, `ChatMessage`, and `MarketCard` preserve and render.

**Tech Stack:** React 18, Vite 6, JavaScript ES modules, Cloudflare Workers, Twelve Data REST API, Vitest, jsdom, Testing Library, existing Node and Bash contract tests.

## Global Constraints

- The card is rendered natively inside chat; do not use an iframe or canvas preview.
- Twelve Data is the sole primary provider for this feature.
- Store the provider credential only as the Cloudflare Worker secret `TWELVE_DATA_API_KEY`; never commit or echo its value.
- USD is the default display currency; initially allow USD, AED, EUR, GBP, and JPY.
- Initial catalog: gold, silver, Bitcoin, Ethereum, Solana, Apple, NVIDIA, Tesla, Microsoft, Alphabet, and Amazon, plus direct conversion among the supported display currencies.
- Cache successful responses for 60 seconds and permit clearly labeled stale responses for at most 15 minutes.
- Never use a hardcoded, guessed, or general-AI-generated numeric market price.
- Retain existing text-message history and all non-market AI behavior.
- Market values are indicative and must not be described as executable quotes.
- Node.js remains at version 22 or later.

---

## File structure

**Create**

- `src/services/marketCatalog.js` — canonical asset/currency metadata and alias lookup.
- `src/services/marketIntent.js` — deterministic prompt-to-request parsing.
- `src/services/marketService.js` — browser client for `/api/market` and market error normalization.
- `src/components/MarketCard.jsx` — inline card, chart, selectors, converter, status, and refresh UI.
- `worker/market.js` — request validation, Twelve Data adapter, normalization, cache, stale fallback, and endpoint handler.
- `tests/market-intent.test.js` — parser and catalog unit tests.
- `tests/market-worker-contract.mjs` — Worker endpoint, provider, cache, and credential contract tests.
- `tests/market-service.test.js` — browser market-service and response-union tests.
- `tests/market-card.test.jsx` — rendering, conversion, interaction, and accessibility tests.

**Modify**

- `package.json` and `package-lock.json` — Vitest/jsdom/Testing Library dependencies and market test scripts.
- `worker/index.js` — route `POST /api/market` to the isolated handler.
- `src/services/aiService.js` — market-first response union and removal of the hardcoded market snapshot path.
- `src/App.jsx` — persist structured market messages and update them on refresh.
- `src/components/ChatMessage.jsx` — dispatch market messages to `MarketCard`.
- `src/index.css` — responsive, theme-aware, reduced-motion, and accessible card styles.
- `tests/cloudflare-worker-contract.mjs` — assert `/api/market` is a known Worker route.
- `tests/public-ai-proxy-contract.sh` — assert market interception precedes hosted AI and hardcoded price output is absent.
- `tests/ui-responsive-contract.sh` — add static responsive/accessibility market-card checks.
- `README.md` — document the market endpoint and secret variable name without a value.

---

### Task 1: Deterministic market catalog and intent parser

**Files:**
- Create: `src/services/marketCatalog.js`
- Create: `src/services/marketIntent.js`
- Create: `tests/market-intent.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `MARKET_ASSETS`, `DISPLAY_CURRENCIES`, `findAssetByAlias(value)`, and `getAssetById(id)` from `marketCatalog.js`.
- Produces: `parseMarketIntent(prompt)` returning `null` or `{ assetId, symbol, assetClass, currency, amount, unit, range, conversion }`.
- Consumes: no application service; this task is a pure deterministic boundary.

- [ ] **Step 1: Install the component-test dependencies and add scripts**

Run:

```bash
npm install --save-dev vitest@^3.2.4 jsdom@^26.1.0 @testing-library/react@^16.3.0 @testing-library/user-event@^14.6.1 @testing-library/jest-dom@^6.6.3
```

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "test:market": "vitest run tests/market-intent.test.js tests/market-service.test.js tests/market-card.test.jsx && node tests/market-worker-contract.mjs",
    "test:market:watch": "vitest tests/market-intent.test.js tests/market-service.test.js tests/market-card.test.jsx"
  }
}
```

Expected: `package.json` and `package-lock.json` contain the pinned compatible dependency ranges; no production dependency is added.

- [ ] **Step 2: Write failing parser tests**

Create `tests/market-intent.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { DISPLAY_CURRENCIES, findAssetByAlias } from '../src/services/marketCatalog.js';
import { parseMarketIntent } from '../src/services/marketIntent.js';

describe('market catalog', () => {
  it('resolves names and tickers to one canonical asset', () => {
    expect(findAssetByAlias('gold').id).toBe('gold');
    expect(findAssetByAlias('XAU').symbol).toBe('XAU/USD');
    expect(findAssetByAlias('nvidia').symbol).toBe('NVDA');
    expect(findAssetByAlias('unknown')).toBeNull();
  });

  it('uses the approved currency allowlist', () => {
    expect(DISPLAY_CURRENCIES).toEqual(['USD', 'AED', 'EUR', 'GBP', 'JPY']);
  });
});

describe('parseMarketIntent', () => {
  it.each([
    ['What is the price of gold?', 'gold', 'USD', 1, 'troy_ounce'],
    ['BTC price in AED', 'bitcoin', 'AED', 1, 'unit'],
    ['How much is 10 grams of gold in EUR?', 'gold', 'EUR', 10, 'gram'],
    ['AAPL quote', 'apple', 'USD', 1, 'unit'],
    ['NVIDIA stock price', 'nvidia', 'USD', 1, 'unit']
  ])('normalizes %s', (prompt, assetId, currency, amount, unit) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId, currency, amount, unit });
  });

  it('parses a direct fiat conversion without guessing an asset', () => {
    expect(parseMarketIntent('Convert 100 EUR to AED')).toEqual({
      assetId: 'fx-eur',
      symbol: 'EUR/USD',
      assetClass: 'forex',
      currency: 'AED',
      amount: 100,
      unit: 'unit',
      range: '1D',
      conversion: { from: 'EUR', to: 'AED' }
    });
  });

  it.each([
    'Tell me about gold mining history',
    'Build a stock dashboard',
    'What is photosynthesis?',
    'Price of an unknownium token'
  ])('does not intercept %s', (prompt) => {
    expect(parseMarketIntent(prompt)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the parser test to verify it fails**

Run:

```bash
npx vitest run tests/market-intent.test.js
```

Expected: FAIL because `marketCatalog.js` and `marketIntent.js` do not exist.

- [ ] **Step 4: Implement the approved catalog**

Create `src/services/marketCatalog.js` with this complete data shape and lookup behavior:

```js
export const DISPLAY_CURRENCIES = Object.freeze(['USD', 'AED', 'EUR', 'GBP', 'JPY']);

export const MARKET_ASSETS = Object.freeze([
  { id: 'gold', name: 'Gold Spot', symbol: 'XAU/USD', assetClass: 'metal', nativeCurrency: 'USD', defaultUnit: 'troy_ounce', aliases: ['gold', 'xau', 'xau/usd'] },
  { id: 'silver', name: 'Silver Spot', symbol: 'XAG/USD', assetClass: 'metal', nativeCurrency: 'USD', defaultUnit: 'troy_ounce', aliases: ['silver', 'xag', 'xag/usd'] },
  { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC/USD', assetClass: 'crypto', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['bitcoin', 'btc', 'btc/usd'] },
  { id: 'ethereum', name: 'Ethereum', symbol: 'ETH/USD', assetClass: 'crypto', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['ethereum', 'ether', 'eth', 'eth/usd'] },
  { id: 'solana', name: 'Solana', symbol: 'SOL/USD', assetClass: 'crypto', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['solana', 'sol', 'sol/usd'] },
  { id: 'apple', name: 'Apple', symbol: 'AAPL', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['apple', 'aapl'] },
  { id: 'nvidia', name: 'NVIDIA', symbol: 'NVDA', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['nvidia', 'nvda'] },
  { id: 'tesla', name: 'Tesla', symbol: 'TSLA', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['tesla', 'tsla'] },
  { id: 'microsoft', name: 'Microsoft', symbol: 'MSFT', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['microsoft', 'msft'] },
  { id: 'alphabet', name: 'Alphabet', symbol: 'GOOGL', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['alphabet', 'google', 'googl'] },
  { id: 'amazon', name: 'Amazon', symbol: 'AMZN', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['amazon', 'amzn'] },
  { id: 'fx-usd', name: 'US Dollar', symbol: 'USD/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['usd', 'us dollar', 'dollar'] },
  { id: 'fx-aed', name: 'UAE Dirham', symbol: 'AED/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['aed', 'uae dirham', 'dirham'] },
  { id: 'fx-eur', name: 'Euro', symbol: 'EUR/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['eur', 'euro'] },
  { id: 'fx-gbp', name: 'British Pound', symbol: 'GBP/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['gbp', 'british pound', 'pound sterling'] },
  { id: 'fx-jpy', name: 'Japanese Yen', symbol: 'JPY/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['jpy', 'japanese yen', 'yen'] }
]);

const byId = new Map(MARKET_ASSETS.map((asset) => [asset.id, asset]));
const byAlias = new Map(MARKET_ASSETS.flatMap((asset) => asset.aliases.map((alias) => [alias, asset])));

export function getAssetById(id) {
  return byId.get(String(id || '').toLowerCase()) || null;
}

export function findAssetByAlias(value) {
  return byAlias.get(String(value || '').trim().toLowerCase()) || null;
}
```

- [ ] **Step 5: Implement the parser, rerun tests, and commit**

Create `src/services/marketIntent.js` with these exact rules:

```js
import { DISPLAY_CURRENCIES, MARKET_ASSETS } from './marketCatalog.js';

const REQUEST_WORDS = /\b(price|quote|rate|worth|cost|convert|conversion|how much)\b/i;
const MARKET_CONTEXT = /\b(stock|crypto|market|spot|forex|currency)\b/i;
const RANGE_PATTERN = /\b(1d|1w|1m)\b/i;
const NUMBER_PATTERN = /\b(\d+(?:\.\d+)?)\b/;
const GOLD_UNITS = [
  [/\b(?:grams?|g)\b/i, 'gram'],
  [/\b(?:kilograms?|kilos?|kg)\b/i, 'kilogram'],
  [/\b(?:troy ounces?|ounces?|oz)\b/i, 'troy_ounce']
];

function findMentionedAsset(prompt) {
  const lower = prompt.toLowerCase();
  return MARKET_ASSETS
    .flatMap((asset) => asset.aliases.map((alias) => ({ asset, alias })))
    .sort((a, b) => b.alias.length - a.alias.length)
    .find(({ alias }) => new RegExp(`\\b${alias.replace('/', '\\/').replace(/\s+/g, '\\s+')}\\b`, 'i').test(lower))?.asset || null;
}

function requestedCurrency(prompt, fallback = 'USD') {
  const matches = [...prompt.toUpperCase().matchAll(/\b(USD|AED|EUR|GBP|JPY)\b/g)].map((match) => match[1]);
  return matches.at(-1) || fallback;
}

export function parseMarketIntent(prompt) {
  const clean = String(prompt || '').trim();
  if (!clean || (!REQUEST_WORDS.test(clean) && !MARKET_CONTEXT.test(clean))) return null;

  const conversion = clean.match(/\b(?:convert\s+)?(\d+(?:\.\d+)?)\s*(USD|AED|EUR|GBP|JPY)\s+(?:to|in)\s+(USD|AED|EUR|GBP|JPY)\b/i);
  if (conversion) {
    const from = conversion[2].toUpperCase();
    const to = conversion[3].toUpperCase();
    if (!DISPLAY_CURRENCIES.includes(from) || !DISPLAY_CURRENCIES.includes(to)) return null;
    return { assetId: `fx-${from.toLowerCase()}`, symbol: `${from}/USD`, assetClass: 'forex', currency: to, amount: Number(conversion[1]), unit: 'unit', range: '1D', conversion: { from, to } };
  }

  const asset = findMentionedAsset(clean);
  if (!asset) return null;
  const explicitAmount = clean.match(NUMBER_PATTERN);
  const unit = asset.assetClass === 'metal'
    ? GOLD_UNITS.find(([pattern]) => pattern.test(clean))?.[1] || asset.defaultUnit
    : asset.defaultUnit;
  const range = clean.match(RANGE_PATTERN)?.[1]?.toUpperCase() || '1D';

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    assetClass: asset.assetClass,
    currency: requestedCurrency(clean),
    amount: explicitAmount ? Number(explicitAmount[1]) : 1,
    unit,
    range,
    conversion: null
  };
}
```

Run:

```bash
npx vitest run tests/market-intent.test.js
git add package.json package-lock.json src/services/marketCatalog.js src/services/marketIntent.js tests/market-intent.test.js
git commit -m "feat: parse supported market requests"
```

Expected: parser tests PASS; the commit contains no credential value.

---

### Task 2: Secure Twelve Data Worker endpoint and cache

**Files:**
- Create: `worker/market.js`
- Create: `tests/market-worker-contract.mjs`
- Modify: `worker/index.js`
- Modify: `tests/cloudflare-worker-contract.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: request shape from `parseMarketIntent`.
- Produces: `handleMarket(request, env)` and `POST /api/market`.
- Produces success: `{ kind: 'market', status, request, asset, quote, series, conversion, meta }`.
- Produces failure: `{ error: { code, message, retryAfter? } }` with an appropriate non-200 status.
- Test-only dependencies may be injected as `env.__MARKET_FETCH` and `env.__MARKET_CACHE`; production never defines them.

- [ ] **Step 1: Write the failing Worker contract**

Create `tests/market-worker-contract.mjs` using the actual Worker entrypoint. The fake provider must cover quote, time-series, and exchange-rate calls:

```js
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

function fakeCache() {
  const values = new Map();
  return {
    async match(request) { return values.get(request.url)?.clone(); },
    async put(request, response) { values.set(request.url, response.clone()); }
  };
}

function marketEnv(overrides = {}) {
  return {
    TWELVE_DATA_API_KEY: 'test-only-key',
    __MARKET_CACHE: fakeCache(),
    __MARKET_FETCH: async (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('apikey'), 'test-only-key');
      if (parsed.pathname.endsWith('/quote')) return Response.json({ symbol: 'XAU/USD', name: 'Gold Spot', currency: 'USD', close: '2412.50', open: '2400.00', high: '2420.00', low: '2395.00', previous_close: '2390.00', change: '22.50', percent_change: '0.9414', timestamp: 1784703600, is_market_open: true });
      if (parsed.pathname.endsWith('/time_series')) return Response.json({ values: [{ datetime: '2026-07-22 07:00:00', close: '2400.00' }, { datetime: '2026-07-22 07:05:00', close: '2412.50' }] });
      if (parsed.pathname.endsWith('/exchange_rate')) return Response.json({ symbol: 'USD/AED', rate: '3.6725', timestamp: 1784703600 });
      return new Response('not found', { status: 404 });
    },
    ...overrides
  };
}

async function post(body, env = marketEnv()) {
  return worker.fetch(new Request('https://corez.test/api/market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
}

const live = await post({ assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null });
assert.equal(live.status, 200);
assert.deepEqual(await live.json(), {
  kind: 'market',
  status: 'live',
  request: { assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null },
  asset: { id: 'gold', class: 'metal', symbol: 'XAU/USD', name: 'Gold Spot' },
  quote: { price: 2412.5, currency: 'USD', change: 22.5, changePercent: 0.9414, high: 2420, low: 2395, previousClose: 2390, marketOpen: true, timestamp: '2026-07-22T07:00:00.000Z' },
  series: { range: '1D', points: [{ timestamp: '2026-07-22T07:00:00.000Z', value: 2400 }, { timestamp: '2026-07-22T07:05:00.000Z', value: 2412.5 }] },
  conversion: { amount: 1, unit: 'troy_ounce', value: 2412.5, currency: 'USD' },
  meta: { source: 'Twelve Data', cached: false, stale: false }
});

assert.equal((await post({ symbol: 'https://evil.test' })).status, 400);
assert.equal((await post({ assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null }, marketEnv({ TWELVE_DATA_API_KEY: undefined }))).status, 503);
console.log('Market Worker contract passed.');
```

Append these concrete cases. Reuse one environment for cache cases so its fake
cache survives between requests:

```js
const method = await worker.fetch(new Request('https://corez.test/api/market'), marketEnv());
assert.equal(method.status, 405);

const malformed = await worker.fetch(new Request('https://corez.test/api/market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }), marketEnv());
assert.equal(malformed.status, 400);
assert.equal((await malformed.json()).error.code, 'invalid_json');

const converted = await post({ assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'AED', amount: 10, unit: 'gram', range: '1D', conversion: null });
const convertedBody = await converted.json();
assert.equal(convertedBody.quote.currency, 'AED');
assert.equal(convertedBody.quote.price, 8859.90625);
assert.equal(convertedBody.conversion.value, 2848.526004655531);

let providerMode = 'live';
let now = 1_000_000;
let providerCalls = 0;
const cacheEnvironment = marketEnv({
  __MARKET_NOW: () => now,
  __MARKET_FETCH: async (url) => {
    providerCalls += 1;
    if (providerMode === 'rate-limit') return new Response('', { status: 429, headers: { 'Retry-After': '30' } });
    if (providerMode === 'malformed') return Response.json({ close: 'not-a-number' });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/quote')) return Response.json({ symbol: 'XAU/USD', name: 'Gold Spot', currency: 'USD', close: '2412.50', open: '2400.00', high: '2420.00', low: '2395.00', previous_close: '2390.00', change: '22.50', percent_change: '0.9414', timestamp: 1784703600, is_market_open: true });
    if (parsed.pathname.endsWith('/time_series')) return Response.json({ values: [{ datetime: '2026-07-22 07:00:00', close: '2400.00' }, { datetime: '2026-07-22 07:05:00', close: '2412.50' }] });
    return Response.json({ symbol: 'USD/AED', rate: '3.6725', timestamp: 1784703600 });
  }
});
const cacheRequest = { assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null };
assert.equal((await post(cacheRequest, cacheEnvironment)).status, 200);
const firstCallCount = providerCalls;
now += 30_000;
assert.equal((await (await post(cacheRequest, cacheEnvironment)).json()).meta.cached, true);
assert.equal(providerCalls, firstCallCount);

const beforeDistinctAmount = providerCalls;
const differentAmount = await (await post({ ...cacheRequest, amount: 2 }, cacheEnvironment)).json();
assert.equal(differentAmount.conversion.amount, 2);
assert.ok(providerCalls > beforeDistinctAmount);

providerMode = 'rate-limit';
now += 90_000;
const stale = await (await post(cacheRequest, cacheEnvironment)).json();
assert.equal(stale.status, 'stale');
assert.equal(stale.meta.stale, true);

now += 16 * 60_000;
const expired = await post(cacheRequest, cacheEnvironment);
assert.equal(expired.status, 429);
assert.deepEqual(await expired.json(), { error: { code: 'rate_limited', message: 'Market data rate limit reached.', retryAfter: 30 } });

providerMode = 'malformed';
const malformedProvider = await post({ ...cacheRequest, assetId: 'silver', symbol: 'XAG/USD' }, cacheEnvironment);
assert.equal(malformedProvider.status, 502);
assert.equal((await malformedProvider.json()).error.code, 'provider_unavailable');
```

- [ ] **Step 2: Run the contract to verify it fails**

Run:

```bash
node tests/market-worker-contract.mjs
```

Expected: FAIL because `/api/market` returns 404.

- [ ] **Step 3: Implement the isolated Worker handler**

Create `worker/market.js` with these concrete boundaries:

```js
const API_BASE = 'https://api.twelvedata.com';
const FRESH_MS = 60_000;
const STALE_MS = 15 * 60_000;
const ALLOWED_CURRENCIES = new Set(['USD', 'AED', 'EUR', 'GBP', 'JPY']);
const ALLOWED_RANGES = new Map([['1D', { interval: '5min', outputsize: 78 }], ['1W', { interval: '1h', outputsize: 168 }], ['1M', { interval: '4h', outputsize: 180 }]]);
const ASSETS = new Map([
  ['gold', { id: 'gold', class: 'metal', symbol: 'XAU/USD', name: 'Gold Spot' }],
  ['silver', { id: 'silver', class: 'metal', symbol: 'XAG/USD', name: 'Silver Spot' }],
  ['bitcoin', { id: 'bitcoin', class: 'crypto', symbol: 'BTC/USD', name: 'Bitcoin' }],
  ['ethereum', { id: 'ethereum', class: 'crypto', symbol: 'ETH/USD', name: 'Ethereum' }],
  ['solana', { id: 'solana', class: 'crypto', symbol: 'SOL/USD', name: 'Solana' }],
  ['apple', { id: 'apple', class: 'stock', symbol: 'AAPL', name: 'Apple' }],
  ['nvidia', { id: 'nvidia', class: 'stock', symbol: 'NVDA', name: 'NVIDIA' }],
  ['tesla', { id: 'tesla', class: 'stock', symbol: 'TSLA', name: 'Tesla' }],
  ['microsoft', { id: 'microsoft', class: 'stock', symbol: 'MSFT', name: 'Microsoft' }],
  ['alphabet', { id: 'alphabet', class: 'stock', symbol: 'GOOGL', name: 'Alphabet' }],
  ['amazon', { id: 'amazon', class: 'stock', symbol: 'AMZN', name: 'Amazon' }],
  ['fx-usd', { id: 'fx-usd', class: 'forex', symbol: 'USD/USD', name: 'US Dollar' }],
  ['fx-aed', { id: 'fx-aed', class: 'forex', symbol: 'AED/USD', name: 'UAE Dirham' }],
  ['fx-eur', { id: 'fx-eur', class: 'forex', symbol: 'EUR/USD', name: 'Euro' }],
  ['fx-gbp', { id: 'fx-gbp', class: 'forex', symbol: 'GBP/USD', name: 'British Pound' }],
  ['fx-jpy', { id: 'fx-jpy', class: 'forex', symbol: 'JPY/USD', name: 'Japanese Yen' }]
]);

function apiError(status, code, message, retryAfter) {
  return Response.json({ error: { code, message, ...(retryAfter ? { retryAfter } : {}) } }, { status });
}

function number(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid provider field: ${field}`);
  return parsed;
}

function positiveNumber(value, field) {
  const parsed = number(value, field);
  if (parsed <= 0) throw new Error(`Invalid provider field: ${field}`);
  return parsed;
}

function validate(body) {
  const asset = ASSETS.get(body?.assetId);
  if (!asset || body.symbol !== asset.symbol || body.assetClass !== asset.class) throw new TypeError('Unsupported asset.');
  if (!ALLOWED_CURRENCIES.has(body.currency) || !ALLOWED_RANGES.has(body.range)) throw new TypeError('Unsupported currency or range.');
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) throw new TypeError('Invalid amount.');
  const units = asset.class === 'metal' ? new Set(['troy_ounce', 'gram', 'kilogram']) : new Set(['unit']);
  if (!units.has(body.unit)) throw new TypeError('Unsupported unit.');
  return { request: { ...body, amount }, asset };
}

function cacheKey(request) {
  const query = new URLSearchParams({
    assetId: request.assetId,
    currency: request.currency,
    range: request.range,
    amount: String(request.amount),
    unit: request.unit,
    from: request.conversion?.from || '',
    to: request.conversion?.to || ''
  });
  return new Request(`https://corez-market-cache.internal/quote?${query}`, { method: 'GET' });
}

class ProviderError extends Error {
  constructor(status, retryAfter) {
    super(`Provider request failed with status ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function providerUrl(path, params, apiKey) {
  const url = new URL(path, API_BASE);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  url.searchParams.set('apikey', apiKey);
  return url;
}

async function providerJson(path, params, apiKey, fetchImpl) {
  const response = await fetchImpl(providerUrl(path, params, apiKey), { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new ProviderError(response.status, Number(response.headers.get('Retry-After')) || undefined);
  return response.json();
}

function isoTimestamp(epochSeconds, datetime) {
  const date = epochSeconds ? new Date(number(epochSeconds, 'timestamp') * 1000) : new Date(`${datetime}Z`);
  if (Number.isNaN(date.valueOf())) throw new Error('Invalid provider timestamp.');
  return date.toISOString();
}

function unitFactor(assetClass, unit) {
  if (assetClass !== 'metal') return 1;
  if (unit === 'gram') return 1 / 31.1034768;
  if (unit === 'kilogram') return 1000 / 31.1034768;
  return 1;
}

export async function fetchAndNormalize({ request, asset }, apiKey, fetchImpl) {
  const providerSymbol = request.conversion ? `${request.conversion.from}/${request.conversion.to}` : asset.symbol;
  const range = ALLOWED_RANGES.get(request.range);
  const quotePromise = providerJson('/quote', { symbol: providerSymbol }, apiKey, fetchImpl);
  const seriesPromise = providerJson('/time_series', { symbol: providerSymbol, interval: range.interval, outputsize: range.outputsize, order: 'asc' }, apiKey, fetchImpl);
  const exchangePromise = !request.conversion && request.currency !== 'USD'
    ? providerJson('/exchange_rate', { symbol: `USD/${request.currency}` }, apiKey, fetchImpl)
    : Promise.resolve({ rate: 1 });
  const [quoteData, seriesData, exchangeData] = await Promise.all([quotePromise, seriesPromise, exchangePromise]);
  const factor = request.conversion ? 1 : positiveNumber(exchangeData.rate, 'exchange rate');
  const quote = {
    price: positiveNumber(quoteData.close, 'close') * factor,
    currency: request.currency,
    change: number(quoteData.change, 'change') * factor,
    changePercent: number(quoteData.percent_change, 'percent_change'),
    high: positiveNumber(quoteData.high, 'high') * factor,
    low: positiveNumber(quoteData.low, 'low') * factor,
    previousClose: positiveNumber(quoteData.previous_close, 'previous_close') * factor,
    marketOpen: Boolean(quoteData.is_market_open),
    timestamp: isoTimestamp(quoteData.timestamp, quoteData.datetime)
  };
  const points = [...(seriesData.values || [])].map((point) => ({
    timestamp: isoTimestamp(null, point.datetime),
    value: positiveNumber(point.close, 'series close') * factor
  })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (points.length === 0) throw new Error('Provider returned no series points.');
  const conversionValue = request.amount * unitFactor(asset.class, request.unit) * quote.price;
  return {
    kind: 'market',
    status: quoteData.is_delayed ? 'delayed' : 'live',
    request,
    asset,
    quote,
    series: { range: request.range, points },
    conversion: { amount: request.amount, unit: request.unit, value: conversionValue, currency: request.currency },
    meta: { source: 'Twelve Data', cached: false, stale: false, ...(quoteData.delay ? { delayMinutes: number(quoteData.delay, 'delay') } : {}) }
  };
}

export async function handleMarket(request, env) {
  if (request.method !== 'POST') return apiError(405, 'method_not_allowed', 'Method not allowed.');
  if (!env.TWELVE_DATA_API_KEY) return apiError(503, 'not_configured', 'Market data is not configured.');
  let body;
  try { body = await request.json(); } catch { return apiError(400, 'invalid_json', 'Request body must be valid JSON.'); }
  let normalized;
  try { normalized = validate(body); } catch (error) { return apiError(400, 'invalid_request', error.message); }

  const fetchImpl = env.__MARKET_FETCH || fetch;
  const cache = env.__MARKET_CACHE || globalThis.caches?.default;
  const now = env.__MARKET_NOW ? env.__MARKET_NOW() : Date.now();
  const key = cacheKey(normalized.request);
  const cachedResponse = await cache?.match(key);
  const cached = cachedResponse ? await cachedResponse.json() : null;
  const age = cached ? now - cached.cachedAt : Infinity;
  if (cached && age <= FRESH_MS) return Response.json({ ...cached.payload, meta: { ...cached.payload.meta, cached: true, stale: false } });

  try {
    const payload = await fetchAndNormalize(normalized, env.TWELVE_DATA_API_KEY, fetchImpl);
    await cache?.put(key, Response.json({ cachedAt: now, payload }, { headers: { 'Cache-Control': 's-maxage=900' } }));
    return Response.json(payload);
  } catch (error) {
    if (cached && age <= STALE_MS) return Response.json({ ...cached.payload, status: 'stale', meta: { ...cached.payload.meta, cached: true, stale: true } });
    if (error.status === 429) return apiError(429, 'rate_limited', 'Market data rate limit reached.', error.retryAfter);
    return apiError(502, 'provider_unavailable', 'Market data temporarily unavailable.');
  }
}
```

Keep `providerUrl` as the only provider URL construction path; validated symbols
and currencies are the only values passed into it. Provider failures must be
mapped by `handleMarket` without logging the URL, because it contains the secret.

- [ ] **Step 4: Route the endpoint and make the full contract pass**

At the top of `worker/index.js` add:

```js
import { handleMarket } from './market.js';
```

In the exported `fetch` router add before the unknown `/api/` branch:

```js
if (pathname === '/api/market') {
  return handleMarket(request, env);
}
```

Add this routing assertion to `tests/cloudflare-worker-contract.mjs` using an
environment without the market secret, which proves the route is recognized:

```js
const marketRouteResponse = await worker.fetch(
  new Request('https://corez.test/api/market', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  }),
  env()
);
assert.equal(marketRouteResponse.status, 503);
assert.equal((await marketRouteResponse.json()).error.code, 'not_configured');
```

Then run:

```bash
node tests/market-worker-contract.mjs
node tests/cloudflare-worker-contract.mjs
```

Expected: both contracts PASS, including cache and stale-window cases.

- [ ] **Step 5: Add the contract to the standard suite and commit**

Change `test:cloudflare` so `node tests/market-worker-contract.mjs` runs immediately after `cloudflare-worker-contract.mjs`.

Run and commit:

```bash
npm run test:cloudflare
git add worker/index.js worker/market.js tests/market-worker-contract.mjs tests/cloudflare-worker-contract.mjs package.json
git commit -m "feat: serve validated market data"
```

Expected: the existing hosted suite and new market contract PASS; no real provider call occurs in tests.

---

### Task 3: Browser market service and market-first response union

**Files:**
- Create: `src/services/marketService.js`
- Create: `tests/market-service.test.js`
- Modify: `src/services/aiService.js`
- Modify: `tests/public-ai-proxy-contract.sh`

**Interfaces:**
- Consumes: `parseMarketIntent(prompt)` and `POST /api/market`.
- Produces: `fetchMarketData(request, signal)`.
- Produces: `generateAIResponse(...)` returning either the existing string or `{ type: 'market', request, market }`.
- The `market` field may be a successful normalized response or `{ kind: 'market', status: 'unavailable', error }`.

- [ ] **Step 1: Write failing service and interception tests**

Create `tests/market-service.test.js`:

```js
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMarketData } from '../src/services/marketService.js';
import { generateAIResponse } from '../src/services/aiService.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchMarketData', () => {
  it('posts a normalized request to the market endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ kind: 'market', status: 'live', quote: { price: 2412.5 } }));
    vi.stubGlobal('fetch', fetchMock);
    const request = { assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null };
    await expect(fetchMarketData(request)).resolves.toMatchObject({ status: 'live' });
    expect(fetchMock).toHaveBeenCalledWith('/api/market', expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }));
  });

  it('returns a safe structured error without inventing a price', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'rate_limited', message: 'Market data rate limit reached.', retryAfter: 30 } }, { status: 429 })));
    await expect(fetchMarketData({ assetId: 'gold' })).rejects.toMatchObject({ code: 'rate_limited', retryAfter: 30 });
  });
});

describe('generateAIResponse market interception', () => {
  it('returns a market response without calling /api/ai', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/market') return Response.json({ kind: 'market', status: 'live', quote: { price: 2412.5 } });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateAIResponse('What is the price of gold?')).resolves.toMatchObject({ type: 'market', request: { assetId: 'gold' }, market: { status: 'live' } });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/ai', expect.anything());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run tests/market-service.test.js
```

Expected: FAIL because `marketService.js` is missing and `generateAIResponse` still calls hosted AI first.

- [ ] **Step 3: Implement the browser client**

Create `src/services/marketService.js`:

```js
export const MARKET_PROXY_ENDPOINT = '/api/market';

export class MarketApiError extends Error {
  constructor(code, message, status, retryAfter) {
    super(message);
    this.name = 'MarketApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export async function fetchMarketData(request, signal = null) {
  const response = await fetch(MARKET_PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    ...(signal ? { signal } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new MarketApiError(data?.error?.code || 'market_unavailable', data?.error?.message || 'Market data temporarily unavailable.', response.status, data?.error?.retryAfter);
  }
  return data;
}

export function unavailableMarket(error) {
  return { kind: 'market', status: 'unavailable', error: { code: error?.code || 'market_unavailable', message: error?.message || 'Market data temporarily unavailable.', ...(error?.retryAfter ? { retryAfter: error.retryAfter } : {}) } };
}
```

- [ ] **Step 4: Intercept before hosted AI and retire the hardcoded price response**

In `src/services/aiService.js`, import:

```js
import { parseMarketIntent } from './marketIntent.js';
import { fetchMarketData, unavailableMarket } from './marketService.js';
```

At the start of `generateAIResponse`, immediately after `cleanPrompt`:

```js
const marketRequest = parseMarketIntent(cleanPrompt);
if (marketRequest) {
  try {
    const market = await fetchMarketData(marketRequest, signal);
    return { type: 'market', request: marketRequest, market };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return { type: 'market', request: marketRequest, market: unavailableMarket(error) };
  }
}
```

Delete the `MARKET_PATTERNS` branch from `generateLocalAIResponse` so no hardcoded market values or implicit financial-terminal HTML remain on the price-query path. Keep explicit app prompts such as “build a financial dashboard” working through app generation, but change any terminal badge or copy that claims hardcoded values are live to `DEMO DATA`.

Append these checks to `tests/public-ai-proxy-contract.sh`:

```bash
check 'frontend imports the deterministic market parser' 'parseMarketIntent' "$service"
check 'frontend imports the structured market client' 'fetchMarketData' "$service"
check 'market interception is evaluated in generateAIResponse' 'marketRequest[[:space:]]*=[[:space:]]*parseMarketIntent' "$service"
check_absent 'hardcoded gold quote is retired' '3,240[.]50|3240[.]50' "$service"
check_absent 'hardcoded bitcoin quote is retired' '66,259[.]00|66259[.]00' "$service"
check_absent 'local fallback does not claim a live snapshot' 'live market snapshot' "$service"
```

Add this order check below the static checks:

```bash
market_line=$(awk '/export async function generateAIResponse/ { inside=1 } inside && /parseMarketIntent\(cleanPrompt\)/ { print NR; exit }' "$service")
hosted_line=$(awk '/export async function generateAIResponse/ { inside=1 } inside && /generateHostedAIResponse\(cleanPrompt/ { print NR; exit }' "$service")
if [ -z "$market_line" ] || [ -z "$hosted_line" ] || [ "$market_line" -ge "$hosted_line" ]; then
  printf 'FAIL: market interception must precede hosted AI\n' >&2
  failures=$((failures + 1))
fi
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npx vitest run tests/market-intent.test.js tests/market-service.test.js
bash tests/public-ai-proxy-contract.sh
npm run build
git add src/services/marketService.js src/services/aiService.js tests/market-service.test.js tests/public-ai-proxy-contract.sh
git commit -m "feat: route market prompts before hosted ai"
```

Expected: tests and build PASS; built assets do not contain the old hardcoded quote text.

---

### Task 4: Native MarketCard component and calculation logic

**Files:**
- Create: `src/components/MarketCard.jsx`
- Create: `tests/market-card.test.jsx`

**Interfaces:**
- Consumes props: `{ market, request, onRefresh, refreshing }`.
- Calls: `onRefresh(nextRequest)` for range, asset, currency, and manual refresh changes.
- Produces no global state; conversion amount and unit are local component state.

- [ ] **Step 1: Write failing component tests**

At the top of `tests/market-card.test.jsx`, configure jsdom and jest-dom:

```js
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MarketCard from '../src/components/MarketCard.jsx';

const request = { assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null };
const market = {
  kind: 'market', status: 'live',
  asset: { id: 'gold', class: 'metal', symbol: 'XAU/USD', name: 'Gold Spot' },
  quote: { price: 2412.5, currency: 'USD', change: 22.5, changePercent: 0.9414, high: 2420, low: 2395, previousClose: 2390, marketOpen: true, timestamp: '2026-07-22T07:00:00.000Z' },
  series: { range: '1D', points: [{ timestamp: '2026-07-22T07:00:00.000Z', value: 2400 }, { timestamp: '2026-07-22T07:05:00.000Z', value: 2412.5 }] },
  conversion: { amount: 1, unit: 'troy_ounce', value: 2412.5, currency: 'USD' },
  meta: { source: 'Twelve Data', cached: false, stale: false }
};

describe('MarketCard', () => {
  it('renders a sourced indicative quote with non-color movement text', () => {
    render(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing={false} />);
    expect(screen.getByRole('region', { name: /gold spot market quote/i })).toBeInTheDocument();
    expect(screen.getByText('$2,412.50')).toBeInTheDocument();
    expect(screen.getByText(/up 0.94%/i)).toBeInTheDocument();
    expect(screen.getByText(/Twelve Data/)).toBeInTheDocument();
    expect(screen.getByText(/indicative/i)).toBeInTheDocument();
  });

  it('converts gold grams from the displayed troy-ounce quote', async () => {
    const user = userEvent.setup();
    render(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing={false} />);
    await user.clear(screen.getByLabelText(/quantity/i));
    await user.type(screen.getByLabelText(/quantity/i), '10');
    await user.selectOptions(screen.getByLabelText(/unit/i), 'gram');
    expect(screen.getByText('$775.64')).toBeInTheDocument();
  });

  it('requests a new currency and chart range', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<MarketCard market={market} request={request} onRefresh={onRefresh} refreshing={false} />);
    await user.selectOptions(screen.getByLabelText(/display currency/i), 'AED');
    expect(onRefresh).toHaveBeenCalledWith({ ...request, currency: 'AED' });
    await user.click(screen.getByRole('button', { name: '1W' }));
    expect(onRefresh).toHaveBeenCalledWith({ ...request, range: '1W' });
  });

  it('renders unavailable and stale states without a fabricated price', () => {
    const { rerender } = render(<MarketCard market={{ kind: 'market', status: 'unavailable', error: { message: 'Market data temporarily unavailable.' } }} request={request} onRefresh={() => {}} refreshing={false} />);
    expect(screen.getByText('Market data temporarily unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('$2,412.50')).not.toBeInTheDocument();
    rerender(<MarketCard market={{ ...market, status: 'stale', meta: { ...market.meta, cached: true, stale: true } }} request={request} onRefresh={() => {}} refreshing={false} />);
    expect(screen.getByText(/stale/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run:

```bash
npx vitest run tests/market-card.test.jsx
```

Expected: FAIL because `MarketCard.jsx` does not exist.

- [ ] **Step 3: Implement formatting, chart, status, selectors, and converter**

Create `src/components/MarketCard.jsx`. Use `Intl.NumberFormat` for currency and numbers, `Intl.DateTimeFormat` for the exact provider timestamp, and this conversion logic:

```jsx
import { useMemo, useState } from 'react';
import { RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { DISPLAY_CURRENCIES, MARKET_ASSETS } from '../services/marketCatalog.js';

const GRAMS_PER_TROY_OUNCE = 31.1034768;
const UNIT_TO_OUNCES = { troy_ounce: 1, gram: 1 / GRAMS_PER_TROY_OUNCE, kilogram: 1000 / GRAMS_PER_TROY_OUNCE, unit: 1 };

function money(value, currency) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: value < 1 ? 6 : 2 }).format(value);
}

function linePoints(points) {
  if (!points?.length) return '';
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  return points.map((point, index) => `${(index / Math.max(points.length - 1, 1)) * 100},${40 - ((point.value - min) / span) * 36}`).join(' ');
}

export default function MarketCard({ market, request, onRefresh, refreshing }) {
  const [amount, setAmount] = useState(request.amount || 1);
  const [unit, setUnit] = useState(request.unit || 'unit');
  const converted = useMemo(() => market.quote ? Number(amount || 0) * (UNIT_TO_OUNCES[unit] || 1) * market.quote.price : null, [amount, unit, market.quote]);

  if (market.status === 'unavailable') {
    return <section className="market-card market-card-error" role="region" aria-label="Market data unavailable"><p>{market.error?.message || 'Market data temporarily unavailable.'}</p><button type="button" onClick={() => onRefresh(request)} disabled={refreshing}>Retry</button></section>;
  }

  const up = market.quote.change >= 0;
  const MovementIcon = up ? TrendingUp : TrendingDown;
  const units = market.asset.class === 'metal' ? [['troy_ounce', 'Troy ounce'], ['gram', 'Gram'], ['kilogram', 'Kilogram']] : [['unit', 'Unit']];
  const statusLabel = market.status === 'stale' ? 'Stale' : market.status === 'delayed' ? 'Delayed' : market.quote.marketOpen ? 'Market open' : 'Market closed';
  return (
    <section className="market-card" role="region" aria-label={`${market.asset.name} market quote`}>
      <header className="market-card-header"><div><strong>{market.asset.name}</strong><span>{market.asset.symbol}</span></div><span className={`market-status market-status-${market.status}`}>{statusLabel}</span></header>
      <div className="market-price-row"><div><div className="market-price">{money(market.quote.price, market.quote.currency)}</div><div className={up ? 'market-movement up' : 'market-movement down'}><MovementIcon aria-hidden="true" size={16} />{up ? 'Up' : 'Down'} {Math.abs(market.quote.changePercent).toFixed(2)}% ({money(Math.abs(market.quote.change), market.quote.currency)})</div></div><button type="button" className="market-refresh" aria-label="Refresh market data" onClick={() => onRefresh(request)} disabled={refreshing}><RefreshCw aria-hidden="true" size={16} />{refreshing ? 'Refreshing' : 'Refresh'}</button></div>
      <div className="market-ranges" aria-label="Chart range">{['1D', '1W', '1M'].map((range) => <button type="button" key={range} aria-pressed={request.range === range} onClick={() => onRefresh({ ...request, range })}>{range}</button>)}</div>
      <svg className="market-chart" viewBox="0 0 100 44" role="img" aria-label={`${request.range} price trend`}><polyline points={linePoints(market.series.points)} fill="none" vectorEffect="non-scaling-stroke" /></svg>
      <div className="market-controls"><label>Asset<select aria-label="Asset" value={request.assetId} onChange={(event) => { const asset = MARKET_ASSETS.find((item) => item.id === event.target.value); onRefresh({ ...request, assetId: asset.id, symbol: asset.symbol, assetClass: asset.assetClass, unit: asset.defaultUnit, conversion: null }); }}>{MARKET_ASSETS.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><label>Display currency<select aria-label="Display currency" value={request.currency} onChange={(event) => onRefresh({ ...request, currency: event.target.value, conversion: null })}>{DISPLAY_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label>Quantity<input aria-label="Quantity" type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>Unit<select aria-label="Unit" value={unit} onChange={(event) => setUnit(event.target.value)}>{units.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <output className="market-conversion" aria-live="polite">{money(converted, market.quote.currency)}</output>
      <footer className="market-card-footer"><span>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(market.quote.timestamp))}</span><span>Source: {market.meta.source}</span><span>Indicative data, not an executable quote.</span></footer>
    </section>
  );
}
```

- [ ] **Step 4: Complete interaction and edge-state coverage**

Append these cases to `tests/market-card.test.jsx`:

```jsx
it('labels negative, delayed, closed, and stale states without relying on color', () => {
  const { rerender } = render(<MarketCard market={{ ...market, status: 'delayed', quote: { ...market.quote, change: -5, changePercent: -0.5, marketOpen: false }, meta: { ...market.meta, delayMinutes: 15 } }} request={request} onRefresh={() => {}} refreshing={false} />);
  expect(screen.getByText(/down 0.50%/i)).toBeInTheDocument();
  expect(screen.getByText('Delayed')).toBeInTheDocument();
  rerender(<MarketCard market={{ ...market, quote: { ...market.quote, marketOpen: false } }} request={request} onRefresh={() => {}} refreshing={false} />);
  expect(screen.getByText('Market closed')).toBeInTheDocument();
  rerender(<MarketCard market={{ ...market, status: 'stale', meta: { ...market.meta, cached: true, stale: true } }} request={request} onRefresh={() => {}} refreshing={false} />);
  expect(screen.getByText('Stale')).toBeInTheDocument();
});

it('disables refresh while a request is active and keeps all actions non-submitting', () => {
  render(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing />);
  expect(screen.getByRole('button', { name: /refresh market data/i })).toBeDisabled();
  for (const button of screen.getAllByRole('button')) expect(button).toHaveAttribute('type', 'button');
});

it('supports zero quantity, all metal units, and an empty chart', async () => {
  const user = userEvent.setup();
  render(<MarketCard market={{ ...market, series: { range: '1D', points: [] } }} request={request} onRefresh={() => {}} refreshing={false} />);
  expect(screen.getByRole('img', { name: /1D price trend/i })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Troy ounce' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Gram' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Kilogram' })).toBeInTheDocument();
  await user.clear(screen.getByLabelText(/quantity/i));
  await user.type(screen.getByLabelText(/quantity/i), '0');
  expect(screen.getByText('$0.00')).toBeInTheDocument();
});

it('limits stock and crypto conversion to units', () => {
  render(<MarketCard market={{ ...market, asset: { id: 'apple', class: 'stock', symbol: 'AAPL', name: 'Apple' } }} request={{ ...request, assetId: 'apple', symbol: 'AAPL', assetClass: 'stock', unit: 'unit' }} onRefresh={() => {}} refreshing={false} />);
  expect(screen.getAllByRole('option', { name: 'Unit' })).toHaveLength(1);
  expect(screen.queryByRole('option', { name: 'Gram' })).not.toBeInTheDocument();
});

it('shows retry timing without showing a number as a quote', () => {
  render(<MarketCard market={{ kind: 'market', status: 'unavailable', error: { code: 'rate_limited', message: 'Market data rate limit reached.', retryAfter: 30 } }} request={request} onRefresh={() => {}} refreshing={false} />);
  expect(screen.getByText(/Market data rate limit reached/)).toBeInTheDocument();
  expect(screen.queryByText('$2,412.50')).not.toBeInTheDocument();
});
```

Replace the unavailable branch's paragraph value with:

```jsx
const unavailableMessage = market.error?.message || 'Market data temporarily unavailable.';
const retryMessage = market.error?.retryAfter ? ` Retry in ${market.error.retryAfter} seconds.` : '';
// Render inside the unavailable section:
<p>{unavailableMessage}{retryMessage}</p>
```

Run:

```bash
npx vitest run tests/market-card.test.jsx
```

Expected: all component tests PASS without CSS-dependent assertions.

- [ ] **Step 5: Commit the component logic**

```bash
git add src/components/MarketCard.jsx tests/market-card.test.jsx
git commit -m "feat: add native market quote card"
```

---

### Task 5: Chat persistence, rendering, and refresh integration

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/ChatMessage.jsx`
- Modify: `tests/market-service.test.js`
- Modify: `tests/market-card.test.jsx`

**Interfaces:**
- Consumes: `generateAIResponse` string-or-market union and `fetchMarketData`.
- Produces stored market message: `{ role: 'assistant', type: 'market', content: '', request, market }`.
- Produces `handleRefreshMarket(messageIndex, nextRequest)` and passes it to `ChatMessage`.

- [ ] **Step 1: Add failing message-normalization and rendering tests**

Export a pure helper from `App.jsx`:

```js
export function toAssistantMessage(response) {
  if (typeof response === 'string') return { role: 'assistant', content: response };
  return { role: 'assistant', type: 'market', content: '', request: response.request, market: response.market };
}
```

Before implementing it, add these assertions:

```jsx
// tests/market-service.test.js
import { toAssistantMessage } from '../src/App.jsx';

expect(toAssistantMessage('Old answer')).toEqual({ role: 'assistant', content: 'Old answer' });
expect(toAssistantMessage({ type: 'market', request: { assetId: 'gold' }, market: { status: 'live' } })).toEqual({
  role: 'assistant', type: 'market', content: '', request: { assetId: 'gold' }, market: { status: 'live' }
});

// tests/market-card.test.jsx
import ChatMessage from '../src/components/ChatMessage.jsx';

render(<ChatMessage message={{ role: 'assistant', type: 'market', content: '', request, market }} onRunInCanvas={() => {}} onReviseCode={() => {}} onRefreshMarket={() => {}} marketRefreshing={false} />);
expect(screen.getByRole('region', { name: /Gold Spot market quote/i })).toBeInTheDocument();

render(<ChatMessage message={{ role: 'assistant', content: 'Old answer' }} onRunInCanvas={() => {}} onReviseCode={() => {}} onRefreshMarket={() => {}} marketRefreshing={false} />);
expect(screen.getByText('Old answer')).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused tests to verify they fail**

```bash
npx vitest run tests/market-service.test.js tests/market-card.test.jsx
```

Expected: FAIL because the helper, market dispatch, and refresh prop do not exist.

- [ ] **Step 3: Normalize new and recovered assistant responses**

In both the normal send path and background recovery path in `src/App.jsx`, replace `responseText` handling with:

```js
const response = await generateAIResponse(apiPrompt, updatedApiMessages, controller.signal);
if (!response) return;
const aiMsg = toAssistantMessage(response);
if (aiMsg.type !== 'market') {
  const extractedCode = extractCodeFromMessage(aiMsg.content);
  if (extractedCode) setActiveCanvasCode(extractedCode);
}
```

Append `aiMsg` exactly as the existing text message is appended. Keep the pending-request payload free of credentials and preserve all existing abort/finally behavior.

- [ ] **Step 4: Add message refresh and ChatMessage dispatch**

Import `fetchMarketData` and `unavailableMarket` in `App.jsx`, add a `refreshingMarketKey` state, and implement:

```js
const handleRefreshMarket = async (messageIndex, nextRequest) => {
  const key = `${activeSessionId}:${messageIndex}`;
  setRefreshingMarketKey(key);
  try {
    const market = await fetchMarketData(nextRequest);
    setSessions((previous) => previous.map((session) => session.id !== activeSessionId ? session : { ...session, messages: session.messages.map((message, index) => index === messageIndex ? { ...message, request: nextRequest, market } : message) }));
  } catch (error) {
    setSessions((previous) => previous.map((session) => session.id !== activeSessionId ? session : { ...session, messages: session.messages.map((message, index) => index === messageIndex ? { ...message, request: nextRequest, market: unavailableMarket(error) } : message) }));
  } finally {
    setRefreshingMarketKey(null);
  }
};
```

Pass `onRefreshMarket={(nextRequest) => handleRefreshMarket(idx, nextRequest)}` and `marketRefreshing={refreshingMarketKey === `${activeSessionId}:${idx}`}` to `ChatMessage`.

In `ChatMessage.jsx`, import `MarketCard` and place this branch before Markdown rendering:

```jsx
{message.type === 'market' ? (
  <MarketCard market={message.market} request={message.request} onRefresh={onRefreshMarket} refreshing={marketRefreshing} />
) : (
  renderFormattedText(message.content)
)}
```

- [ ] **Step 5: Verify persistence compatibility and commit**

Run:

```bash
npx vitest run tests/market-service.test.js tests/market-card.test.jsx
npm run build
git add src/App.jsx src/components/ChatMessage.jsx tests/market-service.test.js tests/market-card.test.jsx
git commit -m "feat: render market responses in chat"
```

Expected: structured cards survive the existing localStorage serialization; old text messages still render; tests and build PASS.

---

### Task 6: Responsive visual treatment and accessibility contracts

**Files:**
- Modify: `src/index.css`
- Modify: `tests/ui-responsive-contract.sh`
- Modify: `tests/market-card.test.jsx`

**Interfaces:**
- Consumes the class names and ARIA structure from `MarketCard.jsx`.
- Produces no JavaScript interface.

- [ ] **Step 1: Add failing static and runtime accessibility checks**

Append to `tests/ui-responsive-contract.sh` checks for:

```bash
market_card="src/components/MarketCard.jsx"
check 'market card has a responsive grid' '\.market-controls' "$css"
check 'market card mobile controls collapse to one column' 'grid-template-columns:[[:space:]]*1fr' "$css"
check 'market card chart remains width-fluid' 'width:[[:space:]]*100%' "$css"
check 'market card respects reduced motion' '\.market-refresh' "$css"
check 'market card exposes a labelled region' 'role="region"' "$market_card"
check 'market movement includes words in addition to color' "\{up \? 'Up' : 'Down'\}" "$market_card"
check 'market disclosure identifies indicative data' 'Indicative data' "$market_card"
```

Append this runtime accessibility case to `tests/market-card.test.jsx`:

```jsx
it('exposes named controls that work from the keyboard', async () => {
  const user = userEvent.setup();
  const onRefresh = vi.fn();
  render(<MarketCard market={market} request={request} onRefresh={onRefresh} refreshing={false} />);
  expect(screen.getByLabelText('Asset')).toBeInTheDocument();
  expect(screen.getByLabelText('Display currency')).toBeInTheDocument();
  expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
  expect(screen.getByLabelText('Unit')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '1D' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /refresh market data/i })).toBeInTheDocument();
  await user.tab();
  expect(document.activeElement).not.toBe(document.body);
  await user.selectOptions(screen.getByLabelText('Display currency'), 'AED');
  expect(onRefresh).toHaveBeenCalledWith({ ...request, currency: 'AED', conversion: null });
});
```

- [ ] **Step 2: Run checks to verify they fail**

```bash
bash tests/ui-responsive-contract.sh
npx vitest run tests/market-card.test.jsx
```

Expected: responsive contract FAILS because market styles are absent.

- [ ] **Step 3: Add theme-aware card styles**

Append focused styles to `src/index.css` using existing tokens:

```css
.market-card { width: min(100%, 720px); display: grid; gap: 0.9rem; color: var(--text-primary); }
.market-card-header, .market-price-row, .market-card-footer { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.market-card-header strong, .market-price { display: block; }
.market-card-header span, .market-card-footer { color: var(--text-secondary); font-size: 0.75rem; }
.market-status { border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.2rem 0.45rem; font-size: 0.72rem; }
.market-status-stale, .market-status-delayed, .market-card-error { border-color: #f59e0b; }
.market-price { font-size: clamp(1.7rem, 5vw, 2.5rem); font-weight: 600; letter-spacing: -0.04em; }
.market-movement { display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 500; }
.market-movement.up { color: #22c55e; }
.market-movement.down { color: #ef4444; }
.market-refresh, .market-ranges button { min-height: 38px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-primary); }
.market-ranges { display: flex; gap: 0.4rem; }
.market-ranges button[aria-pressed="true"] { box-shadow: inset 0 0 0 1px var(--text-primary); }
.market-chart { width: 100%; min-height: 160px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-secondary); }
.market-chart polyline { stroke: currentColor; stroke-width: 2; }
.market-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; }
.market-controls label { display: grid; gap: 0.3rem; color: var(--text-secondary); font-size: 0.75rem; }
.market-controls input, .market-controls select { width: 100%; min-height: 40px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-primary); padding: 0.5rem 0.65rem; }
.market-conversion { font-size: 1.2rem; font-weight: 600; }
.market-card-footer { border-top: 1px solid var(--border-color); padding-top: 0.75rem; }
@media (max-width: 767px) { .market-controls { grid-template-columns: 1fr; } .market-card { gap: 0.75rem; } .market-price-row { align-items: flex-start; } }
@media (prefers-reduced-motion: reduce) { .market-refresh svg { animation: none !important; } }
```

Also ensure the containing AI message remains `max-width: 100%` and does not create horizontal scrolling at 320px.

- [ ] **Step 4: Run accessibility and responsive verification**

```bash
bash tests/ui-responsive-contract.sh
npx vitest run tests/market-card.test.jsx
npm run build
```

Expected: all checks PASS; no focus outline is removed.

- [ ] **Step 5: Commit the visual layer**

```bash
git add src/index.css tests/ui-responsive-contract.sh tests/market-card.test.jsx
git commit -m "feat: style accessible market cards"
```

---

### Task 7: Documentation, secret configuration, full verification, and deployment readiness

**Files:**
- Modify: `README.md`
- Modify: `.github/workflows/deploy.yml` only if the standard suite name changes.
- Verify: all changed source, tests, built assets, and Git diff.

**Interfaces:**
- Consumes all prior tasks.
- Produces an operator-facing secret configuration instruction and verified release candidate.

- [ ] **Step 1: Document runtime behavior and secret setup**

Add a `Live market data` section to `README.md`:

````markdown
## Live market data

Supported market-price and conversion prompts are handled before the general AI route and render as structured cards in chat. The Cloudflare Worker calls Twelve Data through `POST /api/market`; the browser never receives the provider credential.

Configure the production Worker secret interactively:

```text
npx wrangler secret put TWELVE_DATA_API_KEY
```

Do not add the value to `.env`, `wrangler.jsonc`, source files, tests, logs, or GitHub Actions variables exposed to builds. If the secret is absent, the market endpoint returns a safe `not_configured` response and no fallback price.
````

- [ ] **Step 2: Configure the production Worker secret without exposing it**

Use the exact user-provided value only through Wrangler's hidden interactive prompt:

```bash
npx wrangler secret put TWELVE_DATA_API_KEY
```

Expected: Wrangler confirms the secret was uploaded. Do not place the value on the command line, in shell history, in a file, or in captured logs. If the current environment is not authenticated to the intended Cloudflare account, stop this step and ask the owner to run the same command locally.

- [ ] **Step 3: Run targeted and full verification**

```bash
npm run test:market
npm run test:cloudflare
npm run evaluate:intents
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0. A missing script is reported as missing and is not treated as passing.

- [ ] **Step 4: Audit for credential and hardcoded-price leakage**

Run searches using variable names and known forbidden phrases, never the real secret value:

```bash
grep -RInE "TWELVE_DATA_API_KEY[[:space:]]*[:=][[:space:]]*['\"]?[A-Za-z0-9]{16,}|live market snapshot|Gold Spot.*3240|BTC.*66259" src worker tests dist README.md wrangler.jsonc .github || true
git diff --name-only HEAD
git status --short
```

Expected: the first command produces no credential assignment and no retired hardcoded quote phrase. The changed-path list contains only planned files.

- [ ] **Step 5: Perform independent diff review and commit documentation**

Use the repository wrapper in analysis-only review mode:

```powershell
.\scripts\agy-delegate.ps1 -Mode ReviewDiff -Task 'Review the inline live market card implementation for fabricated-price risks, credential leakage, cache/stale correctness, accessibility regressions, and missing tests.'
```

If PowerShell or AGY is unavailable, report that explicitly and perform the same tracked-diff review locally without bypassing permissions. Address every confirmed issue, rerun the affected checks, then commit:

```bash
git add README.md .github/workflows/deploy.yml
git commit -m "docs: document live market data"
```

Do not include `.github/workflows/deploy.yml` in the `git add` command if it was not changed.

- [ ] **Step 6: Complete repository Git policy**

Invoke the repository-local `git-superpowers` skill. Confirm the branch is `main`, the worktree is clean after commits, and all verification output is current. Push local `main` to `origin/main` without a merge commit. Stop and report if the branch is not `main` or if any required verification failed.
