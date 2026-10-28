/**
 * Public, read-only snapshots of one chat.
 *
 * The owner creates a random token; the snapshot lives in R2 under that token
 * and is served without a session at /api/share/chat/:token. A snapshot is
 * deliberately immutable: messages added after sharing do not appear on the
 * public page, and revoking the share deletes both the snapshot and the
 * account's pointer to it.
 *
 * Images referenced by the chat are not copied. Their /api/assets URLs are
 * rewritten to a token-scoped proxy, which only serves keys recorded in that
 * same snapshot.
 */

import { sessionUid } from "./auth.js";
import { resolveAsset } from "./publishStore.js";
import {
  SAFE_STORAGE_SEGMENT,
  createRateLimiter,
  decodePathSegment,
  jsonResponse,
  safeErrorDetail,
} from "./utils.js";

const SHARE_PREFIX = "chat-shares/";
const SHARE_POINTER_PREFIX = "chat-shares/by-chat/";
const SHARE_TOKEN_BYTES = 20;
const MAX_MESSAGES = 500;
const ASSET_PATH_RE =
  /(?:https?:\/\/(?:[a-z0-9-]+\.)?corez\.pro)?\/api\/assets\/([A-Za-z0-9][A-Za-z0-9._-]{0,254})/gi;

const createLimiter = createRateLimiter({ windowMs: 60_000, limit: 10 });
const publicLimiter = createRateLimiter({ windowMs: 60_000, limit: 120 });

function shareKey(token) {
  return `${SHARE_PREFIX}${token}.json`;
}

function pointerKey(uid, chatId) {
  return `${SHARE_POINTER_PREFIX}${encodeURIComponent(uid)}/${encodeURIComponent(chatId)}.json`;
}

function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(SHARE_TOKEN_BYTES));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function readJson(bucket, key) {
  if (!bucket || typeof bucket.get !== "function") return null;
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    return JSON.parse(await object.text());
  } catch {
    return null;
  }
}

async function readPointer(env, uid, chatId) {
  const pointer = await readJson(
    env?.ASSET_BUCKET,
    pointerKey(uid, chatId),
  );
  return pointer && typeof pointer.token === "string" ? pointer : null;
}

async function loadShare(env, token) {
  if (typeof token !== "string" || !SAFE_STORAGE_SEGMENT.test(token)) {
    return null;
  }
  return readJson(env?.ASSET_BUCKET, shareKey(token));
}

function rewriteAssetUrls(value, token, assetKeys) {
  return String(value ?? "").replace(ASSET_PATH_RE, (match, key) => {
    assetKeys.add(key);
    return `/api/share/chat/${token}/asset/${key}`;
  });
}

function safeAttachments(attachments, token, assetKeys) {
  if (!Array.isArray(attachments)) return null;
  const safe = attachments
    .map((attachment) => {
      if (!attachment || typeof attachment !== "object") return null;
      const out = {};
      for (const field of ["id", "name", "type", "size", "status"]) {
        if (attachment[field] !== undefined) out[field] = attachment[field];
      }
      if (typeof attachment.assetUrl === "string") {
        out.assetUrl = rewriteAssetUrls(
          attachment.assetUrl,
          token,
          assetKeys,
        );
      }
      if (typeof attachment.thumb === "string") {
        out.thumb = attachment.thumb.startsWith("data:image/")
          ? attachment.thumb
          : rewriteAssetUrls(attachment.thumb, token, assetKeys);
      }
      return Object.keys(out).length > 0 ? out : null;
    })
    .filter(Boolean);
  return safe.length > 0 ? safe : null;
}

async function buildSnapshot(env, chat, uid, token) {
  const rows = await env.DB.prepare(
    "SELECT role, content, attachments, created_at as createdAt FROM chat_messages WHERE chat_id = ? AND user_id = ? ORDER BY created_at ASC LIMIT 500",
  )
    .bind(chat.id, uid)
    .all();

  const assetKeys = new Set();
  const messages = (rows?.results || []).slice(0, MAX_MESSAGES).map((row) => {
    let attachments = null;
    if (row.attachments) {
      try {
        attachments = JSON.parse(row.attachments);
      } catch {
        attachments = null;
      }
    }
    const sharedAttachments = safeAttachments(
      attachments,
      token,
      assetKeys,
    );
    return {
      role: row.role === "assistant" ? "assistant" : "user",
      content: rewriteAssetUrls(row.content, token, assetKeys),
      createdAt: row.createdAt,
      ...(sharedAttachments ? { attachments: sharedAttachments } : {}),
    };
  });

  return {
    version: 1,
    token,
    uid,
    chatId: chat.id,
    title: String(chat.title || "Shared conversation"),
    createdAt: chat.createdAt,
    sharedAt: Date.now(),
    assetKeys: [...assetKeys],
    messages,
  };
}

function shareUrl(request, token) {
  return `${new URL(request.url).origin}/share/chat/${token}`;
}

function publicShare(record) {
  return {
    version: 1,
    title: record.title,
    createdAt: record.createdAt,
    sharedAt: record.sharedAt,
    messages: Array.isArray(record.messages) ? record.messages : [],
  };
}

async function loadOwnedChat(env, uid, chatId) {
  return env.DB.prepare(
    "SELECT id, title, created_at as createdAt FROM chats WHERE id = ? AND user_id = ?",
  )
    .bind(chatId, uid)
    .first();
}

async function handleOwnerShare(request, env, chatId) {
  const uid = await sessionUid(request, env);
  if (!uid) {
    return jsonResponse(401, { error: "Authentication required." });
  }
  if (typeof chatId !== "string" || !SAFE_STORAGE_SEGMENT.test(chatId)) {
    return jsonResponse(400, { error: "Invalid chat id." });
  }

  if (request.method === "GET") {
    const pointer = await readPointer(env, uid, chatId);
    if (!pointer) return jsonResponse(200, { shared: false });
    const record = await loadShare(env, pointer.token);
    if (!record) {
      await env.ASSET_BUCKET.delete(pointerKey(uid, chatId)).catch(() => {});
      return jsonResponse(200, { shared: false });
    }
    return jsonResponse(200, {
      shared: true,
      token: pointer.token,
      url: shareUrl(request, pointer.token),
      title: record.title,
    });
  }

  if (request.method === "DELETE") {
    const pointer = await readPointer(env, uid, chatId);
    if (pointer) {
      await env.ASSET_BUCKET.delete(shareKey(pointer.token)).catch(() => {});
      await env.ASSET_BUCKET.delete(pointerKey(uid, chatId)).catch(() => {});
    }
    return jsonResponse(200, { shared: false });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const retryAfter = createLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(
      429,
      { error: "Too many share requests. Try again shortly." },
      { "Retry-After": String(retryAfter) },
    );
  }

  if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.put !== "function") {
    return jsonResponse(503, {
      error: "Sharing is not configured on this deployment.",
    });
  }
  if (!env?.DB) {
    return jsonResponse(503, {
      error: "Chat storage is not configured on this deployment.",
    });
  }

  const chat = await loadOwnedChat(env, uid, chatId);
  if (!chat) {
    return jsonResponse(404, { error: "Chat not found." });
  }

  const existing = await readPointer(env, uid, chatId);
  if (existing) {
    const record = await loadShare(env, existing.token);
    if (record) {
      return jsonResponse(200, {
        shared: true,
        token: existing.token,
        url: shareUrl(request, existing.token),
        title: record.title,
      });
    }
  }

  const token = makeToken();
  const snapshot = await buildSnapshot(env, chat, uid, token);
  await env.ASSET_BUCKET.put(shareKey(token), JSON.stringify(snapshot), {
    httpMetadata: { contentType: "application/json" },
  });
  await env.ASSET_BUCKET.put(
    pointerKey(uid, chatId),
    JSON.stringify({ token }),
    { httpMetadata: { contentType: "application/json" } },
  );

  return jsonResponse(201, {
    shared: true,
    token,
    url: shareUrl(request, token),
    title: snapshot.title,
  });
}

async function handlePublicShare(request, env, token) {
  const retryAfter = publicLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(
      429,
      { error: "Too many share requests. Try again shortly." },
      { "Retry-After": String(retryAfter) },
    );
  }
  const record = await loadShare(env, token);
  if (!record) {
    return jsonResponse(404, { error: "Shared chat not found." });
  }
  return jsonResponse(200, publicShare(record), {
    "Cache-Control": "no-store",
  });
}

async function handlePublicAsset(request, env, token, rawKey) {
  const retryAfter = publicLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(
      429,
      { error: "Too many share requests. Try again shortly." },
      { "Retry-After": String(retryAfter) },
    );
  }
  const key = decodePathSegment(rawKey);
  if (!key || !SAFE_STORAGE_SEGMENT.test(key)) {
    return jsonResponse(400, { error: "Invalid asset key." });
  }
  const record = await loadShare(env, token);
  if (!record || !Array.isArray(record.assetKeys)) {
    return jsonResponse(404, { error: "Shared chat not found." });
  }
  if (!record.assetKeys.includes(key)) {
    return jsonResponse(404, { error: "Asset not found in this share." });
  }
  const { object } = await resolveAsset(env, key, record.uid);
  if (!object) {
    return jsonResponse(404, { error: "Asset not found." });
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  if ((headers.get("content-type") || "").includes("svg")) {
    headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
  }
  return new Response(object.body, { headers });
}

/**
 * Handle owner share routes and the token-scoped public snapshot/assets.
 * Returns null for unrelated paths so the caller can continue routing.
 */
export async function handleChatShares(request, env) {
  const pathname = new URL(request.url).pathname;
  try {
    const ownerMatch = pathname.match(/^\/api\/chats\/([^/]+)\/share$/);
    if (ownerMatch) {
      return await handleOwnerShare(
        request,
        env,
        decodePathSegment(ownerMatch[1]),
      );
    }

    const assetMatch = pathname.match(
      /^\/api\/share\/chat\/([^/]+)\/asset\/([^/]+)$/,
    );
    if (assetMatch && request.method === "GET") {
      return await handlePublicAsset(
        request,
        env,
        decodePathSegment(assetMatch[1]),
        assetMatch[2],
      );
    }

    const publicMatch = pathname.match(/^\/api\/share\/chat\/([^/]+)$/);
    if (publicMatch && request.method === "GET") {
      return await handlePublicShare(
        request,
        env,
        decodePathSegment(publicMatch[1]),
      );
    }

    return null;
  } catch (err) {
    console.error("Chat share handler failed:", safeErrorDetail(err));
    return jsonResponse(500, { error: "Sharing operation failed." });
  }
}

/** Best-effort cascade when a chat is deleted. */
export async function deleteChatShare(env, uid, chatId) {
  if (!env?.ASSET_BUCKET || !uid || !chatId) return;
  try {
    const pointer = await readPointer(env, uid, chatId);
    if (!pointer) return;
    await env.ASSET_BUCKET.delete(shareKey(pointer.token)).catch(() => {});
    await env.ASSET_BUCKET.delete(pointerKey(uid, chatId)).catch(() => {});
  } catch {
    /* best effort */
  }
}
