-- CoreZ D1 schema — complete fresh-install bootstrap for the `corez-auth`
-- database (see wrangler.jsonc `d1_databases`).
--
-- This file and worker/dbSchema.js describe the SAME schema: every table,
-- index and column here must have its counterpart there (enforced by
-- tests/db-schema-layout.test.js). If they ever disagree, dbSchema.js wins:
-- the runtime `ensure*` path (auth, chats, projects, memory, subscriptions,
-- usage, analytics, D1TaskStore) is what actually builds a deployed
-- database, because D1 has no migration runner — each feature creates what
-- it needs, idempotently, on first request.
--
-- Fresh databases bootstrapped from THIS file get the final shape inline
-- (all columns present); the runtime path reaches the identical shape via
-- CREATE TABLE plus idempotent ALTER TABLE migrations. Either way:
--
-- - No FOREIGN KEY clauses are relied upon. `chat_messages` names its
--   parent for documentation, but D1 does not enforce foreign keys, so
--   per-user cleanup is explicit work in code (chats.js, projects.js),
--   never an inherited CASCADE guarantee.
-- - R2-backed records (published pages, domains, assets, apps, memories,
--   tasks) are NOT D1 tables at all: their layout lives in
--   worker/storageKeys.js under users/<uid>/ folders.

-- Accounts and access -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT, provider TEXT DEFAULT 'local', google_id TEXT, created_at INTEGER NOT NULL, plan TEXT DEFAULT 'free', subscription_status TEXT DEFAULT 'active', terms_version TEXT, terms_accepted_at INTEGER, marketing_consent INTEGER DEFAULT 0, password_changed_at INTEGER, subscription_plan TEXT DEFAULT 'free', subscription_period_end INTEGER, subscription_ziina_id TEXT, downgrade_plan TEXT, downgrade_scheduled_at INTEGER);
CREATE TABLE IF NOT EXISTS invite_codes (code TEXT PRIMARY KEY, used_by TEXT, used_at INTEGER, max_uses INTEGER DEFAULT 1, uses INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS password_resets (id TEXT PRIMARY KEY, email TEXT NOT NULL, token TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL, used INTEGER DEFAULT 0, created_at INTEGER NOT NULL, user_id TEXT);
CREATE INDEX IF NOT EXISTS idx_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_resets_email ON password_resets(email);

-- Chats, folders and sidebar order ------------------------------------------
CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'New Conversation', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, project_id TEXT, pinned_at INTEGER, sort_order REAL);
CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, attachments TEXT, created_at INTEGER NOT NULL, FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS chat_list_manual (user_id TEXT NOT NULL, list_key TEXT NOT NULL, PRIMARY KEY (user_id, list_key));
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_chats_user_updated ON chats(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON chat_messages(chat_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC);

-- Long-term memory -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_memories (user_id TEXT NOT NULL, key TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general', text TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, key));
CREATE TABLE IF NOT EXISTS memory_migrations (user_id TEXT PRIMARY KEY, migrated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_user_memories_user_updated ON user_memories(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_memories_user_category ON user_memories(user_id, category);

-- Subscriptions and payment ledger -------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT NOT NULL, amount INTEGER NOT NULL, currency_code TEXT NOT NULL DEFAULT 'AED', status TEXT NOT NULL DEFAULT 'pending', period_start INTEGER, period_end INTEGER, ziina_payment_id TEXT, test_mode INTEGER NOT NULL DEFAULT 0, abandoned_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS payment_ledger (payment_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0, currency_code TEXT NOT NULL DEFAULT 'AED', interval TEXT NOT NULL DEFAULT 'month', status TEXT NOT NULL DEFAULT 'processing', claim_token TEXT, subscription_id TEXT, period_start INTEGER, period_end INTEGER, test_mode INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_user ON payment_ledger(user_id, created_at DESC);

-- Usage metering ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_counters (user_id TEXT NOT NULL, period TEXT NOT NULL, metric TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, period, metric));
CREATE TABLE IF NOT EXISTS usage_receipts (receipt_key TEXT PRIMARY KEY, user_id TEXT NOT NULL, period TEXT NOT NULL, metric TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS usage_compensations (compensation_key TEXT PRIMARY KEY, user_id TEXT NOT NULL, period TEXT NOT NULL, metric TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_usage_period ON usage_counters(period);
CREATE INDEX IF NOT EXISTS idx_usage_receipts_user ON usage_receipts(user_id, period);
CREATE INDEX IF NOT EXISTS idx_usage_compensations_pending ON usage_compensations(user_id, period, status);

-- Analytics --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_counters (day TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, country TEXT NOT NULL, device TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name, path, country, device));

-- Published-site traffic (see worker/siteAnalytics.js) -------------------------
-- Page counts are anonymous; visitor identity is a truncated HMAC fingerprint
-- in separate tables so it can be pruned without touching the totals.
CREATE TABLE IF NOT EXISTS site_analytics_daily (
       site_slug TEXT NOT NULL,
       day TEXT NOT NULL,
       page TEXT NOT NULL,
       views INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (site_slug, day, page)
     );
CREATE TABLE IF NOT EXISTS site_analytics_breakdown (
       site_slug TEXT NOT NULL,
       day TEXT NOT NULL,
       dimension TEXT NOT NULL,
       value TEXT NOT NULL,
       views INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (site_slug, day, dimension, value)
     );
CREATE TABLE IF NOT EXISTS site_analytics_visits (
       site_slug TEXT NOT NULL,
       visitor_key TEXT NOT NULL,
       day TEXT NOT NULL,
       PRIMARY KEY (site_slug, visitor_key, day)
     );
CREATE TABLE IF NOT EXISTS site_analytics_visitors (
       site_slug TEXT NOT NULL,
       visitor_key TEXT NOT NULL,
       first_day TEXT NOT NULL,
       last_day TEXT NOT NULL,
       PRIMARY KEY (site_slug, visitor_key)
     );
CREATE INDEX IF NOT EXISTS idx_site_analytics_visits_slug_day ON site_analytics_visits(site_slug, day);
CREATE INDEX IF NOT EXISTS idx_site_analytics_visitors_slug_first ON site_analytics_visitors(site_slug, first_day);

-- Agent harness tasks (atomic leases + ordered events + dispatch outbox) ---------
CREATE TABLE IF NOT EXISTS harness_tasks (task_id TEXT PRIMARY KEY, user_id TEXT, session_id TEXT, status TEXT NOT NULL, doc TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, terminal_at INTEGER);
CREATE TABLE IF NOT EXISTS harness_task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS harness_task_leases (task_id TEXT PRIMARY KEY, holder TEXT NOT NULL, expires_at INTEGER NOT NULL, acquired_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS harness_task_dispatches (task_id TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_harness_tasks_user ON harness_tasks (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_harness_tasks_session ON harness_tasks (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_harness_tasks_status ON harness_tasks (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_harness_task_events_task ON harness_task_events (task_id, id);
CREATE INDEX IF NOT EXISTS idx_harness_task_dispatches_pending ON harness_task_dispatches (next_attempt_at);

-- Open signup seed (kept for backward compat; invite codes are optional) ---------
INSERT OR IGNORE INTO invite_codes (code) VALUES ('COREZ-INVITE-2026');
