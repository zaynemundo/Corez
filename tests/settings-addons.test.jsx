// @vitest-environment jsdom
// Add-on packs in Settings → Billing, and the success page that settles a
// purchase. The client must never invent a price, a credit count, or a
// successful payment.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsModal from '../src/components/SettingsModal.jsx';
import { PaymentSuccess } from '../src/pages/PaymentStatus.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';

const SKUS = [
  {
    id: 'research_pack',
    label: 'Deep research reports',
    unitLabel: 'reports',
    metric: 'research_reports',
    credits: 10,
    amount: 3672,
    aed: '36.72',
    currency: 'AED',
    available: true,
    blurb: 'Ten full research runs.',
  },
  {
    id: 'image_pack',
    label: 'Image pack',
    unitLabel: 'images',
    metric: 'images',
    credits: 50,
    amount: 2754,
    aed: '27.54',
    currency: 'AED',
    available: true,
    blurb: 'Fifty extra generated images.',
  },
  {
    id: 'video_pack',
    label: 'Video pack',
    unitLabel: 'videos',
    metric: 'videos',
    credits: 10,
    amount: 9180,
    aed: '91.80',
    currency: 'AED',
    available: false,
    blurb: 'Video generation has not shipped yet.',
  },
];

function mockApi({
  addons = {
    enabled: true,
    skus: SKUS,
    balances: { research_pack: { remaining: 4, purchased: 10 }, image_pack: { remaining: 0, purchased: 0 }, video_pack: { remaining: 0, purchased: 0 } },
    purchases: [],
    settledNow: [],
    paymentsConfigured: true,
  },
  addonsStatus = 200,
  checkoutBody = { purchaseId: 'addon_1', sku: SKUS[1], redirect_url: 'https://pay.ziina.test/1' },
  checkoutStatus = 201,
  usage = null,
} = {}) {
  const calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const target = String(url);
    const method = init.method || 'GET';
    calls.push({ url: target, method });
    if (target.includes('/api/auth/me')) {
      return new Response(JSON.stringify({ user: { id: 'u1', email: 'demo@corez.pro', plan: 'free' } }), { status: 200 });
    }
    if (target.includes('/api/subscriptions/me')) {
      return new Response(JSON.stringify({ plan: 'free', status: 'active' }), { status: 200 });
    }
    if (target === '/api/addons' && method === 'GET') {
      return new Response(JSON.stringify(addons), { status: addonsStatus });
    }
    if (target === '/api/addons/checkout') {
      return new Response(JSON.stringify(checkoutBody), { status: checkoutStatus });
    }
    if (target === '/api/addons/verify') {
      return new Response(
        JSON.stringify({
          success: true,
          granted: true,
          alreadySettled: false,
          message: 'Credits added to your account.',
          purchase: { label: 'Image pack', credits: 50, unitLabel: 'images' },
        }),
        { status: 200 },
      );
    }
    if (target === '/api/usage') {
      return new Response(
        JSON.stringify(
          usage || {
            period: '2026-09',
            resetsAt: Date.UTC(2026, 9, 1),
            plan: 'free',
            meteringEnabled: true,
            metrics: {
              messages: { used: 5, limit: 20, remaining: 15 },
              images: { used: 10, limit: 10, remaining: 0 },
              publishedPages: { used: 0, limit: 1, remaining: 1 },
            },
            exceeded: ['images'],
            nearLimit: [],
          },
        ),
        { status: 200 },
      );
    }
    if (target === '/api/publish') {
      return new Response(JSON.stringify({ pages: [], truncated: false }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
  return calls;
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

let originalLocation;

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  // jsdom refuses real navigation: capture the assignment instead.
  originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href: '', origin: 'https://corez.test', pathname: '/', search: '' },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

describe('settings: add-on packs', () => {
  it('lists the catalogue with server prices, credit counts and balances', async () => {
    mockApi();
    renderBilling();

    const block = await screen.findByLabelText(/add-on packs/i);
    expect(within(block).getByText('Deep research reports')).toBeTruthy();
    expect(within(block).getByText('36.72 AED')).toBeTruthy();
    expect(within(block).getByText(/10 reports/)).toBeTruthy();
    expect(within(block).getByText(/4 left/)).toBeTruthy();
    expect(within(block).getByText('Image pack')).toBeTruthy();
    expect(within(block).getByText('27.54 AED')).toBeTruthy();
    expect(within(block).getAllByText(/None left/).length).toBeGreaterThan(0);
  });

  it('will not sell a pack whose pipeline does not exist yet', async () => {
    mockApi();
    renderBilling();

    const block = await screen.findByLabelText(/add-on packs/i);
    const videoRow = within(block).getByText('Video pack').closest('li');
    const button = within(videoRow).getByRole('button', { name: /soon/i });
    expect(button.disabled).toBe(true);
    expect(within(videoRow).getByText(/has not shipped yet/i)).toBeTruthy();
  });

  it('starts a purchase and sends the browser to the payment page', async () => {
    const calls = mockApi();
    renderBilling();

    const block = await screen.findByLabelText(/add-on packs/i);
    const imageRow = within(block).getByText('Image pack').closest('li');
    fireEvent.click(within(imageRow).getByRole('button', { name: /^buy$/i }));

    await waitFor(() => {
      expect(calls.some((call) => call.url === '/api/addons/checkout')).toBe(true);
    });
    await waitFor(() => {
      expect(window.location.href).toBe('https://pay.ziina.test/1');
    });
  });

  it('reports a refused checkout without pretending it worked', async () => {
    mockApi({
      checkoutStatus: 409,
      checkoutBody: { error: 'Video pack is not available yet, so it cannot be bought.', code: 'sku_unavailable' },
    });
    renderBilling();

    const block = await screen.findByLabelText(/add-on packs/i);
    const imageRow = within(block).getByText('Image pack').closest('li');
    fireEvent.click(within(imageRow).getByRole('button', { name: /^buy$/i }));

    expect(await screen.findByText(/not available yet, so it cannot be bought/i)).toBeTruthy();
    expect(window.location.href).toBe('');
  });

  it('offers the matching pack when a plan limit is spent', async () => {
    mockApi();
    renderBilling();

    const usage = await screen.findByLabelText(/usage this month/i);
    // Images are exhausted, so the Image pack is the button offered.
    expect(within(usage).getByRole('button', { name: /buy 50 images/i })).toBeTruthy();
    expect(within(usage).getByRole('button', { name: /compare plans/i })).toBeTruthy();
  });

  it('says payments are unavailable instead of showing a dead Buy button', async () => {
    mockApi({
      addons: {
        enabled: true,
        skus: SKUS,
        balances: {},
        purchases: [],
        settledNow: [],
        paymentsConfigured: false,
      },
    });
    renderBilling();

    const block = await screen.findByLabelText(/add-on packs/i);
    expect(within(block).getByText(/payments are not configured/i)).toBeTruthy();
    const imageRow = within(block).getByText('Image pack').closest('li');
    expect(within(imageRow).getByRole('button', { name: /^buy$/i }).disabled).toBe(true);
  });

  it('surfaces a failure to load the catalogue', async () => {
    const calls = mockApi({ addonsStatus: 500, addons: { error: 'nope' } });
    renderBilling();
    await waitFor(() => {
      expect(calls.some((call) => call.url === '/api/addons')).toBe(true);
    });
    expect(await screen.findByText(/could not load add-ons/i)).toBeTruthy();
  });
});

describe('payment success: add-on purchase', () => {
  it('verifies the purchase and reports the credits added', async () => {
    const calls = mockApi();
    render(
      <MemoryRouter initialEntries={['/payment/success?addon=image_pack&payment_id=pi_1']}>
        <AuthProvider>
          <PaymentSuccess />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(calls.some((call) => call.url === '/api/addons/verify')).toBe(true);
    });
    expect(await screen.findByText(/50 images added to your Image pack balance/i)).toBeTruthy();
  });
});
