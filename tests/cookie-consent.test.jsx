// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CookieConsent from '../src/components/CookieConsent.jsx';
import {
  CONSENT_STORAGE_KEY,
  hasConsent,
  openConsentPreferences,
  readConsent,
  saveConsent,
} from '../src/services/consentService.js';

function resetAll() {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  document.body.classList.remove('corez-consent-visible');
}

// The banner's policy links are router links, so it must render inside a router.
function renderBanner() {
  return render(
    <MemoryRouter>
      <CookieConsent />
    </MemoryRouter>,
  );
}

beforeEach(resetAll);
afterEach(() => {
  resetAll();
  vi.restoreAllMocks();
});

describe('cookie consent banner', () => {
  it('asks before anything optional is allowed', () => {
    renderBanner();

    expect(screen.getByRole('region', { name: /cookie consent/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /accept all/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reject non-essential/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /preferences/i })).toBeTruthy();

    const policyLink = screen.getByRole('link', { name: /cookie policy/i });
    expect(policyLink.getAttribute('href')).toBe('/cookies');
    expect(screen.getByRole('link', { name: /privacy policy/i }).getAttribute('href')).toBe(
      '/privacy',
    );
  });

  it('records an accept-all decision and stops asking', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /accept all/i }));

    expect(hasConsent('analytics')).toBe(true);
    expect(hasConsent('embeds')).toBe(true);
    expect(hasConsent('marketing')).toBe(true);
    expect(readConsent().source).toBe('accept_all');
    expect(screen.queryByRole('region', { name: /cookie consent/i })).toBeNull();
  });

  it('rejecting non-essential keeps every optional category off', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /reject non-essential/i }));

    const record = readConsent();
    expect(record.source).toBe('reject_non_essential');
    expect(record.categories).toEqual({
      essential: true,
      analytics: false,
      embeds: false,
      marketing: false,
    });
    expect(screen.queryByRole('region', { name: /cookie consent/i })).toBeNull();
  });

  it('lets a category be enabled individually and saved', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /preferences/i }));

    const dialog = screen.getByRole('dialog', { name: /cookie preferences/i });
    expect(dialog).toBeTruthy();
    // Every category is described, and the required one cannot be toggled.
    expect(within(dialog).getByText('Strictly necessary')).toBeTruthy();
    expect(within(dialog).queryByRole('checkbox', { name: /strictly necessary/i })).toBeNull();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /analytics/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /save choices/i }));

    expect(hasConsent('analytics')).toBe(true);
    expect(hasConsent('embeds')).toBe(false);
    expect(readConsent().source).toBe('preferences');
  });

  it('reopens from a Cookie settings link anywhere in the app', () => {
    saveConsent({ analytics: false }, { source: 'banner' });
    renderBanner();
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => {
      openConsentPreferences();
    });

    expect(screen.getByRole('dialog', { name: /cookie preferences/i })).toBeTruthy();
  });

  it('withdrawing consent clears the record and brings the banner back', () => {
    saveConsent({ analytics: true, embeds: true, marketing: true }, { source: 'banner' });
    renderBanner();
    act(() => {
      openConsentPreferences();
    });

    fireEvent.click(screen.getByRole('button', { name: /withdraw consent/i }));
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.getByRole('region', { name: /cookie consent/i })).toBeTruthy();
    expect(hasConsent('analytics')).toBe(false);
  });

  it('warns when the browser itself is blocking analytics', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      value: true,
      configurable: true,
    });
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /preferences/i }));
    expect(screen.getByText(/global privacy control or do not track/i)).toBeTruthy();
    delete navigator.globalPrivacyControl;
  });

  it('closes the dialog with Escape and returns focus', () => {
    renderBanner();
    const preferencesButton = screen.getByRole('button', { name: /preferences/i });
    preferencesButton.focus();
    fireEvent.click(preferencesButton);
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(preferencesButton);
  });

  it('reserves page space while it is on screen so it never covers a footer', () => {
    renderBanner();
    expect(document.body.classList.contains('corez-consent-visible')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /accept all/i }));
    expect(document.body.classList.contains('corez-consent-visible')).toBe(false);
  });

  it('links to the policies through the router, not a full page load', () => {
    renderBanner();
    for (const [name, href] of [
      [/cookie policy/i, '/cookies'],
      [/privacy policy/i, '/privacy'],
    ]) {
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('href')).toBe(href);
      // A router Link never carries target=_blank on an in-app policy.
      expect(link.getAttribute('target')).toBeNull();
    }
  });
});
