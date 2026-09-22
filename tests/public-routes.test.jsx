// @vitest-environment jsdom
// The public surface is the policies index: the marketing landing page was
// removed on purpose, so the site root must land a signed-out visitor on
// /legal, and the four policies, cookie settings, pricing and sign-in must all
// stay one click away. The route table lives in src/App.jsx, so it is only
// exercised end-to-end from here.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  window.history.pushState({}, '', '/');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('/api/auth/me')) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }
    return new Response(null, { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Hrefs of every link whose accessible name matches, banner links included. */
function linkHrefs(name) {
  return screen.queryAllByRole('link', { name }).map((link) => link.getAttribute('href'));
}

async function renderSignedOut() {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/policies and terms/i);
  });
}

describe('public surface for a signed-out visitor', () => {
  it('sends the site root to the policies index instead of a landing page', async () => {
    await renderSignedOut();
    expect(window.location.pathname).toBe('/legal');
  });

  it('keeps sign-in and pricing reachable from the policies index', async () => {
    await renderSignedOut();
    expect(linkHrefs(/^sign in$/i)).toContain('/login');
    expect(linkHrefs(/^pricing$/i)).toContain('/pricing');
  });

  it('lists every policy from the index', async () => {
    await renderSignedOut();
    for (const [name, href] of [
      [/privacy policy/i, '/privacy'],
      [/terms and conditions/i, '/terms'],
      [/cookie policy/i, '/cookies'],
      [/refund policy/i, '/refunds'],
    ]) {
      expect(linkHrefs(name), `${href} not linked from the index`).toContain(href);
    }
  });

  it('offers the cookie settings control without signing in', async () => {
    await renderSignedOut();
    expect(screen.getAllByRole('button', { name: /cookie settings/i }).length).toBeGreaterThan(0);
  });
});
