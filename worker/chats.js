import { jsonResponse, readBoundedJson, safeErrorDetail } from "./utils.js";
import { verifySession } from "./auth.js";
import {
  userAssetKey,
  userAppPrefix,
  legacyAppPrefix,
  userContextIndexKey,
  legacyContextIndexKey,
  assetPubMarkerKey,
} from "./storageKeys.js";
import {
  TABLE_CHATS,
  TABLE_CHAT_MESSAGES,
  TABLE_CHAT_LIST_MANUAL,
  INDEX_CHATS_USER_UPDATED,
  INDEX_CHATS_PROJECT,
  INDEX_MESSAGES_CHAT_CREATED,
  COLUMN_CHATS_PROJECT_ID,
  COLUMN_CHATS_PINNED_AT,
  COLUMN_CHATS_SORT_ORDER,
} from "./dbSchema.js";
import { unpublishPagesForSessions } from "./publishStore.js";
import { deleteChatShare } from "./chatShares.js";

// ---------------------------------------------------------------------
// Chat ID generation — short, URL-safe, unguessable
// ---------------------------------------------------------------------
const CHAT_ID_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
const CHAT_ID_LEN = 12;

export function generateChatId() {
  const bytes = crypto.getRandomValues(new Uint8Array(CHAT_ID_LEN));
  let id = "";
  for (let i = 0; i < CHAT_ID_LEN; i++) {
    id += CHAT_ID_CHARS[bytes[i] % CHAT_ID_CHARS.length];
  }
  return id;
}

// Valid chatId: starts alphanumeric, 8-32 chars of alnum + _ -
const VALID_CHAT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,31}$/;
const VALID_TITLE_LEN = 120;

// ---------------------------------------------------------------------
// D1 schema helpers
// ---------------------------------------------------------------------
// Keyed by the D1 binding, not a module flag: a long-lived isolate keeps one
// binding, while tests and local dev swap the database between runs and must
// get their schema bootstrapped again.
const tablesReady = new WeakMap();
export async function ensureChatsTables(env) {
  if (!env?.DB) return;
  const cached = tablesReady.get(env.DB);
  if (cached) return cached;
  const ready = (async () => {
    // Table/index/column text lives in worker/dbSchema.js; the control flow
    // stays here: parallel creates, then the three column migrations with
    // duplicate-column tolerance (any other error is real and rethrown),
    // then the manual-order table and indexes.
    // Run table creates in parallel, not 4 sequential round-trips
    await Promise.all([
      env.DB.prepare(TABLE_CHATS).run(),
      env.DB.prepare(TABLE_CHAT_MESSAGES).run(),
    ]);
    // `project_id` belongs to the projects feature, but it is added here with
    // the rest of the chats schema: every chats read selects the column, so
    // it must exist as soon as the chats table does. A second run fails with
    // "duplicate column name" and is ignored on purpose.
    try {
      await env.DB.prepare(COLUMN_CHATS_PROJECT_ID).run();
    } catch (e) {
      // "duplicate column name" is the expected answer on every run after the
      // first. Any other failure is real and must not be swallowed: the very
      // next chats read selects this column.
      if (!/duplicate column/i.test(String(e?.message || e))) throw e;
    }
    // `pinned_at` belongs to the sidebar's Pinned section: null means the chat
    // lives in its normal place (a project or the recent list), a timestamp
    // means it is held in the Pinned list. Added the same way as project_id,
    // and for the same reason: the chats list selects it.
    try {
      await env.DB.prepare(COLUMN_CHATS_PINNED_AT).run();
    } catch (e) {
      if (!/duplicate column/i.test(String(e?.message || e))) throw e;
    }
    // `sort_order` is the manual sidebar order. A list (Recents, Pinned, one
    // project folder) is recency-ordered until the user drags inside it; the
    // first drag freezes that list into manual order and every member gets an
    // explicit position then (lazy normalization — no backfill, no migration).
    // Until then the column stays NULL and is never read.
    try {
      await env.DB.prepare(COLUMN_CHATS_SORT_ORDER).run();
    } catch (e) {
      if (!/duplicate column/i.test(String(e?.message || e))) throw e;
    }
    // One row per manually-ordered list: `recents`, `pinned`,
    // `project:<id>`. Presence of the row IS the flag.
    await env.DB.prepare(TABLE_CHAT_LIST_MANUAL).run();
    await Promise.all([
      env.DB.prepare(INDEX_CHATS_USER_UPDATED).run(),
      env.DB.prepare(INDEX_CHATS_PROJECT).run(),
      env.DB.prepare(INDEX_MESSAGES_CHAT_CREATED).run(),
    ]);
  })();
  tablesReady.set(env.DB, ready);
  try {
    await ready;
  } catch (e) {
    console.warn("ensureChatsTables failed:", safeErrorDetail(e));
    // Allow retry on next request
    tablesReady.delete(env.DB);
    throw e;
  }
}

function sanitizeTitle(title) {
  if (typeof title !== "string") return "New Conversation";
  const t = title.trim().slice(0, VALID_TITLE_LEN);
  return t || "New Conversation";
}

function sanitizeContent(content) {
  if (typeof content === "string") return content;
  if (content == null) return "";
  return String(content);
}

// ---------------------------------------------------------------------
// Manual sidebar order — shared by chats.js and projects.js
// ---------------------------------------------------------------------
// A display list is one sidebar section: `pinned`, `recents`, or
// `project:<id>`. The key must match the client's display rule exactly: a
// pinned chat lives in Pinned no matter which folder it also belongs to, and
// a chat whose folder is gone (or belongs to nobody) falls back to Recents.
export function displayListKey(chatRow, projectIds) {
  if (chatRow?.pinned_at) return "pinned";
  if (chatRow?.project_id && projectIds?.has(chatRow.project_id)) {
    return `project:${chatRow.project_id}`;
  }
  return "recents";
}

/** Set of project ids owned by the user — the membership half of the rule. */
export async function userProjectIds(env, userId) {
  try {
    const rows = await env.DB.prepare(
      "SELECT id FROM projects WHERE user_id = ?",
    )
      .bind(userId)
      .all();
    return new Set((rows?.results || []).map((r) => r.id));
  } catch (e) {
    // A deployment that never used folders has no projects table yet; every
    // chat then falls back to Recents. Any other failure is real.
    if (!/no such table/i.test(String(e?.message || e))) throw e;
    return new Set();
  }
}

/** All of the account's chats with the columns ordering needs. */
async function orderableChats(env, userId) {
  const rows = await env.DB.prepare(
    "SELECT id, project_id, pinned_at, sort_order, updated_at FROM chats WHERE user_id = ? LIMIT 1000",
  )
    .bind(userId)
    .all();
  return rows?.results || [];
}

function sortMembers(members, listKey, manual) {
  const key = (c) =>
    manual
      ? (c.sort_order ?? Number.NEGATIVE_INFINITY)
      : listKey === "pinned"
        ? (c.pinned_at ?? 0)
        : (c.updated_at ?? 0);
  return [...members].sort(
    (a, b) => key(b) - key(a) || (a.id < b.id ? -1 : 1),
  );
}

export async function isListManual(env, userId, listKey) {
  const row = await env.DB.prepare(
    "SELECT 1 AS one FROM chat_list_manual WHERE user_id = ? AND list_key = ?",
  )
    .bind(userId, listKey)
    .first();
  return Boolean(row);
}

export async function clearListManual(env, userId, listKey) {
  await env.DB.prepare(
    "DELETE FROM chat_list_manual WHERE user_id = ? AND list_key = ?",
  )
    .bind(userId, listKey)
    .run();
}

/** Member ids of one display list in current display order. */
export async function listMemberIds(env, userId, listKey) {
  const manual = await isListManual(env, userId, listKey);
  const projectIds = await userProjectIds(env, userId);
  const chats = await orderableChats(env, userId);
  const members = chats.filter(
    (c) => displayListKey(c, projectIds) === listKey,
  );
  return { ids: sortMembers(members, listKey, manual).map((c) => c.id), manual };
}

/** The position above the current top of a list: joins always land on top. */
export async function topSortOrder(env, userId, listKey) {
  const projectIds = await userProjectIds(env, userId);
  const chats = await orderableChats(env, userId);
  let top = 0;
  for (const c of chats) {
    if (displayListKey(c, projectIds) !== listKey) continue;
    if (typeof c.sort_order === "number" && c.sort_order > top) {
      top = c.sort_order;
    }
  }
  return top + 1;
}

// Smart compact summary builder for server-side compaction
// Mirrors src/services/contextStore.js buildContextSummary without persistence
function buildWorkerCompactSummary(messages) {
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

function applySmartCompact(messages, url) {
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

function extractChatAssetKeys(messages) {
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
async function hasPublishMarker(bucket, key) {
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

async function deleteBucketPrefix(bucket, prefix) {
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

// ---------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------
export async function handleChats(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Ensure tables
  await ensureChatsTables(env);

  if (!env?.DB) {
    return jsonResponse(500, {
      error: "Chat database not configured (D1 missing).",
    });
  }

  // Auth required
  const session = await verifySession(request, env);
  if (!session) {
    return jsonResponse(401, {
      error: "Authentication required. Please log in.",
    });
  }
  const userId = session.uid;

  // -------------------------------------------------------------------
  // GET /api/chats — list my chats
  // -------------------------------------------------------------------
  if (pathname === "/api/chats" && request.method === "GET") {
    try {
      const [rows, flagRows] = await Promise.all([
        env.DB.prepare(
          "SELECT id, title, created_at as createdAt, updated_at as updatedAt, project_id as projectId, pinned_at as pinnedAt, sort_order as sortOrder FROM chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100",
        )
          .bind(userId)
          .all(),
        env.DB.prepare(
          "SELECT list_key FROM chat_list_manual WHERE user_id = ?",
        )
          .bind(userId)
          .all(),
      ]);
      const chats = (rows?.results || []).map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        projectId: r.projectId || null,
        pinnedAt: r.pinnedAt || null,
        sortOrder: r.sortOrder ?? null,
      }));
      const manualLists = (flagRows?.results || []).map((r) => r.list_key);
      return jsonResponse(200, { chats, manualLists });
    } catch (e) {
      console.error("GET /api/chats failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to list chats." });
    }
  }

  // -------------------------------------------------------------------
  // POST /api/chats — create new chat
  // -------------------------------------------------------------------
  if (pathname === "/api/chats" && request.method === "POST") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }
    const title = sanitizeTitle(body?.title);
    const id = generateChatId();
    const now = Date.now();
    try {
      // A new chat joins the top of Recents. In a manually-ordered Recents
      // that means an explicit top position; in an auto one the column stays
      // NULL and recency (updated_at, just set) orders it.
      let sortOrder = null;
      if (await isListManual(env, userId, "recents")) {
        sortOrder = await topSortOrder(env, userId, "recents");
      }
      await env.DB.prepare(
        "INSERT INTO chats (id, user_id, title, created_at, updated_at, sort_order) VALUES (?,?,?,?,?,?)",
      )
        .bind(id, userId, title, now, now, sortOrder)
        .run();

      // Optionally create first message if provided
      if (body?.firstMessage && typeof body.firstMessage === "object") {
        const fm = body.firstMessage;
        const role = fm.role === "assistant" ? "assistant" : "user";
        const content = sanitizeContent(fm.content);
        const attachments = fm.attachments
          ? JSON.stringify(fm.attachments)
          : null;
        const msgId = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO chat_messages (id, chat_id, user_id, role, content, attachments, created_at) VALUES (?,?,?,?,?,?,?)",
        )
          .bind(msgId, id, userId, role, content, attachments, now)
          .run();
      }

      return jsonResponse(201, {
        id,
        title,
        createdAt: now,
        updatedAt: now,
        sortOrder,
      });
    } catch (e) {
      console.error("POST /api/chats failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to create chat." });
    }
  }

  // -------------------------------------------------------------------
  // DELETE /api/chats — delete ALL my chats (clear history)
  // -------------------------------------------------------------------
  if (pathname === "/api/chats" && request.method === "DELETE") {
    try {
      // "Clear history" clears folders too — an empty project list is what the
      // user asked for. The projects table belongs to worker/projects.js, so
      // it may not exist on a deployment that never used folders (tolerated);
      // folders go first so a real database fault aborts before any chat is
      // deleted, leaving nothing half-erased.
      try {
        await env.DB.prepare("DELETE FROM projects WHERE user_id = ?")
          .bind(userId)
          .run();
      } catch (e) {
        if (!/no such table/i.test(String(e?.message || e))) throw e;
      }
      // Collect the chat ids BEFORE deleting anything: the R2 cascade below
      // reads each chat's messages for asset references (uploaded images and
      // docs, generated images), and sweeps its per-chat R2 state.
      let chatIds = [];
      try {
        const rows = await env.DB.prepare(
          "SELECT id FROM chats WHERE user_id = ?",
        )
          .bind(userId)
          .all();
        chatIds = (rows?.results || []).map((r) => r.id).filter(Boolean);
      } catch {
        chatIds = [];
      }
      await Promise.all(
        chatIds.map((id) => deleteChatShare(env, userId, id)),
      );
      const { unpublishedSlugs } = await cleanupChatStorage(
        env,
        userId,
        chatIds,
      );
      // Manual orderings die with the history: a fresh account starts fully
      // recency-ordered. The flags table is owned here, so no tolerance dance
      // is needed — ensureChatsTables ran above.
      await env.DB.prepare("DELETE FROM chat_list_manual WHERE user_id = ?")
        .bind(userId)
        .run();
      // Delete messages first
      await env.DB.prepare("DELETE FROM chat_messages WHERE user_id = ?")
        .bind(userId)
        .run();
      await env.DB.prepare("DELETE FROM chats WHERE user_id = ?")
        .bind(userId)
        .run();

      return jsonResponse(200, { success: true, unpublishedSlugs });
    } catch (e) {
      console.error("DELETE /api/chats failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to delete chats." });
    }
  }

  // -------------------------------------------------------------------
  // POST /api/chats/reorder — move a chat within its own sidebar list
  // -------------------------------------------------------------------
  // Body: { chatId, beforeId | afterId }. The chat lands before `beforeId`
  // (or after `afterId`; `beforeId` wins when both are given). All three ids
  // must belong to the signed-in account AND to the same display list —
  // reordering never moves a chat between lists (filing and pinning keep
  // their own endpoints). The first reorder freezes that list into manual
  // order: every member gets an explicit position in one pass, so no
  // backfill or fractional arithmetic is ever needed. A drop that changes
  // nothing is a 200 without a write — an accidental drag must not freeze a
  // happily recency-ordered list.
  if (pathname === "/api/chats/reorder" && request.method === "POST") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }
    const chatId = body?.chatId;
    const beforeId = body?.beforeId ?? null;
    const afterId = body?.afterId ?? null;
    if (
      typeof chatId !== "string" ||
      !VALID_CHAT_ID.test(chatId) ||
      (beforeId !== null &&
        (typeof beforeId !== "string" || !VALID_CHAT_ID.test(beforeId))) ||
      (afterId !== null &&
        (typeof afterId !== "string" || !VALID_CHAT_ID.test(afterId)))
    ) {
      return jsonResponse(400, { error: "chatId and neighbour ids are required." });
    }
    if (beforeId === null && afterId === null) {
      return jsonResponse(400, { error: "Nothing to reorder." });
    }
    if (beforeId === chatId || afterId === chatId) {
      return jsonResponse(400, { error: "A chat cannot reorder around itself." });
    }
    try {
      const wanted = [chatId, beforeId, afterId].filter(Boolean);
      const placeholders = wanted.map(() => "?").join(",");
      const found = await env.DB.prepare(
        `SELECT id, project_id, pinned_at FROM chats WHERE id IN (${placeholders}) AND user_id = ?`,
      )
        .bind(...wanted, userId)
        .all();
      const byId = new Map((found?.results || []).map((r) => [r.id, r]));
      const missing = wanted.find((id) => !byId.has(id));
      if (missing) {
        return jsonResponse(404, { error: "Chat not found." });
      }
      const projectIds = await userProjectIds(env, userId);
      const listKey = displayListKey(byId.get(chatId), projectIds);
      for (const neighbour of [beforeId, afterId]) {
        if (
          neighbour !== null &&
          displayListKey(byId.get(neighbour), projectIds) !== listKey
        ) {
          return jsonResponse(400, {
            error: "Reordering never moves a chat between lists.",
          });
        }
      }
      const { ids } = await listMemberIds(env, userId, listKey);
      const from = ids.indexOf(chatId);
      if (from === -1) {
        return jsonResponse(404, { error: "Chat not found." });
      }
      const without = ids.filter((id) => id !== chatId);
      let to;
      if (beforeId !== null) {
        to = without.indexOf(beforeId);
        if (to === -1) return jsonResponse(404, { error: "Chat not found." });
      } else {
        to = without.indexOf(afterId) + 1;
        if (to === 0) return jsonResponse(404, { error: "Chat not found." });
      }
      // A drop back into its own slot changes nothing and must not freeze
      // the list into manual order.
      const same = without.slice(0, to).concat([chatId], without.slice(to));
      if (same.length === ids.length && same.every((id, i) => id === ids[i])) {
        const current = await env.DB.prepare(
          "SELECT sort_order FROM chats WHERE id = ? AND user_id = ?",
        )
          .bind(chatId, userId)
          .first();
        return jsonResponse(200, {
          id: chatId,
          list: listKey,
          sortOrder: current?.sort_order ?? null,
          manual: false,
        });
      }
      without.splice(to, 0, chatId);
      // Full renormalization, top-first: every member gets an explicit
      // position in one pass, so fractional arithmetic (and its eventual
      // precision collapse) never enters the picture. Chunked: a D1 batch
      // holds at most 100 statements.
      const top = without.length;
      const writes = without.map((id, i) =>
        env.DB.prepare(
          "UPDATE chats SET sort_order = ? WHERE id = ? AND user_id = ?",
        ).bind(top - i, id, userId),
      );
      writes.push(
        env.DB.prepare(
          "INSERT OR IGNORE INTO chat_list_manual (user_id, list_key) VALUES (?,?)",
        ).bind(userId, listKey),
      );
      for (let i = 0; i < writes.length; i += 100) {
        await env.DB.batch(writes.slice(i, i + 100));
      }
      return jsonResponse(200, {
        id: chatId,
        list: listKey,
        sortOrder: top - without.indexOf(chatId),
        manual: true,
      });
    } catch (e) {
      console.error("POST /api/chats/reorder failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to reorder the chat." });
    }
  }

  // -------------------------------------------------------------------
  // Routes with :chatId
  // -------------------------------------------------------------------
  // Match /api/chats/:chatId and /api/chats/:chatId/messages
  const chatIdMatch = pathname.match(/^\/api\/chats\/([^/]+)(\/messages)?$/);
  if (!chatIdMatch) {
    return jsonResponse(404, { error: "Chat route not found." });
  }
  const rawChatId = decodeURIComponent(chatIdMatch[1] || "");
  const isMessagesSubroute = Boolean(chatIdMatch[2]);

  if (!VALID_CHAT_ID.test(rawChatId)) {
    return jsonResponse(400, { error: "Invalid chat id." });
  }
  const chatId = rawChatId;

  // Verify ownership
  let chatRow;
  try {
    chatRow = await env.DB.prepare(
      "SELECT id, title, user_id, created_at, updated_at, project_id, pinned_at, sort_order FROM chats WHERE id = ?",
    )
      .bind(chatId)
      .first();
  } catch (e) {
    console.error("Chat lookup failed:", safeErrorDetail(e));
    return jsonResponse(500, { error: "Failed to lookup chat." });
  }
  if (!chatRow) {
    return jsonResponse(404, { error: "Chat not found." });
  }
  if (chatRow.user_id !== userId) {
    return jsonResponse(403, { error: "Not authorized for this chat." });
  }

  // -------------------------------------------------------------------
  // GET /api/chats/:id — fetch single chat with messages (supports ?limit=&compact=&keep=)
  // -------------------------------------------------------------------
  if (!isMessagesSubroute && request.method === "GET") {
    try {
      const msgRows = await env.DB.prepare(
        "SELECT id, role, content, attachments, created_at as createdAt FROM chat_messages WHERE chat_id = ? AND user_id = ? ORDER BY created_at ASC LIMIT 500",
      )
        .bind(chatId, userId)
        .all();
      let messages = (msgRows?.results || []).map((r) => {
        let attachments = null;
        if (r.attachments) {
          try {
            attachments = JSON.parse(r.attachments);
          } catch {
            attachments = null;
          }
        }
        return {
          id: r.id,
          role: r.role,
          content: r.content,
          attachments,
          createdAt: r.createdAt,
        };
      });
      const compacted = applySmartCompact(messages, url);
      messages = compacted.messages;
      const headers = {};
      if (compacted.meta)
        headers["X-Corez-Compact"] = JSON.stringify(compacted.meta);
      return jsonResponse(
        200,
        {
          id: chatRow.id,
          title: chatRow.title,
          createdAt: chatRow.created_at,
          updatedAt: chatRow.updated_at,
          projectId: chatRow.project_id || null,
          pinnedAt: chatRow.pinned_at || null,
          sortOrder: chatRow.sort_order ?? null,
          messages,
          ...(compacted.meta ? { compactMeta: compacted.meta } : {}),
        },
        headers,
      );
    } catch (e) {
      console.error("GET /api/chats/:id failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to fetch chat." });
    }
  }

  // -------------------------------------------------------------------
  // PATCH /api/chats/:id — update the title and/or the pinned flag
  // -------------------------------------------------------------------
  if (!isMessagesSubroute && request.method === "PATCH") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON." });
    }
    const wantsTitle = body?.title !== undefined;
    const wantsPinned = typeof body?.pinned === "boolean";
    if (!wantsTitle && !wantsPinned) {
      return jsonResponse(400, { error: "Nothing to update." });
    }
    const now = Date.now();
    const sets = [];
    const binds = [];
    if (wantsTitle) {
      // A rename is a real change to the chat, so it also moves it in Recents.
      sets.push("title = ?", "updated_at = ?");
      binds.push(sanitizeTitle(body.title), now);
    }
    if (wantsPinned) {
      // Pinning deliberately does NOT touch updated_at: in an auto-ordered
      // home list, unpinning must return the chat to its true recency place,
      // not to the top of it. (In a manually-ordered home list there is no
      // recency place — joins land on top, like everywhere else.)
      sets.push("pinned_at = ?");
      binds.push(body.pinned ? now : null);
    }
    try {
      await env.DB.prepare(
        `UPDATE chats SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
      )
        .bind(...binds, chatId, userId)
        .run();
      // A chat joining a manually-ordered list lands on top of it: pinning
      // into a manual Pinned, or unpinning into a manual home list.
      let sortOrder = null;
      if (wantsPinned) {
        let homeKey = null;
        if (body.pinned) {
          homeKey = "pinned";
        } else if (chatRow.project_id) {
          const projectIds = await userProjectIds(env, userId);
          homeKey = projectIds.has(chatRow.project_id)
            ? `project:${chatRow.project_id}`
            : "recents";
        } else {
          homeKey = "recents";
        }
        if (await isListManual(env, userId, homeKey)) {
          sortOrder = await topSortOrder(env, userId, homeKey);
          await env.DB.prepare(
            "UPDATE chats SET sort_order = ? WHERE id = ? AND user_id = ?",
          )
            .bind(sortOrder, chatId, userId)
            .run();
        }
      }
      return jsonResponse(200, {
        id: chatId,
        ...(wantsTitle
          ? { title: sanitizeTitle(body.title), updatedAt: now }
          : {}),
        ...(wantsPinned
          ? {
              pinned: body.pinned,
              pinnedAt: body.pinned ? now : null,
              sortOrder,
            }
          : {}),
      });
    } catch (e) {
      console.error("PATCH /api/chats/:id failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to update chat." });
    }
  }

  // -------------------------------------------------------------------
  // PUT /api/chats/:id — bulk sync (title + messages) for migration
  // -------------------------------------------------------------------
  if (!isMessagesSubroute && request.method === "PUT") {
    // Bulk sync: replace messages (for migration / full sync)
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON." });
    }
    const newTitle = body?.title != null ? sanitizeTitle(body.title) : null;
    const incomingMessages = Array.isArray(body?.messages)
      ? body.messages
      : null;
    const now = Date.now();
    try {
      if (newTitle != null) {
        await env.DB.prepare(
          "UPDATE chats SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        )
          .bind(newTitle, now, chatId, userId)
          .run();
      } else {
        await env.DB.prepare(
          "UPDATE chats SET updated_at = ? WHERE id = ? AND user_id = ?",
        )
          .bind(now, chatId, userId)
          .run();
      }
      if (incomingMessages) {
        // Replace all messages
        await env.DB.prepare(
          "DELETE FROM chat_messages WHERE chat_id = ? AND user_id = ?",
        )
          .bind(chatId, userId)
          .run();
        for (let i = 0; i < incomingMessages.length; i++) {
          const m = incomingMessages[i];
          const role = m.role === "assistant" ? "assistant" : "user";
          const content = sanitizeContent(m.content);
          const attachments = m.attachments
            ? JSON.stringify(m.attachments)
            : null;
          const createdAt = Number(m.createdAt) || now + i;
          const msgId =
            m.id && typeof m.id === "string" ? m.id : crypto.randomUUID();
          await env.DB.prepare(
            "INSERT INTO chat_messages (id, chat_id, user_id, role, content, attachments, created_at) VALUES (?,?,?,?,?,?,?)",
          )
            .bind(msgId, chatId, userId, role, content, attachments, createdAt)
            .run();
        }
      }
      return jsonResponse(200, {
        id: chatId,
        title: newTitle || chatRow.title,
        updatedAt: now,
      });
    } catch (e) {
      console.error("PUT /api/chats/:id failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to sync chat." });
    }
  }

  if (!isMessagesSubroute && request.method === "DELETE") {
    try {
      // Cascade first: the chat's R2 state (apps, uploaded assets, generated
      // images referenced by its messages, context index) is read from the
      // messages, and the pages it published are unpublished, so both must run
      // before the D1 rows are deleted.
      await deleteChatShare(env, userId, chatId);
      const { unpublishedSlugs } = await cleanupChatStorage(env, userId, [
        chatId,
      ]);
      await env.DB.prepare(
        "DELETE FROM chat_messages WHERE chat_id = ? AND user_id = ?",
      )
        .bind(chatId, userId)
        .run();
      await env.DB.prepare("DELETE FROM chats WHERE id = ? AND user_id = ?")
        .bind(chatId, userId)
        .run();
      return jsonResponse(200, {
        success: true,
        id: chatId,
        unpublishedSlugs,
      });
    } catch (e) {
      console.error("DELETE /api/chats/:id failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to delete chat." });
    }
  }

  // -------------------------------------------------------------------
  // POST /api/chats/:id/messages — append single message
  // -------------------------------------------------------------------
  if (isMessagesSubroute && request.method === "POST") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON." });
    }
    const role =
      body?.role === "assistant"
        ? "assistant"
        : body?.role === "system"
          ? "system"
          : "user";
    const content = sanitizeContent(body?.content);
    if (!content && !body?.attachments) {
      return jsonResponse(400, {
        error: "Message content or attachments required.",
      });
    }
    const attachments = body?.attachments
      ? JSON.stringify(body.attachments)
      : null;
    const now = Date.now();
    const msgId = crypto.randomUUID();
    try {
      await env.DB.prepare(
        "INSERT INTO chat_messages (id, chat_id, user_id, role, content, attachments, created_at) VALUES (?,?,?,?,?,?,?)",
      )
        .bind(msgId, chatId, userId, role, content, attachments, now)
        .run();
      await env.DB.prepare(
        "UPDATE chats SET updated_at = ? WHERE id = ? AND user_id = ?",
      )
        .bind(now, chatId, userId)
        .run();
      return jsonResponse(201, {
        id: msgId,
        chatId,
        role,
        content,
        attachments: body?.attachments || null,
        createdAt: now,
      });
    } catch (e) {
      console.error("POST /api/chats/:id/messages failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to append message." });
    }
  }

  // -------------------------------------------------------------------
  // GET /api/chats/:id/messages — list messages (alternative, supports ?limit=&compact=&keep=)
  // -------------------------------------------------------------------
  if (isMessagesSubroute && request.method === "GET") {
    try {
      const msgRows = await env.DB.prepare(
        "SELECT id, role, content, attachments, created_at as createdAt FROM chat_messages WHERE chat_id = ? AND user_id = ? ORDER BY created_at ASC LIMIT 500",
      )
        .bind(chatId, userId)
        .all();
      let messages = (msgRows?.results || []).map((r) => {
        let attachments = null;
        if (r.attachments) {
          try {
            attachments = JSON.parse(r.attachments);
          } catch {
            attachments = null;
          }
        }
        return {
          id: r.id,
          role: r.role,
          content: r.content,
          attachments,
          createdAt: r.createdAt,
        };
      });
      const compacted = applySmartCompact(messages, url);
      messages = compacted.messages;
      const headers = {};
      if (compacted.meta)
        headers["X-Corez-Compact"] = JSON.stringify(compacted.meta);
      return jsonResponse(
        200,
        {
          chatId,
          messages,
          ...(compacted.meta ? { compactMeta: compacted.meta } : {}),
        },
        headers,
      );
    } catch (e) {
      console.error("GET /api/chats/:id/messages failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to fetch messages." });
    }
  }

  return jsonResponse(405, { error: "Method not allowed." });
}
