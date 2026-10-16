// Layout-consistency guard for the storage cleanup:
// - worker/dbSchema.js is the canonical DDL: every runtime table/index/column
//   must have its counterpart in worker/schema.sql (fresh-install bootstrap).
// - worker/storageKeys.js owns R2 key construction; worker/publishStore.js
//   owns publish/asset resolution. Both modules must keep their exports so a
//   refactor cannot silently drop a layout branch.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ALL_TABLES,
  ALL_INDEXES,
  ALL_COLUMNS,
} from '../worker/dbSchema.js';
import * as storageKeys from '../worker/storageKeys.js';
import * as publishStore from '../worker/publishStore.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(join(here, '..', 'worker', 'schema.sql'), 'utf8');

function tableName(createTable) {
  const match = createTable.match(/CREATE TABLE IF NOT EXISTS\s+(\S+)/);
  return match ? match[1] : null;
}

function indexName(createIndex) {
  const match = createIndex.match(/CREATE INDEX IF NOT EXISTS\s+(\S+)/);
  return match ? match[1] : null;
}

function alterTarget(alter) {
  const match = alter.match(/ALTER TABLE\s+(\S+)\s+ADD COLUMN\s+(\S+)/);
  return match ? { table: match[1], column: match[2] } : null;
}

function createTableLine(sql, table) {
  const line = sql
    .split('\n')
    .find((l) => l.includes(`CREATE TABLE IF NOT EXISTS ${table} `) || l.includes(`CREATE TABLE IF NOT EXISTS ${table}(`));
  return line || null;
}

describe('storage layout consistency', () => {
  it('every runtime table exists in schema.sql', () => {
    expect(ALL_TABLES.length).toBeGreaterThan(0);
    for (const ddl of ALL_TABLES) {
      const table = tableName(ddl);
      expect(table, `table name parses from: ${ddl.slice(0, 60)}`).toBeTruthy();
      expect(createTableLine(schemaSql, table), `schema.sql defines ${table}`).toBeTruthy();
    }
  });

  it('every runtime index exists in schema.sql', () => {
    expect(ALL_INDEXES.length).toBeGreaterThan(0);
    for (const ddl of ALL_INDEXES) {
      const index = indexName(ddl);
      expect(index, `index name parses from: ${ddl.slice(0, 60)}`).toBeTruthy();
      expect(schemaSql.includes(index), `schema.sql defines ${index}`).toBe(true);
    }
  });

  it('every runtime column migration is present inline in schema.sql', () => {
    expect(ALL_COLUMNS.length).toBeGreaterThan(0);
    for (const alter of ALL_COLUMNS) {
      const target = alterTarget(alter);
      expect(target, `alter parses: ${alter}`).toBeTruthy();
      const line = createTableLine(schemaSql, target.table);
      expect(line, `schema.sql defines ${target.table}`).toBeTruthy();
      expect(line.includes(target.column), `schema.sql ${target.table} includes ${target.column}`).toBe(true);
    }
  });

  it('documents the no-cascade decision honestly', () => {
    const chats = createTableLine(schemaSql, 'chats');
    expect(chats.includes('FOREIGN KEY')).toBe(false);
    const messages = createTableLine(schemaSql, 'chat_messages');
    expect(messages.includes('FOREIGN KEY(chat_id)')).toBe(true);
  });

  it('keeps the R2 key helpers and publish resolvers exported', () => {
    for (const name of [
      'userAssetKey', 'userAppKey', 'userAppPrefix', 'userMemoryKey',
      'userMemoryPrefix', 'userContextKey', 'userContextIndexKey',
      'userTaskKey', 'userTaskEventsKey', 'userTaskLeaseKey',
      'userTaskSessionKey', 'userTaskPrefix', 'userCorezTaskKey',
      'userPublishKey', 'userPublishPrefix', 'userDomainKey',
      'legacyPublishKey', 'assetPubMarkerKey', 'getWithFallback',
      'listWithFallback',
    ]) {
      expect(typeof storageKeys[name], `storageKeys exports ${name}`).toBe('function');
    }
    for (const name of [
      'resolvePublishRecord', 'readPublishRecord', 'writePublishRecord',
      'deletePublishRecord', 'resolveAsset', 'isAssetPublished',
      'scanPublishRecords', 'listUserPublishRecords', 'publishRecordSummary',
      'extractReferencedAssetKeys', 'generatePublishSlug',
    ]) {
      expect(typeof publishStore[name], `publishStore exports ${name}`).toBe('function');
    }
  });
});
