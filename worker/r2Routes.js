import { sessionUid } from "./auth.js";
import {
  SAFE_STORAGE_SEGMENT,
  decodePathSegment,
  readBoundedJson,
  jsonResponse,
  createRateLimiter,
} from "./utils.js";
import { repairMalformedHtml } from "./htmlRepair.js";
import {
  userAssetKey,
  userAppKey,
  userAppPrefix,
  legacyAppKey,
  legacyAppPrefix,
  getWithFallback,
  listWithFallback,
} from "./storageKeys.js";
import { resolveAsset, isAssetPublished } from "./publishStore.js";
import { publishedPageHeaders } from "./publishRoutes.js";

// Largest single decoded asset accepted by /api/assets/upload (10 MB decoded
// ≈ 13.4 MB base64, well under the 24 MB JSON body bound).
const MAX_ASSET_DECODED_BYTES = 10 * 1024 * 1024;

// R2-backed user-data routes (assets, apps, memory) are unauthenticated-free
// in the sense that any valid session reaches them: bound writes/deletes per
// client so one session cannot fill the bucket or burn egress at line rate.
const assetsRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });
const appsRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });

export async function handleR2Assets(request, env) {
  if (!env.ASSET_BUCKET || typeof env.ASSET_BUCKET.put !== "function") {
    return jsonResponse(503, {
      error: "Cloudflare R2 ASSET_BUCKET is not configured.",
    });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // Public published-asset reads: anonymous GETs are allowed through so
  // published creations render for visitors; the ownership + publish-
  // reference check below still protects private assets. Uploads and
  // deletes always require a verified session.
  const isAnonymousGet =
    request.method === "GET" && pathname.startsWith("/api/assets/");
  const uid = await sessionUid(request, env);
  if (!uid && !isAnonymousGet) {
    return jsonResponse(401, { error: "Authentication required." });
  }

  if (pathname === "/api/assets/upload" && request.method === "POST") {
    const retryAfter = assetsRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(
        429,
        { error: "Too many asset requests. Try again shortly." },
        { "Retry-After": String(retryAfter) },
      );
    }
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }

    const ALLOWED_ASSET_TYPES = [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "image/x-icon",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-msvideo",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/webm",
      "audio/mp4",
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/json",
    ];
    const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

    const key =
      typeof body?.key === "string"
        ? body.key.replace(/^\/+/, "")
        : `asset_${Date.now()}`;
    const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
    const mimeType =
      typeof body?.mimeType === "string" ? body.mimeType : "image/png";

    if (!dataUrl) {
      return jsonResponse(400, { error: "dataUrl is required." });
    }
    if (!SAFE_KEY.test(key)) {
      return jsonResponse(400, {
        error:
          "Invalid asset key: use letters, digits, dots, dashes or underscores.",
      });
    }
    if (!ALLOWED_ASSET_TYPES.includes(mimeType)) {
      return jsonResponse(400, {
        error: `Unsupported content type "${mimeType}".`,
      });
    }
    const expectedPrefix = `data:${mimeType};base64,`;
    if (!dataUrl.startsWith(expectedPrefix)) {
      return jsonResponse(400, {
        error:
          "dataUrl must be a base64 data URL matching the declared content type.",
      });
    }

    let bytes;
    try {
      const parts = dataUrl.split(",");
      const bstr = atob(parts[1] || "");
      if (bstr.length > MAX_ASSET_DECODED_BYTES) {
        return jsonResponse(413, {
          error: "Uploaded asset exceeds the size limit.",
        });
      }
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) {
        u8arr[i] = bstr.charCodeAt(i);
      }
      bytes = u8arr.buffer;
    } catch {
      return jsonResponse(400, { error: "Invalid base64 payload." });
    }

    const ownedKey = userAssetKey(uid, key);
    try {
      const existing =
        typeof env.ASSET_BUCKET.head === "function"
          ? await env.ASSET_BUCKET.head(ownedKey).catch(() => null)
          : null;
      const legacyExisting =
        typeof env.ASSET_BUCKET.head === "function"
          ? await env.ASSET_BUCKET.head(key).catch(() => null)
          : null;
      const existingOwner =
        existing?.customMetadata?.ownerId || legacyExisting?.customMetadata?.ownerId;
      if ((existing || legacyExisting) && existingOwner && existingOwner !== uid) {
        return jsonResponse(409, {
          error: "An asset with that key already exists.",
        });
      }
    } catch {
      // head() unavailable: fall through to the guarded put below.
    }

    await env.ASSET_BUCKET.put(ownedKey, bytes, {
      httpMetadata: { contentType: mimeType },
      customMetadata: { ownerId: uid },
    });
    try {
      await env.ASSET_BUCKET.delete(key);
    } catch {}

    return jsonResponse(200, {
      success: true,
      key,
      url: `/api/assets/${key}`,
    });
  }

  if (request.method === "GET" && pathname.startsWith("/api/assets/")) {
    const key = decodePathSegment(pathname.replace("/api/assets/", ""));
    if (!key || !SAFE_STORAGE_SEGMENT.test(key)) {
      return jsonResponse(400, { error: "Invalid asset key." });
    }

    const { object } = await resolveAsset(env, key, uid);
    if (!object) {
      return jsonResponse(404, { error: "Asset not found in R2 bucket." });
    }

    if (
      object.customMetadata?.ownerId !== uid &&
      !(await isAssetPublished(env, key))
    ) {
      return jsonResponse(403, { error: "Asset access denied." });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "no-referrer");
    if ((headers.get("content-type") || "").includes("svg")) {
      headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
    }

    return new Response(object.body, { headers });
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/assets/")) {
    const retryAfter = assetsRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(
        429,
        { error: "Too many asset requests. Try again shortly." },
        { "Retry-After": String(retryAfter) },
      );
    }
    const key = decodePathSegment(pathname.replace("/api/assets/", ""));
    if (!key || !SAFE_STORAGE_SEGMENT.test(key)) {
      return jsonResponse(400, { error: "Invalid asset key." });
    }

    let existing = null;
    if (typeof env.ASSET_BUCKET.head === "function") {
      try {
        existing = await env.ASSET_BUCKET.head(userAssetKey(uid, key));
      } catch {}
      if (!existing) {
        try {
          existing = await env.ASSET_BUCKET.head(key);
        } catch {}
      }
    } else {
      const resolved = await resolveAsset(env, key, uid);
      existing = resolved.object
        ? { customMetadata: { ownerId: resolved.ownerId } }
        : null;
    }
    if (!existing || existing.customMetadata?.ownerId !== uid) {
      return jsonResponse(403, { error: "Asset access denied." });
    }

    await env.ASSET_BUCKET.delete(userAssetKey(uid, key));
    try {
      await env.ASSET_BUCKET.delete(key);
    } catch {}
    return jsonResponse(200, { success: true, deletedKey: key });
  }

  return jsonResponse(405, { error: "Method not allowed." });
}

export async function handleR2Apps(request, env) {
  if (!env?.ASSET_BUCKET) {
    return jsonResponse(530, {
      error: "R2 storage (ASSET_BUCKET) is not configured.",
    });
  }

  const uid = await sessionUid(request, env);
  if (!uid) {
    return jsonResponse(401, { error: "Authentication required." });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. POST /api/apps/store - Store or update an app under a session
  if (pathname === "/api/apps/store" && request.method === "POST") {
    const retryAfter = appsRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(
        429,
        { error: "Too many app requests. Try again shortly." },
        { "Retry-After": String(retryAfter) },
      );
    }
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }

    const sessionId =
      typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    const appId =
      typeof body?.appId === "string" ? body.appId.trim() : `app_${Date.now()}`;
    const title =
      typeof body?.title === "string" ? body.title : "Untitled Application";
    const code = typeof body?.code === "string" ? body.code : "";
    const html = typeof body?.html === "string" ? body.html : "";

    if (!sessionId) {
      return jsonResponse(400, { error: "sessionId is required." });
    }
    if (!SAFE_STORAGE_SEGMENT.test(sessionId)) {
      return jsonResponse(400, {
        error:
          "Invalid sessionId: use letters, digits, dots, dashes or underscores.",
      });
    }
    if (!SAFE_STORAGE_SEGMENT.test(appId)) {
      return jsonResponse(400, {
        error:
          "Invalid appId: use letters, digits, dots, dashes or underscores.",
      });
    }
    if (!code && !html) {
      return jsonResponse(400, { error: "code or html content is required." });
    }

    const appRecord = {
      sessionId,
      appId,
      title,
      code,
      html,
      updatedAt: new Date().toISOString(),
      metadata: body?.metadata || {},
    };

    const key = userAppKey(uid, sessionId, appId);
    await env.ASSET_BUCKET.put(key, JSON.stringify(appRecord), {
      httpMetadata: { contentType: "application/json" },
    });
    try {
      await env.ASSET_BUCKET.delete(legacyAppKey(uid, sessionId, appId));
    } catch {}

    return jsonResponse(200, {
      success: true,
      sessionId,
      appId,
      key,
      url: `/api/apps/${sessionId}/${appId}`,
    });
  }

  // 2. GET /api/apps/:sessionId/:appId - Fetch a specific app
  if (
    request.method === "GET" &&
    pathname.match(/^\/api\/apps\/[^/]+\/[^/]+$/)
  ) {
    const parts = pathname.replace("/api/apps/", "").split("/");
    const sessionId = decodePathSegment(parts[0]);
    const appId = decodePathSegment(parts[1]);
    if (
      sessionId === null ||
      appId === null ||
      !SAFE_STORAGE_SEGMENT.test(sessionId) ||
      !SAFE_STORAGE_SEGMENT.test(appId)
    ) {
      return jsonResponse(400, { error: "Invalid path segment." });
    }

    const key = userAppKey(uid, sessionId, appId);
    const legacyKey = legacyAppKey(uid, sessionId, appId);
    const { object } = await getWithFallback(env.ASSET_BUCKET, key, legacyKey);
    if (!object) {
      return jsonResponse(404, { error: "App not found in R2 storage." });
    }

    const text = await object.text();
    let appData;
    try {
      appData = JSON.parse(text);
    } catch {
      return jsonResponse(500, {
        error: "Failed to parse stored app payload.",
      });
    }

    if (url.searchParams.get("format") === "html") {
      return new Response(repairMalformedHtml(appData.html || appData.code), {
        headers: publishedPageHeaders(),
      });
    }

    return jsonResponse(200, appData);
  }

  // 3. GET /api/apps/:sessionId - List all apps stored for a chat session
  if (request.method === "GET" && pathname.match(/^\/api\/apps\/[^/]+$/)) {
    const sessionId = decodePathSegment(pathname.replace("/api/apps/", ""));
    if (sessionId === null || !SAFE_STORAGE_SEGMENT.test(sessionId)) {
      return jsonResponse(400, { error: "Invalid session id in path." });
    }
    const { objects } = await listWithFallback(
      env.ASSET_BUCKET,
      userAppPrefix(uid, sessionId),
      legacyAppPrefix(uid, sessionId),
    );

    const apps = [];
    if (Array.isArray(objects)) {
      const jsonObjects = objects.filter((obj) =>
        String(obj.key || "").endsWith(".json"),
      );
      const items = await Promise.all(
        jsonObjects.map((obj) => env.ASSET_BUCKET.get(obj.key)),
      );
      for (const item of items) {
        if (item) {
          try {
            const data = JSON.parse(await item.text());
            apps.push({
              appId: data.appId,
              title: data.title,
              updatedAt: data.updatedAt,
              url: `/api/apps/${sessionId}/${data.appId}`,
            });
          } catch {
            /* ignore invalid cache entries */
          }
        }
      }
    }

    return jsonResponse(200, { sessionId, apps });
  }

  // 4. DELETE /api/apps/:sessionId/:appId - Delete a specific app
  if (
    request.method === "DELETE" &&
    pathname.match(/^\/api\/apps\/[^/]+\/[^/]+$/)
  ) {
    const parts = pathname.replace("/api/apps/", "").split("/");
    const sessionId = decodePathSegment(parts[0]);
    const appId = decodePathSegment(parts[1]);
    if (
      sessionId === null ||
      appId === null ||
      !SAFE_STORAGE_SEGMENT.test(sessionId) ||
      !SAFE_STORAGE_SEGMENT.test(appId)
    ) {
      return jsonResponse(400, { error: "Invalid path segment." });
    }

    const key = userAppKey(uid, sessionId, appId);
    await env.ASSET_BUCKET.delete(key);
    try {
      await env.ASSET_BUCKET.delete(legacyAppKey(uid, sessionId, appId));
    } catch {}
    return jsonResponse(200, { success: true, sessionId, appId });
  }

  // 5. DELETE /api/apps/:sessionId - Delete ALL apps associated with a chat session
  if (request.method === "DELETE" && pathname.match(/^\/api\/apps\/[^/]+$/)) {
    const retryAfter = appsRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(
        429,
        { error: "Too many app requests. Try again shortly." },
        { "Retry-After": String(retryAfter) },
      );
    }
    const sessionId = decodePathSegment(pathname.replace("/api/apps/", ""));
    if (sessionId === null || !SAFE_STORAGE_SEGMENT.test(sessionId)) {
      return jsonResponse(400, { error: "Invalid session id in path." });
    }
    const { objects } = await listWithFallback(
      env.ASSET_BUCKET,
      userAppPrefix(uid, sessionId),
      legacyAppPrefix(uid, sessionId),
    );

    let count = 0;
    if (Array.isArray(objects)) {
      for (const obj of objects) {
        await env.ASSET_BUCKET.delete(obj.key);
        count++;
      }
    }

    return jsonResponse(200, { success: true, sessionId, deletedCount: count });
  }

  return jsonResponse(405, { error: "Method not allowed." });
}
