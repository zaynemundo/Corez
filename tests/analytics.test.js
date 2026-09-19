// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ALLOWED_EVENT_NAMES,
  __resetAnalyticsForTests,
  flush,
  getQueuedEvents,
  sanitizeEvent,
  sanitizePath,
  setAnalyticsTransport,
  shouldTrack,
  startAnalytics,
  track,
  trackPageView,
  resetPageViewMemory,
} from '../src/services/analytics.js';
import {
  CONSENT_STORAGE_KEY,
  saveConsent,
} from '../src/services/consentService.js';

function resetAll() {
  __resetAnalyticsForTests();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  delete navigator.globalPrivacyControl;
  delete navigator.doNotTrack;
}

beforeEach(resetAll);
afterEach(() => {
  resetAll();
  vi.restoreAllMocks();
});

describe('analytics tracker', () => {
  it('collects nothing at all before consent is given', async () => {
    const transport = vi.fn();
    setAnalyticsTransport(transport);

    expect(shouldTrack()).toBe(false);
    expect(track('page_view', { path: '/pricing' })).toBe(false);
    expect(trackPageView('/pricing')).toBe(false);
    expect(getQueuedEvents()).toHaveLength(0);

    await flush();
    expect(transport).not.toHaveBeenCalled();
  });

  it('queues and flushes allowlisted events once analytics is allowed', async () => {
    saveConsent({ analytics: true }, { source: 'banner' });
    const transport = vi.fn().mockResolvedValue({ ok: true });
    setAnalyticsTransport(transport);

    expect(shouldTrack()).toBe(true);
    expect(track('page_view', { path: '/pricing' })).toBe(true);
    expect(track('creation_started', { intent: 'game' })).toBe(true);
    expect(getQueuedEvents()).toHaveLength(2);

    const result = await flush();
    expect(result.sent).toBe(2);
    expect(transport).toHaveBeenCalledTimes(1);

    const payload = transport.mock.calls[0][0];
    expect(typeof payload.sid).toBe('string');
    expect(payload.sid.length).toBeGreaterThan(8);
    expect(payload.events.map((e) => e.name)).toEqual(['page_view', 'creation_started']);
    expect(payload.events[0].props.path).toBe('/pricing');
    expect(payload.events[1].props.intent).toBe('game');
  });

  it('stores no identifier anywhere in the browser', async () => {
    saveConsent({ analytics: true }, { source: 'banner' });
    setAnalyticsTransport(vi.fn().mockResolvedValue({ ok: true }));
    trackPageView('/pricing');
    await flush();

    const keys = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      keys.push(window.localStorage.key(index));
    }
    expect(keys).toEqual([CONSENT_STORAGE_KEY]);
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).not.toMatch(/sid|session/i);
  });

  it('drops unknown events, unknown props and personal data', () => {
    saveConsent({ analytics: true }, { source: 'banner' });

    expect(track('not_a_real_event')).toBe(false);
    expect(track('DROP TABLE users')).toBe(false);
    expect(track('page_view', { email: 'someone@corez.pro' })).toBe(true);

    const [event] = getQueuedEvents();
    expect(event.name).toBe('page_view');
    expect(event.props.email).toBeUndefined();
    expect(event.props.path).toBeUndefined();
  });

  it('never sends a full URL, query string or identifier-bearing path', () => {
    expect(sanitizePath('https://corez.pro/pricing?token=secret#frag')).toBe('/pricing');
    expect(sanitizePath('/chat/3f2a9c1e-1234-4abc-9def-0123456789ab')).toBe('/chat/:id');
    expect(sanitizePath('/chat/session_abcdef123456')).toBe('/chat/:id');
    expect(sanitizePath('/dashboard?email=someone@corez.pro')).toBe('/dashboard');
    expect(sanitizePath('')).toBeNull();
  });

  it('sanitizes props to enums and bounded scalars', () => {
    const event = sanitizeEvent({
      name: 'publish_completed',
      props: {
        plan: 'Standard Plan',
        surface: 'canvas',
        count: 1e9,
        status: 'ok',
      },
      ts: Date.now(),
    });
    expect(event.props.plan).toBeUndefined();
    expect(event.props.surface).toBe('canvas');
    expect(event.props.status).toBe('ok');
    expect(event.props.count).toBe(100000);
  });

  it('keeps the allowlist and the validator in agreement', () => {
    for (const name of ALLOWED_EVENT_NAMES) {
      expect(sanitizeEvent({ name, props: {}, ts: Date.now() })).not.toBeNull();
    }
    expect(ALLOWED_EVENT_NAMES.size).toBeGreaterThan(5);
  });

  it('respects Do Not Track and Global Privacy Control even with consent', () => {
    saveConsent({ analytics: true }, { source: 'banner' });
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    expect(shouldTrack()).toBe(false);
    expect(track('page_view', { path: '/' })).toBe(false);

    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      value: true,
      configurable: true,
    });
    expect(shouldTrack()).toBe(false);
  });

  it('stops and discards buffered events when consent is withdrawn', async () => {
    saveConsent({ analytics: true }, { source: 'banner' });
    const transport = vi.fn().mockResolvedValue({ ok: true });
    setAnalyticsTransport(transport);
    const stop = startAnalytics();

    trackPageView('/pricing');
    expect(getQueuedEvents()).toHaveLength(1);

    saveConsent({ analytics: false }, { source: 'preferences' });
    expect(getQueuedEvents()).toHaveLength(0);
    await flush();
    expect(transport).not.toHaveBeenCalled();

    stop();
  });

  it('counts a path once per page load', () => {
    saveConsent({ analytics: true }, { source: 'banner' });
    expect(trackPageView('/pricing')).toBe(true);
    expect(trackPageView('/pricing')).toBe(false);
    resetPageViewMemory();
    expect(trackPageView('/pricing')).toBe(true);
  });

  it('survives a failing transport without retrying or throwing', async () => {
    saveConsent({ analytics: true }, { source: 'banner' });
    setAnalyticsTransport(vi.fn().mockRejectedValue(new Error('offline')));
    trackPageView('/pricing');
    const result = await flush();
    expect(result.failed).toBe(1);
    expect(getQueuedEvents()).toHaveLength(0);
  });
});
