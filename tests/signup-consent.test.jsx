// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../src/pages/Login.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CONSENT_STORAGE_KEY, readConsent } from '../src/services/consentService.js';

function renderSignup() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('tab', { name: /^Sign Up$/i }));
}

function mockAuthFetch() {
  const calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).includes('/api/auth/me')) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }
    if (String(url).includes('/api/auth/signup')) {
      return new Response(
        JSON.stringify({ ok: true, user: { id: 'u1', email: 'new@corez.pro', plan: 'free' } }),
        { status: 200 },
      );
    }
    return new Response(null, { status: 404 });
  });
  return calls;
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

describe('signup form consent', () => {
  it('shows an unticked, required policy checkbox and nothing else to tick', () => {
    renderSignup();

    const required = screen.getByTestId('signup-accept-terms');
    expect(required.checked).toBe(false);
    expect(required.getAttribute('aria-required')).toBe('true');
    // The marketing opt-in was removed from signup: that question is answered in
    // the consent dialog, so the form must not ask it a second time.
    expect(screen.queryByTestId('signup-marketing-optin')).toBeNull();

    // Scope to the consent field itself: the page also carries a summary line
    // with the same links.
    const field = required.closest('.consent-field');
    const links = [...field.querySelectorAll('a')].map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['Terms and Conditions', '/terms'],
      ['Privacy Policy', '/privacy'],
    ]);
    expect(links[0][1]).toBe('/terms');
    expect(links[1][1]).toBe('/privacy');
  });

  it('refuses to create an account until the policies are accepted', async () => {
    const calls = mockAuthFetch();
    renderSignup();

    fireEvent.change(screen.getByPlaceholderText('you@corez.pro'), {
      target: { value: 'new@corez.pro' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'LongEnoughPassword1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create Account$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/accept the Terms and Conditions and the Privacy Policy/i);
    expect(calls.some((call) => call.url.includes('/api/auth/signup'))).toBe(false);
  });

  it('sends the accepted policy version with the signup, and no marketing opt-in', async () => {
    const calls = mockAuthFetch();
    renderSignup();

    fireEvent.change(screen.getByPlaceholderText('you@corez.pro'), {
      target: { value: 'new@corez.pro' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'LongEnoughPassword1' },
    });
    fireEvent.click(screen.getByTestId('signup-accept-terms'));
    fireEvent.click(screen.getByRole('button', { name: /^Create Account$/i }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/api/auth/signup'))).toBe(true);
    });

    const signupCall = calls.find((call) => call.url.includes('/api/auth/signup'));
    expect(signupCall.body.terms_version).toBe('1.0');
    expect(typeof signupCall.body.terms_accepted_at).toBe('number');
    // Signup no longer asks about product email, so it records "not opted in"
    // rather than claiming a consent the visitor was never offered.
    expect(signupCall.body.marketing_consent).toBe(false);
  });

  it('keeps a local receipt of the acceptance without touching other categories', async () => {
    mockAuthFetch();
    renderSignup();

    fireEvent.change(screen.getByPlaceholderText('you@corez.pro'), {
      target: { value: 'new@corez.pro' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'LongEnoughPassword1' },
    });
    fireEvent.click(screen.getByTestId('signup-accept-terms'));
    fireEvent.click(screen.getByRole('button', { name: /^Create Account$/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeTruthy();
    });

    const record = readConsent();
    expect(record.source).toBe('signup');
    expect(record.categories.essential).toBe(true);
    expect(record.categories.marketing).toBe(false);
    // Accepting the Terms is not permission for analytics or embeds.
    expect(record.categories.analytics).toBe(false);
    expect(record.categories.embeds).toBe(false);
  });

  it('does not ask for policy acceptance when signing in', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('signup-accept-terms')).toBeNull();
  });
});
