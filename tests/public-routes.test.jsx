// @vitest-environment jsdom
// The public surface is sign-in: the marketing landing page and the policies
// index were both removed on purpose, so the site root must land a signed-out
// visitor on /login. The four policies stay reachable at their own URLs (from
// the sign-in footer and the cookie banner) because a policy nobody can read is
// not a policy, and pricing stays reachable as well. The route table lives in
// src/App.jsx, so it is only exercised end-to-end from here.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';

function signedOutFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('/api/auth/me')) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }
    if (String(url).includes('/api/subscriptions/me')) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }
    return new Response(null, { status: 404 });
  });
}

function openAt(path) {
  window.history.pushState({}, '', path);
  signedOutFetch();
  return render(<App />);
}

async function waitForSignIn() {
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('COREZ');
  });
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

/** Hrefs of every link whose accessible name matches, banner links included. */
function linkHrefs(name) {
  return screen.queryAllByRole('link', { name }).map((link) => link.getAttribute('href'));
}

describe('public surface for a signed-out visitor', () => {
  it('shows a loading state while the session check is in flight', async () => {
    // A blank frame during the session check read as a broken site on the
    // front door, so the wait must say something.
    let releaseSessionCheck;
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (String(url).includes('/api/auth/me')) {
        return new Promise((resolve) => {
          releaseSessionCheck = () =>
            resolve(new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 }));
        });
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText(/loading corez/i)).toBeTruthy();

    releaseSessionCheck();
    await waitForSignIn();
  });

  it('sends the site root to sign-in instead of a landing or policies page', async () => {
    openAt('/');
    await waitForSignIn();
    expect(window.location.pathname).toBe('/login');
  });

  it('sends an unknown path (including the removed /legal) to sign-in', async () => {
    openAt('/legal');
    await waitForSignIn();
    expect(window.location.pathname).toBe('/login');
  });

  it('keeps every policy and the cookie settings control reachable from sign-in', async () => {
    openAt('/');
    await waitForSignIn();
    for (const [name, href] of [
      [/privacy policy/i, '/privacy'],
      [/^terms$/i, '/terms'],
      [/^cookies$/i, '/cookies'],
      [/^refunds$/i, '/refunds'],
    ]) {
      expect(linkHrefs(name), `${href} not linked from sign-in`).toContain(href);
    }
    expect(screen.getAllByRole('button', { name: /cookie settings/i }).length).toBeGreaterThan(0);
  });

  it('keeps pricing reachable for a signed-out visitor', async () => {
    openAt('/pricing');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/plans that grow with you/i);
    });
  });
});
