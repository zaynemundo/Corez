// SQLite-backed subscription test environment.
//
// The payment-settlement path relies on real SQL semantics (upserts, partial
// indexes, transactional batches), so these tests run against node:sqlite
// through the D1 adapter instead of a hand-rolled JavaScript fake.
import { createSqliteD1 } from './sqliteD1.js';
import { ensureSubscriptionTables } from '../../worker/subscriptions.js';

export function subscriptionRow(overrides = {}) {
  const now = Date.now();
  return {
    id: overrides.id || crypto.randomUUID(),
    user_id: 'dev',
    plan: 'standard',
    amount: 1836,
    currency_code: 'AED',
    status: 'pending',
    period_start: null,
    period_end: null,
    ziina_payment_id: null,
    test_mode: 0,
    abandoned_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function ledgerRow(overrides = {}) {
  const now = Date.now();
  return {
    payment_id: 'pi_test',
    user_id: 'dev',
    plan: 'standard',
    amount: 1836,
    currency_code: 'AED',
    interval: 'month',
    status: 'settled',
    claim_token: null,
    subscription_id: null,
    period_start: now,
    period_end: now + 30 * 24 * 60 * 60 * 1000,
    test_mode: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

async function insertSubscription(DB, row) {
  await DB.prepare(
    `INSERT INTO subscriptions (id, user_id, plan, amount, currency_code, status, period_start, period_end, ziina_payment_id, test_mode, abandoned_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      row.id,
      row.user_id,
      row.plan,
      row.amount,
      row.currency_code,
      row.status,
      row.period_start,
      row.period_end,
      row.ziina_payment_id,
      row.test_mode,
      row.abandoned_at,
      row.created_at,
      row.updated_at,
    )
    .run();
}

async function insertLedger(DB, row) {
  await DB.prepare(
    `INSERT INTO payment_ledger (payment_id, user_id, plan, amount, currency_code, interval, status, claim_token, subscription_id, period_start, period_end, test_mode, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      row.payment_id,
      row.user_id,
      row.plan,
      row.amount,
      row.currency_code,
      row.interval,
      row.status,
      row.claim_token,
      row.subscription_id,
      row.period_start,
      row.period_end,
      row.test_mode,
      row.created_at,
      row.updated_at,
    )
    .run();
}

/**
 * Create a D1-shaped environment with the users/subscriptions/payment_ledger
 * schema and optional seed rows. Returns the raw DB for assertions.
 */
export async function createSubscriptionEnv({
  userId = 'dev',
  user = {},
  subscriptions = [],
  ledger = [],
  env = {},
} = {}) {
  const DB = createSqliteD1();
  await DB.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      plan TEXT DEFAULT 'free',
      subscription_plan TEXT DEFAULT 'free',
      subscription_status TEXT DEFAULT 'active',
      subscription_period_end INTEGER,
      subscription_ziina_id TEXT,
      downgrade_plan TEXT,
      downgrade_scheduled_at INTEGER
    )`,
  ).run();
  await ensureSubscriptionTables({ DB });
  await DB.prepare(
    `INSERT INTO users (id, email, plan, subscription_plan, subscription_status, subscription_period_end, subscription_ziina_id, downgrade_plan, downgrade_scheduled_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      userId,
      user.email || 'dev@corez.pro',
      user.plan || 'free',
      user.plan || 'free',
      user.status || 'active',
      null,
      null,
      null,
      null,
    )
    .run();
  for (const row of subscriptions) await insertSubscription(DB, subscriptionRow({ user_id: userId, ...row }));
  for (const row of ledger) await insertLedger(DB, ledgerRow({ user_id: userId, ...row }));
  return {
    DB,
    userId,
    env: { DB, ZIINA_API_KEY: 'test-key', ...env },
  };
}

export async function getRows(DB, sql, ...params) {
  const result = await DB.prepare(sql).bind(...params).all();
  return result.results || [];
}

export async function getUser(DB, userId = 'dev') {
  return DB.prepare(`SELECT * FROM users WHERE id=?`).bind(userId).first();
}

export async function getLedger(DB, paymentId) {
  return DB.prepare(`SELECT * FROM payment_ledger WHERE payment_id=?`).bind(paymentId).first();
}
