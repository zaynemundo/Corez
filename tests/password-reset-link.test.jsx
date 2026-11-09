// @vitest-environment jsdom
// Password-reset links must survive the public-route redirect. Older emails
// point at "/?token=..." (the sign-in redirect used to drop the query), and a
// visitor who is already signed in must still be able to complete a reset.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import App from '../src/App.jsx';

function mockFetch({ user = null, onReset = null } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const target = String(url);
    if (target.includes('/api/auth/me')) {
      return user
        ? new Response(JSON.stringify({ user }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        : new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }
    if (target.includes('/api/auth/reset')) {
      onReset?.(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, message: 'Password has been reset.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (target.includes('/api/subscriptions/me')) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }
    return new Response(null, { status: 404 });
  });
}

function openAt(path) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

async function fillAndSubmitReset(password = 'NewPassword123!') {
  await waitFor(() => {
    expect(screen.getByText('Set a new password')).toBeTruthy();
  });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
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

describe('password reset links', () => {
  it('keeps the token from an older "/?token=" link through the sign-in redirect', async () => {
    let submitted = null;
    mockFetch({ onReset: (body) => { submitted = body; } });

    openAt('/?token=legacy_reset_token');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
    expect(window.location.search).toBe('?token=legacy_reset_token');

    await fillAndSubmitReset();
    await waitFor(() => {
      expect(submitted?.token).toBe('legacy_reset_token');
    });
  });

  it('opens the reset form for a signed-in visitor following the email link', async () => {
    let submitted = null;
    mockFetch({
      user: { id: 'u_reset', email: 'reset@corez.pro', plan: 'free' },
      onReset: (body) => { submitted = body; },
    });

    openAt('/login?token=signed_in_reset_token');

    await fillAndSubmitReset();
    await waitFor(() => {
      expect(submitted?.token).toBe('signed_in_reset_token');
    });
  });
});
