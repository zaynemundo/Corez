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

