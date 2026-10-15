/**
 * Project folders — ChatGPT-style containers that group a user's chats.
 *
 * The ownership rules live here, in one place:
 *  - a project belongs to exactly one user and is only visible to them;
 *  - a chat sits in at most one project (`chats.project_id`), and the link is
 *    written only by this module, so chats.js never needs the projects schema;
 *  - deleting a project never deletes a chat — its chats fall back to the
 *    ungrouped "Chats" list on the next read.
 *
 * `chats.project_id` is added by `ensureChatsTables`, the chats table's owner,
 * because every chats read selects it. This module owns the `projects` table.
 */
import { jsonResponse, readBoundedJson, safeErrorDetail } from "./utils.js";
import { verifySession } from "./auth.js";
import {
  ensureChatsTables,
  isListManual,
  topSortOrder,
  clearListManual,
} from "./chats.js";

// ---------------------------------------------------------------------
// Project ID generation — short, URL-safe, unguessable (chat-id alphabet)
// ---------------------------------------------------------------------
const PROJECT_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const PROJECT_ID_LEN = 12;

export function generateProjectId() {
  const bytes = crypto.getRandomValues(new Uint8Array(PROJECT_ID_LEN));
  let id = "";
  for (let i = 0; i < PROJECT_ID_LEN; i++) {
    id += PROJECT_ID_ALPHABET[bytes[i] % PROJECT_ID_ALPHABET.length];
  }
  return id;
}

// Same shape as chat ids: starts alphanumeric, 8-32 chars of alnum + _ -
const VALID_PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,31}$/;
const VALID_CHAT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,31}$/;
const VALID_NAME_LEN = 60;
// A user's projects are folders, not storage: the cap keeps one account from
// growing the table without bound while staying far above real use.
const MAX_PROJECTS_PER_USER = 100;

// ---------------------------------------------------------------------
// D1 schema helpers
// ---------------------------------------------------------------------
// Keyed by the D1 binding, not a module flag: a long-lived isolate keeps one
// binding, while tests and local dev swap the database between runs and must
// get their schema bootstrapped again.
const tablesReady = new WeakMap();
export async function ensureProjectsTables(env) {
  if (!env?.DB) return;
  const cached = tablesReady.get(env.DB);
  if (cached) return cached;
  const ready = (async () => {
    // chats.js owns the chats table (and the project_id column on it); the
    // project link is meaningless without it, so that schema goes first.
    await ensureChatsTables(env);
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ).run();
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC)`,
    ).run();
  })();
  tablesReady.set(env.DB, ready);
  try {
    await ready;
  } catch (e) {
    console.warn("ensureProjectsTables failed:", safeErrorDetail(e));
    // Allow retry on next request
    tablesReady.delete(env.DB);
    throw e;
  }
}

/**
 * A project name: one line, collapsed whitespace, bounded length. Returns null
 * when nothing usable is left, so callers decide between defaulting (create)
 * and rejecting (rename).
 */
function sanitizeName(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.replace(/\s+/g, " ").trim().slice(0, VALID_NAME_LEN);
  return trimmed || null;
}

/**
 * `decodeURIComponent` throws on malformed percent-encoding. An id that cannot
 * be decoded is not a valid id — that is a 400, never a 500.
 */
function decodeId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export async function handleProjects(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (!env?.DB) {
    return jsonResponse(500, {
      error: "Project database not configured (D1 missing).",
    });
  }

  try {
    await ensureProjectsTables(env);
  } catch (e) {
    console.error("Project schema setup failed:", safeErrorDetail(e));
    return jsonResponse(500, { error: "Failed to prepare project storage." });
  }

  // Auth required — projects are private to the signed-in account.
  const session = await verifySession(request, env);
  if (!session) {
    return jsonResponse(401, {
      error: "Authentication required. Please log in.",
    });
  }
  const userId = session.uid;

  // -------------------------------------------------------------------
  // GET /api/projects — list my projects
  // -------------------------------------------------------------------
  if (pathname === "/api/projects" && request.method === "GET") {
    try {
      const rows = await env.DB.prepare(
        "SELECT id, name, created_at as createdAt, updated_at as updatedAt FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100",
      )
        .bind(userId)
        .all();
      const projects = (rows?.results || []).map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
      return jsonResponse(200, { projects });
    } catch (e) {
      console.error("GET /api/projects failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to list projects." });
    }
  }

  // -------------------------------------------------------------------
  // POST /api/projects — create a project
  // -------------------------------------------------------------------
  if (pathname === "/api/projects" && request.method === "POST") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }
    const name = sanitizeName(body?.name) || "New Project";
    const id = generateProjectId();
    const now = Date.now();
    try {
      const count = await env.DB.prepare(
        "SELECT COUNT(1) as c FROM projects WHERE user_id = ?",
      )
        .bind(userId)
        .first();
      if ((Number(count?.c) || 0) >= MAX_PROJECTS_PER_USER) {
        return jsonResponse(400, {
          error: `Project limit reached (${MAX_PROJECTS_PER_USER}).`,
        });
      }
      await env.DB.prepare(
        "INSERT INTO projects (id, user_id, name, created_at, updated_at) VALUES (?,?,?,?,?)",
      )
        .bind(id, userId, name, now, now)
        .run();
      return jsonResponse(201, { id, name, createdAt: now, updatedAt: now });
    } catch (e) {
      console.error("POST /api/projects failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to create project." });
    }
  }

  // -------------------------------------------------------------------
  // /api/projects/:projectId/chats/:chatId — remove a chat from a project
  // /api/projects/:projectId/chats         — move a chat into a project
  // -------------------------------------------------------------------
  const chatsMatch = pathname.match(
    /^\/api\/projects\/([^/]+)\/chats(?:\/([^/]+))?$/,
  );
  if (chatsMatch) {
    const projectId = decodeId(chatsMatch[1] || "");
    let chatId = chatsMatch[2] ? decodeId(chatsMatch[2]) : null;
    if (!projectId || !VALID_PROJECT_ID.test(projectId)) {
      return jsonResponse(400, { error: "Invalid project id." });
    }
    // Moving a chat in carries the id in the body (PUT .../chats); removing one
    // names it in the path (DELETE .../chats/:chatId).
    if (chatId === null) {
      if (request.method !== "PUT") {
        return jsonResponse(405, { error: "Method not allowed." });
      }
      let body;
      try {
        body = await readBoundedJson(request);
      } catch {
        return jsonResponse(400, { error: "Invalid JSON payload." });
      }
      if (typeof body?.chatId !== "string") {
        return jsonResponse(400, { error: "A chat id is required." });
      }
      chatId = body.chatId;
    }
    if (typeof chatId !== "string" || !VALID_CHAT_ID.test(chatId)) {
      return jsonResponse(400, { error: "Invalid chat id." });
    }
    try {
      const projectRow = await env.DB.prepare(
        "SELECT id FROM projects WHERE id = ? AND user_id = ?",
      )
        .bind(projectId, userId)
        .first();
      if (!projectRow) {
        return jsonResponse(404, { error: "Project not found." });
      }
      const chatRow = await env.DB.prepare(
        "SELECT id FROM chats WHERE id = ? AND user_id = ?",
      )
        .bind(chatId, userId)
        .first();
      if (!chatRow) {
        return jsonResponse(404, { error: "Chat not found." });
      }

      if (request.method === "PUT") {
        const now = Date.now();
        // One transaction: the chat joins the folder and the folder is touched
        // (updated_at) so the most recently used project sorts first.
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE chats SET project_id = ? WHERE id = ? AND user_id = ?",
          ).bind(projectId, chatId, userId),
          env.DB.prepare(
            "UPDATE projects SET updated_at = ? WHERE id = ? AND user_id = ?",
          ).bind(now, projectId, userId),
        ]);
        // Joining a manually-ordered folder lands on top of it; in an auto
        // folder the column stays untouched and recency orders the chat, as
        // before.
        if (await isListManual(env, userId, `project:${projectId}`)) {
          const top = await topSortOrder(env, userId, `project:${projectId}`);
          await env.DB.prepare(
            "UPDATE chats SET sort_order = ? WHERE id = ? AND user_id = ?",
          )
            .bind(top, chatId, userId)
            .run();
        }
        return jsonResponse(200, { success: true, chatId, projectId });
      }

      if (request.method === "DELETE") {
        // Only the project that currently holds the chat can release it, so a
        // stale second tab cannot remove a chat from a folder it moved to.
        await env.DB.prepare(
          "UPDATE chats SET project_id = NULL WHERE id = ? AND user_id = ? AND project_id = ?",
        )
          .bind(chatId, userId, projectId)
          .run();
        // Same join rule as filing: back in Recents on top when manual.
        if (await isListManual(env, userId, "recents")) {
          const top = await topSortOrder(env, userId, "recents");
          await env.DB.prepare(
            "UPDATE chats SET sort_order = ? WHERE id = ? AND user_id = ?",
          )
            .bind(top, chatId, userId)
            .run();
        }
        return jsonResponse(200, { success: true, chatId, projectId: null });
      }

      return jsonResponse(405, { error: "Method not allowed." });
    } catch (e) {
      console.error(
        `${request.method} /api/projects/:id/chats failed:`,
        safeErrorDetail(e),
      );
      return jsonResponse(500, { error: "Failed to update the project chats." });
    }
  }

  // -------------------------------------------------------------------
  // /api/projects/:projectId — rename or delete
  // -------------------------------------------------------------------
  const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (!projectMatch) {
    return jsonResponse(404, { error: "Project route not found." });
  }
  const projectId = decodeId(projectMatch[1] || "");
  if (!projectId || !VALID_PROJECT_ID.test(projectId)) {
    return jsonResponse(400, { error: "Invalid project id." });
  }

  let projectRow;
  try {
    projectRow = await env.DB.prepare(
      "SELECT id, name, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?",
    )
      .bind(projectId, userId)
      .first();
  } catch (e) {
    console.error("Project lookup failed:", safeErrorDetail(e));
    return jsonResponse(500, { error: "Failed to lookup project." });
  }
  if (!projectRow) {
    return jsonResponse(404, { error: "Project not found." });
  }

  if (request.method === "PATCH") {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON." });
    }
    const name = sanitizeName(body?.name);
    if (!name) {
      return jsonResponse(400, { error: "A project name is required." });
    }
    const now = Date.now();
    try {
      await env.DB.prepare(
        "UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      )
        .bind(name, now, projectId, userId)
        .run();
      return jsonResponse(200, { id: projectId, name, updatedAt: now });
    } catch (e) {
      console.error("PATCH /api/projects/:id failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to rename the project." });
    }
  }

  if (request.method === "DELETE") {
    try {
      // Unassign and delete in one transaction: a project can never be
      // deleted while some chat still points at it (the chats themselves
      // are kept — only the folder is removed). Its manual ordering dies
      // with it: there is no list left to order.
      await clearListManual(env, userId, `project:${projectId}`);
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE chats SET project_id = NULL WHERE project_id = ? AND user_id = ?",
        ).bind(projectId, userId),
        env.DB.prepare(
          "DELETE FROM projects WHERE id = ? AND user_id = ?",
        ).bind(projectId, userId),
      ]);
      return jsonResponse(200, { success: true, id: projectId });
    } catch (e) {
      console.error("DELETE /api/projects/:id failed:", safeErrorDetail(e));
      return jsonResponse(500, { error: "Failed to delete the project." });
    }
  }

  return jsonResponse(405, { error: "Method not allowed." });
}
