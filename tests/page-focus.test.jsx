// @vitest-environment jsdom
// Each full-page route scrolls inside its own container, so on arrival focus
// must sit inside that container: that is what makes PageDown, arrows and space
// scroll the page instead of a non-scrollable document. Focus also puts screen
// readers at the top of the new document on a client-side navigation.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../src/pages/Landing.jsx';
import Pricing from '../src/pages/Pricing.jsx';
import Login from '../src/pages/Login.jsx';
import Legal from '../src/pages/Legal.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderRoute(element) {
  return render(
    <MemoryRouter>
      <AuthProvider>{element}</AuthProvider>
    </MemoryRouter>,
  );
}

const ROUTES = [
  ['landing', '.landing', <Landing />],
  ['pricing', '.pricing-page', <Pricing />],
  ['privacy', '.legal-page', <Legal docId="privacy" />],
  ['cookies', '.legal-page', <Legal docId="cookies" />],
];

describe('full-page routes take focus inside their scroll container', () => {
  it.each(ROUTES)('%s focuses its page container on arrival', (_name, selector, element) => {
    const { container } = renderRoute(element);
    const page = container.querySelector(selector);
    expect(page).toBeTruthy();
    expect(page.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(page);
  });

  it('leaves the page container as the focused element, which is the target browsers scroll on PageDown', () => {
    const { container } = renderRoute(<Legal docId="terms" />);
    const page = container.querySelector('.legal-page');
    // Focus must be inside the scroll container. jsdom does not load
    // src/index.css, so the overflow declaration itself is asserted by
    // tests/page-scroll-contract.test.js.
    expect(document.activeElement).toBe(page);
    expect(page.contains(document.activeElement)).toBe(true);
  });

  it('does not steal focus from the sign-in form, which already focuses its first field', () => {
    renderRoute(<Login />);
    // The email input carries autoFocus; the auth page must not override it or
    // typing would not land in the field.
    expect(document.activeElement.tagName).toBe('INPUT');
  });
});
