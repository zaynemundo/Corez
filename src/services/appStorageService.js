/**
 * Service for storing and managing multi-app artifacts in Cloudflare R2 bucket.
 * Each chat session can store multiple apps. When a chat session is deleted,
 * its associated R2 app storage is completely cleaned up.
 */

const API_APPS_ENDPOINT = "/api/apps";

// Local registry of published links so re-publishing the SAME content
// updates the existing link instead of creating a new slug each time.
// Keyed by a content hash, capped to the most recent entries.
const PUBLISH_REGISTRY_KEY = "corez_published_links";
const PUBLISH_REGISTRY_MAX = 20;

// Per-session publish lineage: remembers the slug each chat session last
// published under, so publishing a REVISED version of a creation updates the
// same public link instead of allocating a new slug (even after the preview
// is closed, the session switches, or the page refreshes).
const PUBLISH_LINEAGE_KEY = "corez_publish_lineage";
const PUBLISH_LINEAGE_MAX = 50;

function contentHash(value) {
  let hash = 5381;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function loadPublishRegistry() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(PUBLISH_REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePublishRegistry(entries) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      PUBLISH_REGISTRY_KEY,
      JSON.stringify(entries.slice(0, PUBLISH_REGISTRY_MAX)),
    );
  } catch {
    // Registry persistence is best-effort; publishing still works.
  }
}

function loadPublishLineage() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(PUBLISH_LINEAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function savePublishLineage(lineage) {
  try {
    if (typeof localStorage === "undefined") return;
    const entries = Object.entries(lineage)
      .sort((a, b) =>
        (b[1].updatedAt || "").localeCompare(a[1].updatedAt || ""),
      )
      .slice(0, PUBLISH_LINEAGE_MAX);
    localStorage.setItem(
      PUBLISH_LINEAGE_KEY,
      JSON.stringify(Object.fromEntries(entries)),
    );
  } catch {
    // Lineage persistence is best-effort; publishing still works.
  }
}

/**
 * Stores or updates an app artifact in Cloudflare R2 bucket.
 */
export async function storeAppInR2({
  sessionId,
  appId,
  title = "Untitled Application",
  code = "",
  html = "",
  metadata = {},
}) {
  if (!sessionId) return null;
  const payload = {
    sessionId,
    appId: appId || `app_${Date.now()}`,
    title,
    code,
    html,
    metadata,
  };

  try {
    const res = await fetch(`${API_APPS_ENDPOINT}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return await res.json();
    }
    console.warn(`R2 app storage failed with HTTP ${res.status}.`);
  } catch (err) {
    console.warn(
      "R2 app storage request failed, falling back to local session state:",
      err,
    );
  }
  return { success: false, ...payload };
}

/**
 * Lists all apps stored in R2 for a specific chat session.
 */
export async function listSessionAppsInR2(sessionId) {
  if (!sessionId) return [];
  try {
    const res = await fetch(
      `${API_APPS_ENDPOINT}/${encodeURIComponent(sessionId)}`,
    );
    if (res.ok) {
      const data = await res.json();
      return data?.apps || [];
    }
  } catch (err) {
    console.warn("Failed to list session apps from R2:", err);
  }
  return [];
}

/**
 * Retrieves a specific app from R2.
 */
export async function getAppFromR2(sessionId, appId) {
  if (!sessionId || !appId) return null;
  try {
    const res = await fetch(
      `${API_APPS_ENDPOINT}/${encodeURIComponent(sessionId)}/${encodeURIComponent(appId)}`,
    );
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch app from R2:", err);
  }
  return null;
}

/**
 * Deletes all R2 stored apps associated with a chat session when the session is deleted.
 */
export async function deleteSessionAppsInR2(sessionId) {
  if (!sessionId) return false;
  try {
    const res = await fetch(
      `${API_APPS_ENDPOINT}/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
      },
    );
    if (res.ok) {
      const data = await res.json();
      return data?.success || false;
    }
  } catch (err) {
    console.warn("Failed to delete R2 apps for session:", err);
  }
  return false;
}

/**
 * Deletes a specific app from R2.
 */
export async function deleteAppInR2(sessionId, appId) {
  if (!sessionId || !appId) return false;
  try {
    const res = await fetch(
      `${API_APPS_ENDPOINT}/${encodeURIComponent(sessionId)}/${encodeURIComponent(appId)}`,
      {
        method: "DELETE",
      },
    );
    if (res.ok) {
      const data = await res.json();
      return data?.success || false;
    }
  } catch (err) {
    console.warn("Failed to delete app from R2:", err);
  }
  return false;
}

/**
 * Publishes a creation so anyone with the returned share link can open it.
 * The html payload is the fully formatted preview document (what the user
 * sees in the canvas).
 *
 * Update semantics:
 *  - Passing an explicit slug always republishes that link.
 *  - Publishing the SAME content again reuses the previously published link
 *    (recorded locally by content hash) so identical republishes never
 *    create duplicate slugs.
 *  - Publishing REVISED content from the same chat session updates the link
 *    that session published before (per-session lineage), so "publish, then
 *    revise, then publish again" keeps one stable URL.
 *  - A new slug is only allocated for genuinely new content from a session
 *    that has not published yet.
 */
export async function publishAppInR2({
  html,
  title = "Untitled Application",
  slug = null,
  previousSlug = null,
  pages = null,
  sessionId = null,
}) {
  if (!html || typeof html !== "string" || !html.trim()) return null;

  const pagesPayload = (() => {
    if (!pages || typeof pages !== "object" || Array.isArray(pages))
      return null;
    const entries = Object.entries(pages).filter(
      ([name, content]) =>
        /^[a-z0-9][a-z0-9_-]{0,63}\.html$/i.test(name) &&
        typeof content === "string" &&
        content.trim().length > 0,
    );
    return entries.length > 0 ? Object.fromEntries(entries) : null;
  })();

  const registry = loadPublishRegistry();
  const lineage = loadPublishLineage();
  const hash = contentHash(
    html.trim() + (pagesPayload ? JSON.stringify(pagesPayload) : ""),
  );
  const existing = registry.find(
    (entry) => entry.contentHash === hash && entry.slug,
  );
  const sessionRecord =
    typeof sessionId === "string" && sessionId ? lineage[sessionId] : null;
  const effectiveSlug = slug || existing?.slug || sessionRecord?.slug || null;

  const payload = {
    html: html.trim(),
    title: title.slice(0, 120),
    ...(effectiveSlug ? { slug: effectiveSlug } : {}),
    ...(previousSlug ? { previousSlug } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(pagesPayload ? { pages: pagesPayload } : {}),
  };
  try {
    const res = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    // Cloudflare Managed Challenge (HTML) can be returned for API calls from
    // datacenter IPs or when the browser lacks a cf_clearance cookie. Detect
    // non-JSON 403 with HTML before treating it as a JSON error.
    const contentType = res.headers.get("content-type") || "";
    const isHtmlChallenge =
      !contentType.includes("application/json") && res.status === 403;
    if (isHtmlChallenge) {
      const text = await res.text().catch(() => "");
      const isChallenge =
        text.includes("Just a moment") ||
        text.includes("cf_chl_opt") ||
        text.includes("challenges.cloudflare.com");
      if (isChallenge) {
        return {
          success: false,
          error:
            "Blocked by Cloudflare security check — please refresh the page and try again. If Under Attack Mode is enabled, disable it or wait for the challenge to complete.",
        };
      }
    }
    const data = await res.json().catch(() => null);
    if (res.ok && data?.slug) {
      const next = [
        {
          contentHash: hash,
          slug: data.slug,
          url: data.url,
          title: title.slice(0, 120),
          updatedAt: new Date().toISOString(),
        },
        ...registry.filter(
          (entry) =>
            entry.slug !== data.slug &&
            (!previousSlug || entry.slug !== previousSlug),
        ),
      ];
      savePublishRegistry(next);
      if (typeof sessionId === "string" && sessionId) {
        lineage[sessionId] = {
          slug: data.slug,
          contentHash: hash,
          title: title.slice(0, 120),
          updatedAt: new Date().toISOString(),
        };
        savePublishLineage(lineage);
      }
      return {
        success: true,
        slug: data.slug,
        url: data.url,
        customized: Boolean(data.customized),
      };
    }
    // Surface the precise server error: 401 auth, 403 ownership, 429 rate-limit, 530 R2, etc.
    // Keep the server-provided error verbatim for test compatibility; add status hints only for auth/R2.
    if (res.status === 401) {
      const base = data?.error || `Publish failed with status ${res.status}.`;
      return { success: false, error: `${base} — please log in again.` };
    }
    if (
      res.status === 530 ||
      (data?.error &&
        String(data.error).toLowerCase().includes("not configured"))
    ) {
      const base = data?.error || `Publish failed with status ${res.status}.`;
      return {
        success: false,
        error: `${base} — hosted R2 storage is not configured.`,
      };
    }
    return {
      success: false,
      error: data?.error || `Publish failed with status ${res.status}.`,
    };
  } catch (err) {
    console.warn("Publish request failed:", err);
    const msg = err?.message ? String(err.message) : "";
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      return {
        success: false,
        error:
          "Publish request failed — network error. Check connection and refresh to solve the Cloudflare challenge if present.",
      };
    }
    return {
      success: false,
      error: msg
        ? `Publish request failed: ${msg}`
        : "Publish request failed. Please check network connection.",
    };
  }
}
