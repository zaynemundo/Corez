// Context records: durable storage of exact compacted conversation state.
//
// Honesty contract: the server save is awaited before `persisted: true` is
// returned; a failed save reports `persisted: false` and never claims durable
// retrieval. localStorage may only serve as a lightweight resume handle.
// Compaction is payload/token-aware, not a fixed item count, and the exact
// records remain retrievable by id — a summary is never the only source.

export const CONTEXT_BUDGET_BYTES = 60_000;
export const CONTEXT_BUDGET_TOKENS = 16_000;

export function estimateTokens(text) {
  return Math.ceil((text?.length || 0) / 3.2);
}

// Compact `messages` until the serialized payload fits the budget. Exact
// messages are dropped only from the oldest end, and the dropped tail is
// returned as the `compacted` evidence. Everything retained stays exact.
export function compactMessages(messages, { maxBytes = CONTEXT_BUDGET_BYTES, maxTokens = CONTEXT_BUDGET_TOKENS } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { kept: [], dropped: [], compacted: false, bytes: 0, tokens: 0 };
  }
  const kept = [...messages];
  const dropped = [];
  while (kept.length > 1) {
    const serialized = JSON.stringify(kept);
    const bytes = Buffer.byteLength(serialized, 'utf8');
    const tokens = estimateTokens(serialized);
    if (bytes <= maxBytes && tokens <= maxTokens) {
      return { kept, dropped, compacted: dropped.length > 0, bytes, tokens };
    }
    const oldest = kept.shift();
    dropped.push(oldest);
  }
  const serialized = JSON.stringify(kept);
  return {
    kept,
    dropped,
    compacted: dropped.length > 0,
    bytes: Buffer.byteLength(serialized, 'utf8'),
    tokens: estimateTokens(serialized)
  };
}

// Bucket adapter contract: { get(key), put(key, value), list({prefix}), delete(key) }.
// The worker wires env.ASSET_BUCKET; tests can use a memory adapter.
//
// Per-user folder layout (worker/storageKeys.js is the canonical scheme):
// new writes land under users/<uid>/..., reads fall back to the legacy
// flat keys (context/<id>.json, context-index/<uid>/<session>.json) so
// pre-move records keep working with no migration.
import {
  userContextKey,
  userContextIndexKey,
  legacyContextKey,
  legacyContextIndexKey,
  getWithFallback,
} from '../../../worker/storageKeys.js';

export class ContextStore {
  constructor({ bucket } = {}) {
    this.bucket = bucket;
  }

  get available() {
    return Boolean(this.bucket && typeof this.bucket.get === 'function' && typeof this.bucket.put === 'function');
  }

  #key(recordId, userId) {
    if (userId !== null && userId !== undefined) {
      return userContextKey(userId, recordId);
    }
    return legacyContextKey(recordId);
  }

  #legacyKey(recordId) {
    return legacyContextKey(recordId);
  }

  #indexKey(userId, sessionId) {
    return userContextIndexKey(userId, sessionId);
  }

  #legacyIndexKey(userId, sessionId) {
    return legacyContextIndexKey(userId, sessionId);
  }

  async #getJson(key) {
    if (!key) return null;
    const object = await this.bucket.get(key);
    if (!object) return null;
    try {
      return JSON.parse(await object.text());
    } catch {
      return null;
    }
  }

  async #getJsonWithFallback(userKey, legacyKey) {
    const { object } = await getWithFallback(this.bucket, userKey, legacyKey);
    if (!object) return null;
    try {
      return JSON.parse(await object.text());
    } catch {
      return null;
    }
  }

  async #putJson(key, value) {
    await this.bucket.put(key, JSON.stringify(value), {
      httpMetadata: { contentType: 'application/json' }
    });
  }

  // Saves a context record. Returns { persisted, recordId, compacted, reason }
  // — persisted is true ONLY after the server write succeeded.
  async save({ userId, sessionId, messages, recordId = null, summary = null, maxBytes, maxTokens } = {}) {
    if (!this.available) {
      return { persisted: false, recordId: null, compacted: false, reason: 'No storage bucket is configured.' };
    }
    const compaction = compactMessages(messages, { maxBytes, maxTokens });
    const id = recordId || `ctx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      recordId: id,
      userId,
      sessionId: sessionId || null,
      messages: compaction.kept,
      summary: summary || null,
      droppedCount: compaction.dropped.length,
      compacted: compaction.compacted,
      createdAt: new Date().toISOString()
    };
    try {
      await this.#putJson(this.#key(id, userId), record);
      // Index update is best-effort; the record itself is the source of truth.
      // New per-user index first; legacy index is left untouched (reads merge).
      const index = (await this.#getJsonWithFallback(
        this.#indexKey(userId, sessionId),
        this.#legacyIndexKey(userId, sessionId),
      )) || { recordIds: [] };
      if (!index.recordIds.includes(id)) {
        index.recordIds.push(id);
        index.recordIds = index.recordIds.slice(-100);
      }
      await this.#putJson(this.#indexKey(userId, sessionId), index);
      return { persisted: true, recordId: id, compacted: compaction.compacted, droppedCount: compaction.dropped.length };
    } catch (err) {
      return { persisted: false, recordId: null, compacted: compaction.compacted, reason: err?.message || 'storage failure' };
    }
  }

  async get(recordId, { userId = null } = {}) {
    if (!this.available) return null;
    const record = userId !== null && userId !== undefined
      ? await this.#getJsonWithFallback(this.#key(recordId, userId), this.#legacyKey(recordId))
      : await this.#getJson(this.#legacyKey(recordId));
    if (record) {
      if (userId !== null && userId !== undefined && record.userId !== userId) {
        const forbidden = new Error('Access denied: this context record belongs to another user.');
        forbidden.status = 403;
        throw forbidden;
      }
      return record;
    }
    // Miss in both the caller's folder and the legacy prefix: the id may
    // belong to another user's folder. A bounded scan distinguishes "exists
    // but not yours" (403, same contract as the flat layout) from a true
    // miss (null). Only runs on the miss path.
    if (userId !== null && userId !== undefined && this.bucket && typeof this.bucket.list === 'function') {
      try {
        const suffix = `context/${safeSegment(recordId, 'ctx')}.json`;
        const listing = await this.bucket.list({ prefix: 'users/', limit: 1000 });
        for (const obj of listing?.objects || []) {
          if (!obj.key.endsWith(suffix)) continue;
          const other = await this.#getJson(obj.key);
          if (other && other.recordId === recordId && other.userId !== userId) {
            const forbidden = new Error('Access denied: this context record belongs to another user.');
            forbidden.status = 403;
            throw forbidden;
          }
          if (other && other.recordId === recordId) return other;
        }
      } catch (err) {
        if (err?.status === 403) throw err;
        // scan failures behave as a miss
      }
    }
    return null;
  }

  async list({ userId, sessionId, limit = 20 } = {}) {
    if (!this.available) return [];
    const index = await this.#getJsonWithFallback(
      this.#indexKey(userId, sessionId),
      this.#legacyIndexKey(userId, sessionId),
    );
    const ids = (index?.recordIds || []).slice(-limit);
    const records = [];
    for (const id of ids) {
      const record = await this.#getJsonWithFallback(this.#key(id, userId), this.#legacyKey(id));
      if (record && record.userId === userId) records.push(record);
    }
    return records;
  }
}

function safeSegment(value) {
  return String(value || 'ctx').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
}
