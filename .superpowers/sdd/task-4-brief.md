### Task 4: Native MarketCard component and calculation logic

**Files:**
- Create: `src/components/MarketCard.jsx`
- Create: `tests/market-card.test.jsx`

**Interfaces:**
- Consumes props: `{ market, request, onRefresh, refreshing }`.
- Calls: `onRefresh(nextRequest)` for range, asset, currency, and manual refresh changes.
- Produces no global state; conversion amount and unit are local component state.

- [ ] **Step 1: Write failing component tests**

At the top of `tests/market-card.test.jsx`, configure jsdom and jest-dom:

```js
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MarketCard from '../src/components/MarketCard.jsx';

const request = { assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null };
const market = {
  kind: 'market', status: 'live',
  asset: { id: 'gold', class: 'metal', symbol: 'XAU/USD', name: 'Gold Spot' },
  quote: { price: 2412.5, currency: 'USD', change: 22.5, changePercent: 0.9414, high: 2420, low: 2395, previousClose: 2390, marketOpen: true, timestamp: '2026-07-22T07:00:00.000Z' },
  series: { range: '1D', points: [{ timestamp: '2026-07-22T07:00:00.000Z', value: 2400 }, { timestamp: '2026-07-22T07:05:00.000Z', value: 2412.5 }] },
  conversion: { amount: 1, unit: 'troy_ounce', value: 2412.5, currency: 'USD' },
  meta: { source: 'Twelve Data', cached: false, stale: false }
};

describe('MarketCard', () => {
  it('renders a sourced indicative quote with non-color movement text', () => {
    render(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing={false} />);
    expect(screen.getByRole('region', { name: /gold spot market quote/i })).toBeInTheDocument();
    expect(screen.getByText('$2,412.50')).toBeInTheDocument();
    expect(screen.getByText(/up 0.94%/i)).toBeInTheDocument();
    expect(screen.getByText(/Twelve Data/)).toBeInTheDocument();
    expect(screen.getByText(/indicative/i)).toBeInTheDocument();
  });

  it('converts gold grams from the displayed troy-ounce quote', async () => {
    const user = userEvent.setup();
    render(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing={false} />);
    await user.clear(screen.getByLabelText(/quantity/i));
    await user.type(screen.getByLabelText(/quantity/i), '10');
    await user.selectOptions(screen.getByLabelText(/unit/i), 'gram');
    expect(screen.getByText('$775.64')).toBeInTheDocument();
  });

  it('requests a new currency and chart range', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<MarketCard market={market} request={request} onRefresh={onRefresh} refreshing={false} />);
    await user.selectOptions(screen.getByLabelText(/display currency/i), 'AED');
    expect(onRefresh).toHaveBeenCalledWith({ ...request, currency: 'AED' });
    await user.click(screen.getByRole('button', { name: '1W' }));
    expect(onRefresh).toHaveBeenCalledWith({ ...request, range: '1W' });
  });

  it('renders unavailable and stale states without a fabricated price', () => {
    const { rerender } = render(<MarketCard market={{ kind: 'market', status: 'unavailable', error: { message: 'Market data temporarily unavailable.' } }} request={request} onRefresh={() => {}} refreshing={false} />);
    expect(screen.getByText('Market data temporarily unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('$2,412.50')).not.toBeInTheDocument();
    rerender(<MarketCard market={{ ...market, status: 'stale', meta: { ...market.meta, cached: true, stale: true } }} request={request} onRefresh={() => {}} refreshing={false} />);
    expect(screen.getByText(/stale/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run:

```bash
npx vitest run tests/market-card.test.jsx
```

Expected: FAIL because `MarketCard.jsx` does not exist.

- [ ] **Step 3: Implement formatting, chart, status, selectors, and converter**

Create `src/components/MarketCard.jsx`. Use `Intl.NumberFormat` for currency and numbers, `Intl.DateTimeFormat` for the exact provider timestamp, and this conversion logic:

```jsx
import { useMemo, useState } from 'react';
import { RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { DISPLAY_CURRENCIES, MARKET_ASSETS } from '../services/marketCatalog.js';

const GRAMS_PER_TROY_OUNCE = 31.1034768;
const UNIT_TO_OUNCES = { troy_ounce: 1, gram: 1 / GRAMS_PER_TROY_OUNCE, kilogram: 1000 / GRAMS_PER_TROY_OUNCE, unit: 1 };

function money(value, currency) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: value < 1 ? 6 : 2 }).format(value);
}

function linePoints(points) {
  if (!points?.length) return '';
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  return points.map((point, index) => `${(index / Math.max(points.length - 1, 1)) * 100},${40 - ((point.value - min) / span) * 36}`).join(' ');
}

export default function MarketCard({ market, request, onRefresh, refreshing }) {
  const [amount, setAmount] = useState(request.amount || 1);
  const [unit, setUnit] = useState(request.unit || 'unit');
  const converted = useMemo(() => market.quote ? Number(amount || 0) * (UNIT_TO_OUNCES[unit] || 1) * market.quote.price : null, [amount, unit, market.quote]);

  if (market.status === 'unavailable') {
    return <section className="market-card market-card-error" role="region" aria-label="Market data unavailable"><p>{market.error?.message || 'Market data temporarily unavailable.'}</p><button type="button" onClick={() => onRefresh(request)} disabled={refreshing}>Retry</button></section>;
  }

  const up = market.quote.change >= 0;
  const MovementIcon = up ? TrendingUp : TrendingDown;
  const units = market.asset.class === 'metal' ? [['troy_ounce', 'Troy ounce'], ['gram', 'Gram'], ['kilogram', 'Kilogram']] : [['unit', 'Unit']];
  const statusLabel = market.status === 'stale' ? 'Stale' : market.status === 'delayed' ? 'Delayed' : market.quote.marketOpen ? 'Market open' : 'Market closed';
  return (
    <section className="market-card" role="region" aria-label={`${market.asset.name} market quote`}>
      <header className="market-card-header"><div><strong>{market.asset.name}</strong><span>{market.asset.symbol}</span></div><span className={`market-status market-status-${market.status}`}>{statusLabel}</span></header>
      <div className="market-price-row"><div><div className="market-price">{money(market.quote.price, market.quote.currency)}</div><div className={up ? 'market-movement up' : 'market-movement down'}><MovementIcon aria-hidden="true" size={16} />{up ? 'Up' : 'Down'} {Math.abs(market.quote.changePercent).toFixed(2)}% ({money(Math.abs(market.quote.change), market.quote.currency)})</div></div><button type="button" className="market-refresh" aria-label="Refresh market data" onClick={() => onRefresh(request)} disabled={refreshing}><RefreshCw aria-hidden="true" size={16} />{refreshing ? 'Refreshing' : 'Refresh'}</button></div>
      <div className="market-ranges" aria-label="Chart range">{['1D', '1W', '1M'].map((range) => <button type="button" key={range} aria-pressed={request.range === range} onClick={() => onRefresh({ ...request, range })}>{range}</button>)}</div>
      <svg className="market-chart" viewBox="0 0 100 44" role="img" aria-label={`${request.range} price trend`}><polyline points={linePoints(market.series.points)} fill="none" vectorEffect="non-scaling-stroke" /></svg>
      <div className="market-controls"><label>Asset<select aria-label="Asset" value={request.assetId} onChange={(event) => { const asset = MARKET_ASSETS.find((item) => item.id === event.target.value); onRefresh({ ...request, assetId: asset.id, symbol: asset.symbol, assetClass: asset.assetClass, unit: asset.defaultUnit, conversion: null }); }}>{MARKET_ASSETS.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><label>Display currency<select aria-label="Display currency" value={request.currency} onChange={(event) => onRefresh({ ...request, currency: event.target.value, conversion: null })}>{DISPLAY_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label>Quantity<input aria-label="Quantity" type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>Unit<select aria-label="Unit" value={unit} onChange={(event) => setUnit(event.target.value)}>{units.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <output className="market-conversion" aria-live="polite">{money(converted, market.quote.currency)}</output>
      <footer className="market-card-footer"><span>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(market.quote.timestamp))}</span><span>Source: {market.meta.source}</span><span>Indicative data, not an executable quote.</span></footer>
    </section>
  );
}
```

- [ ] **Step 4: Complete interaction and edge-state coverage**

Append these cases to `tests/market-card.test.jsx`:

```jsx
it('labels negative, delayed, closed, and stale states without relying on color', () => {
  const { rerender } = render(<MarketCard market={{ ...market, status: 'delayed', quote: { ...market.quote, change: -5, changePercent: -0.5, marketOpen: false }, meta: { ...market.meta, delayMinutes: 15 } }} request={request} onRefresh={() => {}} refreshing={false} />);
  expect(screen.getByText(/down 0.50%/i)).toBeInTheDocument();
  expect(screen.getByText('Delayed')).toBeInTheDocument();
  rerender(<MarketCard market={{ ...market, quote: { ...market.quote, marketOpen: false } }} request={request} onRefresh={() => {}} refreshing={false} />);
  expect(screen.getByText('Market closed')).toBeInTheDocument();
  rerender(<MarketCard market={{ ...market, status: 'stale', meta: { ...market.meta, cached: true, stale: true } }} request={request} onRefresh={() => {}} refreshing={false} />);
  expect(screen.getByText('Stale')).toBeInTheDocument();
});

it('disables refresh while a request is active and keeps all actions non-submitting', () => {
  render(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing />);
  expect(screen.getByRole('button', { name: /refresh market data/i })).toBeDisabled();
  for (const button of screen.getAllByRole('button')) expect(button).toHaveAttribute('type', 'button');
});

it('supports zero quantity, all metal units, and an empty chart', async () => {
  const user = userEvent.setup();
  render(<MarketCard market={{ ...market, series: { range: '1D', points: [] } }} request={request} onRefresh={() => {}} refreshing={false} />);
  expect(screen.getByRole('img', { name: /1D price trend/i })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Troy ounce' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Gram' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Kilogram' })).toBeInTheDocument();
  await user.clear(screen.getByLabelText(/quantity/i));
  await user.type(screen.getByLabelText(/quantity/i), '0');
  expect(screen.getByText('$0.00')).toBeInTheDocument();
});

it('limits stock and crypto conversion to units', () => {
  render(<MarketCard market={{ ...market, asset: { id: 'apple', class: 'stock', symbol: 'AAPL', name: 'Apple' } }} request={{ ...request, assetId: 'apple', symbol: 'AAPL', assetClass: 'stock', unit: 'unit' }} onRefresh={() => {}} refreshing={false} />);
  expect(screen.getAllByRole('option', { name: 'Unit' })).toHaveLength(1);
  expect(screen.queryByRole('option', { name: 'Gram' })).not.toBeInTheDocument();
});

it('shows retry timing without showing a number as a quote', () => {
  render(<MarketCard market={{ kind: 'market', status: 'unavailable', error: { code: 'rate_limited', message: 'Market data rate limit reached.', retryAfter: 30 } }} request={request} onRefresh={() => {}} refreshing={false} />);
  expect(screen.getByText(/Market data rate limit reached/)).toBeInTheDocument();
  expect(screen.queryByText('$2,412.50')).not.toBeInTheDocument();
});
```

Replace the unavailable branch's paragraph value with:

```jsx
const unavailableMessage = market.error?.message || 'Market data temporarily unavailable.';
const retryMessage = market.error?.retryAfter ? ` Retry in ${market.error.retryAfter} seconds.` : '';
// Render inside the unavailable section:
<p>{unavailableMessage}{retryMessage}</p>
```

Run:

```bash
npx vitest run tests/market-card.test.jsx
```

Expected: all component tests PASS without CSS-dependent assertions.

- [ ] **Step 5: Commit the component logic**

```bash
git add src/components/MarketCard.jsx tests/market-card.test.jsx
git commit -m "feat: add native market quote card"
```

---

