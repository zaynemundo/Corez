/**
 * Small SQLite-backed read cache.
 *
 * Chat history is server-authoritative; this cache exists so the app can open
 * with the last-known conversation list and messages when the network is down,
 * clearly marked as an offline copy. It is best-effort: a missing or broken
 * database degrades to "no cache" and never breaks a request.
 */
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

const DB_NAME = "corez-cache.db";

let db: SQLiteDatabase | null = null;
let unavailable = false;

function getDb(): SQLiteDatabase | null {
  if (unavailable) return null;
  if (db) return db;
  try {
    const opened = openDatabaseSync(DB_NAME);
    opened.execSync(
      "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL);",
    );
    db = opened;
    return db;
  } catch {
    unavailable = true;
    return null;
  }
}

export interface CachedEntry<T> {
  value: T;
  updatedAt: number;
}

export function readCache<T>(key: string): CachedEntry<T> | null {
  try {
    const row = getDb()?.getFirstSync<{ value: string; updated_at: number }>(
      "SELECT value, updated_at FROM cache WHERE key = ?",
      key,
    );
    if (!row) return null;
    return {
      value: JSON.parse(row.value) as T,
      updatedAt: Number(row.updated_at) || 0,
    };
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  try {
    getDb()?.runSync(
      "INSERT OR REPLACE INTO cache (key, value, updated_at) VALUES (?, ?, ?)",
      key,
      JSON.stringify(value),
      Date.now(),
    );
  } catch {
    // Caching is an optimisation; a write failure must not affect the caller.
  }
}

export function removeCache(key: string): void {
  try {
    getDb()?.runSync("DELETE FROM cache WHERE key = ?", key);
  } catch {
    // Ignore.
  }
}

export function clearCache(): void {
  try {
    getDb()?.runSync("DELETE FROM cache");
  } catch {
    // Ignore.
  }
}
