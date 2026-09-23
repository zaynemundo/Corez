---
name: d1-schema-migrations
description: Use when adding or changing a D1 table, column, index or constraint, writing a migration, inspecting or querying the remote database, or debugging a "no such column" / "no such table" error in production. Not for query performance and index design - use `backend-architecture`; not for the plan and billing columns themselves - use `payments-billing`.
---

# D1 Schema & Migrations

## When to use

- Adding a table, column, index or constraint to the D1 database.
- Inspecting or querying the **remote** database while debugging.
- A production `no such column` / `no such table` error that works locally.
- Deciding where a table should be created.

## When not to use

- Index design and query performance - `backend-architecture`.
- The plan/subscription columns specifically - `payments-billing`.
- Deploying the Worker itself - `wrangler`.

## The binding

| Property | Value |
| --- | --- |
| Binding | `env.DB` |
| Database | `corez-auth` |
| Declared in | `wrangler.jsonc` (`d1_databases`) |

There is exactly one database. Always reach it through `env.DB` inside the
Worker; never hard-code the database name in Worker code.

## `worker/schema.sql` is NOT the whole schema

This is the trap that costs the most time. `worker/schema.sql` describes only a
subset (users, invite codes, chats, chat messages, password resets). The real
production schema is created **at runtime** by `ensure*` functions that each run
their own idempotent DDL:

- `worker/auth.js` → `users` (+ plan/subscription/consent columns), `invite_codes`, `chats`, `chat_messages`, `password_resets`
- `worker/subscriptions.js` → `subscriptions` + `users.subscription_*`
- `worker/usage.js` → usage counters
- `worker/analytics.js` → the analytics table
- `worker/customDomains.js` → domain records

So **grep for `CREATE TABLE IF NOT EXISTS` before concluding a table does not
exist**, and add a new table to the `ensure*` function for its feature rather
than only to `schema.sql`.

## Adding a column safely

The established pattern is an idempotent `CREATE TABLE` plus a `try/catch`
`ALTER TABLE` per column, because SQLite has no `ADD COLUMN IF NOT EXISTS`:

```js
try {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS users (... plan TEXT DEFAULT 'free')`,
  ).run();
} catch {}
// Migrate tables created before the column existed.
try {
  await env.DB.prepare(
    `ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'`,
  ).run();
} catch {}
```

Notes that matter:

- The `catch {}` is deliberate, not sloppy: a second run fails with "duplicate
  column name" and must be ignored. Do not log it as an error.
- Reads must tolerate the column being absent - callers fall back when a value
  is missing rather than throwing.
- Give every new column a default, or old rows become `NULL` and every reader
  needs a null branch.

## Querying the remote database

```bash
# One-off query (add --json for machine-readable output)
node_modules/.bin/wrangler d1 execute corez-auth --remote --command "SELECT ..."

# Run a .sql file
node_modules/.bin/wrangler d1 execute corez-auth --remote --file=path/to.sql
```

Two behaviours that waste time if you do not know them:

- **`--file` returns only a summary**, not the selected rows. To see rows you
  must use `--command` per statement.
- **PowerShell mangles inline SQL** containing `*`, quotes or `$` (the shell
  expands them before wrangler sees the string), and a `>` redirect writes
  UTF-16 which `JSON.parse` then rejects. Write the SQL to a file and invoke
  wrangler from Node with array arguments instead - both verify scripts in
  `git log` for the deploy verification do exactly this. Prefer `COUNT(1)` over
  `COUNT(*)` when a shell is involved.
- `--local` targets the dev database; a query that "returns nothing" is often
  answered by the wrong one.

## Rules

- **Never** drop or recreate a production table to change its shape. Add
  columns and backfill.
- Migrations run on request path - keep them cheap and idempotent; a full table
  scan on every request is a performance bug.
- Deleting a user does not cascade to every feature table. If a feature stores
  per-user rows, clean them up explicitly. `users` has
  `ON DELETE CASCADE` for `chats` and `chat_messages` only.

## Verification

```bash
npx vitest run tests/project-state.test.js tests/chat-e2e.test.js
```

For a schema change also confirm the runtime bootstrap works from scratch: the
table must be created by the `ensure*` path, not only by an out-of-band command
you ran manually.

## Related skills

- `backend-architecture` - query shape and index design.
- `payments-billing` / `usage-metering` - the tables those features own.
- `wrangler` - CLI syntax and non-D1 commands.
