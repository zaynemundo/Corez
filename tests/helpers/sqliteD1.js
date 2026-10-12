// A D1-shaped adapter over real SQLite (node:sqlite) for store tests.
//
// Real D1 validates SQL when a statement executes; node:sqlite validates at
// prepare time. Statements are therefore compiled lazily on first execution,
// so a CREATE INDEX prepared before its CREATE TABLE still runs in order.
import { DatabaseSync } from 'node:sqlite';

export function createSqliteD1() {
  const db = new DatabaseSync(':memory:');
  return {
    __sqlite: db,
    prepare(sql) {
      let statement = null;
      let params = [];
      const compile = () => {
        statement = statement || db.prepare(sql);
        return statement;
      };
      // Synchronous execution, used by batch so a transaction cannot be
      // interleaved by another caller's awaits on the same connection.
      const runSync = () => {
        const result = compile().run(...params);
        return {
          success: true,
          meta: {
            changes: Number(result.changes),
            last_row_id: Number(result.lastInsertRowid)
          }
        };
      };
      return {
        __runSync: runSync,
        bind(...values) {
          params = values;
          return this;
        },
        async run() {
          return runSync();
        },
        async all() {
          return { success: true, results: compile().all(...params), meta: {} };
        },
        async first() {
          return compile().get(...params) ?? null;
        }
      };
    },
    // D1 executes a batch as ONE transaction, so a statement that fails rolls
    // back every statement before it. Mirroring that is what lets a partial
    // multi-statement write be caught in tests instead of only in production.
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.__runSync());
        db.exec('COMMIT');
        return results;
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw err;
      }
    }
  };
}
