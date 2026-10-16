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
- Deploying the Worker itself - `cloudflare-platform`.

## The binding

| Property | Value |
| --- | --- |
| Binding | `env.DB` |
| Database | `corez-auth` |
| Declared in | `wrangler.jsonc` (`d1_databases`) |

There is exactly one database. Always reach it through `env.DB` inside the
Worker; never hard-code the database name in Worker code.

## `worker/schema.sql` and `worker/dbSchema.js` are the whole schema

`worker/dbSchema.js` is the canonical DDL: every `CREATE TABLE`, `CREATE
INDEX` and `ALTER TABLE ... ADD COLUMN` the runtime bootstraps lives there
exactly once, grouped by feature section (`AUTH_SCHEMA`, `CHATS_SCHEMA`,
`PROJECTS_SCHEMA`, `MEMORY_SCHEMA`, `SUBSCRIPTIONS_SCHEMA`, `USAGE_SCHEMA`,
`ANALYTICS_SCHEMA`, `HARNESS_SCHEMA`). Each feature's `ensure*` function
imports its section's statement strings but keeps its own control flow
(caching, parallelism, error handling), so behavior is unchanged — only the
SQL text moved. `worker/schema.sql` is the complete fresh-install bootstrap
generated from the same statements (kept in sync by
`tests/db-schema-layout.test.js`), and `ensureDbSchema(env)` runs the whole
thing in one idempotent pass for tooling and tests.

Before this cleanup, each `ensure*` carried its own copy of the DDL and three
definitions of `chats` / `chat_messages` disagreed. The reconciled rule:
`chat_messages` names `FOREIGN KEY(chat_id)` (documentation only),
`chats` carries no FOREIGN KEY clause. If `schema.sql` and `dbSchema.js`
ever disagree, `dbSchema.js` wins: the runtime `ensure*` path is what
actually builds a deployed database.

Not every persisted record is D1: published pages, domains, assets, apps,
memories and tasks live as **R2 objects** under `users/<uid>/` folders
(`worker/storageKeys.js` builds the keys, `worker/publishStore.js` owns
publish/asset resolution), deliberately, so lookups stay direct `get()`s
rather than queries. Do not add a D1 table for a feature that already
persists to R2.

So **check `worker/dbSchema.js` before concluding a table does not exist**,
and add a new table to its feature section (plus `worker/schema.sql`) rather
than inlining a third copy of the SQL.

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
  per-user rows, clean them up explicitly.
- **Do not assume CASCADE exists at all.** `worker/schema.sql` and
  `worker/dbSchema.js` name `FOREIGN KEY(chat_id)` on `chat_messages` as
  documentation, but D1 does not enforce foreign keys and every chat delete
  removes its messages explicitly first. Treat per-user cleanup as explicit
  work, never as an inherited guarantee, and check the live table definition
  before relying on it.

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
- `cloudflare-platform` - wrangler CLI syntax, bindings, and non-D1 commands.
