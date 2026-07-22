// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MarketCard from '../src/components/MarketCard.jsx';

afterEach(cleanup);

const request = {
  assetId: 'gold',
  symbol: 'XAU/USD',
  assetClass: 'metal',
  currency: 'USD',
  amount: 1,
  unit: 'troy_ounce',
  range: '1D',
  conversion: null
};

const market = {
  kind: 'market',
  status: 'live',
  asset: { id: 'gold', class: 'metal', symbol: 'XAU/USD', name: 'Gold Spot' },
  quote: {
    price: 2412.5,
    currency: 'USD',
    change: 22.5,
    changePercent: 0.9414,
    high: 2420,
    low: 2395,
    previousClose: 2390,
    marketOpen: true,
    timestamp: '2026-07-22T07:00:00.000Z'
  },
  series: {
    range: '1D',
    points: [
      { timestamp: '2026-07-22T07:00:00.000Z', value: 2400 },
      { timestamp: '2026-07-22T07:05:00.000Z', value: 2412.5 }
    ]
  },
  conversion: { amount: 1, unit: 'troy_ounce', value: 2412.5, currency: 'USD' },
  meta: { source: 'Twelve Data', cached: false, stale: false }
};

describe('MarketCard', () => {
  it('renders a sourced indicative quote with non-color movement text and exact provider time', () => {
    render(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing={false} />);

    expect(screen.getByRole('region', { name: /gold spot market quote/i })).toBeInTheDocument();
    expect(screen.getByText('$2,412.50')).toBeInTheDocument();
    expect(screen.getByText(/up 0.94%/i)).toBeInTheDocument();
    expect(screen.getByText(/Twelve Data/)).toBeInTheDocument();
    expect(screen.getByText(/indicative/i)).toBeInTheDocument();
    expect(screen.getByText(/Jul 22, 2026, 7:00:00 AM UTC/i)).toBeInTheDocument();
  });

  it('converts gold grams from the displayed troy-ounce quote locally', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<MarketCard market={market} request={request} onRefresh={onRefresh} refreshing={false} />);

    await user.clear(screen.getByLabelText(/quantity/i));
    await user.type(screen.getByLabelText(/quantity/i), '10');
    await user.selectOptions(screen.getByLabelText(/^unit$/i), 'gram');

    expect(screen.getByText('$775.64')).toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('requests new currency, range, and asset values from the parent', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<MarketCard market={market} request={request} onRefresh={onRefresh} refreshing={false} />);

    await user.selectOptions(screen.getByLabelText(/display currency/i), 'AED');
    expect(onRefresh).toHaveBeenCalledWith({ ...request, currency: 'AED', conversion: null });

    await user.click(screen.getByRole('button', { name: '1W' }));
    expect(onRefresh).toHaveBeenCalledWith({ ...request, range: '1W' });

    await user.selectOptions(screen.getByLabelText(/^asset$/i), 'bitcoin');
    expect(onRefresh).toHaveBeenCalledWith({
      ...request,
      assetId: 'bitcoin',
      symbol: 'BTC/USD',
      assetClass: 'crypto',
      amount: 1,
      unit: 'unit',
      conversion: null
    });
  });

  it('renders unavailable and stale states without a fabricated price', () => {
    const { rerender } = render(
      <MarketCard
        market={{ kind: 'market', status: 'unavailable', error: { message: 'Market data temporarily unavailable.' } }}
        request={request}
        onRefresh={() => {}}
        refreshing={false}
      />
    );

    expect(screen.getByText('Market data temporarily unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('$2,412.50')).not.toBeInTheDocument();

    rerender(
      <MarketCard
        market={{ ...market, status: 'stale', meta: { ...market.meta, cached: true, stale: true } }}
        request={request}
        onRefresh={() => {}}
        refreshing={false}
      />
    );
    expect(screen.getByText('Stale')).toBeInTheDocument();
  });

  it('labels negative, delayed, closed, and stale states without relying on color', () => {
    const { rerender } = render(
      <MarketCard
        market={{
          ...market,
          status: 'delayed',
          quote: { ...market.quote, change: -5, changePercent: -0.5, marketOpen: false },
          meta: { ...market.meta, delayMinutes: 15 }
        }}
        request={request}
        onRefresh={() => {}}
        refreshing={false}
      />
    );

    expect(screen.getByText(/down 0.50%/i)).toBeInTheDocument();
    expect(screen.getByText('Delayed')).toBeInTheDocument();
    expect(screen.getByText(/15 minutes/i)).toBeInTheDocument();

    rerender(
      <MarketCard
        market={{ ...market, quote: { ...market.quote, marketOpen: false } }}
        request={request}
        onRefresh={() => {}}
        refreshing={false}
      />
    );
    expect(screen.getByText('Market closed')).toBeInTheDocument();

    rerender(
      <MarketCard
        market={{ ...market, status: 'stale', meta: { ...market.meta, cached: true, stale: true } }}
        request={request}
        onRefresh={() => {}}
        refreshing={false}
      />
    );
    expect(screen.getByText('Stale')).toBeInTheDocument();
  });

  it('disables refresh while active and keeps every action non-submitting', () => {
    render(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing />);

    expect(screen.getByRole('button', { name: /refresh market data/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /refresh market data/i })).toHaveAttribute('aria-busy', 'true');
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button');
    }
  });

  it('supports zero quantity, all metal units, and an empty chart', async () => {
    const user = userEvent.setup();
    render(
      <MarketCard
        market={{ ...market, series: { range: '1D', points: [] } }}
        request={request}
        onRefresh={() => {}}
        refreshing={false}
      />
    );

    expect(screen.getByRole('img', { name: /1D price trend/i })).toBeInTheDocument();
    expect(screen.getByText(/No chart data available/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Troy ounce' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Gram' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Kilogram' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/quantity/i));
    await user.type(screen.getByLabelText(/quantity/i), '0');
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('does not format empty or invalid quantities as invented values', async () => {
    const user = userEvent.setup();
    render(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing={false} />);

    await user.clear(screen.getByLabelText(/quantity/i));
    expect(screen.getByText('Enter a valid quantity.')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/quantity/i), '-1');
    expect(screen.getByText('Enter a valid quantity.')).toBeInTheDocument();
  });

  it('limits stock and crypto conversion to units', () => {
    render(
      <MarketCard
        market={{ ...market, asset: { id: 'apple', class: 'stock', symbol: 'AAPL', name: 'Apple' } }}
        request={{ ...request, assetId: 'apple', symbol: 'AAPL', assetClass: 'stock', unit: 'unit' }}
        onRefresh={() => {}}
        refreshing={false}
      />
    );

    expect(screen.getAllByRole('option', { name: 'Unit' })).toHaveLength(1);
    expect(screen.queryByRole('option', { name: 'Gram' })).not.toBeInTheDocument();
  });

  it('shows retry timing and retries the same request without showing a number as a quote', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(
      <MarketCard
        market={{
          kind: 'market',
          status: 'unavailable',
          error: { code: 'rate_limited', message: 'Market data rate limit reached.', retryAfter: 30 }
        }}
        request={request}
        onRefresh={onRefresh}
        refreshing={false}
      />
    );

    expect(screen.getByText(/Retry in 30 seconds/)).toBeInTheDocument();
    expect(screen.queryByText('$2,412.50')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRefresh).toHaveBeenCalledWith(request);
  });

  it('omits missing optional presentation data without throwing or inventing it', () => {
    render(
      <MarketCard
        market={{
          ...market,
          quote: { price: 2412.5, currency: 'USD', marketOpen: true },
          series: undefined,
          meta: undefined
        }}
        request={request}
        onRefresh={() => {}}
        refreshing={false}
      />
    );

    expect(screen.getByText('$2,412.50')).toBeInTheDocument();
    expect(screen.getByText('Movement unavailable')).toBeInTheDocument();
    expect(screen.getByText('Update time unavailable')).toBeInTheDocument();
    expect(screen.getByText('Source unavailable')).toBeInTheDocument();
    expect(screen.getByText(/No chart data available/i)).toBeInTheDocument();
  });
});
