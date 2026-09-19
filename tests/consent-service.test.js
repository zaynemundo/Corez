// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  clearConsent,
  defaultConsentCategories,
  hasConsent,
  hasConsentDecision,
  isConsentStale,
  openConsentPreferences,
  onOpenConsentPreferences,
  readConsent,
  recordPolicyAcceptance,
  saveConsent,
  subscribeConsent,
  browserBlocksAnalytics,
} from '../src/services/consentService.js';

function clearStorage() {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
}

beforeEach(() => {
  clearStorage();
  delete navigator.globalPrivacyControl;
});

afterEach(() => {
  vi.restoreAllMocks();
  clearStorage();
});

describe('consent service', () => {
  it('defaults to nothing optional and no recorded decision', () => {
    expect(hasConsentDecision()).toBe(false);
    expect(readConsent()).toBeNull();
    expect(hasConsent('essential')).toBe(true);
    expect(hasConsent('analytics')).toBe(false);
    expect(hasConsent('embeds')).toBe(false);
    expect(hasConsent('marketing')).toBe(false);
    expect(defaultConsentCategories()).toEqual({
      essential: true,
      analytics: false,
      embeds: false,
      marketing: false,
    });
  });

  it('never lets a required category be switched off or an unknown one be stored', () => {
    const record = saveConsent(
      { essential: false, analytics: true, unknownCategory: true },
      { source: 'test' },
    );
    expect(record.categories.essential).toBe(true);
    expect(record.categories.analytics).toBe(true);
    expect(record.categories.unknownCategory).toBeUndefined();
    expect(hasConsent('unknownCategory')).toBe(false);
  });

  it('persists a decision with a version and keeps a receipt trail', () => {
    saveConsent({ analytics: true, embeds: true }, { source: 'banner', now: 1000 });
    saveConsent({ analytics: false, embeds: true }, { source: 'preferences', now: 2000 });

    const stored = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY));
    expect(stored.version).toBe(CONSENT_VERSION);
    expect(stored.decidedAt).toBe(1000);
    expect(stored.updatedAt).toBe(2000);
    expect(stored.receipts).toHaveLength(2);
    expect(stored.receipts[0].categories.analytics).toBe(true);
    expect(stored.receipts[1].source).toBe('preferences');

    const record = readConsent();
    expect(record.categories.analytics).toBe(false);
    expect(record.categories.embeds).toBe(true);
    expect(record.categories.essential).toBe(true);
  });

  it('treats a stored record from an older version as no decision', () => {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({
        version: CONSENT_VERSION + 1,
        decidedAt: Date.now(),
        categories: { essential: true, analytics: true },
      }),
    );
    expect(readConsent()).toBeNull();
    expect(hasConsent('analytics')).toBe(false);
  });

  it('ignores corrupt storage instead of throwing', () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, 'not json at all');
    expect(readConsent()).toBeNull();
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: 'x' }));
    expect(readConsent()).toBeNull();
  });

  it('withdrawing consent removes the record and re-requires a decision', () => {
    saveConsent({ analytics: true }, { source: 'banner' });
    expect(hasConsent('analytics')).toBe(true);
    clearConsent();
    expect(readConsent()).toBeNull();
    expect(hasConsentDecision()).toBe(false);
    expect(hasConsent('analytics')).toBe(false);
  });

  it('records policy acceptance at signup, with marketing optional and off by default', () => {
    const record = recordPolicyAcceptance({ marketing: false, source: 'signup', now: 500 });
    expect(record.categories.marketing).toBe(false);
    expect(record.categories.essential).toBe(true);

    recordPolicyAcceptance({ marketing: true, source: 'signup', now: 600 });
    expect(hasConsent('marketing')).toBe(true);
  });

  it('notifies subscribers on every change, including withdrawal', () => {
    const seen = [];
    const unsubscribe = subscribeConsent((record) => seen.push(record));
    saveConsent({ analytics: true }, { source: 'banner' });
    clearConsent();
    unsubscribe();
    saveConsent({ analytics: true }, { source: 'banner' });
    expect(seen).toHaveLength(2);
    expect(seen[0].categories.analytics).toBe(true);
    expect(seen[1]).toBeNull();
  });

  it('treats a decision older than a year as stale', () => {
    const now = Date.now();
    saveConsent({ analytics: true }, { source: 'banner', now: now - 400 * 24 * 60 * 60 * 1000 });
    expect(isConsentStale(now)).toBe(true);
    saveConsent({ analytics: true }, { source: 'banner', now });
    expect(isConsentStale(now)).toBe(false);
  });

  it('honours Do Not Track and Global Privacy Control as an analytics opt-out', () => {
    expect(browserBlocksAnalytics()).toBe(false);
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      value: true,
      configurable: true,
    });
    expect(browserBlocksAnalytics()).toBe(true);
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      value: false,
      configurable: true,
    });
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    expect(browserBlocksAnalytics()).toBe(true);
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
    expect(browserBlocksAnalytics()).toBe(false);
  });

  it('can open the preferences dialog from anywhere in the UI', () => {
    const listener = vi.fn();
    const unsubscribe = onOpenConsentPreferences(listener);
    openConsentPreferences();
    unsubscribe();
    openConsentPreferences();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
