// @vitest-environment jsdom
// Settings is grouped into categories. These assertions cover the parts that
// are easy to get wrong: only one category visible at a time, the tab/panel
// wiring assistive tech relies on, arrow-key navigation, and every section
// living in the category a user would look in.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import SettingsModal from '../src/components/SettingsModal.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';

const here = dirname(fileURLToPath(import.meta.url));

const CATEGORIES = [
  { id: 'general', label: 'General', contains: ['Account', 'Appearance'] },
  { id: 'billing', label: 'Billing', contains: ['Plan & Billing'] },
  { id: 'publishing', label: 'Publishing', contains: ['Published pages'] },
  {
    id: 'privacy',
    label: 'Privacy',
    contains: ['Privacy & Cookies', 'Clear Conversation History', 'Log out'],
  },
];

function mockApi() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const target = String(url);
    if (target.includes('/api/auth/me')) {
      // Signed in: a settings dialog is normally opened by a signed-in account,
      // and Log out only exists in that state.
      return new Response(
        JSON.stringify({ user: { id: 'u1', email: 'demo@corez.pro', plan: 'free' } }),
        { status: 200 },
      );
    }
    if (target.includes('/api/subscriptions/me')) {
      return new Response(JSON.stringify({ plan: 'free' }), { status: 200 });
    }
    if (target === '/api/publish') {
      return new Response(JSON.stringify({ pages: [], truncated: false }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
}

function renderSettings(onClose = () => {}) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <SettingsModal
          isOpen
          onClose={onClose}
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
  mockApi();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('settings categories', () => {
  it('offers one tab per category and starts on the first', () => {
    renderSettings();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(CATEGORIES.map((c) => c.label));
    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected')).toBe('true');
    for (const other of CATEGORIES.slice(1)) {
      expect(screen.getByRole('tab', { name: other.label }).getAttribute('aria-selected')).toBe('false');
    }
  });

  it('shows exactly one panel at a time', () => {
    renderSettings();
    const visible = () => screen.getAllByRole('tabpanel');
    expect(visible()).toHaveLength(1);
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('settings-panel-general');

    fireEvent.click(screen.getByRole('tab', { name: 'Billing' }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('settings-panel-billing');
    expect(screen.getByRole('tabpanel').textContent).toMatch(/Plan & Billing/);
  });

  it('wires each tab to its panel for assistive tech', () => {
    renderSettings();
    for (const category of CATEGORIES) {
      const tab = screen.getByRole('tab', { name: category.label });
      expect(tab.getAttribute('aria-controls')).toBe(`settings-panel-${category.id}`);
      expect(tab.id).toBe(`settings-tab-${category.id}`);
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Privacy' }));
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe('settings-tab-privacy');
  });

  it.each(CATEGORIES)('keeps $label content in the $label category', async ({ label, contains }) => {
    renderSettings();
    // The signed-in account arrives with the /api/auth/me response, which is
    // what renders the Log out action in the Privacy category.
    await screen.findByText(/demo@corez\.pro/);
    fireEvent.click(screen.getByRole('tab', { name: label }));
    const panel = screen.getByRole('tabpanel');
    for (const needle of contains) {
      expect(within(panel).getAllByText(needle, { exact: false }).length).toBeGreaterThan(0);
    }
  });

  it('moves between categories with the arrow keys, Home and End', () => {
    renderSettings();
    const general = screen.getByRole('tab', { name: 'General' });
    expect(document.activeElement).toBe(general);

    fireEvent.keyDown(general, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Billing' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Billing' }));

    fireEvent.keyDown(document.activeElement, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Privacy' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Privacy' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(document.activeElement, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected')).toBe('true');
  });

  it('uses a roving tab stop: only the selected tab is in the tab order', () => {
    renderSettings();
    for (const category of CATEGORIES) {
      const tab = screen.getByRole('tab', { name: category.label });
      expect(tab.getAttribute('tabindex')).toBe(category.id === 'general' ? '0' : '-1');
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Publishing' }));
    expect(screen.getByRole('tab', { name: 'Publishing' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('tabindex')).toBe('-1');
  });

  it('is announced as a modal dialog with a title', () => {
    renderSettings();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('settings-modal-title');
    expect(document.getElementById('settings-modal-title').textContent).toBe('Settings');
  });

  it('is one fixed size for every category, with the panel scrolling instead', () => {
    const css = readFileSync(resolve(here, '../src/index.css'), 'utf8');
    const cardRule = css.match(/\.settings-modal-card\s*\{([^}]*)\}/);
    // A declared height rather than a max-height: the card must not resize when
    // a shorter or longer category is selected.
    expect(cardRule[1]).toMatch(/(^|[^-])height:/);
    expect(cardRule[1]).toMatch(/min\(calc\(100dvh - 48px\), 780px\)/);
    expect(cardRule[1]).toMatch(/overflow:\s*hidden/);

    // The phone-sized override keeps the same promise.
    const phoneRule = css.match(/@media \(max-width: 560px\)[\s\S]*?\.settings-modal-card\s*\{([^}]*)\}/);
    expect(phoneRule[1]).toMatch(/(^|[^-])height:/);
    expect(phoneRule[1]).toMatch(/overflow:\s*hidden/);

    const bodyRule = css.match(/\.settings-modal-body\s*\{([^}]*)\}/);
    expect(bodyRule[1]).toMatch(/overflow-y:\s*auto/);
  });

  it('closes on Escape and reopens on the first category', () => {
    const onClose = vi.fn();
    const { rerender } = renderSettings(onClose);
    fireEvent.click(screen.getByRole('tab', { name: 'Billing' }));
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('settings-panel-billing');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <AuthProvider>
          <SettingsModal
            isOpen={false}
            onClose={onClose}
            onClearAllHistory={() => {}}
            theme="dark"
            onToggleTheme={() => {}}
          />
        </AuthProvider>
      </MemoryRouter>,
    );
    rerender(
      <MemoryRouter>
        <AuthProvider>
          <SettingsModal
            isOpen
            onClose={onClose}
            onClearAllHistory={() => {}}
            theme="dark"
            onToggleTheme={() => {}}
          />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('settings-panel-general');
  });
});
