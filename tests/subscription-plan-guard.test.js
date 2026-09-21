/**
 * Plan-escalation guards.
 *
 * Two independent paywall bypasses existed:
 *   1. POST /api/auth/signup accepted a client-supplied `plan`, so an anonymous
 *      request could self-provision permanent premium. (covered in auth.test.js)
 *   2. POST /api/subscriptions/cancel accepted any plan from the body and, when
 *      the account had no active period, activated it immediately via
 *      activateSubscription() with no payment — a free self-service upgrade.
 *
 * These tests pin the rule: only the verified payment flow may raise a plan.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PLAN_RANK,
  isDowngrade,
  handleSubscriptions,
} from '../worker/subscriptions.js';

/** Minimal D1 stand-in: enough for the users/subscriptions reads the route makes. */
function createMockD1(user) {
  const statements = [];
  return {
    statements,
    prepare(query) {
      const q = query.replace(/\s+/g, ' ').trim();
      const stmt = {
        _bound: [],
        bind(...args) {
          stmt._bound = args;
          return stmt;
        },
        async first() {
          if (/FROM users WHERE id=\?/i.test(q)) return user;
          // No subscriptions rows and no pending checkout.
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          statements.push({ query: q, bound: stmt._bound });
          return { success: true };
        },
      };
      return stmt;
    },
  };
}

const baseEnv = (user) => ({ DB: createMockD1(user) }); // no AUTH_SECRET -> dev user

function cancelRequest(plan) {
  return new Request('https://corez.pro/api/subscriptions/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
}

describe('plan escalation guards', () => {
  describe('isDowngrade', () => {
    it('only accepts strictly lower plans', () => {
      expect(isDowngrade('premium', 'standard')).toBe(true);
      expect(isDowngrade('premium', 'free')).toBe(true);
      expect(isDowngrade('standard', 'free')).toBe(true);

      // Same plan is not a downgrade.
      expect(isDowngrade('premium', 'premium')).toBe(false);
      expect(isDowngrade('free', 'free')).toBe(false);

      // Upgrades and unknown plans are never downgrades.
      expect(isDowngrade('free', 'premium')).toBe(false);
      expect(isDowngrade('free', 'standard')).toBe(false);
      expect(isDowngrade('standard', 'premium')).toBe(false);
      expect(isDowngrade('free', 'enterprise')).toBe(false);
    });

    it('ranks the plans free < standard < premium', () => {
      expect(PLAN_RANK.free).toBeLessThan(PLAN_RANK.standard);
      expect(PLAN_RANK.standard).toBeLessThan(PLAN_RANK.premium);
    });
  });

  describe('POST /api/subscriptions/cancel', () => {
    it('refuses to upgrade a free account asking for premium', async () => {
      const env = baseEnv({
        id: 'dev', email: 'dev@corez.pro', plan: 'free',
        subscription_plan: 'free', subscription_status: 'active',
        subscription_period_end: null, downgrade_plan: null,
      });

      const res = await handleSubscriptions(cancelRequest('premium'), env);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('not_a_downgrade');
      expect(body.current_plan).toBe('free');
      expect(body.requested_plan).toBe('premium');
      // Critically: nothing may have been written to activate a plan.
      const activations = env.DB.statements.filter((s) => /UPDATE users SET plan=/i.test(s.query));
      expect(activations).toEqual([]);
    });

    it('refuses to upgrade a free account to standard', async () => {
      const env = baseEnv({
        id: 'dev', email: 'dev@corez.pro', plan: 'free',
        subscription_plan: 'free', subscription_status: 'active',
        subscription_period_end: null, downgrade_plan: null,
      });
      const res = await handleSubscriptions(cancelRequest('standard'), env);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('not_a_downgrade');
    });

    it('still allows a real downgrade from premium to free', async () => {
      const env = baseEnv({
        id: 'dev', email: 'dev@corez.pro', plan: 'premium',
        subscription_plan: 'premium', subscription_status: 'active',
        subscription_period_end: null, downgrade_plan: null,
      });

      const res = await handleSubscriptions(cancelRequest('free'), env);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plan).toBe('free');
    });

    it('still allows a downgrade from premium to standard', async () => {
      const env = baseEnv({
        id: 'dev', email: 'dev@corez.pro', plan: 'premium',
        subscription_plan: 'premium', subscription_status: 'active',
        subscription_period_end: null, downgrade_plan: null,
      });

      const res = await handleSubscriptions(cancelRequest('standard'), env);
      expect(res.status).toBe(200);
      expect((await res.json()).plan).toBe('standard');
    });
  });

  describe('POST /api/subscriptions/verify', () => {
    afterEach(() => vi.restoreAllMocks());

    /** Pretend Ziina reports a completed payment for `amount` fils. */
    function mockZiina(amount) {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        new Response(
          JSON.stringify({ id: 'pi_test', status: 'completed', amount, currency_code: 'AED' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }

    function verifyRequest({ plan, interval } = {}) {
      return new Request('https://corez.pro/api/subscriptions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: 'pi_test',
          ...(plan ? { plan } : {}),
          ...(interval ? { interval } : {}),
        }),
      });
    }

    const verifyEnv = () => ({
      ...baseEnv({
        id: 'dev', email: 'dev@corez.pro', plan: 'free',
        subscription_plan: 'free', subscription_status: 'active',
        subscription_period_end: null, downgrade_plan: null,
      }),
      ZIINA_API_KEY: 'test-key',
    });

    it('grants only what the paid amount buys — an underpayment cannot upgrade', async () => {
      // 200 fils is Ziina's 2 AED minimum, well below every plan price. The old
      // code fell through to "standard" for any unmatched amount, so this paid
      // 18.36 AED worth of plan for 2 AED.
      mockZiina(200);
      const res = await handleSubscriptions(verifyRequest({ plan: 'premium' }), verifyEnv());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plan).toBe('free');
    });

    it('does not let a plan hint raise the plan above the amount paid', async () => {
      mockZiina(1836); // standard price
      const res = await handleSubscriptions(verifyRequest({ plan: 'premium' }), verifyEnv());
      const body = await res.json();
      expect(body.plan).toBe('standard');
    });

    it('derives standard and premium from their monthly amounts', async () => {
      mockZiina(1836);
      const standard = await (await handleSubscriptions(verifyRequest(), verifyEnv())).json();
      expect(standard.plan).toBe('standard');
      expect(standard.interval).toBe('month');

      mockZiina(2754);
      const premium = await (await handleSubscriptions(verifyRequest(), verifyEnv())).json();
      expect(premium.plan).toBe('premium');
      expect(premium.interval).toBe('month');
    });

    it('derives the yearly interval from the yearly amount', async () => {
      mockZiina(17628);
      const standardYearly = await (await handleSubscriptions(verifyRequest(), verifyEnv())).json();
      expect(standardYearly.plan).toBe('standard');
      expect(standardYearly.interval).toBe('year');

      mockZiina(26436);
      const premiumYearly = await (await handleSubscriptions(verifyRequest(), verifyEnv())).json();
      expect(premiumYearly.plan).toBe('premium');
      expect(premiumYearly.interval).toBe('year');
    });

    it('does not let interval=year stretch a monthly payment into a year', async () => {
      mockZiina(1836); // one month of Standard
      const res = await handleSubscriptions(verifyRequest({ interval: 'year' }), verifyEnv());
      const body = await res.json();
      expect(body.plan).toBe('standard');
      expect(body.interval).toBe('month');
    });
  });
});
