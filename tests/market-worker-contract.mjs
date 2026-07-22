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
assert.equal((await post({
  assetId: 'gold',
  symbol: 'XAU/USD',
  assetClass: 'metal',
  currency: 'USD',
  amount: 1,
  unit: 'troy_ounce',
  range: '1D',
  conversion: { from: 'https://evil.test', to: 'USD' }
})).status, 400);
assert.equal((await post({ assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null }, marketEnv({ TWELVE_DATA_API_KEY: undefined }))).status, 503);

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

console.log('Market Worker contract passed.');
