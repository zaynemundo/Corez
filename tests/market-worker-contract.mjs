import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const QUOTE_TIME = Date.parse('2026-07-22T07:00:00.000Z');
const TEST_NOW = Date.parse('2026-07-22T07:05:00.000Z');
const environmentClients = new WeakMap();
let nextClient = 1;

function clientFor(env) {
  if (!environmentClients.has(env)) {
    environmentClients.set(env, `192.0.2.${nextClient}`);
    nextClient += 1;
  }
  return environmentClients.get(env);
}

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
    __MARKET_NOW: () => TEST_NOW,
    __MARKET_CACHE: fakeCache(),
    __MARKET_FETCH: async (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('apikey'), 'test-only-key');
      if (parsed.pathname.endsWith('/quote')) return Response.json({ symbol: 'XAU/USD', name: 'Gold Spot', currency: 'USD', close: '2412.50', open: '2400.00', high: '2420.00', low: '2395.00', previous_close: '2390.00', change: '22.50', percent_change: '0.9414', timestamp: 1784703600, is_market_open: true });
      if (parsed.pathname.endsWith('/time_series')) {
        assert.equal(parsed.searchParams.get('timezone'), 'UTC');
        return Response.json({ meta: { symbol: 'XAU/USD', currency: 'USD', timezone: 'UTC' }, values: [{ datetime: '2026-07-22 06:55:00', close: '2400.00' }, { datetime: '2026-07-22 07:00:00', close: '2412.50' }] });
      }
      if (parsed.pathname.endsWith('/exchange_rate')) return Response.json({ symbol: 'USD/AED', rate: '3.6725', timestamp: 1784703600 });
      return new Response('not found', { status: 404 });
    },
    ...overrides
  };
}

async function post(body, env = marketEnv()) {
  return worker.fetch(new Request('https://corez.test/api/market', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': clientFor(env) }, body: JSON.stringify(body) }), env);
}

async function postRaw(body, env = marketEnv(), headers = {}) {
  return worker.fetch(new Request('https://corez.test/api/market', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': clientFor(env), ...headers },
    body
  }), env);
}

function providerFor({ quote = {}, series = {}, exchange = {} } = {}) {
  return async (url) => {
    const parsed = new URL(url);
    const requestedSymbol = parsed.searchParams.get('symbol');
    if (parsed.pathname.endsWith('/quote')) {
      return Response.json({
        symbol: requestedSymbol,
        name: 'Provider asset',
        currency: requestedSymbol.includes('/') ? requestedSymbol.split('/')[1] : 'USD',
        close: '2412.50',
        high: '2420.00',
        low: '2395.00',
        previous_close: '2390.00',
        change: '22.50',
        percent_change: '0.9414',
        timestamp: QUOTE_TIME / 1000,
        is_market_open: true,
        ...quote
      });
    }
    if (parsed.pathname.endsWith('/time_series')) {
      return Response.json({
        meta: {
          symbol: requestedSymbol,
          currency: requestedSymbol.includes('/') ? requestedSymbol.split('/')[1] : 'USD',
          timezone: 'UTC'
        },
        values: [
          { datetime: '2026-07-22 06:55:00', close: '2400.00' },
          { datetime: '2026-07-22 07:00:00', close: '2412.50' }
        ],
        ...series
      });
    }
    return Response.json({
      symbol: requestedSymbol,
      rate: '3.6725',
      timestamp: QUOTE_TIME / 1000,
      ...exchange
    });
  };
}

const cacheRequest = { assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null };
const live = await post(cacheRequest);
assert.equal(live.status, 200);
assert.deepEqual(await live.json(), {
  kind: 'market',
  status: 'live',
  request: { assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null },
  asset: { id: 'gold', class: 'metal', symbol: 'XAU/USD', name: 'Gold Spot' },
  quote: { price: 2412.5, currency: 'USD', change: 22.5, changePercent: 0.9414, high: 2420, low: 2395, previousClose: 2390, marketOpen: true, timestamp: '2026-07-22T07:00:00.000Z' },
  series: { range: '1D', points: [{ timestamp: '2026-07-22T06:55:00.000Z', value: 2400 }, { timestamp: '2026-07-22T07:00:00.000Z', value: 2412.5 }] },
  conversion: { amount: 1, unit: 'troy_ounce', value: 2412.5, currency: 'USD' },
  meta: { source: 'Twelve Data', cached: false, stale: false, servedAt: '2026-07-22T07:05:00.000Z' }
});

assert.equal((await post({ symbol: 'https://evil.test' })).status, 400);
assert.equal((await post({ assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: '1', unit: 'troy_ounce', range: '1D', conversion: null })).status, 400);
assert.equal((await post({ assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: true, unit: 'troy_ounce', range: '1D', conversion: null })).status, 400);
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

assert.equal((await postRaw('{}', marketEnv(), { 'Content-Type': 'text/plain' })).status, 415);
assert.equal((await postRaw('{}', marketEnv(), { 'Content-Length': '5000' })).status, 413);
assert.equal((await postRaw(`{"assetId":"gold","symbol":"XAU/USD","assetClass":"metal","currency":"USD","amount":1,"unit":"troy_ounce","range":"1D","conversion":null,"padding":"${'x'.repeat(5000)}"}`)).status, 413);
assert.equal((await post({ assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null, extra: true })).status, 400);
assert.equal((await post({ assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', conversion: null })).status, 400);
assert.equal((await postRaw('{"assetId":"gold","symbol":"XAU/USD","assetClass":"metal","currency":"USD","amount":1,"unit":"troy_ounce","range":"1D","conversion":null,"__proto__":{"polluted":true}}')).status, 400);
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

const directFxRequest = { assetId: 'fx-eur', symbol: 'EUR/USD', assetClass: 'forex', currency: 'AED', amount: 100, unit: 'unit', range: '1D', conversion: { from: 'EUR', to: 'AED' } };
const directFx = await post(directFxRequest, marketEnv({ __MARKET_FETCH: providerFor() }));
assert.equal(directFx.status, 200);
assert.equal((await directFx.json()).asset.symbol, 'EUR/AED');

const falseString = await post(cacheRequest, marketEnv({ __MARKET_FETCH: providerFor({ quote: { is_market_open: 'false' } }) }));
assert.equal(falseString.status, 200);
assert.equal((await falseString.json()).quote.marketOpen, false);
assert.equal((await post(cacheRequest, marketEnv({ __MARKET_FETCH: providerFor({ quote: { is_market_open: 'sometimes' } }) }))).status, 502);

for (const [label, fetchImpl] of [
  ['wrong quote symbol', providerFor({ quote: { symbol: 'XAG/USD' } })],
  ['wrong quote currency', providerFor({ quote: { currency: 'EUR' } })],
  ['wrong series symbol', providerFor({ series: { meta: { symbol: 'XAG/USD', currency: 'USD' } } })],
  ['wrong series currency', providerFor({ series: { meta: { symbol: 'XAU/USD', currency: 'EUR' } } })],
  ['conflicting series currencies', providerFor({ series: { meta: { symbol: 'XAU/USD', currency: 'USD', currency_quote: 'EUR' } } })],
  ['ancient quote', providerFor({ quote: { timestamp: 1 } })],
  ['future quote', providerFor({ quote: { timestamp: (TEST_NOW + 10 * 60_000) / 1000 } })],
  ['future series point', providerFor({ series: { values: [{ datetime: '2026-07-22 07:10:01', close: '2412.50' }] } })],
  ['disagreeing series', providerFor({ series: { values: [{ datetime: '2026-07-22 07:00:00', close: '12.50' }] } })],
  ['non-UTC series metadata', providerFor({ series: { meta: { symbol: 'XAU/USD', currency: 'USD', timezone: 'America/New_York' } } })],
  ['NY exchange-local timestamp trap', providerFor({ series: { meta: { symbol: 'XAU/USD', currency: 'USD', exchange_timezone: 'America/New_York' }, values: [{ datetime: '2026-07-22 03:00:00', close: '2412.50' }] } })],
  ['unordered series', providerFor({ series: { values: [{ datetime: '2026-07-22 07:00:00', close: '2412.50' }, { datetime: '2026-07-22 06:55:00', close: '2400.00' }] } })],
  ['1D point outside range', providerFor({ series: { values: [{ datetime: '2026-06-22 07:00:00', close: '2400.00' }, { datetime: '2026-07-22 07:00:00', close: '2412.50' }] } })]
]) {
  const response = await post(cacheRequest, marketEnv({ __MARKET_FETCH: fetchImpl }));
  assert.equal(response.status, 502, label);
}
assert.equal((await post(
  { ...cacheRequest, currency: 'AED' },
  marketEnv({ __MARKET_FETCH: providerFor({ exchange: { symbol: 'USD/EUR' } }) })
)).status, 502);

const delayed = await post(cacheRequest, marketEnv({
  __MARKET_NOW: () => QUOTE_TIME + 30 * 60_000,
  __MARKET_FETCH: providerFor({ quote: { is_market_open: false } })
}));
assert.equal(delayed.status, 200);
const delayedBody = await delayed.json();
assert.equal(delayedBody.status, 'delayed');
assert.equal(delayedBody.meta.delayMinutes, 30);

const providerMarkedDelayed = await post(cacheRequest, marketEnv({
  __MARKET_FETCH: providerFor({
    quote: { timestamp: TEST_NOW / 1000, is_delayed: true },
    series: { values: [{ datetime: '2026-07-22 07:05:00', close: '2412.50' }] }
  })
}));
assert.equal(providerMarkedDelayed.status, 200);
const providerMarkedDelayedBody = await providerMarkedDelayed.json();
assert.equal(providerMarkedDelayedBody.status, 'delayed');
assert.equal(providerMarkedDelayedBody.meta.delayMinutes, 1);

for (const [label, ageMs, expectedStatus] of [
  ['flag-only delayed 17m boundary', 17 * 60_000, 200],
  ['flag-only delayed 17m plus 1ms', 17 * 60_000 + 1, 502]
]) {
  const quoteMilliseconds = TEST_NOW - ageMs;
  const response = await post(cacheRequest, marketEnv({
    __MARKET_FETCH: providerFor({
      quote: { timestamp: quoteMilliseconds / 1000, is_delayed: true },
      series: { values: [{ datetime: new Date(quoteMilliseconds).toISOString(), close: '2412.50' }] }
    })
  }));
  assert.equal(response.status, expectedStatus, label);
  if (expectedStatus === 200) {
    const body = await response.json();
    assert.equal(body.meta.delayMinutes, 17, label);
  }
}

for (const [label, delay, quoteDatetime, expectedStatus] of [
  ['15m+1s declared delay', 16, '2026-07-22 06:49:59', 200],
  ['delay plus 2m boundary', 20, '2026-07-22 06:43:00', 200],
  ['delay plus 2m over boundary', 20, '2026-07-22 06:42:59', 502],
  ['60m hard-cap boundary', 90, '2026-07-22 06:05:00', 200],
  ['60m hard-cap over boundary', 90, '2026-07-22 06:04:59', 502]
]) {
  const quoteTime = Date.parse(`${quoteDatetime.replace(' ', 'T')}Z`) / 1000;
  const response = await post(cacheRequest, marketEnv({
    __MARKET_FETCH: providerFor({
      quote: { timestamp: quoteTime, is_delayed: true, delay },
      series: { values: [{ datetime: quoteDatetime, close: '2412.50' }] }
    })
  }));
  assert.equal(response.status, expectedStatus, label);
  if (expectedStatus === 200) {
    const body = await response.json();
    assert.equal(body.status, 'delayed', label);
    assert.ok(body.meta.delayMinutes >= Math.ceil((TEST_NOW - quoteTime * 1000) / 60_000), label);
  }
}

for (const [label, seriesDatetime, expectedStatus] of [
  ['same-day closed bar', '2026-07-22 01:05:00', 200],
  ['12h closed latest boundary', '2026-07-21 19:05:00', 200],
  ['4d closed latest gap', '2026-07-18 07:05:00', 502]
]) {
  const response = await post(cacheRequest, marketEnv({
    __MARKET_FETCH: providerFor({
      quote: { timestamp: TEST_NOW / 1000, is_market_open: false },
      series: { values: [{ datetime: seriesDatetime, close: '2412.50' }] }
    })
  }));
  assert.equal(response.status, expectedStatus, label);
}

const closedWeekend = await post(cacheRequest, marketEnv({
  __MARKET_NOW: () => QUOTE_TIME + 2 * 24 * 60 * 60_000,
  __MARKET_FETCH: providerFor({ quote: { is_market_open: false } })
}));
assert.equal(closedWeekend.status, 200);
const closedWeekendBody = await closedWeekend.json();
assert.equal(closedWeekendBody.status, 'delayed');
assert.equal(closedWeekendBody.meta.delayMinutes, 2 * 24 * 60);

const namedCurrencyMetadata = await post(cacheRequest, marketEnv({
  __MARKET_FETCH: providerFor({
    quote: { currency: 'US Dollar' },
    series: { meta: { symbol: 'XAU/USD', currency_base: 'Gold', currency_quote: 'US Dollar' } }
  })
}));
assert.equal(namedCurrencyMetadata.status, 200);

for (const [range, oldest] of [
  ['1W', '2026-07-13 07:00:00'],
  ['1M', '2026-06-13 07:00:00']
]) {
  const response = await post({ ...cacheRequest, range }, marketEnv({
    __MARKET_FETCH: providerFor({
      series: { values: [{ datetime: oldest, close: '2400.00' }, { datetime: '2026-07-22 07:00:00', close: '2412.50' }] }
    })
  }));
  assert.equal(response.status, 200, `${range} coherent range`);
}

for (const [label, quoteClose, amount] of [
  ['overflow', '1e300', 1_000_000_000],
  ['underflow', '5e-324', 5e-324]
]) {
  const response = await post({ ...cacheRequest, amount }, marketEnv({
    __MARKET_FETCH: providerFor({
      quote: { close: quoteClose, high: quoteClose, low: quoteClose, previous_close: quoteClose },
      series: { values: [{ datetime: '2026-07-22 07:00:00', close: quoteClose }] }
    })
  }));
  assert.equal(response.status, 502, `${label} conversion arithmetic`);
  assert.doesNotMatch(await response.text(), /null/);
}

let providerMode = 'live';
let now = TEST_NOW;
let providerCalls = 0;
const cacheEnvironment = marketEnv({
  __MARKET_NOW: () => now,
  __MARKET_FETCH: async (url) => {
    providerCalls += 1;
    if (providerMode === 'rate-limit') return new Response('', { status: 429, headers: { 'Retry-After': '30' } });
    if (providerMode === 'malformed') return Response.json({ close: 'not-a-number' });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/quote')) return Response.json({ symbol: 'XAU/USD', name: 'Gold Spot', currency: 'USD', close: '2412.50', open: '2400.00', high: '2420.00', low: '2395.00', previous_close: '2390.00', change: '22.50', percent_change: '0.9414', timestamp: 1784703600, is_market_open: false });
    if (parsed.pathname.endsWith('/time_series')) return Response.json({ meta: { symbol: 'XAU/USD', currency: 'USD', timezone: 'UTC' }, values: [{ datetime: '2026-07-22 06:55:00', close: '2400.00' }, { datetime: '2026-07-22 07:00:00', close: '2412.50' }] });
    return Response.json({ symbol: 'USD/AED', rate: '3.6725', timestamp: 1784703600 });
  }
});
assert.equal((await post(cacheRequest, cacheEnvironment)).status, 200);
const firstCallCount = providerCalls;
now += 30_000;
const freshCachedBody = await (await post(cacheRequest, cacheEnvironment)).json();
assert.equal(freshCachedBody.meta.cached, true);
assert.equal(freshCachedBody.meta.servedAt, '2026-07-22T07:05:30.000Z');
assert.equal(providerCalls, firstCallCount);

const beforeDistinctAmount = providerCalls;
const differentAmount = await (await post({ ...cacheRequest, amount: 2 }, cacheEnvironment)).json();
assert.equal(differentAmount.conversion.amount, 2);
assert.equal(differentAmount.request.amount, 2);
assert.equal(providerCalls, beforeDistinctAmount);

const differentUnit = await (await post({ ...cacheRequest, amount: 10, unit: 'gram' }, cacheEnvironment)).json();
assert.equal(differentUnit.request.unit, 'gram');
assert.equal(differentUnit.conversion.unit, 'gram');
assert.equal(differentUnit.conversion.amount, 10);
assert.equal(differentUnit.conversion.value, 10 / 31.1034768 * 2412.5);
assert.equal(providerCalls, beforeDistinctAmount);

providerMode = 'rate-limit';
now += 90_000;
const stale = await (await post(cacheRequest, cacheEnvironment)).json();
assert.equal(stale.status, 'stale');
assert.equal(stale.meta.stale, true);

let delayedStaleNow = TEST_NOW;
let delayedStaleProviderFails = false;
const delayedStaleEnvironment = marketEnv({
  __MARKET_NOW: () => delayedStaleNow,
  __MARKET_FETCH: async (url) => {
    if (delayedStaleProviderFails) return new Response('', { status: 429 });
    return providerFor({
      quote: { timestamp: (TEST_NOW - 30 * 60_000) / 1000, is_delayed: true, delay: 30 },
      series: { values: [{ datetime: '2026-07-22T06:35:00.000Z', close: '2412.50' }] }
    })(url);
  }
});
const delayedStaleInitial = await (await post(cacheRequest, delayedStaleEnvironment)).json();
assert.equal(delayedStaleInitial.status, 'delayed');
assert.equal(delayedStaleInitial.meta.delayMinutes, 30);
delayedStaleNow += 2 * 60_000;
delayedStaleProviderFails = true;
const delayedStaleResponse = await post(cacheRequest, delayedStaleEnvironment);
assert.equal(delayedStaleResponse.status, 200);
const delayedStaleBody = await delayedStaleResponse.json();
assert.equal(delayedStaleBody.status, 'stale');
assert.equal(delayedStaleBody.meta.delayMinutes, 32);
assert.equal(delayedStaleBody.meta.servedAt, '2026-07-22T07:07:00.000Z');

let liveToStaleNow = TEST_NOW;
let liveToStaleProviderFails = false;
const liveToStaleEnvironment = marketEnv({
  __MARKET_NOW: () => liveToStaleNow,
  __MARKET_FETCH: async (url) => {
    if (liveToStaleProviderFails) return new Response('', { status: 429 });
    return providerFor({
      quote: { timestamp: (TEST_NOW - 14 * 60_000) / 1000 },
      series: { values: [{ datetime: '2026-07-22T06:51:00.000Z', close: '2412.50' }] }
    })(url);
  }
});
assert.equal((await (await post(cacheRequest, liveToStaleEnvironment)).json()).status, 'live');
liveToStaleNow += 2 * 60_000;
liveToStaleProviderFails = true;
const liveToStaleBody = await (await post(cacheRequest, liveToStaleEnvironment)).json();
assert.equal(liveToStaleBody.status, 'stale');
assert.equal(liveToStaleBody.meta.delayMinutes, 16);
assert.equal(liveToStaleBody.meta.servedAt, '2026-07-22T07:07:00.000Z');

now += 16 * 60_000;
const expired = await post(cacheRequest, cacheEnvironment);
assert.equal(expired.status, 429);
assert.deepEqual(await expired.json(), { error: { code: 'rate_limited', message: 'Market data rate limit reached.', retryAfter: 30 } });

providerMode = 'malformed';
const malformedProvider = await post({ ...cacheRequest, assetId: 'silver', symbol: 'XAG/USD' }, cacheEnvironment);
assert.equal(malformedProvider.status, 502);
assert.equal((await malformedProvider.json()).error.code, 'provider_unavailable');

const rateLimitEnvelope = await post(cacheRequest, marketEnv({
  __MARKET_FETCH: async () => Response.json({ code: 429, message: 'API credits exhausted', status: 'error' })
}));
assert.equal(rateLimitEnvelope.status, 429);
assert.equal((await rateLimitEnvelope.json()).error.code, 'rate_limited');

const providerErrorEnvelope = await post(cacheRequest, marketEnv({
  __MARKET_FETCH: async () => Response.json({ code: 400, message: 'Invalid symbol', status: 'error' })
}));
assert.equal(providerErrorEnvelope.status, 502);
assert.equal((await providerErrorEnvelope.json()).error.code, 'provider_unavailable');

const cacheMatchFailure = await post(cacheRequest, marketEnv({
  __MARKET_CACHE: {
    async match() { throw new Error('cache unavailable'); },
    async put() {}
  }
}));
assert.equal(cacheMatchFailure.status, 200);
assert.equal((await cacheMatchFailure.json()).status, 'live');

const corruptCacheEntry = await post(cacheRequest, marketEnv({
  __MARKET_CACHE: {
    async match() { return new Response('{'); },
    async put() {}
  }
}));
assert.equal(corruptCacheEntry.status, 200);
assert.equal((await corruptCacheEntry.json()).status, 'live');

const cachePutFailure = await post(cacheRequest, marketEnv({
  __MARKET_CACHE: {
    async match() { return undefined; },
    async put() { throw new Error('cache write unavailable'); }
  }
}));
assert.equal(cachePutFailure.status, 200);
assert.equal((await cachePutFailure.json()).status, 'live');

const semanticCacheNow = TEST_NOW;
const validCachePayload = await (await post(cacheRequest)).json();
const malformedCacheEntries = [
  ['null payload', { cachedAt: semanticCacheNow, payload: null }],
  ['empty payload', { cachedAt: semanticCacheNow, payload: {} }],
  ['missing cachedAt', { payload: validCachePayload }],
  ['non-finite cachedAt', { cachedAt: Infinity, payload: validCachePayload }],
  ['future cachedAt', { cachedAt: semanticCacheNow + 1, payload: validCachePayload }],
  ['wrong payload kind', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, kind: 'other' } }],
  ['unsupported status', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, status: 'unknown' } }],
  ['missing request', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, request: null } }],
  ['missing asset', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, asset: null } }],
  ['missing quote', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, quote: null } }],
  ['quote missing required fields', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, quote: { price: validCachePayload.quote.price, timestamp: validCachePayload.quote.timestamp } } }],
  ['non-finite quote price', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, quote: { ...validCachePayload.quote, price: Infinity } } }],
  ['non-positive quote price', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, quote: { ...validCachePayload.quote, price: 0 } } }],
  ['invalid quote timestamp', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, quote: { ...validCachePayload.quote, timestamp: 'not-a-date' } } }],
  ['invalid series points', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, series: { ...validCachePayload.series, points: null } } }],
  ['malformed series point', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, series: { ...validCachePayload.series, points: [null] } } }],
  ['missing conversion', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, conversion: null } }],
  ['empty conversion', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, conversion: {} } }],
  ['missing meta', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, meta: null } }],
  ['empty meta', { cachedAt: semanticCacheNow, payload: { ...validCachePayload, meta: {} } }]
];
for (const [label, entry] of malformedCacheEntries) {
  const response = await post(cacheRequest, marketEnv({
    __MARKET_NOW: () => semanticCacheNow,
    __MARKET_CACHE: {
      async match() { return { async json() { return entry; } }; },
      async put() {}
    }
  }));
  assert.equal(response.status, 200, label);
  const payload = await response.json();
  assert.equal(payload.status, 'live', label);
  assert.equal(payload.meta.cached, false, label);
}

const malformedStaleEntry = {
  cachedAt: semanticCacheNow - 2 * 60_000,
  payload: { ...validCachePayload, quote: null }
};
const malformedStaleResponse = await post(cacheRequest, marketEnv({
  __MARKET_NOW: () => semanticCacheNow,
  __MARKET_CACHE: {
    async match() { return { async json() { return malformedStaleEntry; } }; },
    async put() {}
  },
  __MARKET_FETCH: async () => new Response('', { status: 429 })
}));
assert.equal(malformedStaleResponse.status, 429);
assert.equal((await malformedStaleResponse.json()).error.code, 'rate_limited');

let boundaryNow = TEST_NOW;
let boundaryMode = 'live';
let boundaryProviderCalls = 0;
const boundaryEnvironment = marketEnv({
  __MARKET_NOW: () => boundaryNow,
  __MARKET_FETCH: async (url) => {
    boundaryProviderCalls += 1;
    if (boundaryMode === 'rate-limit') {
      return new Response('', { status: 429, headers: { 'Retry-After': '30' } });
    }
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/quote')) return Response.json({ symbol: 'XAU/USD', name: 'Gold Spot', currency: 'USD', close: '2412.50', open: '2400.00', high: '2420.00', low: '2395.00', previous_close: '2390.00', change: '22.50', percent_change: '0.9414', timestamp: 1784703600, is_market_open: false });
    if (parsed.pathname.endsWith('/time_series')) return Response.json({ meta: { symbol: 'XAU/USD', currency: 'USD', timezone: 'UTC' }, values: [{ datetime: '2026-07-22 07:00:00', close: '2412.50' }] });
    return Response.json({ symbol: 'USD/AED', rate: '3.6725', timestamp: 1784703600 });
  }
});
assert.equal((await post(cacheRequest, boundaryEnvironment)).status, 200);
const boundaryInitialCalls = boundaryProviderCalls;
boundaryNow += 60_000;
const exactFreshBoundary = await (await post(cacheRequest, boundaryEnvironment)).json();
assert.equal(exactFreshBoundary.status, 'live');
assert.equal(exactFreshBoundary.meta.cached, true);
assert.equal(boundaryProviderCalls, boundaryInitialCalls);

boundaryMode = 'rate-limit';
boundaryNow = TEST_NOW + 15 * 60_000;
const exactStaleBoundary = await (await post(cacheRequest, boundaryEnvironment)).json();
assert.equal(exactStaleBoundary.status, 'stale');
assert.equal(exactStaleBoundary.meta.stale, true);
assert.equal(exactStaleBoundary.meta.servedAt, '2026-07-22T07:20:00.000Z');

boundaryNow += 1;
const beyondStaleBoundary = await post(cacheRequest, boundaryEnvironment);
assert.equal(beyondStaleBoundary.status, 429);
assert.equal((await beyondStaleBoundary.json()).error.code, 'rate_limited');

let coalescedProviderCalls = 0;
const coalescingEnvironment = marketEnv({
  __MARKET_CACHE: { async match() {}, async put() {} },
  __MARKET_FETCH: async (url) => {
    coalescedProviderCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return providerFor()(url);
  }
});
const [coalescedOne, coalescedTwo] = await Promise.all([
  postRaw(JSON.stringify(cacheRequest), coalescingEnvironment, { 'CF-Connecting-IP': '198.51.100.10' }),
  postRaw(JSON.stringify({ ...cacheRequest, amount: 5 }), coalescingEnvironment, { 'CF-Connecting-IP': '198.51.100.10' })
]);
assert.equal(coalescedOne.status, 200);
assert.equal(coalescedTwo.status, 200);
assert.equal((await coalescedTwo.json()).conversion.amount, 5);
assert.equal(coalescedProviderCalls, 2);

const quotaEnvironment = marketEnv({
  __MARKET_CACHE: { async match() {}, async put() {} },
  __MARKET_FETCH: providerFor()
});
for (let index = 0; index < 20; index += 1) {
  const response = await postRaw(JSON.stringify(cacheRequest), quotaEnvironment, { 'CF-Connecting-IP': '198.51.100.20' });
  assert.equal(response.status, 200, `allowed burst request ${index + 1}`);
}
const quotaResponse = await postRaw(JSON.stringify(cacheRequest), quotaEnvironment, { 'CF-Connecting-IP': '198.51.100.20' });
assert.equal(quotaResponse.status, 429);
assert.equal(quotaResponse.headers.get('Retry-After'), '60');
assert.deepEqual(await quotaResponse.json(), {
  error: { code: 'rate_limited', message: 'Too many market requests.', retryAfter: 60 }
});

const cachedQuotaEnvironment = marketEnv();
assert.equal((await postRaw(JSON.stringify(cacheRequest), cachedQuotaEnvironment, { 'CF-Connecting-IP': '198.51.100.30' })).status, 200);
for (let index = 0; index < 19; index += 1) {
  const response = await postRaw(JSON.stringify({ ...cacheRequest, amount: index + 1 }), cachedQuotaEnvironment, { 'CF-Connecting-IP': '198.51.100.30' });
  assert.equal(response.status, 200, `cached refresh ${index + 1}`);
  assert.equal((await response.json()).meta.cached, true);
}
const cachedQuotaResponse = await postRaw(JSON.stringify(cacheRequest), cachedQuotaEnvironment, { 'CF-Connecting-IP': '198.51.100.30' });
assert.equal(cachedQuotaResponse.status, 429);
assert.equal(cachedQuotaResponse.headers.get('Retry-After'), '60');

const overflowCacheEnvironment = marketEnv({
  __MARKET_FETCH: providerFor({
    quote: { close: '1e300', high: '1e300', low: '1e300', previous_close: '1e300' },
    series: { values: [{ datetime: '2026-07-22 07:00:00', close: '1e300' }] }
  })
});
assert.equal((await post({ ...cacheRequest, amount: 1e-10 }, overflowCacheEnvironment)).status, 200);
const overflowCacheResponse = await post({ ...cacheRequest, amount: 1_000_000_000 }, overflowCacheEnvironment);
assert.equal(overflowCacheResponse.status, 502);
assert.doesNotMatch(await overflowCacheResponse.text(), /null/);

const boundedLimiterEnvironment = marketEnv();
for (let index = 0; index < 20; index += 1) {
  assert.equal((await postRaw(JSON.stringify(cacheRequest), boundedLimiterEnvironment, { 'CF-Connecting-IP': '198.51.100.40' })).status, 200);
}
for (let index = 0; index < 1_000; index += 1) {
  const response = await postRaw(JSON.stringify(cacheRequest), boundedLimiterEnvironment, { 'CF-Connecting-IP': `203.0.${Math.floor(index / 250)}.${index % 250}` });
  assert.equal(response.status, 200, `bounded limiter client ${index + 1}`);
}
assert.equal((await postRaw(JSON.stringify(cacheRequest), boundedLimiterEnvironment, { 'CF-Connecting-IP': '198.51.100.40' })).status, 200);

console.log('Market Worker contract passed.');
