/**
 * Canonical D1 schema — the single source of truth for every table, index
 * and column the Worker runtime bootstraps.
 *
 * Before this module, each feature's `ensure*` function carried its own copy
 * of the DDL, and three definitions of `chats` / `chat_messages` disagreed
 * (worker/schema.sql claimed FOREIGN KEYs the runtime never created).
 * The statements below are the reconciled versions: byte-identical in
 * effect to what the runtime `ensure*` path already builds, so adopting
 * them changes no behavior on any existing database
 * (`CREATE TABLE IF NOT EXISTS` never alters a table that is already there).
 *
 * Deliberate choices, kept stable on purpose:
 * - `chat_messages` carries `FOREIGN KEY(chat_id) REFERENCES chats(id)
 *   ON DELETE CASCADE` (the chats.js definition, and what schema.sql always
 *   claimed). D1 does not enforce foreign keys, and every chat delete removes
 *   its messages explicitly first — so this clause is documentation, never a
 *   cleanup guarantee. Per-user cleanup stays explicit work.
 * - `chats` carries no FOREIGN KEY clause: both runtime creators agree on
 *   that, and schema.sql has been corrected to match.
 * - Column migrations are idempotent `ALTER TABLE` statements. SQLite has no
 *   `ADD COLUMN IF NOT EXISTS`, so callers run each one and ignore the
 *   "duplicate column name" failure on repeat runs — never any other error.
 *
 * This module exports DATA (statement strings grouped by feature section).
 * Each feature keeps its own `ensure*` control flow (caching, parallelism,
 * error handling); only the SQL strings move here. `worker/schema.sql` is
 * generated from the same statements and stays in sync (see
 * tests/db-schema-layout.test.js).
 */

// ---------------------------------------------------------------------------
// Tables (CREATE TABLE IF NOT EXISTS, dependency order)
// ---------------------------------------------------------------------------

export const TABLE_USERS = `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT, provider TEXT DEFAULT 'local', google_id TEXT, created_at INTEGER NOT NULL, plan TEXT DEFAULT 'free')`;

export const TABLE_INVITE_CODES = `CREATE TABLE IF NOT EXISTS invite_codes (code TEXT PRIMARY KEY, used_by TEXT, used_at INTEGER, max_uses INTEGER DEFAULT 1, uses INTEGER DEFAULT 0)`;

export const TABLE_CHATS = `CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'New Conversation', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`;

export const TABLE_CHAT_MESSAGES = `CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            attachments TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
          )`;

export const TABLE_PASSWORD_RESETS = `CREATE TABLE IF NOT EXISTS password_resets (id TEXT PRIMARY KEY, email TEXT NOT NULL, token TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL, used INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`;

export const TABLE_CHAT_LIST_MANUAL = `CREATE TABLE IF NOT EXISTS chat_list_manual (
        user_id TEXT NOT NULL,
        list_key TEXT NOT NULL,
        PRIMARY KEY (user_id, list_key)
      )`;

export const TABLE_PROJECTS = `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`;

export const TABLE_USER_MEMORIES = `CREATE TABLE IF NOT EXISTS user_memories (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        text TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      )`;

export const TABLE_MEMORY_MIGRATIONS = `CREATE TABLE IF NOT EXISTS memory_migrations (
        user_id TEXT PRIMARY KEY,
        migrated_at TEXT NOT NULL
      )`;

export const TABLE_SUBSCRIPTIONS = `CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency_code TEXT NOT NULL DEFAULT 'AED',
      status TEXT NOT NULL DEFAULT 'pending',
      period_start INTEGER,
      period_end INTEGER,
      ziina_payment_id TEXT,
      test_mode INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`;

export const TABLE_PAYMENT_LEDGER = `CREATE TABLE IF NOT EXISTS payment_ledger (
      payment_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      currency_code TEXT NOT NULL DEFAULT 'AED',
      interval TEXT NOT NULL DEFAULT 'month',
      status TEXT NOT NULL DEFAULT 'processing',
      claim_token TEXT,
      subscription_id TEXT,
      period_start INTEGER,
      period_end INTEGER,
      test_mode INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`;

export const TABLE_USAGE_COUNTERS = `CREATE TABLE IF NOT EXISTS usage_counters (user_id TEXT NOT NULL, period TEXT NOT NULL, metric TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, period, metric))`;

export const TABLE_USAGE_RECEIPTS = `CREATE TABLE IF NOT EXISTS usage_receipts (receipt_key TEXT PRIMARY KEY, user_id TEXT NOT NULL, period TEXT NOT NULL, metric TEXT, created_at INTEGER NOT NULL)`;

export const TABLE_USAGE_COMPENSATIONS = `CREATE TABLE IF NOT EXISTS usage_compensations (
       compensation_key TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       period TEXT NOT NULL,
       metric TEXT NOT NULL,
       amount INTEGER NOT NULL,
       status TEXT NOT NULL DEFAULT 'pending',
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`;

export const TABLE_ANALYTICS_COUNTERS = `CREATE TABLE IF NOT EXISTS analytics_counters (day TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, country TEXT NOT NULL, device TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name, path, country, device))`;

// Published-site traffic. One row per site/day/page keeps page-view totals,
// while visitor identity lives in a SEPARATE pair of tables so a visitor can
// still be recognised as returning without attaching an identity to any single
// view row (and so the visitor tables can be pruned on a shorter clock than
// the anonymous page counts). No IP address, user agent, cookie or account id
// is stored anywhere here: `visitor_key` is a truncated HMAC fingerprint that
// only the Worker can recompute.
export const TABLE_SITE_ANALYTICS_DAILY = `CREATE TABLE IF NOT EXISTS site_analytics_daily (
       site_slug TEXT NOT NULL,
       day TEXT NOT NULL,
       page TEXT NOT NULL,
       views INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (site_slug, day, page)
     )`;

export const TABLE_SITE_ANALYTICS_BREAKDOWN = `CREATE TABLE IF NOT EXISTS site_analytics_breakdown (
       site_slug TEXT NOT NULL,
       day TEXT NOT NULL,
       dimension TEXT NOT NULL,
       value TEXT NOT NULL,
       views INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (site_slug, day, dimension, value)
     )`;

export const TABLE_SITE_ANALYTICS_VISITS = `CREATE TABLE IF NOT EXISTS site_analytics_visits (
       site_slug TEXT NOT NULL,
       visitor_key TEXT NOT NULL,
       day TEXT NOT NULL,
       PRIMARY KEY (site_slug, visitor_key, day)
     )`;

export const TABLE_SITE_ANALYTICS_VISITORS = `CREATE TABLE IF NOT EXISTS site_analytics_visitors (
       site_slug TEXT NOT NULL,
       visitor_key TEXT NOT NULL,
       first_day TEXT NOT NULL,
       last_day TEXT NOT NULL,
       PRIMARY KEY (site_slug, visitor_key)
     )`;

export const TABLE_HARNESS_TASKS = `CREATE TABLE IF NOT EXISTS harness_tasks (
     task_id TEXT PRIMARY KEY,
     user_id TEXT,
     session_id TEXT,
     status TEXT NOT NULL,
     doc TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     terminal_at INTEGER
   )`;

export const TABLE_HARNESS_TASK_EVENTS = `CREATE TABLE IF NOT EXISTS harness_task_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id TEXT NOT NULL,
     event TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`;

export const TABLE_HARNESS_TASK_LEASES = `CREATE TABLE IF NOT EXISTS harness_task_leases (
     task_id TEXT PRIMARY KEY,
     holder TEXT NOT NULL,
     expires_at INTEGER NOT NULL,
     acquired_at INTEGER NOT NULL
   )`;

export const TABLE_HARNESS_TASK_DISPATCHES = `CREATE TABLE IF NOT EXISTS harness_task_dispatches (
     task_id TEXT PRIMARY KEY,
     status TEXT NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     next_attempt_at INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`;

// ---------------------------------------------------------------------------
// Indexes (CREATE INDEX IF NOT EXISTS)
// ---------------------------------------------------------------------------

export const INDEX_CHATS_USER_UPDATED = `CREATE INDEX IF NOT EXISTS idx_chats_user_updated ON chats(user_id, updated_at DESC)`;

export const INDEX_MESSAGES_CHAT_CREATED = `CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON chat_messages(chat_id, created_at ASC)`;

export const INDEX_CHATS_CONVERSATION_ACTIVE = `CREATE INDEX IF NOT EXISTS idx_chats_conversation_active ON chats(chat_mode, last_user_at DESC)`;

export const INDEX_RESETS_TOKEN = `CREATE INDEX IF NOT EXISTS idx_resets_token ON password_resets(token)`;

export const INDEX_RESETS_EMAIL = `CREATE INDEX IF NOT EXISTS idx_resets_email ON password_resets(email)`;

export const INDEX_CHATS_PROJECT = `CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id, user_id)`;

export const INDEX_PROJECTS_USER_UPDATED = `CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC)`;

export const INDEX_USER_MEMORIES_USER_UPDATED = `CREATE INDEX IF NOT EXISTS idx_user_memories_user_updated ON user_memories(user_id, updated_at DESC)`;

export const INDEX_USER_MEMORIES_USER_CATEGORY = `CREATE INDEX IF NOT EXISTS idx_user_memories_user_category ON user_memories(user_id, category)`;

export const INDEX_SUBSCRIPTIONS_USER = `CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, created_at DESC)`;

export const INDEX_SUBSCRIPTIONS_STATUS = `CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`;

export const INDEX_PAYMENT_LEDGER_USER = `CREATE INDEX IF NOT EXISTS idx_payment_ledger_user ON payment_ledger(user_id, created_at DESC)`;

export const INDEX_USAGE_PERIOD = `CREATE INDEX IF NOT EXISTS idx_usage_period ON usage_counters(period)`;

export const INDEX_USAGE_RECEIPTS_USER = `CREATE INDEX IF NOT EXISTS idx_usage_receipts_user ON usage_receipts(user_id, period)`;

export const INDEX_USAGE_COMPENSATIONS_PENDING = `CREATE INDEX IF NOT EXISTS idx_usage_compensations_pending ON usage_compensations(user_id, period, status)`;

// The visits primary key starts at the visitor, so range reads (site + day)
// need their own index; the same applies to first-visit lookups.
export const INDEX_SITE_ANALYTICS_VISITS_SLUG_DAY = `CREATE INDEX IF NOT EXISTS idx_site_analytics_visits_slug_day ON site_analytics_visits(site_slug, day)`;

export const INDEX_SITE_ANALYTICS_VISITORS_SLUG_FIRST = `CREATE INDEX IF NOT EXISTS idx_site_analytics_visitors_slug_first ON site_analytics_visitors(site_slug, first_day)`;

export const INDEX_HARNESS_TASKS_USER = `CREATE INDEX IF NOT EXISTS idx_harness_tasks_user ON harness_tasks (user_id, created_at)`;

export const INDEX_HARNESS_TASKS_SESSION = `CREATE INDEX IF NOT EXISTS idx_harness_tasks_session ON harness_tasks (session_id, created_at)`;

export const INDEX_HARNESS_TASKS_STATUS = `CREATE INDEX IF NOT EXISTS idx_harness_tasks_status ON harness_tasks (status, updated_at)`;

export const INDEX_HARNESS_TASK_EVENTS_TASK = `CREATE INDEX IF NOT EXISTS idx_harness_task_events_task ON harness_task_events (task_id, id)`;

export const INDEX_HARNESS_TASK_DISPATCHES_PENDING = `CREATE INDEX IF NOT EXISTS idx_harness_task_dispatches_pending
     ON harness_task_dispatches (next_attempt_at)`;

// ---------------------------------------------------------------------------
// Column migrations (idempotent ALTER TABLE; "duplicate column name" on
// repeat runs is the expected success signal, any other error is real)
// ---------------------------------------------------------------------------

export const COLUMN_USERS_PLAN = `ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'`;
export const COLUMN_USERS_SUBSCRIPTION_STATUS = `ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'active'`;
export const COLUMN_USERS_TERMS_VERSION = `ALTER TABLE users ADD COLUMN terms_version TEXT`;
export const COLUMN_USERS_TERMS_ACCEPTED_AT = `ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER`;
export const COLUMN_USERS_MARKETING_CONSENT = `ALTER TABLE users ADD COLUMN marketing_consent INTEGER DEFAULT 0`;
export const COLUMN_USERS_PASSWORD_CHANGED_AT = `ALTER TABLE users ADD COLUMN password_changed_at INTEGER`;
export const COLUMN_PASSWORD_RESETS_USER_ID = `ALTER TABLE password_resets ADD COLUMN user_id TEXT`;
export const COLUMN_CHATS_PROJECT_ID = `ALTER TABLE chats ADD COLUMN project_id TEXT`;
export const COLUMN_CHATS_PINNED_AT = `ALTER TABLE chats ADD COLUMN pinned_at INTEGER`;
export const COLUMN_CHATS_SORT_ORDER = `ALTER TABLE chats ADD COLUMN sort_order REAL`;
export const COLUMN_CHATS_CHAT_MODE = `ALTER TABLE chats ADD COLUMN chat_mode TEXT NOT NULL DEFAULT 'single'`;
export const COLUMN_CHATS_PERSONAS = `ALTER TABLE chats ADD COLUMN personas TEXT`;
export const COLUMN_CHATS_LAST_USER_AT = `ALTER TABLE chats ADD COLUMN last_user_at INTEGER`;
export const COLUMN_CHATS_TITLE_UPDATED_AT = `ALTER TABLE chats ADD COLUMN title_updated_at INTEGER`;
export const COLUMN_MESSAGES_TURN_ID = `ALTER TABLE chat_messages ADD COLUMN turn_id TEXT`;
export const COLUMN_MESSAGES_SPEAKER_ID = `ALTER TABLE chat_messages ADD COLUMN speaker_id TEXT`;
export const COLUMN_MESSAGES_SPEAKER_NAME = `ALTER TABLE chat_messages ADD COLUMN speaker_name TEXT`;
export const COLUMN_MESSAGES_MODEL_ID = `ALTER TABLE chat_messages ADD COLUMN model_id TEXT`;
export const COLUMN_SUBSCRIPTIONS_TEST_MODE = `ALTER TABLE subscriptions ADD COLUMN test_mode INTEGER NOT NULL DEFAULT 0`;
export const COLUMN_SUBSCRIPTIONS_ABANDONED_AT = `ALTER TABLE subscriptions ADD COLUMN abandoned_at INTEGER`;
export const COLUMN_USERS_SUBSCRIPTION_PLAN = `ALTER TABLE users ADD COLUMN subscription_plan TEXT DEFAULT 'free'`;
export const COLUMN_USERS_SUBSCRIPTION_PERIOD_END = `ALTER TABLE users ADD COLUMN subscription_period_end INTEGER`;
export const COLUMN_USERS_SUBSCRIPTION_ZIINA_ID = `ALTER TABLE users ADD COLUMN subscription_ziina_id TEXT`;
export const COLUMN_USERS_DOWNGRADE_PLAN = `ALTER TABLE users ADD COLUMN downgrade_plan TEXT`;
export const COLUMN_USERS_DOWNGRADE_SCHEDULED_AT = `ALTER TABLE users ADD COLUMN downgrade_scheduled_at INTEGER`;

// ---------------------------------------------------------------------------
// Feature sections — exactly what each ensure* path runs today, now by
// reference instead of by copy-pasted string. The grouping preserves the
// historical ownership (which module creates which tables); only the SQL
// text is shared.
// ---------------------------------------------------------------------------

export const AUTH_SCHEMA = Object.freeze({
  tables: [
    TABLE_USERS,
    TABLE_INVITE_CODES,
    TABLE_CHATS,
    TABLE_CHAT_MESSAGES,
    TABLE_PASSWORD_RESETS,
  ],
  indexes: [
    INDEX_CHATS_USER_UPDATED,
    INDEX_MESSAGES_CHAT_CREATED,
    INDEX_RESETS_TOKEN,
    INDEX_RESETS_EMAIL,
  ],
  columns: [
    COLUMN_USERS_PLAN,
    COLUMN_USERS_SUBSCRIPTION_STATUS,
    COLUMN_USERS_TERMS_VERSION,
    COLUMN_USERS_TERMS_ACCEPTED_AT,
    COLUMN_USERS_MARKETING_CONSENT,
    COLUMN_USERS_PASSWORD_CHANGED_AT,
    COLUMN_PASSWORD_RESETS_USER_ID,
  ],
});

export const CHATS_SCHEMA = Object.freeze({
  tables: [TABLE_CHATS, TABLE_CHAT_MESSAGES, TABLE_CHAT_LIST_MANUAL],
  indexes: [
    INDEX_CHATS_USER_UPDATED,
    INDEX_CHATS_PROJECT,
    INDEX_MESSAGES_CHAT_CREATED,
    INDEX_CHATS_CONVERSATION_ACTIVE,
  ],
  columns: [
    COLUMN_CHATS_PROJECT_ID,
    COLUMN_CHATS_PINNED_AT,
    COLUMN_CHATS_SORT_ORDER,
    COLUMN_CHATS_CHAT_MODE,
    COLUMN_CHATS_PERSONAS,
    COLUMN_CHATS_LAST_USER_AT,
    COLUMN_CHATS_TITLE_UPDATED_AT,
    COLUMN_MESSAGES_TURN_ID,
    COLUMN_MESSAGES_SPEAKER_ID,
    COLUMN_MESSAGES_SPEAKER_NAME,
    COLUMN_MESSAGES_MODEL_ID,
  ],
});

export const PROJECTS_SCHEMA = Object.freeze({
  tables: [TABLE_PROJECTS],
  indexes: [INDEX_PROJECTS_USER_UPDATED],
  columns: [],
});

export const MEMORY_SCHEMA = Object.freeze({
  tables: [TABLE_USER_MEMORIES, TABLE_MEMORY_MIGRATIONS],
  indexes: [
    INDEX_USER_MEMORIES_USER_UPDATED,
    INDEX_USER_MEMORIES_USER_CATEGORY,
  ],
  columns: [],
});

export const SUBSCRIPTIONS_SCHEMA = Object.freeze({
  tables: [TABLE_SUBSCRIPTIONS, TABLE_PAYMENT_LEDGER],
  indexes: [
    INDEX_SUBSCRIPTIONS_USER,
    INDEX_SUBSCRIPTIONS_STATUS,
    INDEX_PAYMENT_LEDGER_USER,
  ],
  columns: [
    COLUMN_SUBSCRIPTIONS_TEST_MODE,
    COLUMN_SUBSCRIPTIONS_ABANDONED_AT,
    COLUMN_USERS_SUBSCRIPTION_PLAN,
    COLUMN_USERS_SUBSCRIPTION_STATUS,
    COLUMN_USERS_SUBSCRIPTION_PERIOD_END,
    COLUMN_USERS_SUBSCRIPTION_ZIINA_ID,
    COLUMN_USERS_DOWNGRADE_PLAN,
    COLUMN_USERS_DOWNGRADE_SCHEDULED_AT,
  ],
});

export const USAGE_SCHEMA = Object.freeze({
  tables: [TABLE_USAGE_COUNTERS, TABLE_USAGE_RECEIPTS, TABLE_USAGE_COMPENSATIONS],
  indexes: [
    INDEX_USAGE_PERIOD,
    INDEX_USAGE_RECEIPTS_USER,
    INDEX_USAGE_COMPENSATIONS_PENDING,
  ],
  columns: [],
});

export const ANALYTICS_SCHEMA = Object.freeze({
  tables: [TABLE_ANALYTICS_COUNTERS],
  indexes: [],
  columns: [],
});

export const SITE_ANALYTICS_SCHEMA = Object.freeze({
  tables: [
    TABLE_SITE_ANALYTICS_DAILY,
    TABLE_SITE_ANALYTICS_BREAKDOWN,
    TABLE_SITE_ANALYTICS_VISITS,
    TABLE_SITE_ANALYTICS_VISITORS,
  ],
  indexes: [
    INDEX_SITE_ANALYTICS_VISITS_SLUG_DAY,
    INDEX_SITE_ANALYTICS_VISITORS_SLUG_FIRST,
  ],
  columns: [],
});

export const HARNESS_SCHEMA = Object.freeze({
  tables: [
    TABLE_HARNESS_TASKS,
    TABLE_HARNESS_TASK_EVENTS,
    TABLE_HARNESS_TASK_LEASES,
    TABLE_HARNESS_TASK_DISPATCHES,
  ],
  indexes: [
    INDEX_HARNESS_TASKS_USER,
    INDEX_HARNESS_TASKS_SESSION,
    INDEX_HARNESS_TASKS_STATUS,
    INDEX_HARNESS_TASK_EVENTS_TASK,
    INDEX_HARNESS_TASK_DISPATCHES_PENDING,
  ],
  columns: [],
});

/** Every table in dependency order (parents before dependents). */
export const ALL_TABLES = Object.freeze([
  TABLE_USERS,
  TABLE_INVITE_CODES,
  TABLE_CHATS,
  TABLE_CHAT_MESSAGES,
  TABLE_PASSWORD_RESETS,
  TABLE_CHAT_LIST_MANUAL,
  TABLE_PROJECTS,
  TABLE_USER_MEMORIES,
  TABLE_MEMORY_MIGRATIONS,
  TABLE_SUBSCRIPTIONS,
  TABLE_PAYMENT_LEDGER,
  TABLE_USAGE_COUNTERS,
  TABLE_USAGE_RECEIPTS,
  TABLE_USAGE_COMPENSATIONS,
  TABLE_ANALYTICS_COUNTERS,
  TABLE_SITE_ANALYTICS_DAILY,
  TABLE_SITE_ANALYTICS_BREAKDOWN,
  TABLE_SITE_ANALYTICS_VISITS,
  TABLE_SITE_ANALYTICS_VISITORS,
  TABLE_HARNESS_TASKS,
  TABLE_HARNESS_TASK_EVENTS,
  TABLE_HARNESS_TASK_LEASES,
  TABLE_HARNESS_TASK_DISPATCHES,
]);

/** Every index. */
export const ALL_INDEXES = Object.freeze([
  INDEX_CHATS_USER_UPDATED,
  INDEX_MESSAGES_CHAT_CREATED,
  INDEX_CHATS_CONVERSATION_ACTIVE,
  INDEX_RESETS_TOKEN,
  INDEX_RESETS_EMAIL,
  INDEX_CHATS_PROJECT,
  INDEX_PROJECTS_USER_UPDATED,
  INDEX_USER_MEMORIES_USER_UPDATED,
  INDEX_USER_MEMORIES_USER_CATEGORY,
  INDEX_SUBSCRIPTIONS_USER,
  INDEX_SUBSCRIPTIONS_STATUS,
  INDEX_PAYMENT_LEDGER_USER,
  INDEX_USAGE_PERIOD,
  INDEX_USAGE_RECEIPTS_USER,
  INDEX_USAGE_COMPENSATIONS_PENDING,
  INDEX_SITE_ANALYTICS_VISITS_SLUG_DAY,
  INDEX_SITE_ANALYTICS_VISITORS_SLUG_FIRST,
  INDEX_HARNESS_TASKS_USER,
  INDEX_HARNESS_TASKS_SESSION,
  INDEX_HARNESS_TASKS_STATUS,
  INDEX_HARNESS_TASK_EVENTS_TASK,
  INDEX_HARNESS_TASK_DISPATCHES_PENDING,
]);

/** Every column migration, deduplicated. */
export const ALL_COLUMNS = Object.freeze([
  COLUMN_USERS_PLAN,
  COLUMN_USERS_SUBSCRIPTION_STATUS,
  COLUMN_USERS_TERMS_VERSION,
  COLUMN_USERS_TERMS_ACCEPTED_AT,
  COLUMN_USERS_MARKETING_CONSENT,
  COLUMN_USERS_PASSWORD_CHANGED_AT,
  COLUMN_PASSWORD_RESETS_USER_ID,
  COLUMN_CHATS_PROJECT_ID,
  COLUMN_CHATS_PINNED_AT,
  COLUMN_CHATS_SORT_ORDER,
  COLUMN_CHATS_CHAT_MODE,
  COLUMN_CHATS_PERSONAS,
  COLUMN_CHATS_LAST_USER_AT,
  COLUMN_CHATS_TITLE_UPDATED_AT,
  COLUMN_MESSAGES_TURN_ID,
  COLUMN_MESSAGES_SPEAKER_ID,
  COLUMN_MESSAGES_SPEAKER_NAME,
  COLUMN_MESSAGES_MODEL_ID,
  COLUMN_SUBSCRIPTIONS_TEST_MODE,
  COLUMN_SUBSCRIPTIONS_ABANDONED_AT,
  COLUMN_USERS_SUBSCRIPTION_PLAN,
  COLUMN_USERS_SUBSCRIPTION_PERIOD_END,
  COLUMN_USERS_SUBSCRIPTION_ZIINA_ID,
  COLUMN_USERS_DOWNGRADE_PLAN,
  COLUMN_USERS_DOWNGRADE_SCHEDULED_AT,
]);

// ---------------------------------------------------------------------------
// Full bootstrap — every table, index and column in one idempotent pass.
// For tooling, tests and fresh installs. Request-path code keeps using the
// per-feature ensure* wrappers (cheaper: each touches only its own tables).
// ---------------------------------------------------------------------------
const fullSchemaReady = new WeakMap();

export async function ensureDbSchema(env) {
  if (!env?.DB) return false;
  const cached = fullSchemaReady.get(env.DB);
  if (cached) return cached;
  const ready = (async () => {
    const db = env.DB;
    const run = (sql) => db.prepare(sql).run();
    await Promise.all(ALL_TABLES.map(run));
    await Promise.all(ALL_INDEXES.map(run));
    await Promise.allSettled(ALL_COLUMNS.map(run));
    return true;
  })();
  fullSchemaReady.set(env.DB, ready);
  try {
    return await ready;
  } catch {
    fullSchemaReady.delete(env.DB);
    return false;
  }
}
