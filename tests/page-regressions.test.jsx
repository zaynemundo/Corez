// @vitest-environment jsdom
// Page-level regressions found by rendering the deployed pages: a signed-out
// visitor could not start the free plan, the pricing "Sign in" button went to
// the wrong place, and the sign-in screen had no heading and no way to read a
// policy outside signup mode.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Pricing from '../src/pages/Pricing.jsx';
import Login from '../src/pages/Login.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('/api/auth/me')) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }
    if (String(url).includes('/api/subscriptions/me')) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }
    return new Response(null, { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={['/pricing']}>
      <AuthProvider>
        <Routes>
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/login" element={<div>sign-in-screen</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('pricing page for a signed-out visitor', () => {
  it('offers the free plan instead of showing it as their current plan', async () => {
    renderPricing();
    const freeCta = await screen.findByRole('button', { name: /start for free/i });
    expect(freeCta.disabled).toBe(false);
    expect(screen.queryByText(/current plan/i)).toBeNull();
  });

  it('sends a visitor choosing the free plan to sign in', async () => {
    renderPricing();
    fireEvent.click(await screen.findByRole('button', { name: /start for free/i }));
    await waitFor(() => expect(screen.getByText('sign-in-screen')).toBeTruthy());
  });

  it('signs a visitor in from the pricing nav', async () => {
    renderPricing();
    fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByText('sign-in-screen')).toBeTruthy());
  });

  it('keeps every policy one router click away in the footer', async () => {
    renderPricing();
    for (const [name, href] of [
      [/privacy policy/i, '/privacy'],
      [/terms/i, '/terms'],
      [/cookie policy/i, '/cookies'],
      [/refund policy/i, '/refunds'],
    ]) {
      const link = await screen.findByRole('link', { name });
      expect(link.getAttribute('href')).toBe(href);
    }
  });
});

describe('sign-in page', () => {
  function renderLogin() {
    return render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it('has exactly one level-one heading', () => {
    renderLogin();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe('COREZ');
  });

  it('keeps the policies and cookie settings reachable while signing in', () => {
    renderLogin();
    for (const [name, href] of [
      [/privacy policy/i, '/privacy'],
      [/^terms$/i, '/terms'],
      [/^cookies$/i, '/cookies'],
      [/^refunds$/i, '/refunds'],
    ]) {
      expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(href);
    }
    expect(screen.getByRole('button', { name: /cookie settings/i })).toBeTruthy();
  });
});
