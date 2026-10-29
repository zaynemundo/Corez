import {
  userAssetKey,
  userAppPrefix,
  legacyAppPrefix,
  userContextIndexKey,
  legacyContextIndexKey,
  assetPubMarkerKey,
} from "./storageKeys.js";
import { unpublishPagesForSessions } from "./publishStore.js";

// Smart compact summary builder for server-side compaction
// Mirrors src/services/contextStore.js buildContextSummary without persistence
export function buildWorkerCompactSummary(messages) {
  const requirements = [];
  const negativeConstraints = [];
  const exactErrors = [];
  const _decisions = [];
  const codeSignatures = [];
  const lines = [];
  for (const m of messages) {
    const text = typeof m?.content === "string" ? m.content : "";
    lines.push(...text.split("\n"));
  }
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (
      /(must not|do not|never|forbidden|don't|must not change|must preserve|must keep|must retain)/i.test(
        line,
      )
    ) {
      negativeConstraints.push(line.slice(0, 200));
      continue;
    }
    if (
      /^(requirement|must|need|require|constraint|goal|acceptance criterion)[: ]/i.test(
        line,
      )
    ) {
      requirements.push(line.slice(0, 200));
      continue;
    }
    if (
      /(error|exception|failed|failure|stack trace|uncaught|fatal|FAIL|syntaxerror|typeerror)/i.test(
        line,
      )
    ) {
      exactErrors.push(line.slice(0, 200));
      continue;
    }
    if (
      /^[-*]\s*(?:add|implement|fix|refactor|change|update|remove|migrate)\b/i.test(
        line,
      )
    ) {
      requirements.push(line.slice(0, 200));
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) {
      const sig = lines[i + 1]?.trim().slice(0, 80);
      if (sig) codeSignatures.push(sig);
    }
  }
  const topicWords = new Map();
  const topicText = lines.join(" ").toLowerCase().slice(0, 50000);
  const words = topicText.match(/[a-z]{5,}/g) || [];
  for (const w of words) {
    if (
      [
        "would",
        "should",
        "could",
        "about",
        "there",
        "their",
        "these",
        "those",
        "which",
        "while",
      ].includes(w)
    )
      continue;
    topicWords.set(w, (topicWords.get(w) || 0) + 1);
  }
  const topics = [...topicWords.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
  const parts = [
    "[Compacted history: earlier messages summarized. Full records remain retrievable.]",
  ];
  if (topics.length) parts.push(`Topics: ${topics.join(", ")}.`);
  if (requirements.length)
    parts.push(`Requirements: ${requirements.slice(0, 3).join(" | ")}`);
  if (negativeConstraints.length)
    parts.push(`Constraints: ${negativeConstraints.slice(0, 2).join(" | ")}`);
  if (exactErrors.length)
    parts.push(`Errors: ${exactErrors.slice(0, 2).join(" | ")}`);
  if (codeSignatures.length)
    parts.push(`Code: ${codeSignatures.slice(0, 2).join(" | ")}`);
  return {
    topics,
    parts: parts.join("\n"),
    requirements,
    negativeConstraints,
    exactErrors,
    codeSignatures,
  };
}

export function applySmartCompact(messages, url) {
  const compact =
    url.searchParams.get("compact") === "1" ||
    url.searchParams.get("compact") === "true";
  const keep = Math.min(
    100,
    Math.max(5, parseInt(url.searchParams.get("keep") || "30", 10) || 30),
  );
  const limitParam = parseInt(url.searchParams.get("limit") || "", 10);
  const effectiveLimit = Number.isFinite(limitParam)
    ? Math.min(500, Math.max(1, limitParam))
    : null;

  // If explicit limit without compact, just slice
  if (!compact && effectiveLimit != null && messages.length > effectiveLimit) {
    const sliced = messages.slice(-effectiveLimit);
    return {
      messages: sliced,
      meta: { limit: effectiveLimit, total: messages.length, compacted: false },
    };
  }
  if (!compact) return { messages, meta: null };
  // Compact: keep recent `keep`, summarize older if total > keep
  if (messages.length <= keep) return { messages, meta: null };
  const older = messages.slice(0, messages.length - keep);
  const recent = messages.slice(messages.length - keep);
  if (older.length === 0) return { messages, meta: null };
  // Only compact if older is meaningful ( >5 messages or >30KB )
  const olderBytes = JSON.stringify(older).length;
  if (older.length < 5 && olderBytes < 30_000) return { messages, meta: null };
  const summary = buildWorkerCompactSummary(older);
  const banner = {
    id: `compact-${Date.now()}`,
    role: "system",
    content: summary.parts,
    attachments: null,
    createdAt: older[older.length - 1]?.createdAt || Date.now(),
    _compactMeta: {
      isCompactSummary: true,
      compactedCount: older.length,
      topics: summary.topics,
      summaryLine: summary.topics.length
        ? `Topics: ${summary.topics.join(", ")}`
        : `${older.length} earlier messages summarized`,
      persisted: false,
    },
  };
  return {
    messages: [banner, ...recent],
    meta: {
      compacted: true,
      compactedCount: older.length,
      keep,
      total: messages.length,
      topics: summary.topics,
    },
  };
}

// ---------------------------------------------------------------------
// Chat storage cascade — deleting a chat also deletes everything that
// belongs to it: R2 apps, uploaded assets (images, docs, ...), generated
// images referenced by its messages, and the per-session context index.
//
// Published pages keep their own lifecycle (own delete UI in settings;
// shareable links must not break silently), so publish records are never
// touched — and any asset still referenced by a published page is kept too.
// ---------------------------------------------------------------------

// Asset keys are client-chosen, slash-free segments (user-upload_*.jpg,
// image_<ts>_<rand>.png, ...). Only that shape is ever deleted, so message
// content can never turn the cascade into unrelated-key deletion.
const SAFE_ASSET_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

function assetKeyFromUrl(url) {
  if (typeof url !== "string") return null;
  const idx = url.indexOf("/api/assets/");
  if (idx === -1) return null;
  const raw = url.slice(idx + "/api/assets/".length).split(/[?#]/)[0];
  let key;
  try {
    key = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return SAFE_ASSET_KEY.test(key) ? key : null;
}

export function extractChatAssetKeys(messages) {
  const keys = new Set();
  const contentPattern = /\/api\/assets\/([A-Za-z0-9._-]+)/g;
  for (const m of messages || []) {
    // Structured attachments (uploads: images, docs, audio, video).
    let list = m?.attachments;
    if (typeof list === "string") {
      try {
        list = JSON.parse(list);
      } catch {
        list = null;
      }
    }
    if (Array.isArray(list)) {
      for (const a of list) {
        if (
          typeof a?.assetKey === "string" &&
          SAFE_ASSET_KEY.test(a.assetKey)
        ) {
          keys.add(a.assetKey);
        }
        const fromUrl = assetKeyFromUrl(a?.assetUrl);
        if (fromUrl) keys.add(fromUrl);
      }
    }
    // Generated-image markdown and absolute R2 URLs inside message text.
    const content = typeof m?.content === "string" ? m.content : "";
    if (content.includes("/api/assets/")) {
      let match;
      contentPattern.lastIndex = 0;
      while ((match = contentPattern.exec(content)) !== null) {
        if (SAFE_ASSET_KEY.test(match[1])) keys.add(match[1]);
      }
    }
  }
  return [...keys];
}

// True when a live published page references this asset: the publish flow
// leaves an asset-pub/<key> marker for every referenced asset.
//
// Deliberately cheaper than publishStore.isAssetPublished (same name elsewhere,
// different job): that one falls back to a bounded scan of every publish record
// for legacy pages that predate the marker. Here the caller sweeps many assets
// during one delete, so it reads the marker only and treats "no marker" as
// unpublished — the conservative outcome for a legacy page is that its images
// are kept, never that a live page loses them.
export async function hasPublishMarker(bucket, key) {
  try {
    const marker = assetPubMarkerKey(key);
    if (typeof bucket.head === "function") {
      const found = await bucket.head(marker).catch(() => null);
      if (found) return true;
    }
    if (typeof bucket.get === "function") {
      const found = await bucket.get(marker).catch(() => null);
      if (found) return true;
    }
  } catch {
    // Marker unreadable: treat as unpublished below.
  }
  return false;
}

export async function deleteBucketPrefix(bucket, prefix) {
  try {
    let cursor = null;
    let guard = 0;
    do {
      const list = await bucket
        .list(cursor ? { prefix, cursor } : { prefix })
        .catch(() => null);
      if (!list) break;
      for (const obj of list.objects || []) {
        try {
          await bucket.delete(obj.key);
        } catch {
          // Per-key best effort.
        }
      }
      cursor = list.truncated ? list.cursor : null;
      guard += 1;
    } while (cursor && guard < 20);
  } catch {
    // Best effort.
  }
}

// Best-effort R2 cascade for the given chats. Reads each chat's messages
// for asset references, so callers must run it BEFORE deleting the D1 rows.
// Never throws: the cascade must not fail the chat delete itself.
//
// Returns the slugs of published pages that were unpublished because they came
// from these chats: deleting a conversation deletes what it produced, and a
// published page is one of its artifacts. That has to run FIRST — the asset
// sweep below keeps any file a live page still references public, so a page
// removed here releases its images to the same pass.
export async function cleanupChatStorage(env, userId, chatIds) {
  const ids = [...new Set((chatIds || []).filter(Boolean))];
  if (ids.length === 0) return { unpublishedSlugs: [] };
  const bucket = env?.ASSET_BUCKET;
  if (!bucket || typeof bucket.list !== "function") {
    return { unpublishedSlugs: [] };
  }
  if (typeof bucket.delete !== "function") return { unpublishedSlugs: [] };
  const unpublishedSlugs = await unpublishPagesForSessions(env, userId, ids);
  try {
    // 1. Collect asset keys referenced by these chats' messages.
    const assetKeys = new Set();
    if (env?.DB) {
      for (const chatId of ids) {
        try {
          const rows = await env.DB.prepare(
            "SELECT attachments, content FROM chat_messages WHERE chat_id = ? AND user_id = ? LIMIT 500",
          )
            .bind(chatId, userId)
            .all();
          for (const key of extractChatAssetKeys(rows?.results || [])) {
            assetKeys.add(key);
          }
        } catch {
          // Per-chat best effort: the R2 prefixes below don't need messages.
        }
      }
    }
    // 2. Delete per-chat R2 state: apps and context index, both locations.
    for (const chatId of ids) {
      await deleteBucketPrefix(bucket, userAppPrefix(userId, chatId));
      await deleteBucketPrefix(bucket, legacyAppPrefix(userId, chatId));
      for (const key of [
        userContextIndexKey(userId, chatId),
        legacyContextIndexKey(userId, chatId),
      ]) {
        try {
          await bucket.delete(key);
        } catch {
          // Per-key best effort.
        }
      }
    }
    // 3. Delete referenced assets unless still used by a published page.
    // Pre-move objects lived at the flat key, so both locations are swept.
    for (const key of assetKeys) {
      try {
        if (await hasPublishMarker(bucket, key)) continue;
        try {
          await bucket.delete(userAssetKey(userId, key));
        } catch {
          // Per-key best effort.
        }
        try {
          await bucket.delete(key);
        } catch {
          // Per-key best effort.
        }
      } catch {
        // Per-key best effort.
      }
    }
  } catch {
    // Cascade never fails the chat delete.
  }
  return { unpublishedSlugs };
}
