const API_BASE = 'https://api.twelvedata.com';
const FRESH_MS = 60_000;
const STALE_MS = 15 * 60_000;
const ALLOWED_CURRENCIES = new Set(['USD', 'AED', 'EUR', 'GBP', 'JPY']);
const ALLOWED_RANGES = new Map([
  ['1D', { interval: '5min', outputsize: 78 }],
  ['1W', { interval: '1h', outputsize: 168 }],
  ['1M', { interval: '4h', outputsize: 180 }]
]);
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
  return Response.json(
    { error: { code, message, ...(retryAfter ? { retryAfter } : {}) } },
    { status }
  );
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
  if (!asset || body.symbol !== asset.symbol || body.assetClass !== asset.class) {
    throw new TypeError('Unsupported asset.');
  }
  if (!ALLOWED_CURRENCIES.has(body.currency) || !ALLOWED_RANGES.has(body.range)) {
    throw new TypeError('Unsupported currency or range.');
  }
  const amount = body.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    throw new TypeError('Invalid amount.');
  }
  const units = asset.class === 'metal'
    ? new Set(['troy_ounce', 'gram', 'kilogram'])
    : new Set(['unit']);
  if (!units.has(body.unit)) throw new TypeError('Unsupported unit.');

  if (body.conversion !== null) {
    const conversion = body.conversion;
    const isCanonicalConversion = conversion
      && typeof conversion === 'object'
      && !Array.isArray(conversion)
      && ALLOWED_CURRENCIES.has(conversion.from)
      && ALLOWED_CURRENCIES.has(conversion.to)
      && asset.class === 'forex'
      && asset.id === `fx-${conversion.from.toLowerCase()}`
      && asset.symbol === `${conversion.from}/USD`
      && body.currency === conversion.to;
    if (!isCanonicalConversion) throw new TypeError('Unsupported conversion.');
  }

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
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }
  url.searchParams.set('apikey', apiKey);
  return url;
}

async function providerJson(path, params, apiKey, fetchImpl) {
  const response = await fetchImpl(providerUrl(path, params, apiKey), {
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) {
    throw new ProviderError(
      response.status,
      Number(response.headers.get('Retry-After')) || undefined
    );
  }
  const data = await response.json();
  if (data?.status === 'error') {
    const status = Number(data.code);
    throw new ProviderError(
      Number.isFinite(status) ? status : 502,
      Number(data.retry_after) || undefined
    );
  }
  return data;
}

function isoTimestamp(epochSeconds, datetime) {
  const date = epochSeconds
    ? new Date(number(epochSeconds, 'timestamp') * 1000)
    : new Date(`${datetime}Z`);
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
  const providerSymbol = request.conversion
    ? `${request.conversion.from}/${request.conversion.to}`
    : asset.symbol;
  const range = ALLOWED_RANGES.get(request.range);
  const quotePromise = providerJson('/quote', { symbol: providerSymbol }, apiKey, fetchImpl);
  const seriesPromise = providerJson('/time_series', {
    symbol: providerSymbol,
    interval: range.interval,
    outputsize: range.outputsize,
    order: 'asc'
  }, apiKey, fetchImpl);
  const exchangePromise = !request.conversion && request.currency !== 'USD'
    ? providerJson('/exchange_rate', { symbol: `USD/${request.currency}` }, apiKey, fetchImpl)
    : Promise.resolve({ rate: 1 });
  const [quoteData, seriesData, exchangeData] = await Promise.all([
    quotePromise,
    seriesPromise,
    exchangePromise
  ]);
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
  const points = [...(seriesData.values || [])]
    .map((point) => ({
      timestamp: isoTimestamp(null, point.datetime),
      value: positiveNumber(point.close, 'series close') * factor
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (points.length === 0) throw new Error('Provider returned no series points.');
  const conversionValue = request.amount * unitFactor(asset.class, request.unit) * quote.price;
  return {
    kind: 'market',
    status: quoteData.is_delayed ? 'delayed' : 'live',
    request,
    asset,
    quote,
    series: { range: request.range, points },
    conversion: {
      amount: request.amount,
      unit: request.unit,
      value: conversionValue,
      currency: request.currency
    },
    meta: {
      source: 'Twelve Data',
      cached: false,
      stale: false,
      ...(quoteData.delay ? { delayMinutes: number(quoteData.delay, 'delay') } : {})
    }
  };
}

export async function handleMarket(request, env) {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Method not allowed.');
  }
  if (!env.TWELVE_DATA_API_KEY) {
    return apiError(503, 'not_configured', 'Market data is not configured.');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'invalid_json', 'Request body must be valid JSON.');
  }

  let normalized;
  try {
    normalized = validate(body);
  } catch (error) {
    return apiError(400, 'invalid_request', error.message);
  }

  const fetchImpl = env.__MARKET_FETCH || fetch;
  const cache = env.__MARKET_CACHE || globalThis.caches?.default;
  const now = env.__MARKET_NOW ? env.__MARKET_NOW() : Date.now();
  const key = cacheKey(normalized.request);
  let cached;
  try {
    const cachedResponse = await cache?.match(key);
    cached = cachedResponse ? await cachedResponse.json() : null;
  } catch {
    // Cache reads are best-effort; continue as a cache miss.
  }
  const age = cached ? now - cached.cachedAt : Infinity;
  if (cached && age <= FRESH_MS) {
    return Response.json({
      ...cached.payload,
      meta: { ...cached.payload.meta, cached: true, stale: false }
    });
  }

  try {
    const payload = await fetchAndNormalize(
      normalized,
      env.TWELVE_DATA_API_KEY,
      fetchImpl
    );
    try {
      await cache?.put(key, Response.json(
        { cachedAt: now, payload },
        { headers: { 'Cache-Control': 's-maxage=900' } }
      ));
    } catch {
      // Cache writes are best-effort and must not replace validated live data.
    }
    return Response.json(payload);
  } catch (error) {
    if (cached && age <= STALE_MS) {
      return Response.json({
        ...cached.payload,
        status: 'stale',
        meta: { ...cached.payload.meta, cached: true, stale: true }
      });
    }
    if (error.status === 429) {
      return apiError(
        429,
        'rate_limited',
        'Market data rate limit reached.',
        error.retryAfter
      );
    }
    return apiError(502, 'provider_unavailable', 'Market data temporarily unavailable.');
  }
}
