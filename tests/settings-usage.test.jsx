// @vitest-environment jsdom
// The usage block in Settings → Billing is the visible half of metering: it has
// to show what has been spent, what the plan allows, and point at upgrading
// when a limit is reached or close.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsModal from '../src/components/SettingsModal.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { PLAN_LIMITS } from '../worker/usage.js';

function usagePayload(overrides = {}) {
  const messages = overrides.messages || { used: 5, limit: 20, remaining: 15 };
  return {
    period: '2026-09',
    resetsAt: Date.UTC(2026, 9, 1),
    plan: 'free',
    meteringEnabled: true,
    usage: { messages: messages.used, tokens: 1200, tokensEstimated: 1200 },
    metrics: {
      messages,
      swarm_runs: { used: 1, limit: 10, remaining: 9 },
      images: { used: 0, limit: 10, remaining: 10 },
      publishes: { used: 0, limit: 3, remaining: 3 },
      publishedPages: { used: 0, limit: 1, remaining: 1 },
      tokens: { used: 1200, limit: 250000, remaining: 248800 },
    },
    exceeded: [],
    nearLimit: [],
    ...overrides,
  };
}

function mockApi({ usage = usagePayload(), usageStatus = 200 } = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const target = String(url);
    if (target.includes('/api/auth/me')) {
      return new Response(JSON.stringify({ user: { id: 'u1', email: 'demo@corez.pro', plan: 'free' } }), { status: 200 });
    }
    if (target.includes('/api/subscriptions/me')) {
      return new Response(JSON.stringify({ plan: 'free', status: 'active' }), { status: 200 });
    }
    if (target === '/api/usage') {
      if (usageStatus !== 200) {
        return new Response(JSON.stringify({ error: 'nope' }), { status: usageStatus });
      }
      return new Response(JSON.stringify(usage), { status: 200 });
    }
    if (target === '/api/publish') {
      return new Response(JSON.stringify({ pages: [], truncated: false }), { status: 200 });
    }
    if (target === '/api/addons') {
      // The panel also loads the add-on catalogue; this suite is about usage.
      return new Response(
        JSON.stringify({ enabled: true, skus: [], balances: {}, purchases: [], settledNow: [] }),
        { status: 200 },
      );
    }
    return new Response(null, { status: 404 });
  });
}

function renderBilling() {
  const view = render(
    <MemoryRouter>
      <AuthProvider>
        <SettingsModal
          isOpen
          onClose={() => {}}
          onClearAllHistory={() => {}}
          theme="dark"
          onToggleTheme={() => {}}
        />
      </AuthProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Billing' }));
  return view;
}

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('settings: usage this month', () => {
  it('shows what has been used against each plan limit', async () => {
    mockApi();
    renderBilling();

    expect(await screen.findByText(/usage this month/i)).toBeTruthy();
    const usageBlock = document.querySelector('.settings-usage');
    expect(within(usageBlock).getByText('Generations')).toBeTruthy();
    expect(within(usageBlock).getByText(/^5$/)).toBeTruthy();
    expect(within(usageBlock).getByText('/ 20')).toBeTruthy();
    expect(within(usageBlock).getByText('Build runs')).toBeTruthy();
    expect(within(usageBlock).getByText('Published pages')).toBeTruthy();
    expect(
      within(usageBlock).getByRole('progressbar', { name: /generations used/i }),
    ).toBeTruthy();
  });

  it('reports where the counters reset', async () => {
    mockApi();
    renderBilling();
    expect(await screen.findByText(/resets/i)).toBeTruthy();
  });

  it('marks an unlimited metric as unlimited instead of inventing a cap', async () => {
    mockApi({
      usage: usagePayload({
        plan: 'premium',
        metrics: {
          messages: { used: 400, limit: null, remaining: null },
          swarm_runs: { used: 12, limit: null, remaining: null },
        },
      }),
    });
    renderBilling();
    expect(await screen.findByText(/usage this month/i)).toBeTruthy();
    expect(screen.getAllByText('/ unlimited').length).toBeGreaterThan(0);
  });

  it('offers the upgrade path once a limit is spent', async () => {
    mockApi({
      usage: usagePayload({
        messages: { used: 20, limit: 20, remaining: 0 },
        exceeded: ['messages'],
      }),
    });
    renderBilling();

    expect(await screen.findByText(/used up a limit on this plan/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /compare plans/i })).toBeTruthy();
  });

  it('nudges before the wall, not only at it', async () => {
    mockApi({
      usage: usagePayload({
        messages: { used: 17, limit: 20, remaining: 3 },
        nearLimit: ['messages'],
      }),
    });
    renderBilling();
    expect(await screen.findByText(/close to a limit on this plan/i)).toBeTruthy();
  });

  it('says nothing about upgrades while there is room', async () => {
    mockApi();
    renderBilling();
    await screen.findByText(/usage this month/i);
    expect(screen.queryByRole('button', { name: /compare plans/i })).toBeNull();
    expect(screen.queryByText(/close to a limit/i)).toBeNull();
  });

  it('explains when the deployment does not meter at all', async () => {
    mockApi({ usage: usagePayload({ meteringEnabled: false, metrics: {} }) });
    renderBilling();
    expect(await screen.findByText(/not metered on this deployment/i)).toBeTruthy();
  });

  it('surfaces a failure to load usage instead of showing zeros', async () => {
    mockApi({ usageStatus: 500 });
    renderBilling();
    const usageBlock = await waitFor(() => {
      const block = document.querySelector('.settings-usage');
      expect(block).toBeTruthy();
      return block;
    });
    expect(within(usageBlock).getByRole('alert').textContent).toMatch(/could not load usage/i);
  });

  it('publishes the free plan limits it is showing', () => {
    // The panel is only honest if it matches what the Worker enforces.
    expect(PLAN_LIMITS.free.messages).toBe(20);
    expect(PLAN_LIMITS.free.images).toBe(10);
    expect(PLAN_LIMITS.premium.messages).toBeNull();
  });
});
