import { DISPLAY_CURRENCIES, getAssetById } from './marketCatalog.js';

export const MARKET_PROXY_ENDPOINT = '/api/market';

const MARKET_STATUSES = new Set(['live', 'delayed', 'stale']);
const MARKET_RANGES = new Set(['1D', '1W', '1M']);
const EARLIEST_MARKET_TIMESTAMP = Date.parse('2000-01-01T00:00:00.000Z');
const MAX_FUTURE_TIMESTAMP_MS = 5 * 60_000;
const LIVE_MAX_AGE_MS = 15 * 60_000;
const CLOSED_MAX_AGE_MS = 4 * 24 * 60 * 60_000;
const OPEN_LATEST_POINT_GAP_MS = 30 * 60_000;
const CLOSED_LATEST_POINT_GAP_MS = 12 * 60 * 60_000;
const DELAYED_QUOTE_GRACE_MS = 2 * 60_000;
const MAX_DELAYED_OPEN_AGE_MS = 60 * 60_000;
const CONVERSION_RELATIVE_TOLERANCE = 1e-9;
const MAX_SERIES_POINTS = 500;
const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;
const RANGE_WINDOWS_MS = new Map([
  ['1D', 4 * 24 * 60 * 60_000],
  ['1W', 10 * 24 * 60 * 60_000],
  ['1M', 40 * 24 * 60 * 60_000]
]);
const SAFE_HTTP_ERRORS = new Map([
  [400, new Map([
    ['invalid_json', 'Market request could not be processed.'],
    ['invalid_request', 'Invalid market request.']
  ])],
  [405, new Map([['method_not_allowed', 'Market request method is unsupported.']])],
  [413, new Map([['request_too_large', 'Market request is too large.']])],
  [415, new Map([['unsupported_media_type', 'Market request format is unsupported.']])],
  [429, new Map([['rate_limited', 'Market data rate limit reached.']])],
  [502, new Map([['provider_unavailable', 'Market data temporarily unavailable.']])],
  [503, new Map([['not_configured', 'Market data is not configured.']])]
]);

export class MarketApiError extends Error {
  constructor(code, message, status, retryAfter) {
    super(message);
    this.name = 'MarketApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveNumber(value) {
  return isFiniteNumber(value) && value > 0;
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    && new Date(timestamp).toISOString() === value
    && timestamp >= EARLIEST_MARKET_TIMESTAMP
    ? timestamp
    : null;
}

function isSameConversion(actual, expected) {
  if (expected === null) return actual === null;
  return isObject(actual)
    && actual.from === expected.from
    && actual.to === expected.to;
}

function isNormalizedRequest(request) {
  if (!isObject(request)) return false;
  const asset = getAssetById(request.assetId);
  if (!asset
    || request.symbol !== asset.symbol
    || request.assetClass !== asset.assetClass
    || !DISPLAY_CURRENCIES.includes(request.currency)
    || !MARKET_RANGES.has(request.range)
    || !isPositiveNumber(request.amount)
    || request.amount > 1_000_000_000) {
    return false;
  }
  const validUnit = asset.assetClass === 'metal'
    ? ['troy_ounce', 'gram', 'kilogram'].includes(request.unit)
    : request.unit === 'unit';
  if (!validUnit) return false;
  if (request.conversion === null) return true;
  return isObject(request.conversion)
    && asset.assetClass === 'forex'
    && DISPLAY_CURRENCIES.includes(request.conversion.from)
    && DISPLAY_CURRENCIES.includes(request.conversion.to)
    && request.assetId === `fx-${request.conversion.from.toLowerCase()}`
    && request.symbol === `${request.conversion.from}/USD`
    && request.currency === request.conversion.to;
}

function isSameRequest(actual, expected) {
  return isObject(actual)
    && actual.assetId === expected.assetId
    && actual.symbol === expected.symbol
    && actual.assetClass === expected.assetClass
    && actual.currency === expected.currency
    && actual.amount === expected.amount
    && actual.unit === expected.unit
    && actual.range === expected.range
    && isSameConversion(actual.conversion, expected.conversion);
}

function isMatchingAsset(asset, request) {
  if (!isObject(asset)) return false;
  const expected = getAssetById(request.assetId);
  if (!expected || asset.id !== expected.id || asset.class !== expected.assetClass) return false;
  if (request.conversion !== null) {
    return asset.symbol === `${request.conversion.from}/${request.conversion.to}`
      && asset.name === `${request.conversion.from} to ${request.conversion.to}`;
  }
  return asset.symbol === expected.symbol && asset.name === expected.name;
}

function isValidQuote(quote, request, servedAt, status, meta) {
  const quoteTime = canonicalTimestamp(quote?.timestamp);
  const openMaxAge = ['delayed', 'stale'].includes(status) && isPositiveNumber(meta?.delayMinutes)
    ? Math.min(
      MAX_DELAYED_OPEN_AGE_MS,
      Math.max(LIVE_MAX_AGE_MS, meta.delayMinutes * 60_000 + DELAYED_QUOTE_GRACE_MS)
    )
    : LIVE_MAX_AGE_MS;
  return isObject(quote)
    && isPositiveNumber(quote.price)
    && DISPLAY_CURRENCIES.includes(quote.currency)
    && quote.currency === request.currency
    && isFiniteNumber(quote.change)
    && isFiniteNumber(quote.changePercent)
    && isPositiveNumber(quote.high)
    && isPositiveNumber(quote.low)
    && quote.high >= quote.low
    && isPositiveNumber(quote.previousClose)
    && typeof quote.marketOpen === 'boolean'
    && quoteTime !== null
    && quoteTime <= servedAt + MAX_FUTURE_TIMESTAMP_MS
    && servedAt - quoteTime <= (quote.marketOpen ? openMaxAge : CLOSED_MAX_AGE_MS);
}

function isValidSeries(series, request, quote, servedAt) {
  if (!isObject(series)
    || series.range !== request.range
    || !Array.isArray(series.points)
    || series.points.length < 1
    || series.points.length > MAX_SERIES_POINTS) {
    return false;
  }
  const quoteTime = canonicalTimestamp(quote.timestamp);
  const oldestAllowed = quoteTime - RANGE_WINDOWS_MS.get(request.range);
  let previousTime = -Infinity;
  for (const point of series.points) {
    const pointTime = canonicalTimestamp(point?.timestamp);
    if (!isObject(point)
      || pointTime === null
      || pointTime <= previousTime
      || pointTime < oldestAllowed
      || pointTime > quoteTime + MAX_FUTURE_TIMESTAMP_MS
      || pointTime > servedAt + MAX_FUTURE_TIMESTAMP_MS
      || !isPositiveNumber(point.value)) {
      return false;
    }
    previousTime = pointTime;
  }
  const latest = series.points.at(-1);
  const latestTime = canonicalTimestamp(latest.timestamp);
  const latestGap = Math.abs(quoteTime - latestTime);
  const maxLatestGap = quote.marketOpen ? OPEN_LATEST_POINT_GAP_MS : CLOSED_LATEST_POINT_GAP_MS;
  const relativeDifference = Math.abs(latest.value - quote.price) / quote.price;
  return latestGap <= maxLatestGap
    && Number.isFinite(relativeDifference)
    && relativeDifference <= 0.25;
}

function expectedConversionValue(request, price) {
  if (request.assetClass !== 'metal' || request.unit === 'troy_ounce') {
    return request.amount * price;
  }
  const ounces = request.unit === 'gram'
    ? request.amount / 31.1034768
    : request.amount * 1000 / 31.1034768;
  return ounces * price;
}

function isApproximatelyEqual(actual, expected) {
  return Math.abs(actual - expected) <= Math.abs(expected) * CONVERSION_RELATIVE_TOLERANCE;
}

function isValidConversion(conversion, request, quote) {
  const expected = expectedConversionValue(request, quote.price);
  return isObject(conversion)
    && conversion.amount === request.amount
    && conversion.unit === request.unit
    && conversion.currency === request.currency
    && DISPLAY_CURRENCIES.includes(conversion.currency)
    && isPositiveNumber(conversion.value)
    && isPositiveNumber(expected)
    && isApproximatelyEqual(conversion.value, expected);
}

function isValidMeta(meta, status, quote) {
  const servedAt = canonicalTimestamp(meta?.servedAt);
  const quoteTime = canonicalTimestamp(quote?.timestamp);
  if (!isObject(meta)
    || meta.source !== 'Twelve Data'
    || typeof meta.cached !== 'boolean'
    || typeof meta.stale !== 'boolean'
    || servedAt === null
    || quoteTime === null) {
    return false;
  }
  if (status === 'live') {
    return meta.stale === false
      && meta.delayMinutes === undefined
      && servedAt - quoteTime <= LIVE_MAX_AGE_MS;
  }
  if (status === 'delayed') {
    const observedDelay = Math.ceil(Math.max(0, servedAt - quoteTime) / 60_000);
    return meta.stale === false
      && isPositiveNumber(meta.delayMinutes)
      && meta.delayMinutes >= observedDelay;
  }
  const observedDelay = Math.ceil(Math.max(0, servedAt - quoteTime) / 60_000);
  if (meta.cached !== true || meta.stale !== true) return false;
  if (!quote.marketOpen) {
    return meta.delayMinutes === undefined || isPositiveNumber(meta.delayMinutes);
  }
  if (meta.delayMinutes === undefined) {
    return servedAt - quoteTime <= LIVE_MAX_AGE_MS;
  }
  return isPositiveNumber(meta.delayMinutes) && meta.delayMinutes >= observedDelay;
}

function isNormalizedMarketResponse(data, submittedRequest) {
  const servedAt = canonicalTimestamp(data?.meta?.servedAt);
  const quoteTime = canonicalTimestamp(data?.quote?.timestamp);
  return isNormalizedRequest(submittedRequest)
    && isObject(data)
    && data.kind === 'market'
    && MARKET_STATUSES.has(data.status)
    && servedAt !== null
    && quoteTime !== null
    && isSameRequest(data.request, submittedRequest)
    && isMatchingAsset(data.asset, submittedRequest)
    && isValidQuote(data.quote, submittedRequest, servedAt, data.status, data.meta)
    && isValidSeries(data.series, submittedRequest, data.quote, servedAt)
    && isValidConversion(data.conversion, submittedRequest, data.quote)
    && isValidMeta(data.meta, data.status, data.quote);
}

function safeHttpError(data, status) {
  const code = data?.error?.code;
  const message = SAFE_HTTP_ERRORS.get(status)?.get(code);
  if (!message) {
    return { code: 'market_unavailable', message: 'Market data temporarily unavailable.' };
  }
  const retryAfter = data?.error?.retryAfter;
  const safeRetryAfter = code === 'rate_limited'
    && Number.isInteger(retryAfter)
    && retryAfter > 0
    && retryAfter <= MAX_RETRY_AFTER_SECONDS
    ? retryAfter
    : undefined;
  return { code, message, retryAfter: safeRetryAfter };
}

export async function fetchMarketData(request, signal = null) {
  const response = await fetch(MARKET_PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: signal || undefined
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
    const error = safeHttpError(data, response.status);
    throw new MarketApiError(
      error.code,
      error.message,
      response.status,
      error.retryAfter
    );
  }
  if (!isNormalizedMarketResponse(data, request)) {
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
