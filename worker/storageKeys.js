/**
 * Per-user R2 folder layout — single canonical copy of the key scheme.
 *
 * Every user's objects live under their own folder so the bucket stays
 * organized and listings are cheap (prefix scan per user, never a full
 * bucket scan filtered in memory):
 *
 *   users/<uid>/assets/<key>
 *   users/<uid>/apps/<sessionId>/<appId>.json
 *   users/<uid>/memory/<key>.json
 *   users/<uid>/context/<recordId>.json
 *   users/<uid>/context-index/<sessionId>.json
 *   users/<uid>/tasks/<taskId>.json (+ .events.json / .lease.json / .session.json)
 *   users/<uid>/corez-tasks/<taskId>.json
 *   users/<uid>/publish/<slug>.json
 *   users/<uid>/domains/<hostname>.json
 *
 * Global pointer records (tiny routing files, not user data) stay at the
 * well-known flat locations so public URLs keep working without knowing the
 * owner up front:
 *
 *   publish/<slug>.json        -> { ownerUid, slug } pointer (legacy: full record)
 *   domains/<hostname>.json    -> { ownerUid, hostname } pointer (legacy: full record)
 *   asset-pub/<assetKey>       -> ownerUid text (legacy: "1")
 *
 * All readers try the per-user key first and fall back to the legacy flat
 * key, so data written before the move keeps working with no migration.
 */

export const USERS_PREFIX = "users/";

export const LEGACY_PREFIXES = Object.freeze({
  apps: "apps/",
  memory: "memory/",
  context: "context/",
  contextIndex: "context-index/",
  tasks: "tasks/",
  corezTasks: "corez-tasks/",
  publish: "publish/",
  domains: "domains/",
  assetPub: "asset-pub/",
  taskStatus: "task-status/",
  retry: "retry/",
});

export function safeSegment(value, fallback = "unknown") {
  const cleaned = String(value ?? fallback)
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 200);
  return cleaned || fallback;
}

export function safeUserId(value) {
  return safeSegment(value, "dev");
}

export function userFolder(userId) {
  return `${USERS_PREFIX}${safeUserId(userId)}/`;
}

// ---- per-user keys (new canonical locations) ----

export function userAssetKey(userId, assetKey) {
  return `${userFolder(userId)}assets/${safeSegment(assetKey)}`;
}

export function userAppKey(userId, sessionId, appId) {
  return `${userFolder(userId)}apps/${safeSegment(sessionId)}/${safeSegment(appId)}.json`;
}

export function userAppPrefix(userId, sessionId) {
  return `${userFolder(userId)}apps/${safeSegment(sessionId)}/`;
}

export function userMemoryKey(userId, key) {
  return `${userFolder(userId)}memory/${safeSegment(key)}.json`;
}

export function userMemoryPrefix(userId) {
  return `${userFolder(userId)}memory/`;
}

export function userContextKey(userId, recordId) {
  // recordId is part of the key namespace, not a validated segment:
  // reuse safeSegment so legacy ids with colons still resolve.
  return `${userFolder(userId)}context/${safeSegment(recordId, "ctx")}.json`;
}

export function userContextIndexKey(userId, sessionId) {
  return `${userFolder(userId)}context-index/${safeSegment(sessionId || "default", "default")}.json`;
}

export function userTaskKey(userId, taskId) {
  return `${userFolder(userId)}tasks/${safeSegment(taskId)}.json`;
}

export function userTaskEventsKey(userId, taskId) {
  return `${userFolder(userId)}tasks/${safeSegment(taskId)}.events.json`;
}

export function userTaskLeaseKey(userId, taskId) {
  return `${userFolder(userId)}tasks/${safeSegment(taskId)}.lease.json`;
}

export function userTaskSessionKey(userId, taskId) {
  return `${userFolder(userId)}tasks/${safeSegment(taskId)}.session.json`;
}

export function userTaskPrefix(userId) {
  return `${userFolder(userId)}tasks/`;
}

export function userCorezTaskKey(userId, taskId) {
  return `${userFolder(userId)}corez-tasks/${safeSegment(taskId, "task")}.json`;
}

export function userPublishKey(userId, slug) {
  return `${userFolder(userId)}publish/${safeSegment(slug)}.json`;
}

export function userPublishPrefix(userId) {
  return `${userFolder(userId)}publish/`;
}

export function userDomainKey(userId, hostname) {
  return `${userFolder(userId)}domains/${safeSegment(hostname, "invalid")}.json`;
}

export function userDomainPrefix(userId) {
  return `${userFolder(userId)}domains/`;
}

// ---- legacy flat keys (pre-move locations, kept as read fallback) ----

export function legacyAppKey(userId, sessionId, appId) {
  return `${LEGACY_PREFIXES.apps}${safeUserId(userId)}/${safeSegment(sessionId)}/${safeSegment(appId)}.json`;
}

export function legacyAppPrefix(userId, sessionId) {
  return `${LEGACY_PREFIXES.apps}${safeUserId(userId)}/${safeSegment(sessionId)}/`;
}

export function legacyMemoryKey(userId, key) {
  return `${LEGACY_PREFIXES.memory}${safeUserId(userId)}/${safeSegment(key)}.json`;
}

export function legacyMemoryPrefix(userId) {
  return `${LEGACY_PREFIXES.memory}${safeUserId(userId)}/`;
}

export function legacyContextKey(recordId) {
  return `${LEGACY_PREFIXES.context}${safeSegment(recordId, "ctx")}.json`;
}

export function legacyContextIndexKey(userId, sessionId) {
  return `${LEGACY_PREFIXES.contextIndex}${safeUserId(userId)}/${safeSegment(sessionId || "default", "default")}.json`;
}

export function legacyTaskKey(taskId) {
  return `${LEGACY_PREFIXES.tasks}${safeSegment(taskId)}.json`;
}

export function legacyTaskEventsKey(taskId) {
  return `${LEGACY_PREFIXES.tasks}${safeSegment(taskId)}.events.json`;
}

export function legacyTaskLeaseKey(taskId) {
  return `${LEGACY_PREFIXES.tasks}${safeSegment(taskId)}.lease.json`;
}

export function legacyTaskSessionKey(taskId) {
  return `${LEGACY_PREFIXES.tasks}${safeSegment(taskId)}.session.json`;
}

export function legacyCorezTaskKey(taskId) {
  return `${LEGACY_PREFIXES.corezTasks}${safeSegment(taskId, "task")}.json`;
}

export function legacyPublishKey(slug) {
  return `${LEGACY_PREFIXES.publish}${safeSegment(slug)}.json`;
}

export function legacyDomainKey(hostname) {
  return `${LEGACY_PREFIXES.domains}${safeSegment(hostname, "invalid")}.json`;
}

export function assetPubMarkerKey(assetKey) {
  return `${LEGACY_PREFIXES.assetPub}${safeSegment(assetKey)}`;
}

/**
 * Read helper: try per-user keys first, then legacy fallbacks.
 * Returns { object, key, location: 'user' | 'legacy' } or { object: null }.
 */
export async function getWithFallback(bucket, userKey, legacyKey) {
  if (!bucket || typeof bucket.get !== "function") return { object: null, key: null, location: null };
  if (userKey) {
    try {
      const object = await bucket.get(userKey);
      if (object) return { object, key: userKey, location: "user" };
    } catch {
      // fall through to legacy
    }
  }
  if (legacyKey && legacyKey !== userKey) {
    try {
      const object = await bucket.get(legacyKey);
      if (object) return { object, key: legacyKey, location: "legacy" };
    } catch {
      // miss
    }
  }
  return { object: null, key: null, location: null };
}

/**
 * List helper: merge per-user prefix listing with the legacy prefix listing
 * so pre-move objects still show up. Later keys win on collision.
 */
export async function listWithFallback(bucket, userPrefix, legacyPrefix) {
  const seen = new Map();
  const prefixes = [userPrefix, legacyPrefix].filter(Boolean);
  for (const prefix of prefixes) {
    try {
      const listing = await bucket.list({ prefix });
      for (const obj of listing?.objects || []) {
        if (!seen.has(obj.key)) seen.set(obj.key, obj);
      }
      // Paginated buckets: follow cursors when supported by the mock/real R2.
      let cursor = listing?.truncated ? listing.cursor : null;
      let guard = 0;
      while (cursor && guard++ < 20) {
        const next = await bucket.list({ prefix, cursor });
        for (const obj of next?.objects || []) {
          if (!seen.has(obj.key)) seen.set(obj.key, obj);
        }
        cursor = next?.truncated ? next.cursor : null;
      }
    } catch {
      // listing failures yield whatever we already have
    }
  }
  return { objects: [...seen.values()] };
}
