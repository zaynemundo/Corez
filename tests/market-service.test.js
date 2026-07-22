/* global AbortController, console, DOMException, Response */
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
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ kind: 'market', status: 'live', quote: { price: 2412.5 } }));
    vi.stubGlobal('fetch', fetchMock);
    const request = { assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null };

    await expect(fetchMarketData(request)).resolves.toMatchObject({ status: 'live' });
    expect(fetchMock).toHaveBeenCalledWith('/api/market', expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }));
  });

  it('forwards an abort signal to the market endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ kind: 'market', status: 'live', quote: { price: 2412.5 } }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await fetchMarketData({ assetId: 'gold' }, controller.signal);

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
      if (url === '/api/market') return Response.json({ kind: 'market', status: 'live', quote: { price: 2412.5 } });
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
