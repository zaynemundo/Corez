import { jsonResponse } from './utils.js';

const API_BASE = 'https://api.twelvedata.com';
const FRESH_MS = 60_000;
const STALE_MS = 15 * 60_000;
const MAX_BODY_BYTES = 4_096;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const LIVE_MAX_AGE_MS = 15 * 60_000;
const OPEN_QUOTE_MAX_AGE_MS = 15 * 60_000;
const OPEN_DELAY_GRACE_MS = 2 * 60_000;
const OPEN_DELAY_HARD_CAP_MS = 60 * 60_000;
const CLOSED_QUOTE_MAX_AGE_MS = 4 * 24 * 60 * 60_000;
const CLOSED_LATEST_SERIES_MAX_GAP_MS = 12 * 60 * 60_000;
const SERIES_MAX_AGE_MS = 45 * 24 * 60 * 60_000;
const MIN_PROVIDER_TIME_MS = Date.parse('2000-01-01T00:00:00.000Z');
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const MAX_RATE_CLIENTS = 1_000;
const ALLOWED_CURRENCIES = new Set(['USD', 'AED', 'EUR', 'GBP', 'JPY']);
const ALLOWED_RANGES = new Map([
  ['1D', { interval: '5min', outputsize: 78, windowMs: 4 * 24 * 60 * 60_000 }],
  ['1W', { interval: '1h', outputsize: 168, windowMs: 10 * 24 * 60 * 60_000 }],
  ['1M', { interval: '4h', outputsize: 180, windowMs: 40 * 24 * 60 * 60_000 }]
]);
const REQUEST_FIELDS = ['assetId', 'symbol', 'assetClass', 'currency', 'amount', 'unit', 'range', 'conversion'];
const CONVERSION_FIELDS = ['from', 'to'];
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const PROVIDER_IDENTITIES = new Map([
  ['USD', new Set(['USD', 'US DOLLAR'])],
  ['AED', new Set(['AED', 'UAE DIRHAM', 'UNITED ARAB EMIRATES DIRHAM'])],
  ['EUR', new Set(['EUR', 'EURO'])],
  ['GBP', new Set(['GBP', 'BRITISH POUND', 'POUND STERLING'])],
  ['JPY', new Set(['JPY', 'JAPANESE YEN'])],
  ['XAU', new Set(['XAU', 'GOLD', 'GOLD SPOT'])],
  ['XAG', new Set(['XAG', 'SILVER', 'SILVER SPOT'])],
  ['BTC', new Set(['BTC', 'BITCOIN'])],
  ['ETH', new Set(['ETH', 'ETHEREUM'])],
  ['SOL', new Set(['SOL', 'SOLANA'])]
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

const inFlight = new Map();
const rateClients = new Map();

function apiError(status, code, message, retryAfter) {
  const hasRetryAfter = Number.isFinite(retryAfter) && retryAfter > 0;
  return jsonResponse(
    status,
    { error: { code, message, ...(hasRetryAfter ? { retryAfter } : {}) } },
    hasRetryAfter ? { 'Retry-After': String(Math.ceil(retryAfter)) } : {}
  );
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactObject(value, allowedFields, label) {
  if (!isObject(value)) throw new TypeError(`${label} must be an object.`);
  const fields = Object.keys(value);
  if (fields.some((field) => FORBIDDEN_KEYS.has(field))) {
    throw new TypeError(`Invalid ${label} field.`);
  }
  if (fields.length !== allowedFields.length
    || allowedFields.some((field) => !Object.prototype.hasOwnProperty.call(value, field))
    || fields.some((field) => !allowedFields.includes(field))) {
    throw new TypeError(`Invalid ${label} fields.`);
  }
}

function number(value, field) {
  if ((typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'string' && value.trim() === '')) {
    throw new Error(`Invalid provider field: ${field}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid provider field: ${field}`);
  return parsed;
}

function positiveNumber(value, field) {
  const parsed = number(value, field);
  if (parsed <= 0) throw new Error(`Invalid provider field: ${field}`);
  return parsed;
}

function finiteProduct(values, field, positive = false) {
  let result = 1;
  for (const value of values) {
    result *= value;
    if (!Number.isFinite(result) || (positive && result <= 0)) {
      throw new Error(`Invalid arithmetic result: ${field}`);
    }
  }
  return result;
}

function providerBoolean(value, field, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  throw new Error(`Invalid provider field: ${field}`);
}

function validate(body) {
  assertExactObject(body, REQUEST_FIELDS, 'request');
  const asset = ASSETS.get(body.assetId);
  if (!asset || body.symbol !== asset.symbol || body.assetClass !== asset.class) {
    throw new TypeError('Unsupported asset.');
  }
  if (!ALLOWED_CURRENCIES.has(body.currency) || !ALLOWED_RANGES.has(body.range)) {
    throw new TypeError('Unsupported currency or range.');
  }
  if (typeof body.amount !== 'number'
    || !Number.isFinite(body.amount)
    || body.amount <= 0
    || body.amount > 1_000_000_000) {
    throw new TypeError('Invalid amount.');
  }
  const units = asset.class === 'metal'
    ? new Set(['troy_ounce', 'gram', 'kilogram'])
    : new Set(['unit']);
  if (!units.has(body.unit)) throw new TypeError('Unsupported unit.');

  let conversion = null;
  if (body.conversion !== null) {
    assertExactObject(body.conversion, CONVERSION_FIELDS, 'conversion');
    const from = body.conversion.from;
    const to = body.conversion.to;
    if (!ALLOWED_CURRENCIES.has(from)
      || !ALLOWED_CURRENCIES.has(to)
      || asset.class !== 'forex'
      || asset.id !== `fx-${from.toLowerCase()}`
      || asset.symbol !== `${from}/USD`
      || body.currency !== to) {
      throw new TypeError('Unsupported conversion.');
    }
    conversion = { from, to };
  }

  return {
    request: {
      assetId: asset.id,
      symbol: asset.symbol,
      assetClass: asset.class,
      currency: body.currency,
      amount: body.amount,
      unit: body.unit,
      range: body.range,
      conversion
    },
    asset: { ...asset }
  };
}

function providerSymbolFor(request, asset) {
  return request.conversion
    ? `${request.conversion.from}/${request.conversion.to}`
    : asset.symbol;
}

function outputAssetFor(request, asset) {
  if (!request.conversion) return { ...asset };
  const symbol = providerSymbolFor(request, asset);
  return { id: asset.id, class: asset.class, symbol, name: `${request.conversion.from} to ${request.conversion.to}` };
}

function cacheKey(request) {
  const query = new URLSearchParams({
    assetId: request.assetId,
    currency: request.currency,
    range: request.range,
    from: request.conversion?.from || '',
    to: request.conversion?.to || ''
  });
  return new Request(`https://corez-market-cache.internal/quote?${query}`, { method: 'GET' });
}

function canonicalProviderSymbol(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '').replace(':', '/');
  return normalized || null;
}

function requireProviderSymbol(value, expected, field) {
  if (canonicalProviderSymbol(value) !== canonicalProviderSymbol(expected)) {
    throw new Error(`Invalid provider field: ${field}`);
  }
}

function expectedProviderCurrency(providerSymbol) {
  const separator = providerSymbol.indexOf('/');
  return separator >= 0 ? providerSymbol.slice(separator + 1) : 'USD';
}

function validateOptionalCurrency(value, expected, field) {
  const accepted = PROVIDER_IDENTITIES.get(expected) || new Set([expected]);
  if (value !== undefined
    && (typeof value !== 'string' || !accepted.has(value.trim().toUpperCase()))) {
    throw new Error(`Invalid provider field: ${field}`);
  }
}

function providerTime(epochSeconds, datetime, field) {
  let date;
  if (epochSeconds !== undefined && epochSeconds !== null && epochSeconds !== '') {
    date = new Date(number(epochSeconds, field) * 1000);
  } else if (typeof datetime === 'string' && datetime.trim()) {
    const value = datetime.trim();
    date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  } else {
    throw new Error(`Invalid provider field: ${field}`);
  }
  const milliseconds = date.valueOf();
  if (!Number.isFinite(milliseconds)) throw new Error(`Invalid provider field: ${field}`);
  return { milliseconds, iso: date.toISOString() };
}

function validateTimeBounds(milliseconds, now, maxAge, field) {
  if (milliseconds < MIN_PROVIDER_TIME_MS
    || milliseconds > now + MAX_FUTURE_SKEW_MS
    || now - milliseconds > maxAge) {
    throw new Error(`Invalid provider field: ${field}`);
  }
}

function openQuoteMaxAge(providerDelayed, delayMinutes) {
  if (!providerDelayed && delayMinutes <= 0) return OPEN_QUOTE_MAX_AGE_MS;
  return Math.min(
    OPEN_DELAY_HARD_CAP_MS,
    Math.max(OPEN_QUOTE_MAX_AGE_MS, delayMinutes * 60_000) + OPEN_DELAY_GRACE_MS
  );
}

function unitFactor(assetClass, unit) {
  if (assetClass !== 'metal') return 1;
  if (unit === 'gram') return 1 / 31.1034768;
  if (unit === 'kilogram') return 1000 / 31.1034768;
  return 1;
}

function conversionFor(request, asset, quotePrice) {
  const value = finiteProduct(
    [request.amount, unitFactor(asset.class, request.unit), quotePrice],
    'conversion',
    true
  );
  return {
    amount: request.amount,
    unit: request.unit,
    value,
    currency: request.currency
  };
}

function classifyStatus(quoteTime, now, providerDelayed, delayMinutes) {
  return providerDelayed
    || delayMinutes > 0
    || now - quoteTime > LIVE_MAX_AGE_MS
    ? 'delayed'
    : 'live';
}

function observedDelayMinutes(quoteTime, now, providerDelay) {
  return Math.max(1, providerDelay, Math.ceil(Math.max(0, now - quoteTime) / 60_000));
}

function servedAt(now) {
  const date = new Date(now);
  if (!Number.isFinite(date.valueOf())) throw new Error('Invalid serve timestamp.');
  return date.toISOString();
}

function validateSeries(seriesData, providerSymbol, providerCurrency, factor, quotePrice, quoteTime, now, rangeName, marketOpen) {
  if (!isObject(seriesData) || !isObject(seriesData.meta)) {
    throw new Error('Invalid provider field: series meta');
  }
  requireProviderSymbol(seriesData.meta.symbol, providerSymbol, 'series symbol');
  validateOptionalCurrency(seriesData.meta.currency, providerCurrency, 'series currency');
  validateOptionalCurrency(seriesData.meta.currency_quote, providerCurrency, 'series quote currency');
  if (seriesData.meta.timezone !== undefined
    && (typeof seriesData.meta.timezone !== 'string'
      || !['UTC', 'ETC/UTC'].includes(seriesData.meta.timezone.trim().toUpperCase()))) {
    throw new Error('Invalid provider field: series timezone');
  }
  if (seriesData.meta.currency_base !== undefined && providerSymbol.includes('/')) {
    validateOptionalCurrency(seriesData.meta.currency_base, providerSymbol.split('/')[0], 'series base currency');
  }
  if (!Array.isArray(seriesData.values)
    || seriesData.values.length === 0
    || seriesData.values.length > 500) {
    throw new Error('Invalid provider field: series values');
  }

  const range = ALLOWED_RANGES.get(rangeName);
  const seen = new Set();
  let previousTime = -Infinity;
  const points = seriesData.values.map((point) => {
    if (!isObject(point)) throw new Error('Invalid provider field: series point');
    const time = providerTime(undefined, point.datetime, 'series timestamp');
    validateTimeBounds(time.milliseconds, now, SERIES_MAX_AGE_MS, 'series timestamp');
    if (time.milliseconds > quoteTime + MAX_FUTURE_SKEW_MS
      || time.milliseconds < quoteTime - range.windowMs
      || time.milliseconds <= previousTime
      || seen.has(time.iso)) {
      throw new Error('Invalid provider field: series timestamp');
    }
    seen.add(time.iso);
    previousTime = time.milliseconds;
    return {
      timestamp: time.iso,
      value: finiteProduct([positiveNumber(point.close, 'series close'), factor], 'series close', true)
    };
  });

  const latestPoint = points.at(-1);
  const latestTime = Date.parse(latestPoint.timestamp);
  const maximumLatestGap = marketOpen ? 30 * 60_000 : CLOSED_LATEST_SERIES_MAX_GAP_MS;
  if (quoteTime - latestTime > maximumLatestGap) {
    throw new Error('Invalid provider field: latest series timestamp');
  }
  const latestValue = latestPoint.value;
  const relativeDifference = Math.abs(latestValue - quotePrice) / quotePrice;
  if (!Number.isFinite(relativeDifference) || relativeDifference > 0.25) {
    throw new Error('Provider quote and series disagree.');
  }
  return points;
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

export async function fetchAndNormalize({ request, asset }, apiKey, fetchImpl, now = Date.now()) {
  const providerSymbol = providerSymbolFor(request, asset);
  const providerCurrency = expectedProviderCurrency(providerSymbol);
  const range = ALLOWED_RANGES.get(request.range);
  const quotePromise = providerJson('/quote', { symbol: providerSymbol }, apiKey, fetchImpl);
  const seriesPromise = providerJson('/time_series', {
    symbol: providerSymbol,
    interval: range.interval,
    outputsize: range.outputsize,
    order: 'asc',
    timezone: 'UTC'
  }, apiKey, fetchImpl);
  const exchangePromise = !request.conversion && request.currency !== 'USD'
    ? providerJson('/exchange_rate', { symbol: `USD/${request.currency}` }, apiKey, fetchImpl)
    : Promise.resolve({ symbol: 'USD/USD', rate: 1 });
  const [quoteData, seriesData, exchangeData] = await Promise.all([
    quotePromise,
    seriesPromise,
    exchangePromise
  ]);

  if (!isObject(quoteData)) throw new Error('Invalid provider field: quote');
  requireProviderSymbol(quoteData.symbol, providerSymbol, 'quote symbol');
  validateOptionalCurrency(quoteData.currency, providerCurrency, 'quote currency');
  const marketOpen = providerBoolean(quoteData.is_market_open, 'is_market_open');
  const providerDelayed = providerBoolean(quoteData.is_delayed, 'is_delayed', false);
  const delayMinutes = quoteData.delay === undefined ? 0 : number(quoteData.delay, 'delay');
  if (delayMinutes < 0) throw new Error('Invalid provider field: delay');
  const quoteTime = providerTime(quoteData.timestamp, quoteData.datetime, 'quote timestamp');
  validateTimeBounds(
    quoteTime.milliseconds,
    now,
    marketOpen
      ? openQuoteMaxAge(providerDelayed, delayMinutes)
      : CLOSED_QUOTE_MAX_AGE_MS,
    'quote timestamp'
  );

  let factor = 1;
  if (!request.conversion && request.currency !== 'USD') {
    const exchangeSymbol = `USD/${request.currency}`;
    if (!isObject(exchangeData)) throw new Error('Invalid provider field: exchange rate');
    requireProviderSymbol(exchangeData.symbol, exchangeSymbol, 'exchange symbol');
    validateOptionalCurrency(exchangeData.currency, request.currency, 'exchange currency');
    if (exchangeData.timestamp !== undefined || exchangeData.datetime !== undefined) {
      const exchangeTime = providerTime(exchangeData.timestamp, exchangeData.datetime, 'exchange timestamp');
      validateTimeBounds(exchangeTime.milliseconds, now, CLOSED_QUOTE_MAX_AGE_MS, 'exchange timestamp');
    }
    factor = positiveNumber(exchangeData.rate, 'exchange rate');
  }

  const rawPrice = positiveNumber(quoteData.close, 'close');
  const quotePrice = finiteProduct([rawPrice, factor], 'close', true);
  const high = finiteProduct([positiveNumber(quoteData.high, 'high'), factor], 'high', true);
  const low = finiteProduct([positiveNumber(quoteData.low, 'low'), factor], 'low', true);
  if (low > high) throw new Error('Invalid provider field: quote range');
  const quote = {
    price: quotePrice,
    currency: request.currency,
    change: finiteProduct([number(quoteData.change, 'change'), factor], 'change'),
    changePercent: number(quoteData.percent_change, 'percent_change'),
    high,
    low,
    previousClose: finiteProduct(
      [positiveNumber(quoteData.previous_close, 'previous_close'), factor],
      'previous_close',
      true
    ),
    marketOpen,
    timestamp: quoteTime.iso
  };
  const points = validateSeries(
    seriesData,
    providerSymbol,
    providerCurrency,
    factor,
    quotePrice,
    quoteTime.milliseconds,
    now,
    request.range,
    marketOpen
  );
  const status = classifyStatus(
    quoteTime.milliseconds,
    now,
    providerDelayed,
    delayMinutes
  );
  const effectiveDelayMinutes = observedDelayMinutes(quoteTime.milliseconds, now, delayMinutes);
  return {
    kind: 'market',
    status,
    request,
    asset: outputAssetFor(request, asset),
    quote,
    series: { range: request.range, points },
    conversion: conversionFor(request, asset, quote.price),
    meta: {
      source: 'Twelve Data',
      cached: false,
      stale: false,
      servedAt: servedAt(now),
      ...(status === 'delayed' ? { delayMinutes: effectiveDelayMinutes } : {})
    }
  };
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveFinite(value) {
  return isFiniteNumber(value) && value > 0;
}

function sameConversion(actual, expected) {
  return expected === null
    ? actual === null
    : isObject(actual) && actual.from === expected.from && actual.to === expected.to;
}

function isValidCachedPayload(payload, normalized, now, cachedAt) {
  try {
    if (!isObject(payload)
      || payload.kind !== 'market'
      || !['live', 'delayed'].includes(payload.status)
      || !isObject(payload.request)
      || payload.request.assetId !== normalized.request.assetId
      || payload.request.symbol !== normalized.request.symbol
      || payload.request.assetClass !== normalized.request.assetClass
      || payload.request.currency !== normalized.request.currency
      || payload.request.range !== normalized.request.range
      || !sameConversion(payload.request.conversion, normalized.request.conversion)) return false;

    const expectedAsset = outputAssetFor(normalized.request, normalized.asset);
    if (!isObject(payload.asset)
      || payload.asset.id !== expectedAsset.id
      || payload.asset.class !== expectedAsset.class
      || payload.asset.symbol !== expectedAsset.symbol
      || payload.asset.name !== expectedAsset.name) return false;
    if (!isObject(payload.quote)
      || !isPositiveFinite(payload.quote.price)
      || payload.quote.currency !== normalized.request.currency
      || !isFiniteNumber(payload.quote.change)
      || !isFiniteNumber(payload.quote.changePercent)
      || !isPositiveFinite(payload.quote.high)
      || !isPositiveFinite(payload.quote.low)
      || !isPositiveFinite(payload.quote.previousClose)
      || payload.quote.low > payload.quote.high
      || typeof payload.quote.marketOpen !== 'boolean') return false;
    const quoteTime = providerTime(undefined, payload.quote.timestamp, 'cached quote timestamp');
    validateTimeBounds(
      quoteTime.milliseconds,
      now,
      payload.quote.marketOpen
        ? (payload.status === 'delayed'
          ? openQuoteMaxAge(true, payload.meta?.delayMinutes || 0)
          : OPEN_DELAY_HARD_CAP_MS)
        : CLOSED_QUOTE_MAX_AGE_MS,
      'cached quote timestamp'
    );
    if (!isObject(payload.series)
      || payload.series.range !== normalized.request.range
      || !Array.isArray(payload.series.points)
      || payload.series.points.length === 0
      || payload.series.points.some((point) => !isObject(point) || !isPositiveFinite(point.value))) return false;
    const seen = new Set();
    let previousTime = -Infinity;
    const range = ALLOWED_RANGES.get(normalized.request.range);
    for (const point of payload.series.points) {
      const pointTime = providerTime(undefined, point.timestamp, 'cached series timestamp');
      validateTimeBounds(pointTime.milliseconds, now, SERIES_MAX_AGE_MS, 'cached series timestamp');
      if (pointTime.milliseconds > quoteTime.milliseconds + MAX_FUTURE_SKEW_MS
        || pointTime.milliseconds < quoteTime.milliseconds - range.windowMs
        || pointTime.milliseconds < previousTime
        || seen.has(pointTime.iso)) return false;
      seen.add(pointTime.iso);
      previousTime = pointTime.milliseconds;
    }
    const latestTime = Date.parse(payload.series.points.at(-1).timestamp);
    const maximumLatestGap = payload.quote.marketOpen
      ? 30 * 60_000
      : CLOSED_LATEST_SERIES_MAX_GAP_MS;
    if (quoteTime.milliseconds - latestTime > maximumLatestGap) return false;
    const latest = payload.series.points.at(-1).value;
    if (Math.abs(latest - payload.quote.price) / payload.quote.price > 0.25) return false;
    conversionFor(normalized.request, normalized.asset, payload.quote.price);
    if (!isObject(payload.meta) || typeof payload.meta.servedAt !== 'string') return false;
    const cachedServeTime = providerTime(undefined, payload.meta.servedAt, 'cached serve timestamp');
    if (cachedServeTime.iso !== payload.meta.servedAt || cachedServeTime.milliseconds !== cachedAt) return false;
    return isObject(payload.conversion)
      && isPositiveFinite(payload.conversion.value)
      && payload.meta.source === 'Twelve Data'
      && payload.meta.cached === false
      && payload.meta.stale === false
      && (payload.status === 'delayed'
        ? isFiniteNumber(payload.meta.delayMinutes) && payload.meta.delayMinutes > 0
        : payload.meta.delayMinutes === undefined);
  } catch {
    return false;
  }
}

function isUsableCacheEntry(entry, now, normalized) {
  return isObject(entry)
    && isFiniteNumber(entry.cachedAt)
    && now - entry.cachedAt >= 0
    && isValidCachedPayload(entry.payload, normalized, now, entry.cachedAt);
}

function rebindPayload(payload, normalized, meta, status, now) {
  const request = normalized.request;
  const reboundStatus = status || payload.status;
  const quoteTime = Date.parse(payload.quote.timestamp);
  const quoteAge = Math.ceil(Math.max(0, now - quoteTime) / 60_000);
  const existingDelay = isFiniteNumber(payload.meta.delayMinutes) && payload.meta.delayMinutes > 0
    ? payload.meta.delayMinutes
    : 0;
  const normalizeDelay = reboundStatus === 'delayed'
    || (reboundStatus === 'stale'
      && payload.quote.marketOpen
      && (quoteAge > LIVE_MAX_AGE_MS / 60_000 || existingDelay > 0));
  const reboundMeta = {
    ...payload.meta,
    ...meta,
    servedAt: servedAt(now),
    ...(normalizeDelay ? { delayMinutes: Math.max(1, existingDelay, quoteAge) } : {})
  };
  return {
    ...payload,
    ...(status ? { status } : {}),
    request,
    asset: outputAssetFor(request, normalized.asset),
    conversion: conversionFor(request, normalized.asset, payload.quote.price),
    meta: reboundMeta
  };
}

function clientIdentity(request) {
  // CF-Connecting-IP is set by Cloudflare and cannot be spoofed by clients.
  // X-Forwarded-For is deliberately NOT trusted: clients can set it, which
  // would let them rotate identities and reset the rate limit.
  const candidate = request.headers.get('CF-Connecting-IP')
    || 'anonymous';
  return candidate.trim().slice(0, 128) || 'anonymous';
}

function rateRetryAfter(request, now) {
  for (const [client, record] of rateClients) {
    if (now - record.windowStart >= RATE_WINDOW_MS) rateClients.delete(client);
  }
  const client = clientIdentity(request);
  let record = rateClients.get(client);
  if (!record) {
    if (rateClients.size >= MAX_RATE_CLIENTS) {
      const oldest = rateClients.keys().next().value;
      if (oldest !== undefined) rateClients.delete(oldest);
    }
    record = { windowStart: now, count: 0 };
    rateClients.set(client, record);
  }
  if (now - record.windowStart >= RATE_WINDOW_MS) {
    record.windowStart = now;
    record.count = 0;
  }
  if (record.count >= RATE_LIMIT) {
    return Math.max(1, Math.ceil((record.windowStart + RATE_WINDOW_MS - now) / 1000));
  }
  record.count += 1;
  return null;
}

async function readBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return { error: apiError(415, 'unsupported_media_type', 'Content-Type must be application/json.') };
  }
  const contentLength = request.headers.get('Content-Length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isInteger(declared) || declared < 0 || declared > MAX_BODY_BYTES) {
      return { error: apiError(413, 'request_too_large', 'Request body is too large.') };
    }
  }
  const decoder = new TextDecoder();
  let text = '';
  let bytesRead = 0;
  try {
    if (request.body) {
      const reader = request.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > MAX_BODY_BYTES) {
          await reader.cancel();
          return { error: apiError(413, 'request_too_large', 'Request body is too large.') };
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    }
  } catch {
    return { error: apiError(400, 'invalid_json', 'Request body must be valid JSON.') };
  }
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: apiError(400, 'invalid_json', 'Request body must be valid JSON.') };
  }
}

export async function handleMarket(request, env) {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Method not allowed.');
  }
  const parsedBody = await readBody(request);
  if (parsedBody.error) return parsedBody.error;
  if (!env.TWELVE_DATA_API_KEY) {
    return apiError(503, 'not_configured', 'Market data is not configured.');
  }

  let normalized;
  try {
    normalized = validate(parsedBody.body);
  } catch (error) {
    return apiError(400, 'invalid_request', error.message);
  }

  const fetchImpl = env.__MARKET_FETCH || fetch;
  const cache = env.__MARKET_CACHE || globalThis.caches?.default;
  const injectedNow = env.__MARKET_NOW ? env.__MARKET_NOW() : Date.now();
  const now = isFiniteNumber(injectedNow) ? injectedNow : Date.now();
  const retryAfter = rateRetryAfter(request, now);
  if (retryAfter !== null) {
    return apiError(429, 'rate_limited', 'Too many market requests.', retryAfter);
  }
  const key = cacheKey(normalized.request);
  let cached;
  try {
    const cachedResponse = await cache?.match(key);
    const parsed = cachedResponse ? await cachedResponse.json() : null;
    cached = isUsableCacheEntry(parsed, now, normalized) ? parsed : null;
  } catch {
    // Cache reads are best-effort; continue as a cache miss.
  }
  const age = cached ? now - cached.cachedAt : Infinity;
  if (cached && age <= FRESH_MS) {
    const cachedQuoteTime = Date.parse(cached.payload.quote.timestamp);
    const cachedStatus = classifyStatus(
      cachedQuoteTime,
      now,
      cached.payload.status === 'delayed',
      cached.payload.meta.delayMinutes || 0
    );
    try {
      return jsonResponse(200, rebindPayload(
        cached.payload,
        normalized,
        {
          cached: true,
          stale: false,
          ...(cachedStatus === 'delayed'
            ? { delayMinutes: observedDelayMinutes(cachedQuoteTime, now, cached.payload.meta.delayMinutes || 0) }
            : {})
        },
        cachedStatus,
        now
      ));
    } catch {
      return apiError(502, 'provider_unavailable', 'Market data temporarily unavailable.');
    }
  }

  const inFlightKey = key.url;
  let pending = inFlight.get(inFlightKey);
  if (!pending) {
    pending = (async () => {
      const payload = await fetchAndNormalize(
        normalized,
        env.TWELVE_DATA_API_KEY,
        fetchImpl,
        now
      );
      try {
        await cache?.put(key, Response.json(
          { cachedAt: now, payload },
          { headers: { 'Cache-Control': 's-maxage=900' } }
        ));
      } catch {
        // Cache writes are best-effort and must not replace validated live data.
      }
      return payload;
    })();
    inFlight.set(inFlightKey, pending);
    pending.finally(() => {
      if (inFlight.get(inFlightKey) === pending) inFlight.delete(inFlightKey);
    }).catch(() => {});
  }

  try {
    const payload = await pending;
    return jsonResponse(200, rebindPayload(
      payload,
      normalized,
      { cached: false, stale: false },
      undefined,
      now
    ));
  } catch (error) {
    if (cached && age <= STALE_MS) {
      try {
        return jsonResponse(200, rebindPayload(
          cached.payload,
          normalized,
          { cached: true, stale: true },
          'stale',
          now
        ));
      } catch {
        // Unsafe cached arithmetic must not replace the upstream error.
      }
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
