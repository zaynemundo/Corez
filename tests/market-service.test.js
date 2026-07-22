/* global AbortController, console, DOMException, Response */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMarketData } from '../src/services/marketService.js';
import { generateAIResponse } from '../src/services/aiService.js';
import {
  isCurrentMarketRefresh,
  nextMarketRefreshVersion,
  replaceMarketMessageInSession,
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
    })).toEqual({
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
      { id: 'origin', messages: [{ role: 'assistant', type: 'market', content: '', request: { assetId: 'gold' }, market: { status: 'live' } }] },
      { id: 'active-now', messages: [{ role: 'assistant', content: 'Old answer' }] }
    ];
    const nextRequest = { assetId: 'bitcoin' };
    const nextMarket = { status: 'live', asset: { id: 'bitcoin' } };

    const updated = replaceMarketMessageInSession(sessions, 'origin', 0, nextRequest, nextMarket);

    expect(updated[0].messages[0]).toEqual(expect.objectContaining({ request: nextRequest, market: nextMarket }));
    expect(updated[1]).toBe(sessions[1]);
    expect(sessions[0].messages[0].request).toEqual({ assetId: 'gold' });
  });

  it('rejects stale refresh completions after a newer refresh starts', () => {
    const versions = new Map();
    const key = JSON.stringify(['origin', 0]);
    const olderVersion = nextMarketRefreshVersion(versions, key);
    const newerVersion = nextMarketRefreshVersion(versions, key);

    expect(isCurrentMarketRefresh(versions, key, olderVersion)).toBe(false);
    expect(isCurrentMarketRefresh(versions, key, newerVersion)).toBe(true);

    versions.delete(key);
    const laterVersion = nextMarketRefreshVersion(versions, key);
    expect(isCurrentMarketRefresh(versions, key, olderVersion)).toBe(false);
    expect(isCurrentMarketRefresh(versions, key, laterVersion)).toBe(true);
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
