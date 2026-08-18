// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  GUEST_LIMITS,
  getGuestUsage,
  checkActionQuota,
  recordActionUsage,
  resetGuestUsage
} from '../src/services/quotaService.js';

describe('Quota & Guest Usage Limits Service', () => {
  beforeEach(() => {
    localStorage.clear();
    resetGuestUsage();
  });

  it('allows unlimited usage for authenticated users', () => {
    const quota = checkActionQuota('message', true);
    expect(quota.allowed).toBe(true);
    expect(quota.remaining).toBe(Infinity);
    expect(quota.isGuest).toBe(false);
  });

  it('enforces 5 daily free messages for guests', () => {
    let quota = checkActionQuota('message', false);
    expect(quota.allowed).toBe(true);
    expect(quota.remaining).toBe(5);
    expect(quota.limit).toBe(5);
    expect(quota.isGuest).toBe(true);

    // Consume 3 messages
    recordActionUsage('message', false);
    recordActionUsage('message', false);
    recordActionUsage('message', false);

    quota = checkActionQuota('message', false);
    expect(quota.allowed).toBe(true);
    expect(quota.remaining).toBe(2);
    expect(quota.used).toBe(3);

    // Consume remaining 2 messages
    recordActionUsage('message', false);
    recordActionUsage('message', false);

    quota = checkActionQuota('message', false);
    expect(quota.allowed).toBe(false);
    expect(quota.remaining).toBe(0);
    expect(quota.used).toBe(5);
  });

  it('enforces 1 daily free publish for guests', () => {
    let quota = checkActionQuota('publish', false);
    expect(quota.allowed).toBe(true);
    expect(quota.remaining).toBe(1);

    recordActionUsage('publish', false);

    quota = checkActionQuota('publish', false);
    expect(quota.allowed).toBe(false);
    expect(quota.remaining).toBe(0);
  });

  it('does not increment guest usage for authenticated users', () => {
    recordActionUsage('message', true);
    const usage = getGuestUsage();
    expect(usage.messagesCount).toBe(0);
  });
});
