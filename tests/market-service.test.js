/* global AbortController, DOMException, Response */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMarketData } from '../src/services/marketService.js';
import { generateAIResponse, generateLocalAIResponse } from '../src/services/aiService.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ kind: 'market', status: 'live' }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await fetchMarketData({ assetId: 'gold' }, controller.signal);

    expect(fetchMock).toHaveBeenCalledWith('/api/market', expect.objectContaining({ signal: controller.signal }));
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

  it('propagates market request cancellation', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    await expect(generateAIResponse('AAPL quote')).rejects.toBe(abortError);
  });
});

describe('explicit financial app generation', () => {
  it('keeps generating a financial dashboard labeled as demo data', async () => {
    vi.useFakeTimers();
    const responsePromise = generateLocalAIResponse('Build a financial dashboard');
    await vi.runAllTimersAsync();

    await expect(responsePromise).resolves.toContain('COREZ Real-Time Financial Terminal');
    await expect(responsePromise).resolves.toContain('DEMO DATA');
    await expect(responsePromise).resolves.not.toContain('LIVE DATA');
  });
});
