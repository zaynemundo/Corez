// @vitest-environment jsdom
// Settings must show the account's published pages and let the owner take one
// offline — including the states that are easy to get wrong: still loading,
// nothing published, the server refusing, and a removal that fails.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import SettingsModal from '../src/components/SettingsModal.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';

const here = dirname(fileURLToPath(import.meta.url));

const PUBLISHED = [
  {
    slug: 'alice-shop',
    url: '/alice-shop',
    title: 'Alice shop',
    createdAt: '2026-09-19T09:00:00.000Z',
    badge: true,
    customized: true,
    pages: 1,
    bytes: 2048,
  },
  {
    slug: 'neon-snake-4821',
    url: '/neon-snake-4821',
    title: 'Neon snake',
    createdAt: '2026-09-18T09:00:00.000Z',
    badge: false,
    customized: false,
    pages: 0,
    bytes: 900,
  },
];

function mockApi({ pages = PUBLISHED, listStatus = 200, deleteStatus = 200, deleteBody = { success: true } } = {}) {
  const calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const target = String(url);
    const method = init?.method || 'GET';
    calls.push({ url: target, method });
    if (target.includes('/api/auth/me')) {
      return new Response(JSON.stringify({ error: 'no' }), { status: 401 });
    }
    if (target.includes('/api/subscriptions/me')) {
      return new Response(JSON.stringify({ plan: 'free' }), { status: 200 });
    }
    if (target === '/api/publish' && method === 'GET') {
      if (listStatus !== 200) {
        return new Response(JSON.stringify({ error: 'R2 storage (ASSET_BUCKET) is not configured.' }), { status: listStatus });
      }
      return new Response(JSON.stringify({ pages, truncated: false }), { status: 200 });
    }
    if (target.startsWith('/api/publish/') && method === 'DELETE') {
      return new Response(JSON.stringify(deleteBody), { status: deleteStatus });
    }
    return new Response(null, { status: 404 });
  });
  return calls;
}

function renderSettings() {
  return render(
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

describe('settings: published pages', () => {
  it('lists what the account has published, with a link to each page', async () => {
    mockApi();
    renderSettings();

    expect(await screen.findByRole('link', { name: /alice shop/i })).toBeTruthy();
    const link = screen.getByRole('link', { name: /alice shop/i });
    expect(link.getAttribute('href')).toBe('/alice-shop');
    expect(link.getAttribute('target')).toBe('_blank');

    expect(screen.getByText(/corez\.pro\/alice-shop/)).toBeTruthy();
    expect(screen.getByText(/2 pages/)).toBeTruthy();
    expect(screen.getByText(/neon snake/i)).toBeTruthy();
    expect(screen.getByText(/Made with Corez badge/)).toBeTruthy();
  });

  it('says plainly when nothing has been published', async () => {
    mockApi({ pages: [] });
    renderSettings();
    expect(await screen.findByText(/Nothing published yet/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  it('removes a page after confirmation and takes it out of the list', async () => {
    const calls = mockApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderSettings();

    const item = (await screen.findByText(/alice shop/i)).closest('li');
    fireEvent.click(within(item).getByRole('button', { name: /remove published page alice shop/i }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'DELETE' && call.url === '/api/publish/alice-shop')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText(/corez\.pro\/alice-shop/)).toBeNull();
    });
    // The other page is untouched.
    expect(screen.getByText(/neon snake/i)).toBeTruthy();
  });

  it('does nothing when the confirmation is dismissed', async () => {
    const calls = mockApi();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderSettings();

    const item = (await screen.findByText(/alice shop/i)).closest('li');
    fireEvent.click(within(item).getByRole('button', { name: /remove published page alice shop/i }));

    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    expect(screen.getByText(/corez\.pro\/alice-shop/)).toBeTruthy();
  });

  it('surfaces a failed removal instead of pretending it worked', async () => {
    mockApi({ deleteStatus: 403, deleteBody: { error: 'This published page belongs to another account.' } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderSettings();

    const item = (await screen.findByText(/alice shop/i)).closest('li');
    fireEvent.click(within(item).getByRole('button', { name: /remove published page alice shop/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/belongs to another account/i)).toBeTruthy();
    expect(screen.getByText(/corez\.pro\/alice-shop/)).toBeTruthy();
  });

  it('explains when published pages cannot be read at all', async () => {
    mockApi({ listStatus: 530 });
    renderSettings();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/not configured/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('styles every element it renders (class names match the stylesheet)', async () => {
    mockApi();
    const { container } = renderSettings();
    await screen.findByText(/alice shop/i);

    const css = readFileSync(resolve(here, '../src/index.css'), 'utf8');
    const used = new Set();
    for (const el of container.querySelectorAll('[class]')) {
      for (const name of String(el.className).split(/\s+/)) {
        if (name.startsWith('settings-published')) used.add(name);
      }
    }
    expect(used.size).toBeGreaterThan(3);
    for (const name of used) {
      expect(css, `${name} is used in the component but never styled`).toContain(`.${name}`);
    }
  });

  it('scrolls inside the dialog instead of growing past the viewport', async () => {
    mockApi();
    const { container } = renderSettings();
    await screen.findByText(/alice shop/i);

    const body = container.querySelector('.settings-modal-body');
    expect(body).toBeTruthy();
    // Everything except the header lives in the scrollable body.
    expect(body.querySelector('.modal-header')).toBeNull();
    expect(body.textContent).toMatch(/published pages/i);
    expect(body.textContent).toMatch(/clear conversation history/i);

    const css = readFileSync(resolve(here, '../src/index.css'), 'utf8');
    const cardRule = css.match(/\.settings-modal-card\s*\{([^}]*)\}/);
    const bodyRule = css.match(/\.settings-modal-body\s*\{([^}]*)\}/);
    expect(cardRule[1]).toMatch(/max-height:/);
    expect(cardRule[1]).toMatch(/overflow:\s*hidden/);
    expect(bodyRule[1]).toMatch(/overflow-y:\s*auto/);
    expect(bodyRule[1]).toMatch(/min-height:\s*0/);
  });
});
