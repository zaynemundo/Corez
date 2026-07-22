import { useEffect, useMemo, useState } from 'react';
import { Minus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { DISPLAY_CURRENCIES, MARKET_ASSETS } from '../services/marketCatalog.js';

const GRAMS_PER_TROY_OUNCE = 31.1034768;
const UNIT_TO_OUNCES = Object.freeze({
  troy_ounce: 1,
  gram: 1 / GRAMS_PER_TROY_OUNCE,
  kilogram: 1000 / GRAMS_PER_TROY_OUNCE,
  unit: 1
});
const CHART_RANGES = Object.freeze(['1D', '1W', '1M']);
const METAL_UNITS = Object.freeze([
  ['troy_ounce', 'Troy ounce'],
  ['gram', 'Gram'],
  ['kilogram', 'Kilogram']
]);
const UNIT_ONLY = Object.freeze([['unit', 'Unit']]);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function money(value, currency) {
  if (!isFiniteNumber(value) || typeof currency !== 'string') return null;

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: Math.abs(value) < 1 && value !== 0 ? 6 : 2
    }).format(value);
  } catch {
    return null;
  }
}

function providerTime(timestamp) {
  if (typeof timestamp !== 'string') return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short'
  }).format(date);
}

function chartPoints(points) {
  const values = Array.isArray(points)
    ? points.filter((point) => point && isFiniteNumber(point.value)).map((point) => point.value)
    : [];

  if (values.length === 0) return '';

  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  return values
    .map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${40 - ((value - min) / span) * 36}`)
    .join(' ');
}

function quoteStatus(market) {
  if (market?.status === 'stale') return 'Stale';
  if (market?.status === 'delayed') return 'Delayed';
  if (market?.quote?.marketOpen === true) return 'Market open';
  if (market?.quote?.marketOpen === false) return 'Market closed';
  return 'Market status unavailable';
}

export default function MarketCard({ market = {}, request = {}, onRefresh = () => {}, refreshing = false }) {
  const [amount, setAmount] = useState(request.amount ?? 1);
  const [unit, setUnit] = useState(request.unit || 'unit');

  useEffect(() => {
    setAmount(request.amount ?? 1);
    setUnit(request.unit || 'unit');
  }, [request.amount, request.assetId, request.unit]);

  const quote = market.quote || {};
  const asset = market.asset || {};
  const range = request.range || market.series?.range || '1D';
  const points = chartPoints(market.series?.points);
  const quotePrice = isFiniteNumber(quote.price) ? quote.price : null;
  const quoteCurrency = typeof quote.currency === 'string' ? quote.currency : null;
  const displayedPrice = money(quotePrice, quoteCurrency);
  const numericAmount = amount === '' ? null : Number(amount);
  const validAmount = numericAmount !== null && Number.isFinite(numericAmount) && numericAmount >= 0;
  const unitMultiplier = UNIT_TO_OUNCES[unit];
  const converted = useMemo(() => {
    if (!validAmount || !isFiniteNumber(quotePrice) || !isFiniteNumber(unitMultiplier)) return null;
    return numericAmount * unitMultiplier * quotePrice;
  }, [numericAmount, quotePrice, unitMultiplier, validAmount]);
  const convertedMoney = money(converted, quoteCurrency);
  const conversionText = !validAmount
    ? 'Enter a valid quantity.'
    : convertedMoney || 'Conversion unavailable.';

  if (market.status === 'unavailable') {
    const unavailableMessage = market.error?.message || 'Market data temporarily unavailable.';
    const retryAfter = market.error?.retryAfter;
    const retryMessage = isFiniteNumber(retryAfter) && retryAfter > 0
      ? ` Retry in ${retryAfter} seconds.`
      : '';

    return (
      <section
        className="market-card market-card-error"
        role="region"
        aria-label="Market data unavailable"
        aria-busy={refreshing}
      >
        <p className="market-error-message" role="alert">{unavailableMessage}{retryMessage}</p>
        <button
          type="button"
          className="market-retry"
          onClick={() => onRefresh(request)}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? 'Retrying' : 'Retry'}
        </button>
      </section>
    );
  }

  const hasMovement = isFiniteNumber(quote.change) && isFiniteNumber(quote.changePercent);
  const unchanged = hasMovement && quote.change === 0;
  const movingUp = hasMovement && quote.change > 0;
  const MovementIcon = unchanged ? Minus : movingUp ? TrendingUp : TrendingDown;
  const movementDirection = unchanged ? 'neutral' : movingUp ? 'up' : 'down';
  const movementLabel = unchanged ? 'Unchanged' : movingUp ? 'Up' : 'Down';
  const movementPercent = unchanged ? 0 : Math.abs(quote.changePercent);
  const movementAmount = hasMovement ? money(Math.abs(quote.change), quoteCurrency) : null;
  const units = asset.class === 'metal' ? METAL_UNITS : UNIT_ONLY;
  const statusLabel = quoteStatus(market);
  const delayMinutes = market.status === 'delayed' && isFiniteNumber(market.meta?.delayMinutes)
    ? market.meta.delayMinutes
    : null;
  const timestamp = providerTime(quote.timestamp);
  const assetName = asset.name || 'Market';
  const assetSymbol = asset.symbol || request.symbol || 'Symbol unavailable';
  const marketUpdate = refreshing
    ? 'Refreshing market data'
    : displayedPrice ? 'Market data ready' : 'Quote unavailable';

  const requestAsset = (assetId) => {
    const nextAsset = MARKET_ASSETS.find((item) => item.id === assetId);
    if (!nextAsset) return;
    onRefresh({
      ...request,
      assetId: nextAsset.id,
      symbol: nextAsset.symbol,
      assetClass: nextAsset.assetClass,
      amount: 1,
      unit: nextAsset.defaultUnit,
      conversion: null
    });
  };

  return (
    <section className="market-card" role="region" aria-label={`${assetName} market quote`} aria-busy={refreshing}>
      <header className="market-card-header">
        <div className="market-identity">
          <strong className="market-asset-name">{assetName}</strong>
          <span className="market-symbol">{assetSymbol}</span>
        </div>
        <div
          className="market-status-group"
          role="status"
          aria-label="Market update"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="market-refresh-state">{marketUpdate}</span>
          <span className={`market-status market-status-${market.status || 'unknown'}`}>{statusLabel}</span>
          {delayMinutes !== null && <span className="market-delay">Delayed by {delayMinutes} minutes</span>}
        </div>
      </header>

      <div className="market-price-row">
        <div className="market-quote">
          <data className="market-price" value={displayedPrice ? quotePrice : undefined}>
            {displayedPrice || 'Quote unavailable'}
          </data>
          {hasMovement && movementAmount ? (
            <div className={`market-movement market-movement-${movementDirection}`}>
              <MovementIcon aria-hidden="true" size={16} />
              <span>{movementLabel} {movementPercent.toFixed(2)}% ({movementAmount})</span>
            </div>
          ) : (
            <div className="market-movement market-movement-unavailable">Movement unavailable</div>
          )}
        </div>
        <button
          type="button"
          className="market-refresh"
          aria-label="Refresh market data"
          aria-busy={refreshing}
          onClick={() => onRefresh(request)}
          disabled={refreshing}
        >
          <RefreshCw aria-hidden="true" size={16} />
          <span>{refreshing ? 'Refreshing' : 'Refresh'}</span>
        </button>
      </div>

      <div className="market-chart-block">
        <div className="market-ranges" role="group" aria-label="Chart range">
          {CHART_RANGES.map((chartRange) => (
            <button
              type="button"
              key={chartRange}
              aria-pressed={range === chartRange}
              onClick={() => onRefresh({ ...request, range: chartRange })}
              disabled={refreshing}
            >
              {chartRange}
            </button>
          ))}
        </div>
        <svg
          className="market-chart"
          viewBox="0 0 100 44"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${range} price trend${points ? '' : '; no data available'}`}
        >
          {points && <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />}
        </svg>
        {!points && <p className="market-chart-empty">No chart data available.</p>}
      </div>

      <div className="market-controls">
        <label className="market-control">
          <span>Asset</span>
          <select
            aria-label="Asset"
            value={request.assetId || ''}
            onChange={(event) => requestAsset(event.target.value)}
            disabled={refreshing}
          >
            {MARKET_ASSETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="market-control">
          <span>Display currency</span>
          <select
            aria-label="Display currency"
            value={request.currency || 'USD'}
            onChange={(event) => onRefresh({ ...request, currency: event.target.value, conversion: null })}
            disabled={refreshing}
          >
            {DISPLAY_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>
        </label>
        <label className="market-control">
          <span>Quantity</span>
          <input
            aria-label="Quantity"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label className="market-control">
          <span>Unit</span>
          <select aria-label="Unit" value={unit} onChange={(event) => setUnit(event.target.value)}>
            {units.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <output className="market-conversion" aria-live="polite">
        <span className="market-conversion-label">Converted value: </span>
        <span className="market-conversion-value">{conversionText}</span>
      </output>

      <footer className="market-card-footer">
        <span>{timestamp ? `Updated ${timestamp}` : 'Update time unavailable'}</span>
        <span>{market.meta?.source ? `Source: ${market.meta.source}` : 'Source unavailable'}</span>
        <span>Indicative data, not an executable quote.</span>
      </footer>
    </section>
  );
}
