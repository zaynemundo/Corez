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
 * Lists the signed-in account's published pages.
 *
 * The server is the source of truth: a published link can be removed from
 * another device, and the local registry only knows about this browser. Returns
 * `{ pages, truncated, error }` so the caller can tell "nothing published" from
 * "could not check".
 */
export async function listPublishedPages() {
  try {
    const res = await fetch("/api/publish", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => null);
    if (res.ok && Array.isArray(data?.pages)) {
      return {
        pages: data.pages,
        truncated: data.truncated === true,
        error: null,
      };
    }
    if (res.status === 401) {
      return { pages: [], truncated: false, error: "Please sign in again to see your published pages." };
    }
    if (res.status === 530 || data?.error) {
      return {
        pages: [],
        truncated: false,
        error: data?.error || "Published pages are unavailable on this deployment.",
      };
    }
    return { pages: [], truncated: false, error: `Could not load published pages (${res.status}).` };
  } catch (err) {
    return {
      pages: [],
      truncated: false,
      error: err?.message
        ? `Could not load published pages: ${err.message}`
        : "Could not load published pages.",
    };
  }
}

/**
 * Removes a published page: the public URL stops working immediately.
 * The creation itself stays in its chat.
 */
export async function unpublishPage(slug) {
  if (!slug || typeof slug !== "string") {
    return { success: false, error: "A slug is required." };
  }
  try {
    const res = await fetch(`/api/publish/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success !== false) {
      forgetPublishedSlug(slug);
      return { success: true, slug };
    }
    return {
      success: false,
      error: data?.error || `Could not remove the page (${res.status}).`,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message
        ? `Could not remove the page: ${err.message}`
        : "Could not remove the page.",
    };
  }
}

/**
 * Reads one published site's traffic report for the signed-in owner.
 *
 * `days` is one of 7, 30 or 90 (the windows the worker accepts). Returns the
 * full report as `{ success: true, analytics }` or `{ success: false, error }`
 * so the panel can show a retry instead of a wall of zeroes.
 */
export async function fetchSiteAnalytics(slug, days = 30) {
  if (!slug || typeof slug !== "string") {
    return { success: false, error: "A slug is required." };
  }
  try {
    const res = await fetch(
      `/api/publish/${encodeURIComponent(slug)}/analytics?days=${encodeURIComponent(days)}`,
      {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );
    const data = await res.json().catch(() => null);
    if (res.ok && data?.totals && Array.isArray(data?.series)) {
      return { success: true, analytics: data };
    }
    if (res.status === 401) {
      return {
        success: false,
        error: "Please sign in again to see this site's analytics.",
      };
    }
    return {
      success: false,
      error: data?.error || `Could not load analytics (${res.status}).`,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message
        ? `Could not load analytics: ${err.message}`
        : "Could not load analytics.",
    };
  }
}

/**
 * Drops a removed slug from the local publish registry and per-session
 * lineage. Without this, republishing the same content would try to reuse a
 * link that no longer exists.
 */
function forgetPublishedSlug(slug) {
  try {
    const registry = loadPublishRegistry().filter((entry) => entry.slug !== slug);
    savePublishRegistry(registry);
  } catch {
    /* best effort */
  }
  try {
    const lineage = loadPublishLineage();
    let changed = false;
    for (const [sessionId, entry] of Object.entries(lineage)) {
      if (entry?.slug === slug) {
        delete lineage[sessionId];
        changed = true;
      }
    }
    if (changed) savePublishLineage(lineage);
  } catch {
    /* best effort */
  }
}

/**
 * Forgets a deleted chat session's publish lineage. Without this, a future
 * chat that reuses the session id (or republishes identical content) could
 * silently update a link whose source conversation is gone.
 */
export function forgetPublishLineageForSession(sessionId) {
  if (!sessionId || typeof sessionId !== "string") return;
  try {
    const lineage = loadPublishLineage();
    if (lineage[sessionId]) {
      delete lineage[sessionId];
      savePublishLineage(lineage);
    }
  } catch {
    /* best effort */
  }
}

/**
 * Unpublishes whatever this session published, using the local lineage.
 *
 * The server removes a deleted chat's published pages itself, from the session
 * id stored on each publish record. This is the other half: a page published
 * before that lineage was recorded is only known here, in the browser that
 * published it, so deleting the chat is the last chance to take it down.
 *
 * Returns `{ slug, removed }` — `removed` says whether a live page was taken
 * down (a page already gone is not a failure, but it is not a removal either).
 */
export async function unpublishSessionPages(sessionId) {
  if (!sessionId || typeof sessionId !== "string") {
    return { slug: null, removed: false };
  }
  let slug;
  try {
    slug = loadPublishLineage()[sessionId]?.slug || null;
  } catch {
    slug = null;
  }
  if (!slug) return { slug: null, removed: false };
  let removed = false;
  try {
    const result = await unpublishPage(slug);
    removed = Boolean(result?.success);
    if (!removed && result?.error) {
      console.warn(`Could not unpublish ${slug} for the deleted chat: ${result.error}`);
    }
  } catch (err) {
    console.warn(`Could not unpublish ${slug} for the deleted chat:`, err);
  }
  // The lineage has to go either way: the conversation it belonged to is gone,
  // so a later chat must never inherit this link.
  forgetPublishLineageForSession(sessionId);
  return { slug, removed };
}

/**
 * Hands this browser's publish lineage to the worker, once per app load.
 *
 * The dialogue that fixes legacy pages: a page published before the worker began
 * recording which chat produced it has no session id, so its chat being deleted
 * could not unpublish it. This browser is the only place that pairing exists, so
 * it is offered here and the worker decides — it is the only party that can tell
 * whether the chat still exists. Pages whose chat is gone come back in
 * `unpublished` and are forgotten locally; pages whose chat survives get the
 * lineage recorded, so later deletes clean them up like any other.
 *
 * Best effort by design: a failure leaves the lineage in place for the next load
 * and never blocks the interface.
 */
export async function claimPublishLineage() {
  let lineage;
  try {
    lineage = loadPublishLineage();
  } catch {
    return { claimed: [], unpublished: [], error: "lineage-unavailable" };
  }
  const entries = Object.entries(lineage)
    .map(([sessionId, entry]) => ({
      sessionId,
      slug: typeof entry?.slug === "string" ? entry.slug : "",
    }))
    .filter((entry) => entry.sessionId && entry.slug)
    .slice(0, PUBLISH_LINEAGE_MAX);
  if (entries.length === 0) return { claimed: [], unpublished: [] };

  try {
    const res = await fetch("/api/publish/lineage", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ entries }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.success !== true) {
      return {
        claimed: [],
        unpublished: [],
        error: data?.error || `Lineage sync failed (${res.status}).`,
      };
    }
    const unpublished = Array.isArray(data.unpublished) ? data.unpublished : [];
    if (unpublished.length > 0) {
      // Those pages are gone, so their local entries would only point at dead
      // links. Forget exactly those: everything else keeps its lineage (an
      // "ignored" slug may just be a record this account no longer owns).
      const gone = new Set(unpublished);
      const next = {};
      for (const [sessionId, entry] of Object.entries(lineage)) {
        if (entry?.slug && gone.has(entry.slug)) continue;
        next[sessionId] = entry;
      }
      savePublishLineage(next);
    }
    return {
      claimed: Array.isArray(data.claimed) ? data.claimed : [],
      unpublished,
    };
  } catch (err) {
    return {
      claimed: [],
      unpublished: [],
      error: err?.message ? `Lineage sync failed: ${err.message}` : "Lineage sync failed.",
    };
  }
}

/**
 * Fetches the published page's EDITABLE copy for the settings/sites editor.
 *
 * Owner-only, and different from `GET /<slug>` by design: the public route serves
 * the rendered page to anyone, while this returns the raw documents (home plus
 * every sub-page) with the injected badge removed. Editing needs all of them —
 * saving a multi-page site must write back the pages it did not touch, not drop
 * them.
 */
export async function fetchPublishedPageForEdit(slug) {
  if (!slug || typeof slug !== "string") {
    return { success: false, error: "A slug is required." };
  }
  try {
    const res = await fetch(`/api/publish/${encodeURIComponent(slug)}`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.slug) {
      return {
        success: true,
        page: {
          slug: data.slug,
          url: data.url || `/${data.slug}`,
          title: typeof data.title === "string" ? data.title : "",
          html: typeof data.html === "string" ? data.html : "",
          pages:
            data.pages && typeof data.pages === "object" && !Array.isArray(data.pages)
              ? data.pages
              : {},
          badge: data.badge === true,
          customized: data.customized === true,
          createdAt: data.createdAt || null,
        },
      };
    }
    return {
      success: false,
      error: data?.error || `Could not load the page (${res.status}).`,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message
        ? `Could not load the page: ${err.message}`
        : "Could not load the page.",
    };
  }
}

/**
 * Saves an edited published page under its existing link.
 *
 * The slug is explicit, so the publish route updates that record in place
 * (ownership is enforced there). Every page is sent back — the editor's copy of
 * the one being edited plus the untouched sub-pages — because the record is
 * replaced wholesale.
 */
export async function savePublishedPage({ slug, title, html, pages }) {
  if (!slug || typeof slug !== "string") {
    return { success: false, error: "A slug is required." };
  }
  if (!html || typeof html !== "string" || !html.trim()) {
    return { success: false, error: "The page cannot be empty." };
  }
  return publishAppInR2({
    html,
    title: title || "Untitled Application",
    slug,
    pages,
    // No sessionId: this edit is not attributed to a chat, and the existing
    // lineage on the record is preserved by the worker.
  });
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
