/**
 * Published creations + asset resolution — the single home for R2 publish
 * logic shared by worker/index.js (HTTP routes) and worker/customDomains.js
 * (customer-domain serving and the domains API).
 *
 * Layout (see worker/storageKeys.js for key construction):
 * - Authoritative records live in per-user folders:
 *   users/<uid>/publish/<slug>.json
 * - A tiny global pointer at publish/<slug>.json ({ ownerUid, slug })
 *   lets public URLs resolve without knowing the owner. Legacy flat records
 *   holding the full document are served directly as a fallback.
 * - Asset public markers at asset-pub/<key> hold the owner's uid
 *   (legacy markers hold "1" and fall back to a bounded record scan).
 *
 * Key-building primitives stay in worker/storageKeys.js; this module owns
 * the read/write/resolve behavior on top of them.
 */

import {
  USERS_PREFIX,
  userAssetKey,
  userPublishKey,
  userPublishPrefix,
  legacyPublishKey,
  assetPubMarkerKey,
  listWithFallback,
} from "./storageKeys.js";
import { deleteSiteAnalyticsForSlug } from "./siteAnalytics.js";

// Published creations get a short, human-shareable slug or custom slug (e.g. "asyag23-123" or "my-portfolio")
// served at the bare root path corez.pro/<slug>. Multi-page creations are
// served with the home page at corez.pro/<slug>/ and each page at
// corez.pro/<slug>/<page>.html so relative links always resolve inside the
// slug directory; the bare /<slug> path redirects there.
export const PUBLISH_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
export const GENERATED_SLUG_PATTERN = /^[a-z0-9]{4,8}-[0-9]{1,6}$/;

// Sub-page paths inside a published multi-page creation: /<slug>/<page>.html
// where <page> is a validated file name (no slashes, no ".." traversal).
export const PUBLISH_PAGE_PATTERN =
  /^([a-z0-9][a-z0-9-]{1,48}[a-z0-9])\/([a-z0-9][a-z0-9_-]{0,63}\.html)$/;
export const PUBLISH_PAGE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}\.html$/i;
export const MAX_PUBLISH_PAGES = 12;

// Trailing-slash root of a published creation: /<slug>/ serves the home page
// so every RELATIVE sub-page link (<a href="about.html">) resolves inside the
// slug directory (corez.pro/<slug>/about.html) instead of the site root
// (corez.pro/about.html). Multi-page creations redirect the bare /<slug>
// path here for the same reason.
export const PUBLISH_SLUG_ROOT_PATTERN = /^\/([a-z0-9][a-z0-9-]{1,48}[a-z0-9])\/$/;

// Owner-facing unpublish endpoint: DELETE /api/publish/<slug>. Shared by the
// route dispatch and the handler so they can never disagree about what is a
// removable slug.
export const PUBLISH_UNPUBLISH_PATH_PATTERN =
  /^\/api\/publish\/([a-z0-9][a-z0-9-]{1,48}[a-z0-9])$/;

// Owner-facing publish management (list + unpublish). Each user's records
// live in their own folder (users/<uid>/publish/<slug>.json) with a tiny
// global pointer at publish/<slug>.json for public URL resolution; legacy
// flat records (publish/<slug>.json holding the full document) are merged
// in by bounded scans. The bounds keep a single request from walking an
// unbounded bucket, and the response says when it truncated instead of
// silently hiding pages.
export const MAX_PUBLISH_LIST_RECORDS = 1000;
export const MAX_OWNED_PUBLISHES = 200;

export const RESERVED_SLUGS = Object.freeze(
  new Set([
    "api",
    "app",
    "apps",
    "auth",
    "admin",
    "assets",
    "static",
    "dist",
    "favicon",
    "robots",
    "sitemap",
    "health",
    "metrics",
    "login",
    "register",
    "dashboard",
    "settings",
    "publish",
    "preview",
    "search",
    "ws",
    "worker",
    "null",
    "undefined",
    "index",
    "home",
  ]),
);

export function generatePublishSlug() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let word = "";
  const len = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < len; i++) {
    word += chars[Math.floor(Math.random() * chars.length)];
  }
  const num = 100 + Math.floor(Math.random() * 900);
  return `${word}-${num}`;
}

export function extractReferencedAssetKeys(htmlParts) {
  const keys = new Set();
  const ASSET_REF_PATTERN =
    /\/api\/assets\/([A-Za-z0-9][A-Za-z0-9._-]{0,254})/g;
  for (const part of htmlParts) {
    if (typeof part !== "string") continue;
    let match;
    while ((match = ASSET_REF_PATTERN.exec(part)) !== null) {
      keys.add(match[1]);
    }
  }
  return [...keys];
}

// Resolve one publish record by slug across both layouts:
//  - per-user record via the global pointer (publish/<slug>.json holding
//    { ownerUid }) — the post-move layout;
//  - legacy full record stored directly at publish/<slug>.json;
//  - per-user record addressed directly (owner-known paths).
// Returns { record, storageKey, ownerUid } or null.
export async function resolvePublishRecord(env, slug) {
  if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.get !== "function") return null;
  const pointerKey = legacyPublishKey(slug);
  let pointer = null;
  try {
    const obj = await env.ASSET_BUCKET.get(pointerKey);
    if (obj) {
      try {
        pointer = JSON.parse(await obj.text());
      } catch {
        pointer = null;
      }
    }
  } catch {
    pointer = null;
  }
  if (pointer && typeof pointer === "object") {
    // Legacy full record: it carries the document body.
    if (typeof pointer.html === "string") {
      return { record: pointer, storageKey: pointerKey, ownerUid: pointer.ownerUserId || null };
    }
    // Post-move pointer: fetch the owner's copy.
    const ownerUid = typeof pointer.ownerUid === "string" ? pointer.ownerUid : null;
    if (ownerUid) {
      try {
        const owned = await env.ASSET_BUCKET.get(userPublishKey(ownerUid, slug));
        if (owned) {
          try {
            const record = JSON.parse(await owned.text());
            return { record, storageKey: userPublishKey(ownerUid, slug), ownerUid };
          } catch {
            return null;
          }
        }
      } catch {
        // fall through to null
      }
      return null;
    }
  }
  return null;
}

/** Convenience for callers that only need the document (custom domains). */
export async function readPublishRecord(env, slug) {
  const resolved = await resolvePublishRecord(env, slug).catch(() => null);
  const record = resolved?.record;
  return record && typeof record.html === "string" ? record : null;
}

export async function writePublishRecord(env, userId, slug, record) {
  const ownedKey = userPublishKey(userId, slug);
  await env.ASSET_BUCKET.put(ownedKey, JSON.stringify(record), {
    httpMetadata: { contentType: "application/json" },
  });
  // Tiny global pointer so public URLs resolve without knowing the owner.
  // Legacy readers that expect a full record detect the missing `html`
  // field and follow the pointer (see resolvePublishRecord).
  try {
    await env.ASSET_BUCKET.put(
      legacyPublishKey(slug),
      JSON.stringify({ ownerUid: userId, slug, pointer: true, updatedAt: record.createdAt || null }),
      { httpMetadata: { contentType: "application/json" } },
    );
  } catch {
    // The owned copy is authoritative; a pointer failure only costs a scan.
  }
  return ownedKey;
}

export async function deletePublishRecord(env, slug) {
  // Best-effort removal from every location a record for this slug can live.
  const resolved = await resolvePublishRecord(env, slug).catch(() => null);
  const keys = new Set([legacyPublishKey(slug)]);
  if (resolved?.storageKey) keys.add(resolved.storageKey);
  if (resolved?.ownerUid) keys.add(userPublishKey(resolved.ownerUid, slug));
  for (const key of keys) {
    try {
      await env.ASSET_BUCKET.delete(key);
    } catch {
      // best effort
    }
  }
  // Traffic history belongs to the page that produced it: unpublishing (or
  // deleting the chat that published it) removes it too, rather than leaving
  // an orphaned audience record behind. D1 may not be configured, and a
  // cleanup failure must never keep a taken-down page alive.
  await deleteSiteAnalyticsForSlug(env, slug).catch(() => {});
  return resolved;
}

/**
 * Drop the public markers of the assets a removed page was keeping readable.
 *
 * A published page is what makes its images public to anonymous visitors, so
 * removing the page must take that access away again — unless another live page
 * still references the same asset. Markers are an optimization: a failure here
 * never un-deletes the page, so it is best-effort by design.
 */
export async function dropUnreferencedAssetMarkers(env, record) {
  if (!env?.ASSET_BUCKET || !record) return [];
  const htmlParts = [typeof record.html === "string" ? record.html : ""];
  if (record.pages && typeof record.pages === "object") {
    for (const pageHtml of Object.values(record.pages)) {
      if (typeof pageHtml === "string") htmlParts.push(pageHtml);
    }
  }
  const referenced = extractReferencedAssetKeys(htmlParts);
  if (referenced.length === 0) return [];
  const dropped = [];
  try {
    const { records } = await scanPublishRecords(env);
    for (const assetKey of referenced) {
      const stillReferenced = records.some(({ record: other }) => {
        const parts = [typeof other?.html === "string" ? other.html : ""];
        if (other?.pages && typeof other.pages === "object") {
          for (const pageHtml of Object.values(other.pages)) {
            if (typeof pageHtml === "string") parts.push(pageHtml);
          }
        }
        return parts.some((html) => html.includes(`/api/assets/${assetKey}`));
      });
      if (stillReferenced) continue;
      try {
        await env.ASSET_BUCKET.delete(assetPubMarkerKey(assetKey));
        dropped.push(assetKey);
      } catch {
        // Per-key best effort.
      }
    }
  } catch {
    // Markers are an optimization; a failure here never un-deletes the page.
  }
  return dropped;
}

/**
 * Unpublish every page that came from one of `sessionIds`.
 *
 * Deleting a chat removes the creations it produced, and a published page is
 * one of them: leaving it live would keep serving work the user deleted. The
 * lineage is `record.sessionId`, written at publish time; records published
 * before that field existed are not attributable and are left alone (the
 * browser that published them still knows the slug — see the client's own
 * unpublish on delete).
 *
 * Returns the slugs that were removed so the caller can report them.
 */
export async function unpublishPagesForSessions(env, uid, sessionIds) {
  const ids = new Set(
    (Array.isArray(sessionIds) ? sessionIds : [sessionIds])
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean),
  );
  if (ids.size === 0 || !uid) return [];
  if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.delete !== "function") {
    return [];
  }
  let records;
  try {
    records = (await listUserPublishRecords(env, uid))?.records;
  } catch {
    return [];
  }
  if (!Array.isArray(records) || records.length === 0) return [];
  const removed = [];
  for (const { record } of records) {
    const sessionId =
      typeof record?.sessionId === "string" ? record.sessionId : "";
    if (!sessionId || !ids.has(sessionId)) continue;
    const slug = typeof record?.slug === "string" ? record.slug : "";
    if (!slug) continue;
    try {
      await deletePublishRecord(env, slug);
      await dropUnreferencedAssetMarkers(env, record);
      removed.push(slug);
    } catch {
      // Per-page best effort: one failure must not strand the rest.
    }
  }
  return removed;
}

// Resolve an asset's bytes across both layouts. Returns
// { object, storageKey, ownerId } or { object: null }.
export async function resolveAsset(env, key, uid) {
  if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.get !== "function") {
    return { object: null, storageKey: null, ownerId: null };
  }
  // 1. The caller's own folder.
  if (uid) {
    try {
      const own = await env.ASSET_BUCKET.get(userAssetKey(uid, key));
      if (own) return { object: own, storageKey: userAssetKey(uid, key), ownerId: own?.customMetadata?.ownerId || null };
    } catch {}
  }
  // 2. Legacy flat key.
  try {
    const flat = await env.ASSET_BUCKET.get(key);
    if (flat) return { object: flat, storageKey: key, ownerId: flat?.customMetadata?.ownerId || null };
  } catch {}
  // 3. Another user's folder via the publish marker (which now stores the
  //    owner's uid; legacy markers hold "1" and fall through to the scan).
  try {
    const marker = await env.ASSET_BUCKET.get(assetPubMarkerKey(key));
    if (marker) {
      const text = (await marker.text()).trim();
      if (text && text !== "1") {
        try {
          const owned = await env.ASSET_BUCKET.get(userAssetKey(text, key));
          if (owned) return { object: owned, storageKey: userAssetKey(text, key), ownerId: owned?.customMetadata?.ownerId || text };
        } catch {}
      }
    }
  } catch {}
  return { object: null, storageKey: null, ownerId: null };
}

// An asset is public when a published creation references it: published
// pages are shared to anyone, so their images must load for anonymous
// visitors too. Fast path: the publish-time marker (asset-pub/<key>).
// Fallback for legacy records (published before markers): a bounded scan of
// live publish records looking for the reference, across both the legacy
// flat prefix and per-user folders.
export async function isAssetPublished(env, key) {
  if (!env?.ASSET_BUCKET) return false;
  try {
    const marker = await env.ASSET_BUCKET.get(assetPubMarkerKey(key));
    if (marker) return true;
  } catch {
    // marker read failure falls through to the legacy scan
  }
  if (typeof env.ASSET_BUCKET.list !== "function") return false;
  try {
    // Records without a marker predate markers. Scan live publish records in
    // bounded pages (up to 1000) so an asset referenced only by an older
    // publish is still served anonymously.
    let scanned = 0;
    const MAX_PUBLISH_SCAN = 1000;
    const prefixes = ["publish/", USERS_PREFIX];
    for (const prefix of prefixes) {
      let cursor;
      do {
        const listing = await env.ASSET_BUCKET.list({
          prefix,
          limit: 100,
          cursor,
        });
        const objects = Array.isArray(listing?.objects) ? listing.objects : [];
        for (const obj of objects) {
          // Only publish documents can reference assets; skip pointers,
          // markers and unrelated user files without a GET.
          const isPublishDoc =
            obj.key.startsWith("publish/") ||
            (obj.key.startsWith(USERS_PREFIX) && obj.key.includes("/publish/"));
          if (!isPublishDoc || !obj.key.endsWith(".json")) continue;
          scanned += 1;
          if (scanned > MAX_PUBLISH_SCAN) return false;
          const recordObj = await env.ASSET_BUCKET.get(obj.key);
          if (!recordObj) continue;
          let record;
          try {
            record = JSON.parse(await recordObj.text());
          } catch {
            continue;
          }
          if (!record || typeof record.html !== "string") continue;
          const htmlParts = [record.html];
          if (record?.pages && typeof record.pages === "object") {
            for (const pageHtml of Object.values(record.pages)) {
              if (typeof pageHtml === "string") htmlParts.push(pageHtml);
            }
          }
          if (htmlParts.some((html) => html.includes(`/api/assets/${key}`)))
            return true;
        }
        cursor = listing?.truncated ? listing.cursor : null;
      } while (cursor && scanned < MAX_PUBLISH_SCAN);
    }
  } catch {
    // Listing/read failures never block asset access: fall through to the
    // ownership check.
  }
  return false;
}

/**
 * Walk publish records in bounded batches, across both the legacy flat
 * prefix (publish/<slug>.json) and per-user folders
 * (users/<uid>/publish/<slug>.json). Pointer records (no `html`) are
 * skipped — the owned copy is the document. Returns parsed records with
 * their storage keys. `truncated` is true when the scan stopped at the
 * bound, so callers can say so instead of implying the list is complete.
 */
export async function scanPublishRecords(env, { limit = MAX_PUBLISH_LIST_RECORDS } = {}) {
  if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.list !== "function") {
    return { records: [], truncated: true, supported: false };
  }
  const records = [];
  const seenSlugs = new Set();
  let scanned = 0;
  let truncated = false;
  try {
    for (const prefix of ["publish/", USERS_PREFIX]) {
      let cursor;
      do {
        const listing = await env.ASSET_BUCKET.list({
          prefix,
          limit: 100,
          cursor,
        });
        const objects = Array.isArray(listing?.objects) ? listing.objects : [];
        for (const object of objects) {
          const isPublishDoc =
            object.key.startsWith("publish/") ||
            (object.key.startsWith(USERS_PREFIX) && object.key.includes("/publish/"));
          if (!isPublishDoc || !object.key.endsWith(".json")) continue;
          scanned += 1;
          if (scanned > limit) {
            truncated = true;
            break;
          }
          const stored = await env.ASSET_BUCKET.get(object.key);
          if (!stored) continue;
          let record;
          try {
            record = JSON.parse(await stored.text());
          } catch {
            continue; // unreadable record: skip rather than fail the whole list
          }
          // Pointer, not a document — the owned copy is scanned separately.
          if (record && typeof record.html !== "string") continue;
          const slug = typeof record?.slug === "string" ? record.slug : null;
          if (slug && seenSlugs.has(slug)) continue;
          if (slug) seenSlugs.add(slug);
          records.push({ key: object.key, record });
        }
        cursor = listing?.truncated ? listing.cursor : null;
      } while (cursor && !truncated);
      if (truncated) break;
    }
  } catch {
    return { records, truncated: true, supported: false };
  }
  return { records, truncated, supported: true, scanned };
}

/**
 * List one user's publish records efficiently: their own folder prefix plus
 * any legacy flat records they still own. Pointer records are skipped.
 */
export async function listUserPublishRecords(env, uid, { limit = MAX_OWNED_PUBLISHES } = {}) {
  const records = [];
  const seenSlugs = new Set();
  if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.list !== "function") {
    return { records, truncated: true, supported: false };
  }
  try {
    const { objects } = await listWithFallback(
      env.ASSET_BUCKET,
      userPublishPrefix(uid),
      null,
    );
    for (const object of (objects || [])) {
      if (!object.key.endsWith(".json")) continue;
      const stored = await env.ASSET_BUCKET.get(object.key);
      if (!stored) continue;
      let record;
      try {
        record = JSON.parse(await stored.text());
      } catch {
        continue;
      }
      if (typeof record?.html !== "string") continue;
      if (record?.ownerUserId && record.ownerUserId !== uid) continue;
      const slug = typeof record?.slug === "string" ? record.slug : null;
      if (slug && seenSlugs.has(slug)) continue;
      if (slug) seenSlugs.add(slug);
      records.push({ key: object.key, record });
      if (records.length >= limit) break;
    }
  } catch {
    return { records, truncated: true, supported: false };
  }
  return { records, truncated: false, supported: true };
}

/**
 * The owner-facing shape of a publish record: everything needed to recognise
 * and manage a link, never the document bodies (each can be megabytes).
 */
export function publishRecordSummary(key, record) {
  const slug =
    typeof record?.slug === "string" && PUBLISH_SLUG_PATTERN.test(record.slug)
      ? record.slug
      : String(key).split("/").pop().replace(/\.json$/, "");
  const pageHtml =
    record?.pages && typeof record.pages === "object"
      ? Object.values(record.pages).filter((value) => typeof value === "string")
      : [];
  return {
    slug,
    url: `/${slug}`,
    title:
      typeof record?.title === "string" && record.title.trim()
        ? record.title.slice(0, 120)
        : "Untitled Application",
    createdAt: typeof record?.createdAt === "string" ? record.createdAt : null,
    badge: record?.badge === true,
    customized: record?.customized === true,
    pages: pageHtml.length,
    bytes:
      (typeof record?.html === "string" ? record.html.length : 0) +
      pageHtml.reduce((total, html) => total + html.length, 0),
  };
}
