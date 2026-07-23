import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMarketData } from '../src/services/marketService.js';
import { generateAIResponse } from '../src/services/aiService.js';
import {
  marketRefreshKey,
  normalizeMarketMessageIds,
  replaceMarketMessageInSession,
  runMarketRefresh,
  toAssistantMessage
} from '../src/App.jsx';

const GOLD_REQUEST = Object.freeze({
  assetId: 'gold',
  symbol: 'XAU/USD',
  assetClass: 'metal',
  currency: 'USD',
  amount: 1,
  unit: 'troy_ounce',
  range: '1D',
  conversion: null
});
const SERVED_AT = '2026-07-22T07:05:00.000Z';

function validGoldResponse() {
  return {
    kind: 'market',
    status: 'live',
    request: { ...GOLD_REQUEST },
    asset: { id: 'gold', class: 'metal', symbol: 'XAU/USD', name: 'Gold Spot' },
    quote: {
      price: 2412.5,
      currency: 'USD',
      change: 22.5,
      changePercent: 0.9414,
      high: 2420,
      low: 2395,
      previousClose: 2390,
      marketOpen: true,
      timestamp: '2026-07-22T07:00:00.000Z'
    },
    series: {
      range: '1D',
      points: [
        { timestamp: '2026-07-22T06:55:00.000Z', value: 2400 },
        { timestamp: '2026-07-22T07:00:00.000Z', value: 2412.5 }
      ]
    },
    conversion: { amount: 1, unit: 'troy_ounce', value: 2412.5, currency: 'USD' },
    meta: { source: 'Twelve Data', cached: false, stale: false, servedAt: SERVED_AT }
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('assistant market message persistence', () => {
  it('keeps legacy text responses in the historical message shape', () => {
    expect(toAssistantMessage('Old answer')).toEqual({ role: 'assistant', content: 'Old answer' });
  });

  it('normalizes structured market responses for localStorage persistence', () => {
    expect(toAssistantMessage({
      type: 'market',
      request: { assetId: 'gold' },
      market: { status: 'live' }
    }, () => 'market-new')).toEqual({
      id: 'market-new',
      role: 'assistant',
      type: 'market',
      content: '',
      request: { assetId: 'gold' },
      market: { status: 'live' }
    });
  });

  it.each([null, undefined, 42, {}, { type: 'market' }])('safely normalizes an invalid response shape: %j', (response) => {
    expect(toAssistantMessage(response)).toEqual({ role: 'assistant', content: '' });
  });

  it('updates only the exact originating session and message', () => {
    const sessions = [
      { id: 'origin', messages: [{ id: 'market-gold', role: 'assistant', type: 'market', content: '', request: { assetId: 'gold' }, market: { status: 'live' } }] },
      { id: 'active-now', messages: [{ role: 'assistant', content: 'Old answer' }] }
    ];
    const nextRequest = { assetId: 'bitcoin' };
    const nextMarket = { status: 'live', asset: { id: 'bitcoin' } };

    const updated = replaceMarketMessageInSession(sessions, 'origin', 'market-gold', nextRequest, nextMarket);

    expect(updated[0].messages[0]).toEqual(expect.objectContaining({ request: nextRequest, market: nextMarket }));
    expect(updated[1]).toBe(sessions[1]);
    expect(sessions[0].messages[0].request).toEqual({ assetId: 'gold' });
  });

  it('migrates legacy market messages to unique stable IDs without changing text messages', () => {
    const textMessage = { role: 'assistant', content: 'Old answer' };
    const generatedIds = ['already-stable', 'market-migrated-1', 'market-migrated-2'][Symbol.iterator]();
    const sessions = [{
      id: 'legacy',
      messages: [
        textMessage,
        { role: 'assistant', type: 'market', content: '', request: {}, market: {} },
        { id: 'already-stable', role: 'assistant', type: 'market', content: '', request: {}, market: {} },
        { id: 'already-stable', role: 'assistant', type: 'market', content: '', request: {}, market: {} }
      ]
    }];

    const migrated = normalizeMarketMessageIds(sessions, () => generatedIds.next().value);

    expect(migrated[0].messages[0]).toBe(textMessage);
    expect(migrated[0].messages.map((message) => message.id)).toEqual([
      undefined,
      'market-migrated-1',
      'already-stable',
      'market-migrated-2'
    ]);
    expect(normalizeMarketMessageIds(migrated, () => 'must-not-run')).toEqual(migrated);
  });

  it('updates by stable ID after preceding messages reorder and no-ops after deletion', () => {
    const target = { id: 'market-target', role: 'assistant', type: 'market', content: '', request: {}, market: { quote: { price: 1 } } };
    const reordered = [{ id: 'origin', messages: [target, { role: 'assistant', content: 'Earlier text' }] }];

    const updated = replaceMarketMessageInSession(reordered, 'origin', 'market-target', { assetId: 'gold' }, { quote: { price: 2 } });
    expect(updated[0].messages[0].market.quote.price).toBe(2);
    expect(replaceMarketMessageInSession([{ id: 'origin', messages: [] }], 'origin', 'market-target', {}, {}))
      .toEqual([{ id: 'origin', messages: [] }]);
  });

  it('keeps only the newest out-of-order completion for one card and never reuses tokens', async () => {
    const pending = [];
    let sessions = [{ id: 'origin', messages: [{ id: 'market-target', role: 'assistant', type: 'market', content: '', request: {}, market: { quote: { price: 1 } } }] }];
    let refreshing = new Set();
    const refreshTokens = new Map();
    const tokenSequence = { current: 0 };
    const options = {
      sessionId: 'origin', messageId: 'market-target', nextRequest: { assetId: 'gold' }, refreshTokens, tokenSequence,
      setSessions: (update) => { sessions = update(sessions); },
      setRefreshingMarketKeys: (update) => { refreshing = update(refreshing); },
      fetchMarket: () => new Promise((resolve) => pending.push(resolve))
    };

    const older = runMarketRefresh(options);
    const newer = runMarketRefresh(options);
    expect(tokenSequence.current).toBe(2);
    pending[1]({ quote: { price: 3 } });
    await newer;
    pending[0]({ quote: { price: 2 } });
    await older;

    expect(sessions[0].messages[0].market.quote.price).toBe(3);
    expect(refreshing).toEqual(new Set());

    const later = runMarketRefresh({ ...options, fetchMarket: async () => ({ quote: { price: 4 } }) });
    await later;
    expect(tokenSequence.current).toBe(3);
    expect(sessions[0].messages[0].market.quote.price).toBe(4);
  });

  it('tracks concurrent cards independently and resolves by message ID after reorder', async () => {
    const pending = new Map();
    let sessions = [{ id: 'origin', messages: [
      { id: 'market-a', role: 'assistant', type: 'market', content: '', request: {}, market: { quote: { price: 1 } } },
      { id: 'market-b', role: 'assistant', type: 'market', content: '', request: {}, market: { quote: { price: 10 } } }
    ] }];
    let refreshing = new Set();
    const common = {
      sessionId: 'origin', refreshTokens: new Map(), tokenSequence: { current: 0 },
      setSessions: (update) => { sessions = update(sessions); },
      setRefreshingMarketKeys: (update) => { refreshing = update(refreshing); },
      fetchMarket: (request) => new Promise((resolve) => pending.set(request.assetId, resolve))
    };
    const refreshA = runMarketRefresh({ ...common, messageId: 'market-a', nextRequest: { assetId: 'a' } });
    const refreshB = runMarketRefresh({ ...common, messageId: 'market-b', nextRequest: { assetId: 'b' } });
    expect(refreshing).toEqual(new Set([
      marketRefreshKey('origin', 'market-a'),
      marketRefreshKey('origin', 'market-b')
    ]));

    sessions = [{ ...sessions[0], messages: [...sessions[0].messages].reverse() }];
    pending.get('a')({ quote: { price: 2 } });
    await refreshA;
    expect(refreshing).toEqual(new Set([marketRefreshKey('origin', 'market-b')]));
    expect(sessions[0].messages.find((message) => message.id === 'market-a').market.quote.price).toBe(2);

    sessions = [{ ...sessions[0], messages: sessions[0].messages.filter((message) => message.id !== 'market-b') }];
    pending.get('b')({ quote: { price: 20 } });
    await refreshB;
    expect(sessions[0].messages.some((message) => message.id === 'market-b')).toBe(false);
    expect(refreshing).toEqual(new Set());
  });

  it('maps current failures safely and leaves prior data intact on abort', async () => {
    const originalMarket = { quote: { price: 1 } };
    let sessions = [{ id: 'origin', messages: [{ id: 'market-a', role: 'assistant', type: 'market', content: '', request: {}, market: originalMarket }] }];
    let refreshing = new Set();
    const common = {
      sessionId: 'origin', messageId: 'market-a', nextRequest: { assetId: 'gold' },
      refreshTokens: new Map(), tokenSequence: { current: 0 },
      setSessions: (update) => { sessions = update(sessions); },
      setRefreshingMarketKeys: (update) => { refreshing = update(refreshing); }
    };

    await runMarketRefresh({
      ...common,
      fetchMarket: async () => { throw Object.assign(new Error('Provider unavailable'), { code: 'provider_unavailable' }); },
      toUnavailable: (error) => ({ status: 'unavailable', error: { code: error.code, message: 'Safe error' } })
    });
    expect(sessions[0].messages[0].market).toEqual({
      status: 'unavailable',
      error: { code: 'provider_unavailable', message: 'Safe error' }
    });
    expect(refreshing).toEqual(new Set());

    sessions = [{ id: 'origin', messages: [{ id: 'market-a', role: 'assistant', type: 'market', content: '', request: {}, market: originalMarket }] }];
    await runMarketRefresh({
      ...common,
      refreshTokens: new Map(),
      tokenSequence: { current: 0 },
      fetchMarket: async () => { throw new DOMException('Cancelled', 'AbortError'); }
    });
    expect(sessions[0].messages[0].market).toBe(originalMarket);
    expect(refreshing).toEqual(new Set());
  });
});

describe('fetchMarketData', () => {
  it('posts a normalized request to the market endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(validGoldResponse()));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchMarketData(GOLD_REQUEST)).resolves.toMatchObject({ status: 'live' });
    expect(fetchMock).toHaveBeenCalledWith('/api/market', expect.objectContaining({ method: 'POST', body: JSON.stringify(GOLD_REQUEST) }));
  });

  it('forwards an abort signal to the market endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(validGoldResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await fetchMarketData(GOLD_REQUEST, controller.signal);

    expect(fetchMock).toHaveBeenCalledWith('/api/market', expect.objectContaining({ signal: controller.signal }));
  });

  it('returns a safe structured error without inventing a price', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'rate_limited', message: 'Market data rate limit reached.', retryAfter: 30 } }, { status: 429 })));

    await expect(fetchMarketData({ assetId: 'gold' })).rejects.toMatchObject({ code: 'rate_limited', retryAfter: 30 });
  });

  it.each([
    ['an empty body', ''],
    ['invalid JSON', 'not-json']
  ])('rejects a successful response with %s', async (_description, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    await expect(fetchMarketData({ assetId: 'gold' })).rejects.toMatchObject({
      code: 'invalid_market_response',
      message: 'Market data temporarily unavailable.'
    });
  });

  it('rejects a successful response without a normalized market envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({})));

    await expect(fetchMarketData({ assetId: 'gold' })).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it.each([
    ['the wrong kind', (body) => { body.kind = 'text'; }],
    ['an unsupported status', (body) => { body.status = 'unavailable'; }],
    ['a mismatched request asset', (body) => { body.request.assetId = 'silver'; }],
    ['a mismatched request symbol', (body) => { body.request.symbol = 'XAG/USD'; }],
    ['a mismatched request class', (body) => { body.request.assetClass = 'stock'; }],
    ['a mismatched request currency', (body) => { body.request.currency = 'AED'; }],
    ['a mismatched request amount', (body) => { body.request.amount = 2; }],
    ['a mismatched request unit', (body) => { body.request.unit = 'gram'; }],
    ['a mismatched request range', (body) => { body.request.range = '1W'; }],
    ['a mismatched request conversion', (body) => { body.request.conversion = { from: 'USD', to: 'AED' }; }],
    ['a mismatched asset id', (body) => { body.asset.id = 'silver'; }],
    ['a mismatched asset class', (body) => { body.asset.class = 'crypto'; }],
    ['a mismatched asset symbol', (body) => { body.asset.symbol = 'XAG/USD'; }],
    ['a mismatched asset name', (body) => { body.asset.name = 'Silver Spot'; }],
    ['a missing quote movement field', (body) => { delete body.quote.changePercent; }],
    ['a non-finite quote field', (body) => { body.quote.change = null; }],
    ['a non-positive quote price', (body) => { body.quote.price = 0; }],
    ['an unsupported quote currency', (body) => { body.quote.currency = 'CAD'; }],
    ['a quote currency different from the request', (body) => { body.quote.currency = 'AED'; }],
    ['a non-boolean market-open flag', (body) => { body.quote.marketOpen = 'true'; }],
    ['an invalid quote timestamp', (body) => { body.quote.timestamp = 'July 22'; }],
    ['an implausibly future quote timestamp', (body) => { body.quote.timestamp = '2999-01-01T00:00:00.000Z'; }],
    ['a mismatched series range', (body) => { body.series.range = '1W'; }],
    ['an empty series', (body) => { body.series.points = []; }],
    ['an invalid series timestamp', (body) => { body.series.points[0].timestamp = 'not-a-date'; }],
    ['a non-positive series value', (body) => { body.series.points[0].value = 0; }],
    ['a mismatched conversion amount', (body) => { body.conversion.amount = 2; }],
    ['a mismatched conversion unit', (body) => { body.conversion.unit = 'gram'; }],
    ['a mismatched conversion currency', (body) => { body.conversion.currency = 'AED'; }],
    ['a conversion value inconsistent with the quote', (body) => { body.conversion.value = 1; }],
    ['a non-finite conversion value', (body) => { body.conversion.value = null; }],
    ['an empty source label', (body) => { body.meta.source = ''; }],
    ['a spoofed source label', (body) => { body.meta.source = 'Trusted Data'; }],
    ['a non-boolean cached flag', (body) => { body.meta.cached = 0; }],
    ['a stale flag inconsistent with live status', (body) => { body.meta.stale = true; }],
    ['a delay flag inconsistent with live status', (body) => { body.meta.delayMinutes = 15; }],
    ['a missing serve timestamp', (body) => { delete body.meta.servedAt; }],
    ['a non-canonical serve timestamp', (body) => { body.meta.servedAt = '2026-07-22T07:05:00Z'; }]
  ])('rejects a successful response with %s', async (_description, mutate) => {
    const body = validGoldResponse();
    mutate(body);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).rejects.toMatchObject({
      code: 'invalid_market_response',
      message: 'Market data temporarily unavailable.'
    });
  });

  it.each([
    ['delayed', { cached: false, stale: false, delayMinutes: 15 }],
    ['stale', { cached: true, stale: true }]
  ])('accepts a complete %s response with consistent metadata', async (status, meta) => {
    const body = validGoldResponse();
    body.status = status;
    body.meta = { source: 'Twelve Data', servedAt: SERVED_AT, ...meta };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).resolves.toMatchObject({ status, meta });
  });

  it.each([
    ['delayed data without a positive delay', 'delayed', { cached: false, stale: false }],
    ['delayed data marked stale', 'delayed', { cached: true, stale: true, delayMinutes: 15 }],
    ['stale data not sourced from cache', 'stale', { cached: false, stale: true }],
    ['stale data without the stale flag', 'stale', { cached: true, stale: false }]
  ])('rejects %s', async (_description, status, meta) => {
    const body = validGoldResponse();
    body.status = status;
    body.meta = { source: 'Twelve Data', servedAt: SERVED_AT, ...meta };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it('validates direct FX identity using the requested currency pair', async () => {
    const request = {
      assetId: 'fx-eur', symbol: 'EUR/USD', assetClass: 'forex', currency: 'AED', amount: 100,
      unit: 'unit', range: '1D', conversion: { from: 'EUR', to: 'AED' }
    };
    const body = validGoldResponse();
    body.request = { ...request, conversion: { ...request.conversion } };
    body.asset = { id: 'fx-eur', class: 'forex', symbol: 'EUR/AED', name: 'EUR to AED' };
    body.quote = {
      price: 3.6725, currency: 'AED', change: 0.01, changePercent: 0.27, high: 3.68,
      low: 3.66, previousClose: 3.6625, marketOpen: true, timestamp: '2026-07-22T07:00:00.000Z'
    };
    body.series.range = '1D';
    body.series.points = [{ timestamp: '2026-07-22T07:00:00.000Z', value: 3.6725 }];
    body.conversion = { amount: 100, unit: 'unit', value: 367.25, currency: 'AED' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(request)).resolves.toMatchObject({ asset: { symbol: 'EUR/AED', name: 'EUR to AED' } });
  });

  it('rejects a direct FX response labeled with the canonical USD leg instead of the requested pair', async () => {
    const request = {
      assetId: 'fx-eur', symbol: 'EUR/USD', assetClass: 'forex', currency: 'AED', amount: 100,
      unit: 'unit', range: '1D', conversion: { from: 'EUR', to: 'AED' }
    };
    const body = validGoldResponse();
    body.request = { ...request, conversion: { ...request.conversion } };
    body.asset = { id: 'fx-eur', class: 'forex', symbol: 'EUR/USD', name: 'Euro' };
    body.quote = {
      price: 3.6725, currency: 'AED', change: 0.01, changePercent: 0.27, high: 3.68,
      low: 3.66, previousClose: 3.6625, marketOpen: true, timestamp: '2026-07-22T07:00:00.000Z'
    };
    body.series.points = [{ timestamp: '2026-07-22T07:00:00.000Z', value: 3.6725 }];
    body.conversion = { amount: 100, unit: 'unit', value: 367.25, currency: 'AED' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(request)).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it('rejects a direct FX response with a spoofed pair name', async () => {
    const request = {
      assetId: 'fx-eur', symbol: 'EUR/USD', assetClass: 'forex', currency: 'AED', amount: 100,
      unit: 'unit', range: '1D', conversion: { from: 'EUR', to: 'AED' }
    };
    const body = validGoldResponse();
    body.request = { ...request, conversion: { ...request.conversion } };
    body.asset = { id: 'fx-eur', class: 'forex', symbol: 'EUR/AED', name: 'EUR/AED' };
    body.quote = {
      price: 3.6725, currency: 'AED', change: 0.01, changePercent: 0.27, high: 3.68,
      low: 3.66, previousClose: 3.6625, marketOpen: true, timestamp: '2026-07-22T07:00:00.000Z'
    };
    body.series.points = [{ timestamp: '2026-07-22T07:00:00.000Z', value: 3.6725 }];
    body.conversion = { amount: 100, unit: 'unit', value: 367.25, currency: 'AED' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(request)).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it.each([
    ['reversed timestamps', (body) => { body.series.points.reverse(); }],
    ['duplicate timestamps', (body) => { body.series.points[1].timestamp = body.series.points[0].timestamp; }],
    ['a divergent latest value', (body) => { body.series.points[1].value = 1000; }],
    ['a point outside the requested range window', (body) => { body.series.points[0].timestamp = '2026-07-18T06:59:00.000Z'; }],
    ['a latest point too far from an open quote', (body) => {
      body.series.points = [{ timestamp: '2026-07-22T06:00:00.000Z', value: 2412.5 }];
    }],
    ['more than 500 points', (body) => {
      const end = Date.parse('2026-07-22T07:00:00.000Z');
      body.series.points = Array.from({ length: 501 }, (_value, index) => ({
        timestamp: new Date(end - (500 - index) * 60_000).toISOString(),
        value: 2412.5
      }));
    }]
  ])('rejects a series with %s', async (_description, mutate) => {
    const body = validGoldResponse();
    mutate(body);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it('uses Worker servedAt instead of the browser clock', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2001-01-01T00:00:00.000Z'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(validGoldResponse())));

    await expect(fetchMarketData(GOLD_REQUEST)).resolves.toMatchObject({ status: 'live' });
  });

  it('rejects a quote that is ancient relative to Worker servedAt', async () => {
    const body = validGoldResponse();
    body.quote.timestamp = '2026-07-20T07:00:00.000Z';
    body.series.points = [{ timestamp: '2026-07-20T07:00:00.000Z', value: 2412.5 }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it('accepts closed-market weekend timestamps within the Worker bounds', async () => {
    const body = validGoldResponse();
    body.status = 'delayed';
    body.quote.marketOpen = false;
    body.quote.timestamp = '2026-07-19T07:05:00.000Z';
    body.series.points = [{ timestamp: '2026-07-19T07:05:00.000Z', value: 2412.5 }];
    body.meta.delayMinutes = 3 * 24 * 60;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).resolves.toMatchObject({ status: 'delayed' });
  });

  it('rejects an old closed-market quote mislabeled as live', async () => {
    const body = validGoldResponse();
    body.quote.marketOpen = false;
    body.quote.timestamp = '2026-07-19T07:05:00.000Z';
    body.series.points = [{ timestamp: '2026-07-19T07:05:00.000Z', value: 2412.5 }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it('rejects a delayed response whose delay is shorter than its observed quote age', async () => {
    const body = validGoldResponse();
    body.status = 'delayed';
    body.quote.marketOpen = false;
    body.quote.timestamp = '2026-07-19T07:05:00.000Z';
    body.series.points = [{ timestamp: '2026-07-19T07:05:00.000Z', value: 2412.5 }];
    body.meta.delayMinutes = 15;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it.each([
    ['a fully reported 32-minute age', 32, '2026-07-22T06:33:00.000Z'],
    ['the sixty-minute cap', 60, '2026-07-22T06:05:00.000Z']
  ])('accepts an open delayed quote with %s', async (_description, delayMinutes, quoteTimestamp) => {
    const body = validGoldResponse();
    body.status = 'delayed';
    body.quote.timestamp = quoteTimestamp;
    body.series.points = [{ timestamp: quoteTimestamp, value: 2412.5 }];
    body.meta.delayMinutes = delayMinutes;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).resolves.toMatchObject({ status: 'delayed' });
  });

  it.each([
    ['an understated observed age', 30, '2026-07-22T06:33:00.000Z'],
    ['a quote beyond the sixty-minute cap', 61, '2026-07-22T06:04:59.999Z']
  ])('rejects an open delayed quote with %s', async (_description, delayMinutes, quoteTimestamp) => {
    const body = validGoldResponse();
    body.status = 'delayed';
    body.quote.timestamp = quoteTimestamp;
    body.series.points = [{ timestamp: quoteTimestamp, value: 2412.5 }];
    body.meta.delayMinutes = delayMinutes;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it.each([
    ['accepts', 32, true],
    ['rejects', 30, false]
  ])('%s a stale open quote with servedAt-relative delay evidence', async (_verb, delayMinutes, accepted) => {
    const body = validGoldResponse();
    body.status = 'stale';
    body.quote.timestamp = '2026-07-22T06:33:00.000Z';
    body.series.points = [{ timestamp: body.quote.timestamp, value: 2412.5 }];
    body.meta = {
      source: 'Twelve Data', servedAt: SERVED_AT, cached: true, stale: true, delayMinutes
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    const result = fetchMarketData(GOLD_REQUEST);
    if (accepted) await expect(result).resolves.toMatchObject({ status: 'stale' });
    else await expect(result).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it.each([
    ['rejects', 1, false],
    ['accepts', 10, true]
  ])('%s a ten-minute-old stale open quote with delayMinutes=%i', async (_verb, delayMinutes, accepted) => {
    const body = validGoldResponse();
    body.status = 'stale';
    body.quote.timestamp = '2026-07-22T06:55:00.000Z';
    body.series.points = [{ timestamp: body.quote.timestamp, value: 2412.5 }];
    body.meta = {
      source: 'Twelve Data', servedAt: SERVED_AT, cached: true, stale: true, delayMinutes
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    const result = fetchMarketData(GOLD_REQUEST);
    if (accepted) await expect(result).resolves.toMatchObject({ status: 'stale' });
    else await expect(result).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it.each([
    ['accepts', 'five minutes', '2026-07-22T07:00:00.000Z', true],
    ['accepts', 'ten minutes', '2026-07-22T06:55:00.000Z', true],
    ['rejects', 'more than fifteen minutes', '2026-07-22T06:49:59.999Z', false]
  ])('%s a stale open quote aged %s without delay metadata', async (_verb, _age, quoteTimestamp, accepted) => {
    const body = validGoldResponse();
    body.status = 'stale';
    body.quote.timestamp = quoteTimestamp;
    body.series.points = [{ timestamp: quoteTimestamp, value: 2412.5 }];
    body.meta = { source: 'Twelve Data', servedAt: SERVED_AT, cached: true, stale: true };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    const result = fetchMarketData(GOLD_REQUEST);
    if (accepted) await expect(result).resolves.toMatchObject({ status: 'stale' });
    else await expect(result).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it.each([
    ['accepts', '2026-07-19T19:05:00.000Z', true],
    ['rejects', '2026-07-19T19:04:59.999Z', false]
  ])('%s a closed-market latest series point at the twelve-hour boundary', async (_verb, pointTimestamp, accepted) => {
    const body = validGoldResponse();
    body.status = 'delayed';
    body.quote.marketOpen = false;
    body.quote.timestamp = '2026-07-20T07:05:00.000Z';
    body.series.points = [{ timestamp: pointTimestamp, value: 2412.5 }];
    body.meta.delayMinutes = 2 * 24 * 60;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    const result = fetchMarketData(GOLD_REQUEST);
    if (accepted) await expect(result).resolves.toMatchObject({ status: 'delayed' });
    else await expect(result).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it('rejects an underflowed expected conversion even when the reported value is positive', async () => {
    const request = { ...GOLD_REQUEST, amount: Number.MIN_VALUE, unit: 'gram' };
    const body = validGoldResponse();
    body.request = { ...request };
    body.conversion = { amount: request.amount, unit: 'gram', value: Number.MIN_VALUE, currency: 'USD' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(request)).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it('rejects an overflowed expected conversion even when the reported value is finite', async () => {
    const request = { ...GOLD_REQUEST, amount: 1_000_000_000 };
    const body = validGoldResponse();
    body.request = { ...request };
    body.quote = {
      ...body.quote,
      price: Number.MAX_VALUE,
      high: Number.MAX_VALUE,
      previousClose: Number.MAX_VALUE
    };
    body.series.points = [{ timestamp: '2026-07-22T07:00:00.000Z', value: Number.MAX_VALUE }];
    body.conversion = {
      amount: request.amount, unit: request.unit, value: Number.MAX_VALUE, currency: request.currency
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(request)).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it('uses relative tolerance for small positive conversion values', async () => {
    const body = validGoldResponse();
    body.quote = { ...body.quote, price: 1e-8, high: 2e-8, low: 0.5e-8, previousClose: 1e-8 };
    body.series.points = [{ timestamp: '2026-07-22T07:00:00.000Z', value: 1e-8 }];
    body.conversion.value = 1.05e-8;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it('does not use a fixed absolute conversion tolerance floor', async () => {
    const body = validGoldResponse();
    body.quote = { ...body.quote, price: 1e-15, high: 2e-15, low: 0.5e-15, previousClose: 1e-15 };
    body.series.points = [{ timestamp: '2026-07-22T07:00:00.000Z', value: 1e-15 }];
    body.conversion.value = 1e-12;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).rejects.toMatchObject({ code: 'invalid_market_response' });
  });

  it('accepts a small conversion value within relative tolerance', async () => {
    const expected = 1e-15;
    const body = validGoldResponse();
    body.quote = { ...body.quote, price: expected, high: 2e-15, low: 0.5e-15, previousClose: expected };
    body.series.points = [{ timestamp: '2026-07-22T07:00:00.000Z', value: expected }];
    body.conversion.value = expected * (1 + 5e-10);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    await expect(fetchMarketData(GOLD_REQUEST)).resolves.toMatchObject({ status: 'live' });
  });

  it('maps a non-JSON HTTP error to the safe default without exposing its body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<h1>gateway secret</h1>', { status: 502 })));

    await expect(fetchMarketData(GOLD_REQUEST)).rejects.toMatchObject({
      code: 'market_unavailable',
      message: 'Market data temporarily unavailable.',
      status: 502
    });
  });

  it.each([
    [502, { code: 'provider_unavailable', message: '<script>steal()</script>' }, 'provider_unavailable', 'Market data temporarily unavailable.'],
    [429, { code: 'rate_limited', message: 'internal quota id 123', retryAfter: 30 }, 'rate_limited', 'Market data rate limit reached.'],
    [418, { code: 'admin_debug', message: 'secret stack trace', retryAfter: 999999999 }, 'market_unavailable', 'Market data temporarily unavailable.']
  ])('sanitizes an HTTP %i JSON error', async (status, error, code, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error }, { status })));

    const rejection = expect(fetchMarketData(GOLD_REQUEST)).rejects;
    await rejection.toMatchObject({ code, message, status });
    await rejection.not.toMatchObject({ message: error.message });
  });

  it('drops an invalid or excessive retry delay', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      error: { code: 'rate_limited', message: 'unsafe', retryAfter: 999999999 }
    }, { status: 429 })));

    const error = await fetchMarketData(GOLD_REQUEST).catch((caught) => caught);
    expect(error).toMatchObject({ code: 'rate_limited', message: 'Market data rate limit reached.' });
    expect(error.retryAfter).toBeUndefined();
  });

  it('preserves cancellation while reading the response body', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(abortError)
    }));

    await expect(fetchMarketData({ assetId: 'gold' })).rejects.toBe(abortError);
  });
});

describe('generateAIResponse market interception', () => {
  it('returns a market response without calling /api/ai', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/market') return Response.json(validGoldResponse());
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateAIResponse('What is the price of gold?')).resolves.toMatchObject({ type: 'market', request: { assetId: 'gold' }, market: { status: 'live' } });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/ai', expect.anything());
  });

  it('normalizes market failures without falling through to hosted AI', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/market') return Response.json({ error: { code: 'provider_unavailable', message: 'Market data temporarily unavailable.' } }, { status: 502 });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateAIResponse('BTC price')).resolves.toEqual(expect.objectContaining({
      type: 'market',
      market: {
        kind: 'market',
        status: 'unavailable',
        error: { code: 'provider_unavailable', message: 'Market data temporarily unavailable.' }
      }
    }));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/ai', expect.anything());
  });

  it('normalizes a malformed successful market response without falling through to hosted AI', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/market') return new Response('', { status: 200 });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateAIResponse('What is the price of gold?')).resolves.toMatchObject({
      type: 'market',
      market: {
        kind: 'market',
        status: 'unavailable',
        error: { code: 'invalid_market_response', message: 'Market data temporarily unavailable.' }
      }
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/ai', expect.anything());
  });

  it('does not persist or render a successful response for a different request', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/market') {
        const body = validGoldResponse();
        body.request.assetId = 'silver';
        return Response.json(body);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateAIResponse('What is the price of gold?')).resolves.toMatchObject({
      type: 'market',
      request: GOLD_REQUEST,
      market: {
        kind: 'market',
        status: 'unavailable',
        error: { code: 'invalid_market_response', message: 'Market data temporarily unavailable.' }
      }
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/ai', expect.anything());
  });

  it('propagates market request cancellation', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    await expect(generateAIResponse('AAPL quote')).rejects.toBe(abortError);
  });
});

describe('explicit financial app generation', () => {
  it.each([
    'Build a bitcoin market dashboard',
    'Create a gold market dashboard',
    'Design an AAPL stock dashboard'
  ])('keeps %s on the app path without calling the market endpoint', async (prompt) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/ai') return Response.json({ error: { code: 'provider_unavailable' } }, { status: 503 });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const responsePromise = generateAIResponse(prompt);
    await vi.runAllTimersAsync();

    await expect(responsePromise).resolves.toContain('COREZ Financial Demo Terminal');
    await expect(responsePromise).resolves.toContain('DEMO DATA');
    await expect(responsePromise).resolves.not.toContain('LIVE DATA');
    await expect(responsePromise).resolves.not.toContain('Real-Time Financial Terminal');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/market', expect.anything());
  });

  it('leaves unsupported market-adjacent prompts on the hosted AI path', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/ai') return Response.json({ content: 'Hosted response unchanged.' });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateAIResponse('Tell me about gold mining history')).resolves.toBe('Hosted response unchanged.');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/market', expect.anything());
  });
});
