// Per-user long-term memory backed by SQLite (D1) with an R2 fallback.
//
// Every fact lives in its owner's perspective: all rows/objects are namespaced
// by the verified session identity (uid), so one account can never read or
// delete another user's memories. When `env.DB` (D1) is available it is the
// source of truth; otherwise (local dev, test envs without D1) the legacy R2
// JSON layout (`memory/<userId>/<key>.json`) is used unchanged. Legacy R2
// records are imported into SQLite exactly once per user on first D1-backed
// read, so nothing ever stored is lost in the move.

import { verifySession } from "./auth.js";
import {
  jsonResponse,
  readBoundedJson,
  safeErrorDetail,
  createRateLimiter,
} from "./utils.js";

// Mirrors SAFE_STORAGE_SEGMENT in index.js (single canonical copy lives here
// for the memory module so it stays import-cycle free).
const SAFE_STORAGE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

const memoryRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });

// Session identity for the memory namespace. Mirrors sessionUid() in
// index.js: the verified session wins, and environments without AUTH_SECRET
// (local dev) fall back to the shared "dev" namespace.
async function sessionUid(request, env) {
  const sess = await verifySession(request, env);
  if (sess?.uid) return sess.uid;
  if (!env?.AUTH_SECRET) return "dev";
  return null;
}

export function publicMemoryRecord(record) {
  if (!record || typeof record !== "object") return record;
  const publicRecord = { ...record };
  // Embeddings are server-side only: never expose raw vectors to clients.
  delete publicRecord.embedding;
  delete publicRecord.embeddingModel;
  return publicRecord;
}

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SQLite (D1) storage
// ---------------------------------------------------------------------------

export async function ensureMemoryTables(env) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS user_memories (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        text TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      )`,
    ).run();
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_user_memories_user_updated ON user_memories(user_id, updated_at DESC)`,
    ).run();
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_user_memories_user_category ON user_memories(user_id, category)`,
    ).run();
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS memory_migrations (
        user_id TEXT PRIMARY KEY,
        migrated_at TEXT NOT NULL
      )`,
    ).run();
  } catch (e) {
    console.warn("ensureMemoryTables failed", safeErrorDetail(e));
  }
}

function parseJsonField(value, fallback) {
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function rowToRecord(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    key: row.key,
    category: row.category,
    text: row.text,
    tags: parseJsonField(row.tags, []),
    metadata: parseJsonField(row.metadata, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Escape a literal substring for a LIKE pattern so keyword search keeps the
// exact R2 `includes()` semantics (a query for "100%" must not act as a
// wildcard).
function escapeLikePattern(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function d1StoreMemory(env, { userId, key, category, text, tags, metadata, createdAt }) {
  const now = new Date().toISOString();
  const existing = await env.DB.prepare(
    `SELECT created_at FROM user_memories WHERE user_id = ? AND key = ?`,
  )
    .bind(userId, key)
    .first();
  const created = existing?.created_at || createdAt || now;
  await env.DB.prepare(
    `INSERT INTO user_memories (user_id, key, category, text, tags, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET
       category = excluded.category,
       text = excluded.text,
       tags = excluded.tags,
       metadata = excluded.metadata,
       updated_at = excluded.updated_at`,
  )
    .bind(
      userId,
      key,
      category,
      text,
      JSON.stringify(Array.isArray(tags) ? tags : []),
      JSON.stringify(metadata && typeof metadata === "object" ? metadata : {}),
      created,
      now,
    )
    .run();
  return {
    userId,
    key,
    category,
    text,
    tags: Array.isArray(tags) ? tags : [],
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    createdAt: created,
    updatedAt: now,
  };
}

export async function d1ListMemories(env, userId) {
  const result = await env.DB.prepare(
    `SELECT user_id, key, category, text, tags, metadata, created_at, updated_at
     FROM user_memories WHERE user_id = ? ORDER BY updated_at DESC`,
  )
    .bind(userId)
    .all();
  return (result?.results || []).map(rowToRecord).filter(Boolean);
}

export async function d1SearchMemories(env, { userId, query, category }) {
  const categoryFilter = typeof category === "string" ? category.trim() : "";
  const q = typeof query === "string" ? query.trim().toLowerCase() : "";
  let sql =
    `SELECT user_id, key, category, text, tags, metadata, created_at, updated_at
     FROM user_memories WHERE user_id = ?`;
  const params = [userId];
  if (categoryFilter) {
    sql += ` AND lower(category) = lower(?)`;
    params.push(categoryFilter);
  }
  if (q) {
    const like = `%${escapeLikePattern(q)}%`;
    sql += ` AND (lower(text) LIKE ? ESCAPE '\\' OR lower(key) LIKE ? ESCAPE '\\' OR lower(category) LIKE ? ESCAPE '\\')`;
    params.push(like, like, like);
  }
  sql += ` ORDER BY updated_at DESC`;
  const result = await env.DB.prepare(sql).bind(...params).all();
  return (result?.results || []).map(rowToRecord).filter(Boolean);
}

export async function d1DeleteMemory(env, { userId, key }) {
  await env.DB.prepare(`DELETE FROM user_memories WHERE user_id = ? AND key = ?`)
    .bind(userId, key)
    .run();
}

// Inferred interest memory (profiler): repeated behavioral signals
// accumulate confidence instead of overwriting. First sighting starts at
// 0.35, each reinforcement adds 0.15 up to a 0.95 cap; per plan there is no
// time decay — inferences persist until explicitly forgotten. Rows live in
// the same table with category "inference" and a metadata envelope:
// { confidence, evidence_count, first_seen, last_seen, status, topic }.
export async function d1UpsertInference(env, { userId, key, text, topic }) {
  const now = new Date().toISOString();
  let existing = null;
  try {
    const rows = await d1SearchMemories(env, { userId });
    existing = (rows || []).find((r) => r.key === key) || null;
  } catch {
    // Missing table or DB hiccup: treat as first sighting.
  }
  const prevMeta =
    existing?.metadata && typeof existing.metadata === "object"
      ? existing.metadata
      : {};
  const prevCount =
    Number.isFinite(prevMeta.evidence_count) && prevMeta.evidence_count > 0
      ? Math.floor(prevMeta.evidence_count)
      : 0;
  const evidence_count = prevCount + 1;
  const confidence = Math.min(0.95, 0.35 + 0.15 * evidence_count);
  return d1StoreMemory(env, {
    userId,
    key,
    category: "inference",
    text,
    tags: ["inferred"],
    metadata: {
      confidence: Math.round(confidence * 100) / 100,
      evidence_count,
      first_seen: prevMeta.first_seen || existing?.createdAt || now,
      last_seen: now,
      status: "inferred",
      topic: topic || key,
    },
  });
}

// Minimal account lookup for chat-time identity answers ("who am I").
// Never throws: a missing users table or DB simply means "no account info".
export async function getUserAccount(env, userId) {
  try {
    if (!env?.DB || typeof userId !== "string" || !userId) return null;
    const row = await env.DB.prepare(
      `SELECT id, email, plan FROM users WHERE id = ?`,
    )
      .bind(userId)
      .first();
    if (!row) return null;
    return {
      id: row.id,
      email: typeof row.email === "string" ? row.email : null,
      plan:
        typeof row.plan === "string" && row.plan.trim()
          ? row.plan.trim().toLowerCase()
          : "free",
    };
  } catch {
    return null;
  }
}

// One-time legacy import: R2 JSON records for this user move into SQLite on
// first D1-backed read. INSERT OR IGNORE keeps D1 authoritative on key
// conflicts; the migration flag makes this exactly-once per user.
async function migrateR2MemoriesToD1(env, userId) {
  try {
    await ensureMemoryTables(env);
    const flag = await env.DB.prepare(
      `SELECT user_id FROM memory_migrations WHERE user_id = ?`,
    )
      .bind(userId)
      .first();
    if (flag) return { migrated: false, imported: 0 };
    let imported = 0;
    if (env?.ASSET_BUCKET) {
      const prefix = `memory/${userId}/`;
      const list = await env.ASSET_BUCKET.list({ prefix });
      const objects = (list?.objects || []).filter((obj) =>
        String(obj.key || "").endsWith(".json"),
      );
      for (const obj of objects) {
        try {
          const item = await env.ASSET_BUCKET.get(obj.key);
          if (!item) continue;
          const data = JSON.parse(await item.text());
          if (!data || typeof data.text !== "string" || !data.text) continue;
          const fileKey = String(obj.key).slice(prefix.length).replace(/\.json$/, "");
          const key =
            typeof data.key === "string" && SAFE_STORAGE_SEGMENT.test(data.key)
              ? data.key
              : fileKey;
          if (!SAFE_STORAGE_SEGMENT.test(key)) continue;
          await env.DB.prepare(
            `INSERT OR IGNORE INTO user_memories (user_id, key, category, text, tags, metadata, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(
              userId,
              key,
              typeof data.category === "string" ? data.category : "general",
              data.text,
              JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
              JSON.stringify(data.metadata && typeof data.metadata === "object" ? data.metadata : {}),
              data.createdAt || data.created_at || new Date().toISOString(),
              data.updatedAt || data.updated_at || new Date().toISOString(),
            )
            .run();
          imported += 1;
          try {
            await env.ASSET_BUCKET.delete(obj.key);
          } catch {}
        } catch {}
      }
    }
    await env.DB.prepare(
      `INSERT OR IGNORE INTO memory_migrations (user_id, migrated_at) VALUES (?, ?)`,
    )
      .bind(userId, new Date().toISOString())
      .run();
    return { migrated: true, imported };
  } catch (e) {
    console.warn("migrateR2MemoriesToD1 failed", safeErrorDetail(e));
    return { migrated: false, imported: 0 };
  }
}

async function bestEffortR2Delete(env, userId, key) {
  try {
    if (env?.ASSET_BUCKET) {
      await env.ASSET_BUCKET.delete(`memory/${userId}/${key}.json`);
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// Legacy R2 storage (used when env.DB is unavailable)
// ---------------------------------------------------------------------------

function r2RecordToMemory(data) {
  return {
    userId: data.userId,
    key: data.key,
    category: data.category,
    text: data.text,
    tags: data.tags,
    metadata: data.metadata,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

async function r2ListMemories(env, userId) {
  const prefix = `memory/${userId}/`;
  const list = await env.ASSET_BUCKET.list({ prefix });
  const memories = [];
  if (list && Array.isArray(list.objects)) {
    const jsonObjects = list.objects.filter((obj) => obj.key.endsWith(".json"));
    const items = await Promise.all(jsonObjects.map((obj) => env.ASSET_BUCKET.get(obj.key)));
    for (const item of items) {
      if (!item) continue;
      try {
        const data = JSON.parse(await item.text());
        memories.push(r2RecordToMemory(data));
      } catch {
        /* ignore invalid cache entries */
      }
    }
  }
  return memories;
}

// ---------------------------------------------------------------------------
// HTTP handler: POST /api/memory/store, POST /api/memory/search,
// GET /api/memory/:userId, DELETE /api/memory/:userId/:key
// ---------------------------------------------------------------------------

export async function handleMemory(request, env) {
  const useD1 = Boolean(env?.DB);
  if (!useD1 && !env?.ASSET_BUCKET) {
    return jsonResponse(530, {
      error: "R2 storage (ASSET_BUCKET) is not configured.",
    });
  }
  if (useD1) await ensureMemoryTables(env);

  const uid = await sessionUid(request, env);
  if (!uid) {
    return jsonResponse(401, { error: "Authentication required." });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. POST /api/memory/store - Store or update a memory entry
  if (pathname === "/api/memory/store" && request.method === "POST") {
    const retryAfter = memoryRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(
        429,
        { error: "Too many memory requests. Try again shortly." },
        { "Retry-After": String(retryAfter) },
      );
    }
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }

    // Identity comes from the verified session only; any client-supplied
    // userId is ignored so one account can never touch another's namespace.
    const userId = uid;
    const keyName =
      typeof body?.key === "string" ? body.key.trim() : `mem_${Date.now()}`;
    const category =
      typeof body?.category === "string" ? body.category.trim() : "general";
    const text =
      typeof body?.text === "string"
        ? body.text
        : typeof body?.value === "string"
          ? body.value
          : "";

    if (!text) {
      return jsonResponse(400, {
        error: "text or value content is required for memory storage.",
      });
    }
    if (!SAFE_STORAGE_SEGMENT.test(userId)) {
      return jsonResponse(400, {
        error:
          "Invalid userId: use letters, digits, dots, dashes or underscores.",
      });
    }
    if (!SAFE_STORAGE_SEGMENT.test(keyName)) {
      return jsonResponse(400, {
        error:
          "Invalid memory key: use letters, digits, dots, dashes or underscores.",
      });
    }

    if (useD1) {
      const memoryRecord = await d1StoreMemory(env, {
        userId,
        key: keyName,
        category,
        text,
        tags: body?.tags,
        metadata: body?.metadata,
        createdAt: body?.createdAt,
      });
      // Drop any legacy R2 twin so the SQLite row is the single copy.
      await bestEffortR2Delete(env, userId, keyName);
      return jsonResponse(200, {
        success: true,
        userId,
        key: keyName,
        r2Key: null,
        storage: "d1",
        embeddingStored: false,
        record: publicMemoryRecord(memoryRecord),
      });
    }

    const now = new Date().toISOString();
    const memoryRecord = {
      userId,
      key: keyName,
      category,
      text,
      metadata: body?.metadata || {},
      tags: Array.isArray(body?.tags) ? body.tags : [],
      updatedAt: now,
      createdAt: body?.createdAt || now,
    };

    const key = `memory/${userId}/${keyName}.json`;
    await env.ASSET_BUCKET.put(key, JSON.stringify(memoryRecord), {
      httpMetadata: { contentType: "application/json" },
    });

    return jsonResponse(200, {
      success: true,
      userId,
      key: keyName,
      r2Key: key,
      storage: "r2",
      embeddingStored: false,
      record: publicMemoryRecord(memoryRecord),
    });
  }

  // 2. POST /api/memory/search - Search relevant memories
  if (pathname === "/api/memory/search" && request.method === "POST") {
    const retryAfter = memoryRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(
        429,
        { error: "Too many memory requests. Try again shortly." },
        { "Retry-After": String(retryAfter) },
      );
    }
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }

    // Scoped to the verified session's namespace; body.userId is ignored.
    const userId = uid;
    const query =
      typeof body?.query === "string" ? body.query.trim().toLowerCase() : "";
    const categoryFilter =
      typeof body?.category === "string"
        ? body.category.trim().toLowerCase()
        : "";

    if (!SAFE_STORAGE_SEGMENT.test(userId)) {
      return jsonResponse(400, {
        error:
          "Invalid userId: use letters, digits, dots, dashes or underscores.",
      });
    }

    if (useD1) {
      await migrateR2MemoriesToD1(env, userId);
      const matches = await d1SearchMemories(env, {
        userId,
        query,
        category: categoryFilter,
      });
      return jsonResponse(200, {
        userId,
        query,
        matches: matches.map(publicMemoryRecord),
        source: "keyword",
      });
    }

    const memories = await r2ListMemories(env, userId);
    const matches = memories.filter((m) => {
      const catLower = String(m.category || "").toLowerCase();
      return !categoryFilter || catLower === categoryFilter;
    });

    if (!query) {
      const publicMatches = matches.map(publicMemoryRecord);
      return jsonResponse(200, {
        userId,
        query,
        matches: publicMatches,
        source: "keyword",
      });
    }

    const keywordMatches = matches
      .filter((m) => {
        const textLower = String(m.text || "").toLowerCase();
        const keyLower = String(m.key || "").toLowerCase();
        const catLower = String(m.category || "").toLowerCase();
        return (
          textLower.includes(query) ||
          keyLower.includes(query) ||
          catLower.includes(query)
        );
      })
      .map(publicMemoryRecord);

    return jsonResponse(200, {
      userId,
      query,
      matches: keywordMatches,
      source: "keyword",
    });
  }

  // 3. GET /api/memory/:userId - List all memories for a user
  if (request.method === "GET" && pathname.match(/^\/api\/memory\/[^/]+$/)) {
    // The path userId is ignored for scoping: only the session's namespace
    // is ever listed.
    const userId = uid;
    if (useD1) {
      await migrateR2MemoriesToD1(env, userId);
      const memories = await d1ListMemories(env, userId);
      return jsonResponse(200, {
        userId,
        memories: memories.map(publicMemoryRecord),
      });
    }
    const memories = await r2ListMemories(env, userId);
    return jsonResponse(200, {
      userId,
      memories: memories.map(publicMemoryRecord),
    });
  }

  // 4. DELETE /api/memory/:userId/:key - Delete a memory
  if (
    request.method === "DELETE" &&
    pathname.match(/^\/api\/memory\/[^/]+\/[^/]+$/)
  ) {
    const retryAfter = memoryRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(
        429,
        { error: "Too many memory requests. Try again shortly." },
        { "Retry-After": String(retryAfter) },
      );
    }
    const parts = pathname.replace("/api/memory/", "").split("/");
    const keyName = decodePathSegment(parts[1]);
    if (keyName === null || !SAFE_STORAGE_SEGMENT.test(keyName)) {
      return jsonResponse(400, { error: "Invalid path segment." });
    }

    // Scoped to the session's namespace; the path userId is ignored.
    const userId = uid;
    if (useD1) {
      await d1DeleteMemory(env, { userId, key: keyName });
      // Also clear any legacy R2 twin so a future read cannot resurrect it.
      await bestEffortR2Delete(env, userId, keyName);
      return jsonResponse(200, { success: true, userId, key: keyName });
    }
    const key = `memory/${userId}/${keyName}.json`;
    await env.ASSET_BUCKET.delete(key);
    return jsonResponse(200, { success: true, userId, key: keyName });
  }

  return jsonResponse(405, { error: "Method not allowed." });
}
