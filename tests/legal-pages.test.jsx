// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Legal from '../src/pages/Legal.jsx';
import SettingsModal from '../src/components/SettingsModal.jsx';
import {
  LEGAL_CONTACTS,
  LEGAL_DOCUMENTS,
  LEGAL_ORDER,
  LEGAL_UPDATED,
} from '../src/data/legalDocuments.js';

afterEach(cleanup);

function renderWithRouter(element) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

const KNOWN_ROUTES = new Set([
  '/',
  '/pricing',
  '/login',
  '/privacy',
  '/terms',
  '/cookies',
  '/refunds',
  '/privacy-policy',
  '/terms-and-conditions',
  '/cookie-policy',
  '/refund-policy',
]);

function collectLinks(container) {
  return [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
}

describe('legal documents', () => {
  it('ships the four required policies, each substantial enough to be real', () => {
    expect(LEGAL_ORDER).toEqual(['privacy', 'terms', 'cookies', 'refunds']);
    for (const id of LEGAL_ORDER) {
      const doc = LEGAL_DOCUMENTS[id];
      expect(doc.id).toBe(id);
      expect(doc.title).toMatch(/Policy|Terms/);
      expect(doc.sections.length).toBeGreaterThanOrEqual(8);
      expect(doc.summary.length).toBeGreaterThan(40);
    }
  });

  it.each(LEGAL_ORDER)('renders %s with headings, a table of contents and a contact block', (id) => {
    const doc = LEGAL_DOCUMENTS[id];
    renderWithRouter(<Legal docId={id} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(doc.title);
    expect(screen.getAllByText(new RegExp(LEGAL_UPDATED)).length).toBeGreaterThan(0);
    expect(screen.getByRole('navigation', { name: /on this page/i })).toBeTruthy();

    for (const section of doc.sections) {
      expect(screen.getByRole('heading', { level: 2, name: section.heading })).toBeTruthy();
    }

    for (const email of Object.values(LEGAL_CONTACTS)) {
      expect(screen.getAllByText(email).length).toBeGreaterThan(0);
    }
  });

  it.each(LEGAL_ORDER)('%s links only to routes that exist', (id) => {
    const { container } = renderWithRouter(<Legal docId={id} />);
    for (const href of collectLinks(container)) {
      if (!href) continue;
      if (href.startsWith('mailto:') || href.startsWith('#')) continue;
      if (href.startsWith('https://')) continue;
      expect(KNOWN_ROUTES.has(href), `${id} links to unknown route ${href}`).toBe(true);
    }
  });

  it('cross-links every other policy from each document', () => {
    for (const id of LEGAL_ORDER) {
      cleanup();
      renderWithRouter(<Legal docId={id} />);
      for (const other of LEGAL_ORDER) {
        if (other === id) continue;
        expect(
          screen.getAllByRole('link', { name: new RegExp(LEGAL_DOCUMENTS[other].title, 'i') })
            .length,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('renders tables where the documents use them', () => {
    renderWithRouter(<Legal docId="cookies" />);
    // The cookie inventory must name the storage the app actually writes.
    expect(screen.getByText('corez_session')).toBeTruthy();
    expect(screen.getByText(/corez_consent_v1/)).toBeTruthy();
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
  });

  it('names the processors the product actually calls', () => {
    renderWithRouter(<Legal docId="privacy" />);
    for (const processor of ['Cloudflare', 'OpenCode Zen', 'Ziina', 'Resend']) {
      expect(screen.getAllByText(new RegExp(processor, 'i')).length).toBeGreaterThan(0);
    }
  });

  it('states the no-refund stance together with statutory rights', () => {
    renderWithRouter(<Legal docId="refunds" />);
    expect(screen.getByText(/we do not refund part-used billing periods/i)).toBeTruthy();
    expect(screen.getByText(/14 days from the start of a new paid subscription/i)).toBeTruthy();
  });

  it('offers a Cookie settings control and a print action', () => {
    renderWithRouter(<Legal docId="privacy" />);
    expect(screen.getByRole('button', { name: /cookie settings/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /print or save as pdf/i })).toBeTruthy();
  });

  it('handles an unknown document', () => {
    renderWithRouter(<Legal docId="does-not-exist" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/not found/i);
  });

  it('navigates between policies inside the app instead of reloading', () => {
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <Routes>
          <Route path="/privacy" element={<Legal docId="privacy" />} />
          <Route path="/cookies" element={<Legal docId="cookies" />} />
          <Route path="/" element={<div>home</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Privacy Policy');

    const nav = screen.getByRole('navigation', { name: /legal documents/i });
    fireEvent.click(within(nav).getByRole('link', { name: /^Cookie Policy$/ }));

    // Still the same document: a router transition, not a fresh page load.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cookie Policy');
    expect(screen.queryByText('home')).toBeNull();
  });

  it('gives each document its own document title', () => {
    const previous = document.title;
    renderWithRouter(<Legal docId="cookies" />);
    expect(document.title).toMatch(/Cookie Policy/);
    cleanup();
    document.title = previous;
  });

  it('marks the section the reader is in as current', () => {
    renderWithRouter(<Legal docId="cookies" />);
    const toc = screen.getByRole('navigation', { name: /on this page/i });
    const current = toc.querySelector('[aria-current="true"]');
    expect(current).toBeTruthy();
    expect(current.getAttribute('href')).toBe('#what-they-are');
  });
});

// With no public policies index, Settings is the in-app path to the documents:
// the Privacy category must list all four and route to them.
describe('policies from Settings', () => {
  const noop = () => {};

  function renderSettings() {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/subscriptions/me')) {
        return new Response(JSON.stringify({ plan: 'free' }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <SettingsModal
                isOpen
                onClose={noop}
                onClearAllHistory={noop}
                theme="dark"
                onToggleTheme={noop}
              />
            }
          />
          <Route path="/terms" element={<div>terms-route</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  function privacyPanel() {
    fireEvent.click(screen.getByRole('tab', { name: /privacy/i }));
    return within(screen.getByRole('tabpanel', { name: /privacy/i }));
  }

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists every policy and the cookie settings control in the Privacy category', () => {
    renderSettings();
    const panel = privacyPanel();
    for (const name of ['Privacy Policy', 'Terms', 'Cookies', 'Refunds']) {
      expect(panel.getByRole('button', { name }), `${name} missing from Settings`).toBeTruthy();
    }
    // The row shows "Cookie settings" visually; its accessible name is the
    // more explicit "Open cookie preferences".
    expect(panel.getByRole('button', { name: /open cookie preferences/i })).toBeTruthy();
  });

  it('closes the dialog and routes to the chosen document', () => {
    renderSettings();
    const panel = privacyPanel();
    fireEvent.click(panel.getByRole('button', { name: 'Terms' }));
    expect(screen.getByText('terms-route')).toBeTruthy();
  });
});
