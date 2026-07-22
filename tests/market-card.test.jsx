// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MarketCard from '../src/components/MarketCard.jsx';
import ChatMessage from '../src/components/ChatMessage.jsx';
import App from '../src/App.jsx';

const { fetchMarketDataMock } = vi.hoisted(() => ({ fetchMarketDataMock: vi.fn() }));

vi.mock('../src/services/marketService.js', async (importOriginal) => ({
  ...await importOriginal(),
  fetchMarketData: fetchMarketDataMock
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  fetchMarketDataMock.mockReset();
  vi.restoreAllMocks();
});

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

describe('ChatMessage market dispatch', () => {
  it('renders a structured market response through MarketCard', () => {
    render(
      <ChatMessage
        message={{ role: 'assistant', type: 'market', content: '', request, market }}
        onRunInCanvas={() => {}}
        onReviseCode={() => {}}
        onRefreshMarket={() => {}}
        marketRefreshing={false}
      />
    );

    expect(screen.getByRole('region', { name: /Gold Spot market quote/i })).toBeInTheDocument();
  });

  it('preserves rendering for historical text responses', () => {
    render(
      <ChatMessage
        message={{ role: 'assistant', content: 'Old answer' }}
        onRunInCanvas={() => {}}
        onReviseCode={() => {}}
        onRefreshMarket={() => {}}
        marketRefreshing={false}
      />
    );

    expect(screen.getByText('Old answer')).toBeInTheDocument();
  });

  it('wires refresh requests and busy state to the market card', async () => {
    const user = userEvent.setup();
    const onRefreshMarket = vi.fn();
    const { rerender } = render(
      <ChatMessage
        message={{ role: 'assistant', type: 'market', content: '', request, market }}
        onRunInCanvas={() => {}}
        onReviseCode={() => {}}
        onRefreshMarket={onRefreshMarket}
        marketRefreshing={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /refresh market data/i }));
    expect(onRefreshMarket).toHaveBeenCalledWith(request);

    rerender(
      <ChatMessage
        message={{ role: 'assistant', type: 'market', content: '', request, market }}
        onRunInCanvas={() => {}}
        onReviseCode={() => {}}
        onRefreshMarket={onRefreshMarket}
        marketRefreshing
      />
    );
    expect(screen.getByRole('button', { name: /refresh market data/i })).toBeDisabled();
  });
});

describe('App market message persistence', () => {
  function stubBrowserLayout() {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
    Element.prototype.scrollIntoView = vi.fn();
  }

  it('loads legacy text unchanged and persists a stable ID migration for legacy market messages', async () => {
    stubBrowserLayout();
    localStorage.setItem('corez_sessions', JSON.stringify([
      {
        id: 'legacy',
        title: 'Legacy',
        messages: [
          { role: 'assistant', content: 'Persisted old answer' },
          { role: 'assistant', type: 'market', content: '', request, market }
        ]
      }
    ]));

    render(<App />);

    expect(screen.getByText('Persisted old answer')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Gold Spot market quote/i })).toBeInTheDocument();
    let migratedId;
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('corez_sessions'));
      migratedId = stored[0].messages[1].id;
      expect(migratedId).toMatch(/^market-/);
      expect(stored[0].messages[0]).toEqual({ role: 'assistant', content: 'Persisted old answer' });
    });

    cleanup();
    render(<App />);
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('corez_sessions'));
      expect(stored[0].messages[1].id).toBe(migratedId);
    });
  });

  it('refreshes the exact origin message after the active session changes', async () => {
    stubBrowserLayout();
    const refreshedMarket = { ...market, quote: { ...market.quote, price: 2500 } };
    let resolveRefresh;
    fetchMarketDataMock.mockReturnValue(new Promise((resolve) => { resolveRefresh = resolve; }));
    localStorage.setItem('corez_sessions', JSON.stringify([
      {
        id: 'origin',
        title: 'Origin',
        messages: [{ role: 'assistant', type: 'market', content: '', request, market }]
      },
      {
        id: 'other',
        title: 'Other',
        messages: [{
          role: 'assistant',
          type: 'market',
          content: '',
          request: { ...request, assetId: 'bitcoin', symbol: 'BTC/USD', assetClass: 'crypto', unit: 'unit' },
          market: {
            ...market,
            asset: { id: 'bitcoin', class: 'crypto', symbol: 'BTC/USD', name: 'Bitcoin' }
          }
        }]
      }
    ]));

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /refresh market data/i }));
    fireEvent.click(document.querySelector('[title="Other"]'));
    expect(screen.getByRole('region', { name: /Bitcoin market quote/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh market data/i })).toBeEnabled();

    await act(async () => resolveRefresh(refreshedMarket));

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('corez_sessions'));
      expect(stored.find((session) => session.id === 'origin').messages[0].market.quote.price).toBe(2500);
      expect(stored.find((session) => session.id === 'other').messages[0].market.asset.name).toBe('Bitcoin');
    });
  });
});

describe('MarketCard', () => {
  it('exposes named controls that work from the keyboard', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<MarketCard market={market} request={request} onRefresh={onRefresh} refreshing={false} />);

    expect(screen.getByLabelText('Asset')).toBeInTheDocument();
    expect(screen.getByLabelText('Display currency')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1D' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /refresh market data/i })).toBeInTheDocument();

    await user.tab();
    expect(document.activeElement).not.toBe(document.body);
    await user.selectOptions(screen.getByLabelText('Display currency'), 'AED');
    expect(onRefresh).toHaveBeenCalledWith({ ...request, currency: 'AED', conversion: null });
  });

  it('renders a sourced indicative quote with non-color movement text and exact provider time', () => {
    render(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing={false} />);

    const card = screen.getByRole('region', { name: /gold spot market quote/i });
    expect(within(card).getByText('$2,412.50', { selector: '.market-price' })).toBeVisible();
    expect(screen.getByText(/up 0.94%/i)).toBeInTheDocument();
    expect(screen.getByText(/Twelve Data/)).toBeInTheDocument();
    expect(screen.getByText(/indicative/i)).toBeInTheDocument();
    expect(screen.getByText(/Jul 22, 2026, 7:00:00 AM UTC/i)).toBeInTheDocument();
  });

  it('keeps the primary formatted quote as accessible semantic text', () => {
    render(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing={false} />);

    const price = screen.getByText('$2,412.50', { selector: 'data.market-price' });
    expect(price).toBeVisible();
    expect(price).not.toHaveAttribute('aria-label');
    expect(price.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it('announces refresh progress and completion in one scoped market status region', () => {
    const { rerender } = render(
      <MarketCard market={market} request={request} onRefresh={() => {}} refreshing />
    );

    const status = screen.getByRole('status', { name: 'Market update' });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveTextContent(/Refreshing market data.*Market open/i);

    rerender(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing={false} />);
    expect(screen.getByRole('status', { name: 'Market update' })).toHaveTextContent(/Market data ready.*Market open/i);
    expect(screen.getByRole('region', { name: /gold spot market quote/i })).not.toHaveAttribute('aria-live');
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
    expect(screen.getByLabelText(/^asset$/i)).toBeDisabled();
    expect(screen.getByLabelText(/display currency/i)).toBeDisabled();
    expect(screen.getByLabelText(/quantity/i)).toBeEnabled();
    expect(screen.getByLabelText(/^unit$/i)).toBeEnabled();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button');
    }
  });

  it('renders zero movement neutrally without a directional icon', () => {
    render(
      <MarketCard
        market={{ ...market, quote: { ...market.quote, change: 0, changePercent: 0 } }}
        request={request}
        onRefresh={() => {}}
        refreshing={false}
      />
    );

    expect(screen.getByText(/Unchanged 0.00%/i)).toBeInTheDocument();
    expect(document.querySelector('.market-movement-neutral .lucide-minus')).toBeInTheDocument();
    expect(document.querySelector('.market-movement-up, .market-movement-down')).not.toBeInTheDocument();
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

  it('calculates a kilogram of metal from the troy-ounce quote', async () => {
    const user = userEvent.setup();
    render(<MarketCard market={market} request={request} onRefresh={() => {}} refreshing={false} />);

    await user.selectOptions(screen.getByLabelText(/^unit$/i), 'kilogram');
    expect(screen.getByText('$77,563.68')).toBeInTheDocument();
  });

  it.each([
    ['stock', { id: 'apple', class: 'stock', symbol: 'AAPL', name: 'Apple' }],
    ['crypto', { id: 'bitcoin', class: 'crypto', symbol: 'BTC/USD', name: 'Bitcoin' }]
  ])('calculates whole %s units directly from the displayed quote', async (assetClass, asset) => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(
      <MarketCard
        market={{ ...market, asset }}
        request={{ ...request, assetId: asset.id, symbol: asset.symbol, assetClass, amount: 1, unit: 'unit' }}
        onRefresh={onRefresh}
        refreshing={false}
      />
    );

    await user.clear(screen.getByLabelText(/quantity/i));
    await user.type(screen.getByLabelText(/quantity/i), '3');
    expect(screen.getByText('$7,237.50')).toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('filters non-finite chart values and keeps flat chart geometry finite and stable', () => {
    const { rerender } = render(
      <MarketCard
        market={{
          ...market,
          series: {
            range: '1D',
            points: [{ value: Number.NaN }, { value: Number.POSITIVE_INFINITY }, { value: 2400 }, { value: 2400 }]
          }
        }}
        request={request}
        onRefresh={() => {}}
        refreshing={false}
      />
    );

    const line = document.querySelector('.market-chart polyline');
    expect(line).toHaveAttribute('points', '0,40 100,40');
    expect(line.getAttribute('points')).not.toMatch(/NaN|Infinity/);

    rerender(
      <MarketCard
        market={{ ...market, series: { range: '1D', points: [{ value: Number.NaN }, { value: Number.NEGATIVE_INFINITY }] } }}
        request={request}
        onRefresh={() => {}}
        refreshing={false}
      />
    );
    expect(document.querySelector('.market-chart polyline')).not.toBeInTheDocument();
    expect(screen.getByText(/No chart data available/i)).toBeInTheDocument();
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

  it('announces unavailable errors and exposes retry busy and disabled semantics', () => {
    render(
      <MarketCard
        market={{ kind: 'market', status: 'unavailable', error: { message: 'Market data temporarily unavailable.' } }}
        request={request}
        onRefresh={() => {}}
        refreshing
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Market data temporarily unavailable.');
    expect(screen.getByRole('region', { name: /market data unavailable/i })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Retrying' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retrying' })).toHaveAttribute('aria-busy', 'true');
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

    expect(screen.getByText('$2,412.50', { selector: '.market-price' })).toBeInTheDocument();
    expect(screen.getByText('Movement unavailable')).toBeInTheDocument();
    expect(screen.getByText('Update time unavailable')).toBeInTheDocument();
    expect(screen.getByText('Source unavailable')).toBeInTheDocument();
    expect(screen.getByText(/No chart data available/i)).toBeInTheDocument();
  });

  it.each([
    ['a missing price', { currency: 'USD', marketOpen: true }],
    ['a non-finite price', { price: Number.POSITIVE_INFINITY, currency: 'USD', marketOpen: true }],
    ['a missing quote currency', { price: 2412.5, marketOpen: true }],
    ['an invalid quote currency', { price: 2412.5, currency: 'NOT_A_CURRENCY', marketOpen: true }]
  ])('uses safe placeholders for %s without fabricating a quote', (_label, quote) => {
    render(
      <MarketCard
        market={{ ...market, quote }}
        request={request}
        onRefresh={() => {}}
        refreshing={false}
      />
    );

    expect(screen.getByText('Quote unavailable', { selector: '.market-price' })).toBeInTheDocument();
    expect(screen.getByText('Conversion unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Market update' })).toHaveTextContent(/Quote unavailable/i);
  });
});
