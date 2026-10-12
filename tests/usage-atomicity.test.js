// Budget admission is the security boundary: these tests run the real SQL
// (node:sqlite behind the D1-shaped adapter) so the atomic guard, the refund
// path and the receipt idempotency are exercised as database semantics, not
// as a JavaScript mock's interpretation of them.
import { describe, it, expect } from 'vitest';
import { createSqliteD1 } from './helpers/sqliteD1.js';
import {
  PLAN_LIMITS,
  UsageUnavailableError,
  checkAllowance,
  consumeAllowance,
  ensureUsageTables,
  getUsage,
  periodKey,
  recordUsageOnce,
  refundUsage,
  usageSummary,
} from '../worker/usage.js';

const PERIOD = periodKey();

async function seedCounter(db, uid, metric, count) {
  await ensureUsageTables({ DB: db });
  await db
    .prepare(
      `INSERT INTO usage_counters (user_id, period, metric, count, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, period, metric) DO UPDATE SET count = excluded.count`,
    )
    .bind(uid, PERIOD, metric, count, Date.now())
    .run();
}

// A configured accounting database that cannot answer: every statement throws.
function outageD1() {
  const fail = async () => {
    throw new Error('simulated D1 outage');
  };
  return {
    prepare() {
      const statement = { bind() { return statement; }, run: fail, all: fail, first: fail };
      return statement;
    },
    async batch() {
      return fail();
    },
  };
}

// A database that answers, but without change metadata (a broken binding /
// wrong client). It must be treated as unusable, never as "allowed".
function noChangeMetaD1() {
  return {
    prepare() {
      const statement = {
        bind() {
          return statement;
        },
        async run() {
          return { success: true };
        },
        async all() {
          return { results: [] };
        },
        async first() {
          return null;
        },
      };
      return statement;
    },
    async batch(statements) {
      return statements.map(() => ({ success: true }));
    },
  };
}

// A database that fails the SECOND counter write of a multi-metric admission.
// When the charges ran as separate statements the first one stayed behind, so
// the account was permanently charged for work that never started.
function secondChargeFailsD1() {
  const db = createSqliteD1();
  let charges = 0;
  return {
    __sqlite: db.__sqlite,
    prepare(sql) {
      const inner = db.prepare(sql);
      return {
        __runSync() {
          const isCharge =
            /INSERT INTO usage_counters/i.test(sql) && !/receipt_key/i.test(sql);
          if (isCharge) {
            charges += 1;
            if (charges === 2) throw new Error('simulated write failure');
          }
          return inner.__runSync();
        },
        bind(...args) {
          inner.bind(...args);
          return this;
        },
        async run() {
          return this.__runSync();
        },
        async all() {
          return inner.all();
        },
        async first() {
          return inner.first();
        },
      };
    },
    batch(statements) {
      return db.batch(statements);
    },
  };
}

describe('atomic budget admission', () => {
  it('admits exactly one of two simultaneous requests when one slot remains', async () => {
    const db = createSqliteD1();
    const env = { DB: db };
    const uid = 'alice';
    await seedCounter(db, uid, 'messages', PLAN_LIMITS.free.messages - 1);

    const results = await Promise.all([
      consumeAllowance(env, uid, { plan: 'free', charges: [{ metric: 'messages', amount: 1 }] }),
      consumeAllowance(env, uid, { plan: 'free', charges: [{ metric: 'messages', amount: 1 }] }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const refused = results.find((result) => !result.ok);
    expect(refused.reason).toBe('limit');
    expect(refused.metric).toBe('messages');
    expect(refused.evaluation.limit).toBe(PLAN_LIMITS.free.messages);
    expect(refused.evaluation.allowed).toBe(false);
    expect((await getUsage(env, uid)).messages).toBe(PLAN_LIMITS.free.messages);
  });

  it('admits exactly the available slots under heavier concurrency', async () => {
    const db = createSqliteD1();
    const env = { DB: db };
    const uid = 'heavy';
    const limit = PLAN_LIMITS.free.messages;
    await seedCounter(db, uid, 'messages', limit - 2);

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        consumeAllowance(env, uid, { plan: 'free', charges: [{ metric: 'messages', amount: 1 }] }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(results.filter((result) => !result.ok)).toHaveLength(4);
    expect((await getUsage(env, uid)).messages).toBe(limit);
  });

  it('refuses a charge larger than the whole budget on a fresh counter', async () => {
    const db = createSqliteD1();
    const env = { DB: db };

    const result = await consumeAllowance(env, 'oversized', {
      plan: 'free',
      charges: [{ metric: 'tokens', amount: PLAN_LIMITS.free.tokens + 1 }],
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('limit');
    expect(result.metric).toBe('tokens');
    expect((await getUsage(env, 'oversized')).tokens).toBe(0);
  });

  it('refunds the metrics already charged when a later metric is refused', async () => {
    const db = createSqliteD1();
    const env = { DB: db };
    const uid = 'multi';
    await seedCounter(db, uid, 'tokens', 100);
    await seedCounter(db, uid, 'messages', PLAN_LIMITS.free.messages);

    const result = await consumeAllowance(env, uid, {
      plan: 'free',
      charges: [
        { metric: 'tokens', amount: 50 },
        { metric: 'messages', amount: 1 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.metric).toBe('messages');
    expect(result.refunded).toBe(true);
    const usage = await getUsage(env, uid);
    expect(usage.tokens).toBe(100);
    expect(usage.messages).toBe(PLAN_LIMITS.free.messages);
  });

  it('never refuses a charge on an unlimited plan', async () => {
    const db = createSqliteD1();
    const env = { DB: db };
    const result = await consumeAllowance(env, 'premium-user', {
      plan: 'premium',
      charges: [
        { metric: 'messages', amount: 5000 },
        { metric: 'tokens', amount: 50_000_000 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.consumed).toHaveLength(2);
  });

  it('records reconciliations once per receipt key', async () => {
    const db = createSqliteD1();
    const env = { DB: db };
    const uid = 'settle';
    await consumeAllowance(env, uid, { plan: 'free', charges: [{ metric: 'tokens', amount: 100 }] });

    const first = await recordUsageOnce(env, uid, { key: 'task:one', increments: { tokens: 50 } });
    const replay = await recordUsageOnce(env, uid, { key: 'task:one', increments: { tokens: 50 } });
    const other = await recordUsageOnce(env, uid, { key: 'task:two', increments: { tokens: 25 } });

    expect(first.recorded).toBe(true);
    expect(replay.recorded).toBe(false);
    expect(other.recorded).toBe(true);
    expect((await getUsage(env, uid)).tokens).toBe(175);
  });

  it('checks without charging and still enforces the backstop', async () => {
    const db = createSqliteD1();
    const env = { DB: db };
    const uid = 'resume';
    await seedCounter(db, uid, 'tokens', PLAN_LIMITS.free.tokens - 5);

    const over = await checkAllowance(env, uid, {
      plan: 'free',
      charges: [{ metric: 'tokens', amount: 10 }],
    });
    const within = await checkAllowance(env, uid, {
      plan: 'free',
      charges: [{ metric: 'tokens', amount: 5 }],
    });

    expect(over.ok).toBe(false);
    expect(over.reason).toBe('limit');
    expect(within.ok).toBe(true);
    // A check never spends.
    expect((await getUsage(env, uid)).tokens).toBe(PLAN_LIMITS.free.tokens - 5);
  });

  it('leaves no partial charge behind when a later counter write fails', async () => {
    const env = { DB: secondChargeFailsD1() };

    await expect(
      consumeAllowance(env, 'partial', {
        plan: 'free',
        charges: [
          { metric: 'messages', amount: 1 },
          { metric: 'tokens', amount: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(UsageUnavailableError);

    // The first charge rolled back with the failure. A half-applied admission
    // would have charged this account for a generation it never got.
    const usage = await getUsage(env, 'partial');
    expect(usage.messages).toBe(0);
    expect(usage.tokens).toBe(0);
  });

  it('refunds a reservation whose work was never accepted, and never below zero', async () => {
    const db = createSqliteD1();
    const env = { DB: db };
    const uid = 'refunded';

    await consumeAllowance(env, uid, {
      plan: 'free',
      charges: [
        { metric: 'messages', amount: 1 },
        { metric: 'tokens', amount: 250 },
      ],
    });
    expect((await getUsage(env, uid)).messages).toBe(1);

    await refundUsage(env, uid, {
      charges: [
        { metric: 'messages', amount: 1 },
        { metric: 'tokens', amount: 250 },
      ],
    });
    const usage = await getUsage(env, uid);
    expect(usage.messages).toBe(0);
    expect(usage.tokens).toBe(0);

    // A repeated refund is a floor, not a credit: it can never mint quota.
    await refundUsage(env, uid, { charges: [{ metric: 'messages', amount: 5 }] });
    expect((await getUsage(env, uid)).messages).toBe(0);
  });

  it('fails closed when the accounting database is unreachable', async () => {
    const env = { DB: outageD1() };

    await expect(
      consumeAllowance(env, 'u', { plan: 'free', charges: [{ metric: 'messages', amount: 1 }] }),
    ).rejects.toBeInstanceOf(UsageUnavailableError);
    await expect(getUsage(env, 'u')).rejects.toBeInstanceOf(UsageUnavailableError);
    await expect(
      checkAllowance(env, 'u', { plan: 'free', charges: [{ metric: 'messages', amount: 1 }] }),
    ).rejects.toBeInstanceOf(UsageUnavailableError);
    await expect(
      recordUsageOnce(env, 'u', { key: 'k', increments: { tokens: 1 } }),
    ).rejects.toBeInstanceOf(UsageUnavailableError);
    await expect(usageSummary(env, 'u', { plan: 'free' })).rejects.toBeInstanceOf(UsageUnavailableError);
  });

  it('treats a write without change metadata as an unavailable store', async () => {
    const env = { DB: noChangeMetaD1() };
    await expect(
      consumeAllowance(env, 'u', { plan: 'free', charges: [{ metric: 'messages', amount: 1 }] }),
    ).rejects.toBeInstanceOf(UsageUnavailableError);
  });

  it('keeps the unmetered mode for a deployment without a database', async () => {
    const env = {};
    const result = await consumeAllowance(env, 'u', {
      plan: 'free',
      charges: [{ metric: 'messages', amount: 1 }],
    });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(await getUsage(env, 'u')).toMatchObject({ messages: 0 });
  });
});
