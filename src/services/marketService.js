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

function isNormalizedMarketResponse(data) {
  return data !== null
    && typeof data === 'object'
    && data.kind === 'market'
    && ['live', 'delayed', 'stale'].includes(data.status)
    && data.quote !== null
    && typeof data.quote === 'object'
    && Number.isFinite(data.quote.price)
    && data.quote.price > 0;
}

export async function fetchMarketData(request, signal = null) {
  const response = await fetch(MARKET_PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    ...(signal ? { signal } : {})
  });
  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (response.ok) {
      throw new MarketApiError(
        'invalid_market_response',
        'Market data temporarily unavailable.',
        response.status
      );
    }
    data = {};
  }
  if (!response.ok) {
    throw new MarketApiError(
      data?.error?.code || 'market_unavailable',
      data?.error?.message || 'Market data temporarily unavailable.',
      response.status,
      data?.error?.retryAfter
    );
  }
  if (!isNormalizedMarketResponse(data)) {
    throw new MarketApiError(
      'invalid_market_response',
      'Market data temporarily unavailable.',
      response.status
    );
  }
  return data;
}

export function unavailableMarket(error) {
  return {
    kind: 'market',
    status: 'unavailable',
    error: {
      code: error?.code || 'market_unavailable',
      message: error?.message || 'Market data temporarily unavailable.',
      ...(error?.retryAfter ? { retryAfter: error.retryAfter } : {})
    }
  };
}
