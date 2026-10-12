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
      return {
        bind(...values) {
          params = values;
          return this;
        },
        async run() {
          statement = statement || db.prepare(sql);
          const result = statement.run(...params);
          return {
            success: true,
            meta: {
              changes: Number(result.changes),
              last_row_id: Number(result.lastInsertRowid)
            }
          };
        },
        async all() {
          statement = statement || db.prepare(sql);
          return { success: true, results: statement.all(...params), meta: {} };
        },
        async first() {
          statement = statement || db.prepare(sql);
          return statement.get(...params) ?? null;
        }
      };
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    }
  };
}
