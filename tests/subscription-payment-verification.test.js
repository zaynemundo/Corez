/**
 * Payment verification boundaries.
 *
 * These tests pin the remaining holes in the Ziina verification path:
 *   1. Test mode is deployment-controlled (ZIINA_TEST_MODE), never a client
 *      body flag.
 *   2. `/verify` requires a local checkout belonging to the authenticated user
 *      before it trusts anything Ziina says.
 *   3. Only AED payments buy AED-priced plans, and test payments buy nothing
 *      on a live deployment.
 *   4. Settlement is exactly-once through the payment ledger: duplicates
 *      return the ORIGINAL period, and database failures produce a failure
 *      response instead of a success-shaped one.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleSubscriptions, derivePlanFromAmount } from '../worker/subscriptions.js';
import { handleZiina } from '../worker/ziina.js';
import {
  createSubscriptionEnv,
  getLedger,
  getRows,
  getUser,
} from './helpers/subscriptionEnv.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Route every fetch through one handler: { url, method, body } -> Response. */
function mockZiina(handler) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const method = (init?.method || 'GET').toUpperCase();
    let parsedBody = null;
    if (init?.body) {
      try {
        parsedBody = JSON.parse(init.body);
      } catch {
        parsedBody = null;
      }
    }
    return handler({ url, method, body: parsedBody });
  });
}

function completedPayment(overrides = {}) {
  return {
    id: 'pi_test',
    status: 'completed',
    amount: 1836,
    currency_code: 'AED',
    ...overrides,
  };
}

function verifyRequest(paymentId, extra = {}) {
  return new Request('https://corez.pro/api/subscriptions/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_id: paymentId, ...extra }),
  });
}

function checkoutRequest(body) {
  return new Request('https://corez.pro/api/subscriptions/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function meRequest() {
  return new Request('https://corez.pro/api/subscriptions/me', { method: 'GET' });
}

describe('payment verification boundaries', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('deployment-controlled test mode', () => {
    it('ignores a client test flag on a live deployment', async () => {
      const { DB, env } = await createSubscriptionEnv();
      let captured = null;
      mockZiina(({ url, method, body }) => {
        if (method === 'POST' && url.endsWith('/payment_intent')) {
          captured = body;
          return jsonResponse({
            id: 'pi_live_1',
            status: 'requires_payment_instrument',
            redirect_url: 'https://ziina.test/redirect',
          });
        }
        return jsonResponse({ message: 'unexpected' }, 500);
      });

      const res = await handleSubscriptions(
        checkoutRequest({ plan: 'standard', test: true, test_mode: true, is_test: true }),
        env,
      );

      expect(res.status).toBe(200);
      expect(captured.amount).toBe(1836);
      expect(captured.test).toBeUndefined();

      const rows = await getRows(
        DB,
        `SELECT * FROM subscriptions WHERE ziina_payment_id='pi_live_1'`,
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].test_mode)).toBe(0);
      expect(rows[0].status).toBe('pending');
    });

    it('ignores a client test flag on the generic payment-intent proxy too', async () => {
      let captured = null;
      mockZiina(({ url, method, body }) => {
        if (method === 'POST' && url.endsWith('/payment_intent')) {
          captured = body;
          return jsonResponse({ id: 'pi_generic', status: 'requires_payment_instrument' });
        }
        return jsonResponse({ message: 'unexpected' }, 500);
      });
      const request = new Request('https://corez.pro/api/ziina/payment_intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'standard', test: true, testMode: true }),
      });

      const res = await handleZiina(request, { ZIINA_API_KEY: 'test-key' });

      expect(res.status).toBe(200);
      expect(captured.amount).toBe(1836);
      expect(captured.test).toBeUndefined();
    });

    it('creates a test-mode intent only when the deployment opts in', async () => {
      const { DB, env } = await createSubscriptionEnv({
        env: { ZIINA_TEST_MODE: 'true' },
      });
      let captured = null;
      mockZiina(({ url, method, body }) => {
        if (method === 'POST' && url.endsWith('/payment_intent')) {
          captured = body;
          return jsonResponse({ id: 'pi_test_1', status: 'requires_payment_instrument' });
        }
        return jsonResponse({ message: 'unexpected' }, 500);
      });

      const res = await handleSubscriptions(checkoutRequest({ plan: 'standard' }), env);
      expect(res.status).toBe(200);
      expect(captured.test).toBe(true);

      const rows = await getRows(
        DB,
        `SELECT * FROM subscriptions WHERE ziina_payment_id='pi_test_1'`,
      );
      expect(Number(rows[0].test_mode)).toBe(1);
    });
  });

  describe('payment ownership', () => {
    it('refuses a completed payment with no local checkout for the account', async () => {
      const { DB, env } = await createSubscriptionEnv();
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse(completedPayment({ id: 'pi_foreign' }))
          : jsonResponse({}, 500),
      );

      const res = await handleSubscriptions(verifyRequest('pi_foreign'), env);

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('payment_not_owned');
      expect((await getUser(DB)).plan).toBe('free');
      expect(await getRows(DB, 'SELECT * FROM payment_ledger')).toHaveLength(0);
      expect(await getRows(DB, "SELECT * FROM subscriptions WHERE status='active'")).toHaveLength(0);
    });

    it("refuses another account's payment id", async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [
          { user_id: 'alice', plan: 'standard', amount: 1836, ziina_payment_id: 'pi_alice' },
        ],
      });
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse(completedPayment({ id: 'pi_alice' }))
          : jsonResponse({}, 500),
      );

      const res = await handleSubscriptions(verifyRequest('pi_alice'), env);

      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('payment_not_owned');
      expect((await getUser(DB)).plan).toBe('free');
      expect(await getRows(DB, 'SELECT * FROM payment_ledger')).toHaveLength(0);
    });
  });

  describe('currency and test-payment entitlements', () => {
    it('rejects a completed payment in a foreign currency', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [{ plan: 'standard', amount: 1836, ziina_payment_id: 'pi_usd' }],
      });
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse(completedPayment({ id: 'pi_usd', currency_code: 'USD' }))
          : jsonResponse({}, 500),
      );

      const res = await handleSubscriptions(verifyRequest('pi_usd'), env);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('currency_mismatch');
      expect((await getUser(DB)).plan).toBe('free');
      expect(await getLedger(DB, 'pi_usd')).toBeNull();
      expect(await getRows(DB, "SELECT * FROM subscriptions WHERE status='active'")).toHaveLength(0);
    });

    it('rejects a Ziina-flagged test payment on a live deployment', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [{ plan: 'standard', amount: 1836, ziina_payment_id: 'pi_testpay' }],
      });
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse(completedPayment({ id: 'pi_testpay', test: true }))
          : jsonResponse({}, 500),
      );

      const res = await handleSubscriptions(verifyRequest('pi_testpay'), env);

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('test_payment');
      expect((await getUser(DB)).plan).toBe('free');
      expect(await getRows(DB, "SELECT * FROM subscriptions WHERE status='active'")).toHaveLength(0);
    });

    it('rejects a locally-recorded test checkout even when Ziina omits the flag', async () => {
      const live = await createSubscriptionEnv({
        subscriptions: [
          { plan: 'standard', amount: 1836, ziina_payment_id: 'pi_local_test', test_mode: 1 },
        ],
      });
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse(completedPayment({ id: 'pi_local_test' }))
          : jsonResponse({}, 500),
      );

      const res = await handleSubscriptions(verifyRequest('pi_local_test'), live.env);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('test_payment');
      expect((await getUser(live.DB)).plan).toBe('free');
    });

    it('honours a deployment in test mode', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [
          { plan: 'standard', amount: 1836, ziina_payment_id: 'pi_dev_test', test_mode: 1 },
        ],
        env: { ZIINA_TEST_MODE: 'true' },
      });
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse(completedPayment({ id: 'pi_dev_test', test: true }))
          : jsonResponse({}, 500),
      );

      const res = await handleSubscriptions(verifyRequest('pi_dev_test'), env);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.verified).toBe(true);
      expect(body.plan).toBe('standard');
      expect((await getLedger(DB, 'pi_dev_test')).status).toBe('settled');
    });
  });

  describe('exactly-once settlement', () => {
    it('replays the original period for a repeated verification', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [
          { id: 'sub_pending', plan: 'standard', amount: 1836, ziina_payment_id: 'pi_once' },
        ],
      });
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse(completedPayment({ id: 'pi_once' }))
          : jsonResponse({}, 500),
      );

      const firstRes = await handleSubscriptions(verifyRequest('pi_once'), env);
      expect(firstRes.status).toBe(200);
      const first = await firstRes.json();
      expect(first.verified).toBe(true);
      expect(first.plan).toBe('standard');
      expect(first.period_end - first.period_start).toBe(30 * DAY_MS);

      const ledger = await getLedger(DB, 'pi_once');
      expect(ledger.status).toBe('settled');
      expect(Number(ledger.period_end)).toBe(first.period_end);

      const activeBefore = await getRows(
        DB,
        "SELECT * FROM subscriptions WHERE status='active'",
      );
      expect(activeBefore).toHaveLength(1);

      // Repeating the verification must NOT mint a new period.
      const secondRes = await handleSubscriptions(verifyRequest('pi_once'), env);
      expect(secondRes.status).toBe(200);
      const second = await secondRes.json();
      expect(second.verified).toBe(true);
      expect(second.alreadySettled).toBe(true);
      expect(second.period_end).toBe(first.period_end);

      const activeAfter = await getRows(
        DB,
        "SELECT * FROM subscriptions WHERE status='active'",
      );
      expect(activeAfter).toHaveLength(1);
      expect(activeAfter[0].id).toBe(activeBefore[0].id);
    });

    it('reports failure, releases the claim, and retries cleanly when the activation transaction fails', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [
          { id: 'sub_pending', plan: 'standard', amount: 1836, ziina_payment_id: 'pi_fail' },
        ],
      });
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse(completedPayment({ id: 'pi_fail' }))
          : jsonResponse({}, 500),
      );

      const originalBatch = env.DB.batch;
      env.DB.batch = async () => {
        throw new Error('D1 batch failed');
      };

      const res = await handleSubscriptions(verifyRequest('pi_fail'), env);
      expect(res.status).toBe(502);
      expect((await res.json()).verified).toBeUndefined();

      env.DB.batch = originalBatch;

      expect((await getUser(DB)).plan).toBe('free');
      expect(await getRows(DB, "SELECT * FROM subscriptions WHERE status='active'")).toHaveLength(0);
      const failedClaim = await getLedger(DB, 'pi_fail');
      expect(failedClaim.status).toBe('failed');

      // The payment is real, so a retry must settle it.
      const retryRes = await handleSubscriptions(verifyRequest('pi_fail'), env);
      expect(retryRes.status).toBe(200);
      expect((await retryRes.json()).verified).toBe(true);
      expect((await getLedger(DB, 'pi_fail')).status).toBe('settled');
      expect((await getUser(DB)).plan).toBe('standard');
    });

    it('settles a completed checkout resume through the ledger', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [
          { id: 'sub_pending', plan: 'standard', amount: 1836, ziina_payment_id: 'pi_resume' },
        ],
      });
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse(completedPayment({ id: 'pi_resume' }))
          : jsonResponse({}, 500),
      );

      const res = await handleSubscriptions(checkoutRequest({ plan: 'standard' }), env);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.verified).toBe(true);
      expect(body.period_end).toBeGreaterThan(Date.now());

      const ledger = await getLedger(DB, 'pi_resume');
      expect(ledger.status).toBe('settled');
      expect(Number(ledger.period_end)).toBe(body.period_end);
    });

    it('reconciles a completed pending checkout once and replays the same period', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [
          { id: 'sub_pending', plan: 'standard', amount: 1836, ziina_payment_id: 'pi_rec' },
        ],
      });
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse(completedPayment({ id: 'pi_rec' }))
          : jsonResponse({}, 500),
      );

      const first = await (await handleSubscriptions(meRequest(), env)).json();
      expect(first.plan).toBe('standard');
      const firstEnd = first.period_end;

      const second = await (await handleSubscriptions(meRequest(), env)).json();
      expect(second.plan).toBe('standard');
      expect(second.period_end).toBe(firstEnd);

      const ledger = await getLedger(DB, 'pi_rec');
      expect(ledger.status).toBe('settled');
      expect(Number(ledger.period_end)).toBe(firstEnd);
      expect(
        await getRows(DB, "SELECT * FROM subscriptions WHERE status='active'"),
      ).toHaveLength(1);
    });
  });

  describe('reconciliation preserves checkout ownership', () => {
    it('survives pending status checks and still activates exactly once when completed', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [
          { id: 'sub_pending', plan: 'standard', amount: 1836, ziina_payment_id: 'pi_slow' },
        ],
      });
      let ziinaStatus = 'requires_user_action';
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse({
              id: 'pi_slow',
              status: ziinaStatus,
              amount: 1836,
              currency_code: 'AED',
            })
          : jsonResponse({}, 500),
      );

      // Checking the subscription while the user is still on the Ziina page
      // must not delete the only local proof that this checkout belongs to
      // them, or the later capture could never be verified.
      for (const status of [
        'requires_user_action',
        'pending',
        'requires_payment_instrument',
      ]) {
        ziinaStatus = status;
        const me = await (await handleSubscriptions(meRequest(), env)).json();
        expect(me.plan).toBe('free');
        const rows = await getRows(
          DB,
          `SELECT * FROM subscriptions WHERE ziina_payment_id='pi_slow'`,
        );
        expect(rows, `checkout deleted while Ziina reported ${status}`).toHaveLength(1);
        expect(await getLedger(DB, 'pi_slow')).toBeNull();
      }

      // The payment completes later: verification still finds the local
      // checkout and settles it exactly once for the right account.
      ziinaStatus = 'completed';
      const res = await handleSubscriptions(verifyRequest('pi_slow'), env);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.verified).toBe(true);
      expect(body.plan).toBe('standard');

      const active = await getRows(DB, "SELECT * FROM subscriptions WHERE status='active'");
      expect(active).toHaveLength(1);
      expect(active[0].user_id).toBe('dev');
      expect((await getLedger(DB, 'pi_slow')).status).toBe('settled');

      // Later reads replay the same period instead of minting a new one.
      const meAfter = await (await handleSubscriptions(meRequest(), env)).json();
      expect(meAfter.plan).toBe('standard');
      expect(meAfter.period_end).toBe(body.period_end);
    });

    // Regression: activation used to DELETE every non-abandoned pending row
    // for the user, not just the checkout being settled. Starting checkout A,
    // starting checkout B for a different plan, and settling B erased A's
    // ownership record — so a late completion of A could never verify.
    it('keeps both checkouts attributable when one of two pending checkouts settles', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [
          { id: 'sub_A', plan: 'standard', amount: 1836, ziina_payment_id: 'pi_A' },
          { id: 'sub_B', plan: 'premium', amount: 2754, ziina_payment_id: 'pi_B' },
        ],
      });
      let statusA = 'requires_user_action';
      let statusB = 'requires_user_action';
      mockZiina(({ url }) => {
        if (url.includes('pi_A')) {
          return jsonResponse({ id: 'pi_A', status: statusA, amount: 1836, currency_code: 'AED' });
        }
        if (url.includes('pi_B')) {
          return jsonResponse({ id: 'pi_B', status: statusB, amount: 2754, currency_code: 'AED' });
        }
        return jsonResponse({ message: 'unexpected' }, 500);
      });

      // Checkout B completes first and activates the premium plan.
      statusB = 'completed';
      const settledB = await handleSubscriptions(verifyRequest('pi_B'), env);
      expect(settledB.status).toBe(200);
      expect((await settledB.json()).verified).toBe(true);

      // Checkout A's ownership record must survive B's activation: it is the
      // only local proof that its eventual payment belongs to this account.
      const rowA = await getRows(DB, `SELECT * FROM subscriptions WHERE ziina_payment_id='pi_A'`);
      expect(rowA).toHaveLength(1);
      expect(rowA[0].user_id).toBe('dev');
      // It is retired from the resume flow (superseded), not attributed away.
      expect(Number(rowA[0].abandoned_at)).toBeGreaterThan(0);

      // A completes later: verification still finds the local checkout and
      // settles it exactly once for the right account (standard takes over as
      // the current single plan).
      statusA = 'completed';
      const settledA = await handleSubscriptions(verifyRequest('pi_A'), env);
      expect(settledA.status).toBe(200);
      const bodyA = await settledA.json();
      expect(bodyA.verified).toBe(true);
      expect(bodyA.plan).toBe('standard');

      // Every payment remains attributable: B as its completed row plus its
      // settled ledger claim, A as the single active period.
      const ledgerA = await getLedger(DB, 'pi_A');
      const ledgerB = await getLedger(DB, 'pi_B');
      expect(ledgerA.status).toBe('settled');
      expect(ledgerA.user_id).toBe('dev');
      expect(ledgerB.status).toBe('settled');
      expect(ledgerB.user_id).toBe('dev');
      const rowB = await getRows(DB, `SELECT * FROM subscriptions WHERE ziina_payment_id='pi_B'`);
      expect(rowB).toHaveLength(1);
      expect(rowB[0].user_id).toBe('dev');
      const active = await getRows(DB, "SELECT * FROM subscriptions WHERE status='active'");
      expect(active).toHaveLength(1);
      expect(active[0].user_id).toBe('dev');
      expect(active[0].ziina_payment_id).toBe('pi_A');
    });

    it('keeps a completed payment that cannot buy an entitlement for review', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [
          { plan: 'standard', amount: 1836, ziina_payment_id: 'pi_refused', test_mode: 1 },
        ],
      });
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse(completedPayment({ id: 'pi_refused' }))
          : jsonResponse({}, 500),
      );

      await handleSubscriptions(meRequest(), env);

      expect(
        await getRows(DB, `SELECT * FROM subscriptions WHERE ziina_payment_id='pi_refused'`),
      ).toHaveLength(1);
      expect((await getUser(DB)).plan).toBe('free');
      expect(await getLedger(DB, 'pi_refused')).toBeNull();
    });

    it('drops only checkouts that have no payment id at all', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [{ plan: 'standard', amount: 1836, ziina_payment_id: null }],
      });
      mockZiina(() => jsonResponse({}, 500));

      await handleSubscriptions(meRequest(), env);

      expect(await getRows(DB, "SELECT * FROM subscriptions WHERE status='pending'")).toHaveLength(0);
    });

    it('keeps the abandoned checkout as ownership proof and settles a late completion', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [
          { plan: 'standard', amount: 1836, ziina_payment_id: 'pi_late' },
        ],
      });
      // The payment is still unfinished when the user walks away from it.
      let ziinaStatus = 'requires_user_action';
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse({
              id: 'pi_late',
              status: ziinaStatus,
              amount: 1836,
              currency_code: 'AED',
            })
          : jsonResponse({}, 500),
      );

      const abandonRequest = new Request('https://corez.pro/api/subscriptions/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'standard' }),
      });
      const res = await handleSubscriptions(abandonRequest, env);
      expect(res.status).toBe(200);
      expect((await res.clone().json()).activated).toBe(false);

      // The checkout is MARKED, not deleted: the row is the only local proof
      // that pi_late belongs to this account. Deleting it here is what turned a
      // later capture into an unrecoverable `payment_not_owned` refusal.
      const rows = await getRows(
        DB,
        `SELECT * FROM subscriptions WHERE ziina_payment_id='pi_late'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].abandoned_at).toBeTruthy();

      // Abandoning removes the checkout from the resume flows, so the user is
      // not pushed back into a payment they walked away from.
      const pending = await (
        await handleSubscriptions(
          new Request('https://corez.pro/api/subscriptions/pending', { method: 'GET' }),
          env,
        )
      ).json();
      expect(pending.pending).toBeNull();
      const me = await (await handleSubscriptions(meRequest(), env)).json();
      expect(me.pending_payment_id ?? null).toBeNull();

      // It completes afterwards anyway. Ownership survived the abandonment, so
      // the payment is still recoverable rather than refused.
      ziinaStatus = 'completed';
      const verified = await handleSubscriptions(verifyRequest('pi_late'), env);
      expect(verified.status).toBe(200);
      const body = await verified.json();
      expect(body.verified).toBe(true);
      expect(body.plan).toBe('standard');
      expect((await getLedger(DB, 'pi_late')).status).toBe('settled');
      expect(await getUser(DB)).toMatchObject({ plan: 'standard' });
    });

    it('marks the checkout abandoned even when Ziina cannot be reached, and says so', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [
          { plan: 'standard', amount: 1836, ziina_payment_id: 'pi_offline' },
        ],
      });
      // Ziina is unreachable: "not confirmed" must never be reported as
      // "confirmed not completed".
      mockZiina(() => {
        throw new Error('network down');
      });

      const res = await handleSubscriptions(
        new Request('https://corez.pro/api/subscriptions/abandon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.confirmation_pending).toBe(true);

      // Marking is not destructive, so the ownership row survives an
      // unconfirmable reconciliation and can still settle later.
      const rows = await getRows(
        DB,
        `SELECT * FROM subscriptions WHERE ziina_payment_id='pi_offline'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].abandoned_at).toBeTruthy();
    });

    it('settles a checkout abandoned before completion through reconciliation', async () => {
      const { DB, env } = await createSubscriptionEnv({
        subscriptions: [
          {
            plan: 'standard',
            amount: 1836,
            ziina_payment_id: 'pi_reconcile',
            abandoned_at: Date.now(),
          },
        ],
      });
      mockZiina(({ method }) =>
        method === 'GET'
          ? jsonResponse(completedPayment({ id: 'pi_reconcile' }))
          : jsonResponse({}, 500),
      );

      // The passive status read is the recovery path: abandoned is a UI state,
      // so a captured payment still activates from it.
      const me = await (await handleSubscriptions(meRequest(), env)).json();
      expect(me.plan).toBe('standard');
      expect((await getLedger(DB, 'pi_reconcile')).status).toBe('settled');

      // The settled checkout row retires because activation wrote the same
      // user_id + payment_id onto the active row: attribution is transferred,
      // not dropped.
      const rows = await getRows(
        DB,
        `SELECT * FROM subscriptions WHERE ziina_payment_id='pi_reconcile'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('active');
    });
  });

  describe('amount-derived grants (retained)', () => {
    it('resolves every price and no other amount', () => {
      expect(derivePlanFromAmount(1836)).toMatchObject({ plan: 'standard', interval: 'month' });
      expect(derivePlanFromAmount(2754)).toMatchObject({ plan: 'premium', interval: 'month' });
      expect(derivePlanFromAmount(17628)).toMatchObject({ plan: 'standard', interval: 'year' });
      expect(derivePlanFromAmount(26436)).toMatchObject({ plan: 'premium', interval: 'year' });
      expect(derivePlanFromAmount(200)).toMatchObject({ plan: 'free', interval: 'month' });
      expect(derivePlanFromAmount(0)).toMatchObject({ plan: 'free', interval: 'month' });
    });
  });
});
