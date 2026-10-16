/**
 * One-time storage rearrangement: move legacy flat R2 keys into per-user
 * folders (`users/<uid>/...`, see worker/storageKeys.js).
 *
 * POST /api/admin/storage-migrate
 *   { mode, prefix, cursor, limit, confirm }
 *
 * Modes (all paginated and resumable via `cursor`):
 * - `dry-run`  — classify every key under `prefix`, write nothing.
 * - `copy`     — copy each attributable legacy key to its user folder.
 *                Publish/domain full records also gain their global pointer
 *                (the designed end-state; public URLs keep resolving).
 *                Legacy keys are left in place.
 * - `verify`   — byte-compare legacy keys against their user-folder copies,
 *                write nothing.
 * - `cleanup`  — delete legacy keys whose copy verifies byte-identical.
 *                Requires `confirm: true`, otherwise refused. Publish/domain
 *                pointers are never deleted (they are routing, not legacy).
 *
 * Prefixes (one per request; omit `prefix` to get the plan):
 *   apps/ | memory/ | context/ | context-index/ | tasks/ | publish/ |
 *   domains/ | root  (root = slash-free keys: uploaded/generated assets)
 *
 * Deliberately NOT moved:
 * - `users/` — already arranged.
 * - `asset-pub/` — global routing markers by design.
 * - `corez-tasks/` (retry schedules, task-status mirrors) — ephemeral
 *   operational state read from the flat location; it ages out on its own.
 * - Anything without an attributable owner (pre-ownership uploads,
 *   ownerless records) — reported as skipped, never guessed.
 *
 * Auth: any verified session may run dry-run/copy/verify (idempotent,
 * non-destructive). Cleanup additionally requires `confirm: true` and only
 * deletes byte-verified copies. D1 needs no rearrangement: every table is
 * already per-user via `user_id` (see worker/dbSchema.js).
 */

import { verifySession } from "./auth.js";
import {
  jsonResponse,
  readBoundedJson,
  safeErrorDetail,
  createRateLimiter,
} from "./utils.js";
import {
  userAssetKey,
  userAppKey,
  userMemoryKey,
  userContextKey,
  userContextIndexKey,
  userTaskKey,
  userTaskEventsKey,
  userTaskLeaseKey,
  userTaskSessionKey,
  userPublishKey,
  userDomainKey,
  legacyPublishKey,
} from "./storageKeys.js";
import { domainRecordKey } from "./customDomains.js";

const migrateRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });

const MIGRATE_PREFIXES = Object.freeze([
  "apps/",
  "memory/",
  "context/",
  "context-index/",
  "tasks/",
  "publish/",
  "domains/",
  "root",
]);

const MAX_PAGE_LIMIT = 500;
const DEFAULT_PAGE_LIMIT = 100;
const MAX_ERRORS = 20;

const APPS_KEY = /^apps\/([^/]+)\/([^/]+)\/([^/]+)\.json$/;
const MEMORY_KEY = /^memory\/([^/]+)\/([^/]+)\.json$/;
const CONTEXT_KEY = /^context\/([^/]+)\.json$/;
const CONTEXT_INDEX_KEY = /^context-index\/([^/]+)\/([^/]+)\.json$/;
const TASKS_KEY = /^tasks\/([^/]+)\.json$/;
const PUBLISH_KEY = /^publish\/([^/]+)\.json$/;
const DOMAINS_KEY = /^domains\/([^/]+)\.json$/;

function boundedLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.floor(n), MAX_PAGE_LIMIT);
}

async function readBytes(object) {
  if (object && typeof object.arrayBuffer === "function") {
    const ab = await object.arrayBuffer();
    return new Uint8Array(ab);
  }
  const text = await object.text();
  return new TextEncoder().encode(text);
}

function bytesEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function readJsonObject(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return { object: null, data: null };
  try {
    return { object, data: JSON.parse(await object.text()) };
  } catch {
    return { object, data: null, corrupt: true };
  }
}

function contentTypeOf(object, fallback) {
  return (
    object?.httpMetadata?.contentType ||
    object?.contentType ||
    fallback ||
    "application/octet-stream"
  );
}

function metadataOf(object) {
  return object?.customMetadata && typeof object.customMetadata === "object"
    ? { ...object.customMetadata }
    : {};
}

/**
 * Classify one legacy key: where it belongs and who owns it.
 * Returns { kind, target, owner, skipReason } — exactly one of target or
 * skipReason is set. Reading the object body happens here only when the
 * owner lives inside the document (context/tasks/publish/domains).
 */
async function classifyKey(bucket, key) {
  if (key.startsWith("users/")) return { kind: "arranged", skipReason: "already-arranged" };
  if (key.startsWith("asset-pub/")) return { kind: "marker", skipReason: "routing-marker" };
  if (key.startsWith("corez-tasks/")) return { kind: "ephemeral", skipReason: "ephemeral-operational" };

  let match;
  if ((match = key.match(APPS_KEY))) {
    const [, uid, sessionId, appFile] = match;
    return { kind: "apps", owner: uid, target: userAppKey(uid, sessionId, appFile.replace(/\.json$/, "")) };
  }
  if ((match = key.match(MEMORY_KEY))) {
    const [, uid, file] = match;
    return { kind: "memory", owner: uid, target: userMemoryKey(uid, file.replace(/\.json$/, "")) };
  }
  if ((match = key.match(CONTEXT_INDEX_KEY))) {
    const [, uid, session] = match;
    return { kind: "context-index", owner: uid, target: userContextIndexKey(uid, session) };
  }
  if ((match = key.match(CONTEXT_KEY))) {
    const [, recordFile] = match;
    const recordId = recordFile.replace(/\.json$/, "");
    const { data, corrupt } = await readJsonObject(bucket, key);
    if (corrupt || !data) return { kind: "context", skipReason: "unreadable-record" };
    if (typeof data.userId !== "string" || !data.userId) {
      return { kind: "context", skipReason: "unattributable" };
    }
    return { kind: "context", owner: data.userId, target: userContextKey(data.userId, recordId) };
  }
  if ((match = key.match(TASKS_KEY))) {
    const [, file] = match;
    let taskId = file;
    let sidecar = null;
    // Note: the `.json` extension is already consumed by TASKS_KEY.
    for (const suffix of [".events", ".lease", ".session"]) {
      if (file.endsWith(suffix)) {
        taskId = file.slice(0, -suffix.length);
        sidecar = suffix.slice(1);
        break;
      }
    }
    const owner = await taskOwner(bucket, taskId);
    if (!owner) return { kind: "tasks", skipReason: "unattributable" };
    const target = sidecar === "events"
      ? userTaskEventsKey(owner, taskId)
      : sidecar === "lease"
        ? userTaskLeaseKey(owner, taskId)
        : sidecar === "session"
          ? userTaskSessionKey(owner, taskId)
          : userTaskKey(owner, taskId);
    return { kind: "tasks", owner, target };
  }
  if ((match = key.match(PUBLISH_KEY))) {
    const [, file] = match;
    const slug = file.replace(/\.json$/, "");
    const { data, corrupt } = await readJsonObject(bucket, key);
    if (corrupt || !data) return { kind: "publish", skipReason: "unreadable-record" };
    if (typeof data.html !== "string") return { kind: "publish", skipReason: "already-arranged" };
    if (typeof data.ownerUserId !== "string" || !data.ownerUserId) {
      return { kind: "publish", skipReason: "unattributable" };
    }
    return { kind: "publish", owner: data.ownerUserId, target: userPublishKey(data.ownerUserId, slug), slug };
  }
  if ((match = key.match(DOMAINS_KEY))) {
    const [, file] = match;
    const hostname = file.replace(/\.json$/, "");
    const { data, corrupt } = await readJsonObject(bucket, key);
    if (corrupt || !data) return { kind: "domains", skipReason: "unreadable-record" };
    if (typeof data.slug !== "string") return { kind: "domains", skipReason: "already-arranged" };
    if (typeof data.ownerUserId !== "string" || !data.ownerUserId) {
      return { kind: "domains", skipReason: "unattributable" };
    }
    return { kind: "domains", owner: data.ownerUserId, target: userDomainKey(data.ownerUserId, hostname), hostname };
  }
  if (!key.includes("/")) {
    return { kind: "asset", owner: null, target: null, flatAsset: key };
  }
  return { kind: "unknown", skipReason: "unrecognized-prefix" };
}

/** Owner of a task: legacy doc first, then a bounded users/ scan. */
async function taskOwner(bucket, taskId) {
  try {
    const { data } = await readJsonObject(bucket, `tasks/${taskId}.json`);
    if (data && typeof data.userId === "string" && data.userId) return data.userId;
  } catch {}
  if (typeof bucket.list !== "function") return null;
  try {
    const listing = await bucket.list({ prefix: "users/", limit: 1000 });
    const suffix = `tasks/${taskId}.json`;
    for (const obj of listing?.objects || []) {
      if (!obj.key.endsWith(suffix)) continue;
      const { data } = await readJsonObject(bucket, obj.key);
      if (data && typeof data.userId === "string" && data.userId) return data.userId;
    }
  } catch {}
  return null;
}

/** Flat asset owner comes from R2 custom metadata (set at upload time). */
async function flatAssetTarget(bucket, key) {
  let owner = null;
  try {
    if (typeof bucket.head === "function") {
      const head = await bucket.head(key);
      owner = head?.customMetadata?.ownerId || null;
    } else {
      const object = await bucket.get(key);
      owner = object?.customMetadata?.ownerId || null;
    }
  } catch {}
  if (typeof owner !== "string" || !owner) return { skipReason: "unattributable" };
  return { owner, target: userAssetKey(owner, key) };
}

function recordError(stats, key, reason) {
  stats.errorsCount = (stats.errorsCount || 0) + 1;
  if (stats.errors.length < MAX_ERRORS) stats.errors.push({ key, reason });
}

function newStats() {
  return {
    scanned: 0,
    copied: 0,
    alreadyArranged: 0,
    verified: 0,
    deleted: 0,
    skippedUnattributable: 0,
    skippedEphemeral: 0,
    skippedDesign: 0,
    errors: [],
    errorsCount: 0,
  };
}

async function copyOne(bucket, key, found, stats, dryRun) {
  const put = async (target, bytes, contentType, metadata) => {
    if (dryRun) return;
    await bucket.put(target, bytes, {
      ...(contentType ? { httpMetadata: { contentType } } : {}),
      ...(metadata && Object.keys(metadata).length > 0 ? { customMetadata: metadata } : {}),
    });
  };

  if (found.kind === "publish") {
    const { data } = await readJsonObject(bucket, key);
    if (!data || typeof data.html !== "string") {
      stats.alreadyArranged += 1;
      return;
    }
    if (dryRun) {
      stats.copied += 1;
      return;
    }
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    await put(found.target, bytes.buffer, "application/json", {});
    await bucket.put(
      legacyPublishKey(found.slug),
      JSON.stringify({ ownerUid: found.owner, slug: found.slug, pointer: true, updatedAt: data.createdAt || null }),
      { httpMetadata: { contentType: "application/json" } },
    );
    stats.copied += 1;
    return;
  }

  if (found.kind === "domains") {
    const { data } = await readJsonObject(bucket, key);
    if (!data || typeof data.slug !== "string") {
      stats.alreadyArranged += 1;
      return;
    }
    if (dryRun) {
      stats.copied += 1;
      return;
    }
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    await put(found.target, bytes.buffer, "application/json", {});
    await bucket.put(
      domainRecordKey(found.hostname),
      JSON.stringify({ ownerUid: found.owner, hostname: found.hostname, pointer: true }),
      { httpMetadata: { contentType: "application/json" } },
    );
    stats.copied += 1;
    return;
  }

  const object = await bucket.get(key);
  if (!object) {
    recordError(stats, key, "vanished-during-copy");
    return;
  }
  const bytes = await readBytes(object);
  const isJson = key.endsWith(".json");
  if (dryRun) {
    stats.copied += 1;
    return;
  }
  await put(
    found.target,
    bytes,
    contentTypeOf(object, isJson ? "application/json" : null),
    metadataOf(object),
  );
  stats.copied += 1;
}

async function verifyOne(bucket, key, found, stats) {
  if (found.kind === "publish") {
    const { data } = await readJsonObject(bucket, key);
    if (!data || typeof data.html !== "string") {
      // Pointer (or nothing): the move already happened or is unnecessary.
      stats.alreadyArranged += 1;
      return;
    }
    const { data: owned } = await readJsonObject(bucket, found.target);
    if (owned && JSON.stringify(owned) === JSON.stringify(data)) {
      stats.verified += 1;
    } else {
      recordError(stats, key, "copy-missing-or-differs");
    }
    return;
  }
  if (found.kind === "domains") {
    const { data } = await readJsonObject(bucket, key);
    if (!data || typeof data.slug !== "string") {
      stats.alreadyArranged += 1;
      return;
    }
    const { data: owned } = await readJsonObject(bucket, found.target);
    if (owned && JSON.stringify(owned) === JSON.stringify(data)) {
      stats.verified += 1;
    } else {
      recordError(stats, key, "copy-missing-or-differs");
    }
    return;
  }
  const [legacyBytes, ownedBytes] = await Promise.all([
    bucket.get(key).then(readBytes).catch(() => null),
    bucket.get(found.target).then(readBytes).catch(() => null),
  ]);
  if (legacyBytes && ownedBytes && bytesEqual(legacyBytes, ownedBytes)) {
    stats.verified += 1;
  } else {
    recordError(stats, key, ownedBytes ? "copy-differs" : "copy-missing");
  }
}

async function cleanupOne(bucket, key, found, stats) {
  // Pointers and markers are routing by design — never deleted here.
  if (found.kind === "publish" || found.kind === "domains") {
    stats.skippedDesign += 1;
    return;
  }
  const [legacyBytes, ownedBytes] = await Promise.all([
    bucket.get(key).then(readBytes).catch(() => null),
    bucket.get(found.target).then(readBytes).catch(() => null),
  ]);
  if (legacyBytes && ownedBytes && bytesEqual(legacyBytes, ownedBytes)) {
    await bucket.delete(key);
    stats.deleted += 1;
  } else {
    recordError(stats, key, ownedBytes ? "copy-differs-not-deleted" : "copy-missing-not-deleted");
  }
}

export async function handleStorageMigrate(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }
  const uid = await verifySession(request, env).then((s) => s?.uid || null).catch(() => null);
  if (!uid && env?.AUTH_SECRET) {
    return jsonResponse(401, { error: "Authentication required." });
  }
  const caller = uid || "dev";
  if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.list !== "function") {
    return jsonResponse(530, { error: "R2 storage (ASSET_BUCKET) is not configured." });
  }
  const retryAfter = migrateRateLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(
      429,
      { error: "Too many migration requests. Try again shortly." },
      { "Retry-After": String(retryAfter) },
    );
  }

  let body;
  try {
    body = await readBoundedJson(request);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload." });
  }

  const mode = typeof body?.mode === "string" ? body.mode : "dry-run";
  if (!["dry-run", "copy", "verify", "cleanup"].includes(mode)) {
    return jsonResponse(400, { error: "mode must be dry-run, copy, verify or cleanup." });
  }
  if (mode === "cleanup" && body?.confirm !== true) {
    return jsonResponse(400, {
      error: "Cleanup deletes legacy keys. Re-run with confirm: true after verify reports clean.",
    });
  }

  const prefix = typeof body?.prefix === "string" ? body.prefix : null;
  if (!prefix) {
    return jsonResponse(200, {
      mode: "plan",
      caller,
      prefixes: [...MIGRATE_PREFIXES],
      hint: "Run one prefix per request: { mode, prefix, cursor }. Sequence: dry-run, copy, verify, then cleanup with confirm: true.",
    });
  }
  if (!MIGRATE_PREFIXES.includes(prefix)) {
    return jsonResponse(400, { error: `Unknown prefix. Use one of: ${MIGRATE_PREFIXES.join(", ")}.` });
  }

  const bucket = env.ASSET_BUCKET;
  const limit = boundedLimit(body?.limit);
  const cursor = typeof body?.cursor === "string" ? body.cursor : undefined;
  const dryRun = mode === "dry-run";
  const stats = newStats();

  let listing;
  try {
    listing = await bucket.list(prefix === "root" ? { prefix: "", limit, cursor } : { prefix, limit, cursor });
  } catch (e) {
    return jsonResponse(502, { error: "Storage listing failed.", detail: safeErrorDetail(e) });
  }
  const objects = Array.isArray(listing?.objects) ? listing.objects : [];

  for (const obj of objects) {
    const key = obj.key;
    if (prefix === "root" && key.includes("/")) continue;
    stats.scanned += 1;
    let found;
    try {
      found = await classifyKey(bucket, key);
    } catch (e) {
      recordError(stats, key, `classify-failed: ${safeErrorDetail(e)}`);
      continue;
    }
    if (found.skipReason) {
      if (found.skipReason === "already-arranged") stats.alreadyArranged += 1;
      else if (found.skipReason === "ephemeral-operational") stats.skippedEphemeral += 1;
      else if (found.skipReason === "routing-marker") stats.skippedDesign += 1;
      else if (found.skipReason === "unattributable" || found.skipReason === "unreadable-record") {
        stats.skippedUnattributable += 1;
      } else {
        recordError(stats, key, found.skipReason);
      }
      continue;
    }
    try {
      if (found.kind === "asset") {
        const resolved = await flatAssetTarget(bucket, key);
        if (resolved.skipReason) {
          stats.skippedUnattributable += 1;
          continue;
        }
        found = { ...found, ...resolved };
      }
      if (mode === "verify") {
        await verifyOne(bucket, key, found, stats);
      } else if (mode === "cleanup") {
        await cleanupOne(bucket, key, found, stats);
      } else {
        await copyOne(bucket, key, found, stats, dryRun);
      }
    } catch (e) {
      recordError(stats, key, `${mode}-failed: ${safeErrorDetail(e)}`);
    }
  }

  return jsonResponse(200, {
    mode,
    caller,
    prefix,
    done: !listing?.truncated,
    cursor: listing?.truncated ? (listing.cursor || null) : null,
    stats,
  });
}
