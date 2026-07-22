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
    throw new MarketApiError(
      data?.error?.code || 'market_unavailable',
      data?.error?.message || 'Market data temporarily unavailable.',
      response.status,
      data?.error?.retryAfter
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
