import { sessionUid } from "./auth.js";
import { getActiveSubscription } from "./subscriptions.js";
import {
  UsageUnavailableError,
  consumeAllowance,
  limitResponse,
   usageUnavailableResponse,
} from "./usage.js";
import {
  SAFE_STORAGE_SEGMENT,
  readBoundedJson,
  jsonResponse,
  createRateLimiter,
} from "./utils.js";
import { repairMalformedHtml } from "./htmlRepair.js";
import {
  legacyPublishKey,
  assetPubMarkerKey,
} from "./storageKeys.js";
import {
  DEFAULT_ANALYTICS_RANGE,
  HOME_PAGE,
  maybePruneSiteAnalytics,
  normalizeAnalyticsRange,
  readSiteAnalytics,
  recordSitePageView,
} from "./siteAnalytics.js";
import {
  PUBLISH_SLUG_PATTERN,
  GENERATED_SLUG_PATTERN,
  PUBLISH_PAGE_PATTERN,
  PUBLISH_PAGE_NAME_PATTERN,
  MAX_PUBLISH_PAGES,
  PUBLISH_SLUG_ROOT_PATTERN,
  PUBLISH_UNPUBLISH_PATH_PATTERN,
  MAX_OWNED_PUBLISHES,
  RESERVED_SLUGS,
  generatePublishSlug,
  extractReferencedAssetKeys,
  resolvePublishRecord,
  writePublishRecord,
  deletePublishRecord,
  dropUnreferencedAssetMarkers,
  scanPublishRecords,
  listUserPublishRecords,
  publishRecordSummary,
} from "./publishStore.js";

export function publishedPageHeaders({ frameable = false } = {}) {
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    // Published creations are AI-generated user content: render them in an
    // originless sandbox (no cookies, storage, or same-origin access) but
    // let the app itself run exactly like the in-app preview — inline
    // scripts/styles, CDN libraries, embedded images/fonts, and external
    // links (popups escape the sandbox so links open in real tabs).
    "Content-Security-Policy":
      // `default-src blob:` lets a published document download a file it built
      // locally (same Blob-URL anchor mechanism as the in-app preview); the
      // sandbox also carries allow-downloads so the download is not silently
      // dropped. It must NOT be `'none' blob:`: CSP rejects `'none'` combined
      // with other sources and discards the whole directive. Matches the
      // preview CSP in src/utils/previewTransformer.js.
      "sandbox allow-scripts allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-downloads; default-src blob:; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src data: https: blob:; font-src data: https:; media-src data: https: blob:; connect-src https:",
  };
  // The publish modal offers an <iframe> embed, which X-Frame-Options: DENY
  // silently broke. Published creations stay frameable (they run sandboxed,
  // without cookies or same-origin access); private app previews keep DENY.
  if (!frameable) headers["X-Frame-Options"] = "DENY";
  return headers;
}

// Published links are public shareable URLs backed by R2 storage: bound the
// creation rate per client so the store cannot be spammed with slugs.
const publishRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });

// Free-plan published creations carry a "Made with Corez" badge. The badge is
// injected server-side behind markers so a later paid republish can strip it
// again, and so re-publishing never stacks duplicate badges.
const COREZ_BADGE_START = "<!-- corez-badge:start -->";
const COREZ_BADGE_END = "<!-- corez-badge:end -->";
const COREZ_BADGE_HTML =
  COREZ_BADGE_START +
  '<a href="https://corez.pro/?ref=badge" target="_blank" rel="noopener" aria-label="Made with Corez" style="position:fixed;right:12px;bottom:12px;z-index:2147483647;display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;background:rgba(10,10,10,0.82);color:#ffffff;font:600 12px/1 -apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;text-decoration:none;letter-spacing:0.01em;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.14);pointer-events:auto"><span style="width:8px;height:8px;border-radius:50%;background:#ffffff;opacity:0.9"></span>Made with Corez</a>' +
  COREZ_BADGE_END;

export function stripCorezBadge(html) {
  if (typeof html !== "string") return html;
  const start = html.indexOf(COREZ_BADGE_START);
  const end = html.indexOf(COREZ_BADGE_END);
  if (start === -1 || end === -1 || end < start) return html;
  return html.slice(0, start) + html.slice(end + COREZ_BADGE_END.length);
}

export function injectCorezBadge(html) {
  const clean = stripCorezBadge(html);
  const lower = clean.toLowerCase();
  const bodyClose = lower.lastIndexOf("</body>");
  if (bodyClose !== -1) {
    return clean.slice(0, bodyClose) + COREZ_BADGE_HTML + clean.slice(bodyClose);
  }
  // No </body>: place the badge before </html> so it stays part of the
  // document. Appending it AFTER the closing tag made it trailing text, which
  // the serve-time HTML repair now strips as junk — the free-plan badge would
  // silently disappear from a page the model closed without </body>.
  const htmlClose = lower.lastIndexOf("</html>");
  if (htmlClose !== -1) {
    return clean.slice(0, htmlClose) + COREZ_BADGE_HTML + clean.slice(htmlClose);
  }
  return clean + COREZ_BADGE_HTML;
}

// Most lineage entries one request may carry: the browser keeps at most 50
// (appStorageService PUBLISH_LINEAGE_MAX), so this accepts exactly what a client
// can legitimately have and no more.
const MAX_LINEAGE_ENTRIES = 50;

export async function handlePublish(request, env, ctx = null, serveAssets = null) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // GET /api/publish/<slug>/analytics - the owner's traffic report for one
  // published site. Owner-only, like every other publish-management route:
  // traffic patterns can reveal an audience, so they are never public.
  const analyticsMatch = pathname.match(
    /^\/api\/publish\/([a-z0-9][a-z0-9-]{1,48}[a-z0-9])\/analytics$/,
  );
  if (analyticsMatch && request.method === "GET") {
    const uid = await sessionUid(request, env);
    if (!uid) {
      return jsonResponse(401, { error: "Authentication required." });
    }
    const slug = analyticsMatch[1];
    const resolved = await resolvePublishRecord(env, slug).catch(() => null);
    const record = resolved?.record || null;
    if (!record) {
      return jsonResponse(404, { error: "Published page not found." });
    }
    if (!record.ownerUserId) {
      return jsonResponse(403, {
        error:
          "This published page predates ownership records, so its analytics cannot be shown here.",
      });
    }
    if (record.ownerUserId !== uid) {
      return jsonResponse(403, {
        error: "This published page belongs to another account.",
      });
    }
    if (!env?.DB) {
      return jsonResponse(503, {
        error: "Site analytics storage is not configured on this deployment.",
        code: "analytics_unavailable",
      });
    }
    const requested = url.searchParams.get("days");
    const days =
      requested === null ? DEFAULT_ANALYTICS_RANGE : normalizeAnalyticsRange(requested);
    if (days === null) {
      return jsonResponse(400, {
        error: "days must be one of 7, 30 or 90.",
      });
    }
    const analytics = await readSiteAnalytics(env, slug, { days });
    if (!analytics) {
      return jsonResponse(503, {
        error: "Site analytics are unavailable right now.",
        code: "analytics_unavailable",
        retryable: true,
      });
    }
    // Retention is cleaned up on the screen that consumes this data, not on
    // every public page view. Throttled per isolate inside the module.
    const maintenance = maybePruneSiteAnalytics(env).catch(() => {});
    if (typeof ctx?.waitUntil === "function") ctx.waitUntil(maintenance);
    else await maintenance;
    return jsonResponse(200, {
      ...analytics,
      url: `/${slug}`,
      title: typeof record.title === "string" ? record.title : "",
      collectionDisabled: env.SITE_ANALYTICS_DISABLED === "1",
    });
  }

  // POST /api/publish/lineage - claim the lineage of pages published before the
  // worker recorded which chat produced them, and take down the ones whose chat
  // is already gone.
  if (pathname === "/api/publish/lineage" && request.method === "POST") {
    const uid = await sessionUid(request, env);
    if (!uid) {
      return jsonResponse(401, { error: "Authentication required." });
    }
    if (!env?.ASSET_BUCKET) {
      return jsonResponse(530, {
        error: "R2 storage (ASSET_BUCKET) is not configured.",
      });
    }
    const retryAfter = publishRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(
        429,
        { error: "Too many publish requests. Try again shortly." },
        { "Retry-After": String(retryAfter) },
      );
    }
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }
    const rawEntries = Array.isArray(body?.entries) ? body.entries : [];
    if (rawEntries.length === 0) {
      // Nothing to claim is not an error: the browser simply has no lineage.
      return jsonResponse(200, {
        success: true,
        claimed: [],
        unpublished: [],
        ignored: [],
      });
    }
    if (rawEntries.length > MAX_LINEAGE_ENTRIES) {
      return jsonResponse(400, {
        error: `Send at most ${MAX_LINEAGE_ENTRIES} lineage entries.`,
      });
    }

    const claimed = [];
    const unpublished = [];
    const ignored = [];
    for (const entry of rawEntries) {
      const sessionId =
        typeof entry?.sessionId === "string" ? entry.sessionId.trim() : "";
      const slug = typeof entry?.slug === "string" ? entry.slug.trim() : "";
      if (
        !sessionId ||
        !SAFE_STORAGE_SEGMENT.test(sessionId) ||
        !PUBLISH_SLUG_PATTERN.test(slug)
      ) {
        ignored.push(slug || sessionId || "invalid");
        continue;
      }
      const resolved = await resolvePublishRecord(env, slug).catch(() => null);
      const record = resolved?.record || null;
      // Missing or somebody else's page: nothing to claim, nothing to remove.
      if (!record || record.ownerUserId !== uid) {
        ignored.push(slug);
        continue;
      }
      // A page already attributed to a different chat is left alone: the client
      // is stale or wrong, and the recorded lineage is the one the delete path
      // relies on.
      if (
        typeof record.sessionId === "string" &&
        record.sessionId &&
        record.sessionId !== sessionId
      ) {
        ignored.push(slug);
        continue;
      }
      // Whether the chat still exists decides the outcome, so it has to be a
      // real answer. A failed lookup (missing table, D1 hiccup) must never
      // unpublish anything.
      let chatExists = null;
      if (env?.DB) {
        try {
          const row = await env.DB.prepare(
            "SELECT id FROM chats WHERE id = ? AND user_id = ? LIMIT 1",
          )
            .bind(sessionId, uid)
            .first();
          chatExists = Boolean(row);
        } catch {
          chatExists = null;
        }
      }
      if (chatExists === null) {
        ignored.push(slug);
        continue;
      }
      if (chatExists === false) {
        try {
          await deletePublishRecord(env, slug);
          await dropUnreferencedAssetMarkers(env, record);
          unpublished.push(slug);
        } catch {
          ignored.push(slug);
        }
        continue;
      }
      if (record.sessionId === sessionId) {
        // Already attributed: nothing to write, and it counts as claimed so a
        // caller can see the lineage is in place.
        claimed.push(slug);
        continue;
      }
      try {
        await writePublishRecord(env, uid, slug, {
          ...record,
          sessionId,
          lineageClaimedAt: new Date().toISOString(),
        });
        claimed.push(slug);
      } catch {
        ignored.push(slug);
      }
    }

    return jsonResponse(200, {
      success: true,
      claimed,
      unpublished,
      ignored,
    });
  }

  // POST /api/publish - publish (or republish under an explicit slug) a
  // creation so anyone with the link can open it. Requires authentication;
  // GET /<slug> routes below are public and do not require a session.
  if (pathname === "/api/publish" && request.method === "POST") {
    const uid = await sessionUid(request, env);
    if (!uid) {
      return jsonResponse(401, { error: "Authentication required." });
    }
    let planId = "free";
    if (env?.DB) {
      try {
        const sub = await getActiveSubscription(env, uid);
        if (sub) {
          const plan = String(sub.plan || "free").toLowerCase();
          const expired = sub.status === "expired" || sub.isExpired === true;
          planId =
            !expired && (plan === "standard" || plan === "premium")
              ? plan
              : "free";
        }
      } catch {
        planId = "free";
      }
    }
    const showBadge = planId !== "standard" && planId !== "premium";
    try {
      const publishAdmission = await consumeAllowance(env, uid, {
        plan: planId,
        charges: [{ metric: "publishes", amount: 1 }],
      });
      if (!publishAdmission.ok && publishAdmission.reason === "limit") {
        return limitResponse("publishes", publishAdmission.evaluation, planId);
      }
    } catch (err) {
      if (err instanceof UsageUnavailableError) {
        return usageUnavailableResponse();
      }
      throw err;
    }
    const retryAfter = publishRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(
        429,
        { error: "Too many publish requests. Try again shortly." },
        { "Retry-After": String(retryAfter) },
      );
    }
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      body = {};
    }

    const html =
      typeof body?.html === "string" && body.html.trim()
        ? body.html.trim()
        : typeof body?.code === "string" && body.code.trim()
          ? body.code.trim()
          : "";
    if (!html) {
      return jsonResponse(400, {
        error: "html or code content is required to publish.",
      });
    }
    if (html.length > 2 * 1024 * 1024) {
      return jsonResponse(400, { error: "Published content is too large." });
    }
    if (!env?.ASSET_BUCKET) {
      return jsonResponse(530, {
        error: "R2 storage (ASSET_BUCKET) is not configured.",
      });
    }

    const title =
      typeof body?.title === "string"
        ? body.title.slice(0, 120)
        : "Untitled Application";

    // Optional multi-page payload: a map of validated page names to their
    // full formatted HTML documents. Every name is validated, the count and
    // total size are bounded, and the home html + pages share one 2 MB cap.
    const pages = {};
    if (
      body?.pages &&
      typeof body.pages === "object" &&
      !Array.isArray(body.pages)
    ) {
      let pagesTotal = html.length;
      for (const [pageName, pageHtml] of Object.entries(body.pages)) {
        if (pagesTotal >= 2 * 1024 * 1024) break;
        if (!PUBLISH_PAGE_NAME_PATTERN.test(pageName)) continue;
        if (typeof pageHtml !== "string" || !pageHtml.trim()) continue;
        const pageContent = pageHtml.trim();
        pagesTotal += pageContent.length;
        if (pagesTotal > 2 * 1024 * 1024) break;
        if (Object.keys(pages).length >= MAX_PUBLISH_PAGES) break;
        pages[pageName] = pageContent;
      }
    }

    const rawRequestedSlug =
      typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : null;
    let slug = null;
    let isCustomized;

    if (rawRequestedSlug) {
      if (
        !PUBLISH_SLUG_PATTERN.test(rawRequestedSlug) ||
        rawRequestedSlug.includes("--")
      ) {
        return jsonResponse(400, {
          error:
            "Slug must be 3-50 characters with lowercase letters, numbers, and single hyphens.",
        });
      }
      if (RESERVED_SLUGS.has(rawRequestedSlug)) {
        return jsonResponse(400, {
          error: `The slug "${rawRequestedSlug}" is reserved. Please choose a different URL.`,
        });
      }

      // 1-time change check: if renaming from previous slug, ensure previous was not already customized
      if (body?.previousSlug && body.previousSlug !== rawRequestedSlug) {
        if (PUBLISH_SLUG_PATTERN.test(body.previousSlug)) {
          const prevResolved = await resolvePublishRecord(env, body.previousSlug);
          const prevRecord = prevResolved?.record || null;
          if (prevRecord) {
            if (prevRecord?.customized) {
              return jsonResponse(400, {
                error:
                  "The URL slug for this creation has already been customized once and cannot be changed again.",
              });
            }
          }
        }
      }

      // Check collision / ownership (per-user folders + legacy flat keys).
      const existingResolved = await resolvePublishRecord(env, rawRequestedSlug);
      if (
        existingResolved &&
        body?.previousSlug &&
        body.previousSlug !== rawRequestedSlug
      ) {
        return jsonResponse(409, {
          error: `The slug "${rawRequestedSlug}" is already taken. Please choose a different URL.`,
        });
      }
      if (existingResolved) {
        const existingRecord = existingResolved.record;
        if (existingRecord?.ownerUserId && existingRecord.ownerUserId !== uid) {
          return jsonResponse(403, {
            error: "This slug belongs to another user.",
          });
        }
      }
      slug = rawRequestedSlug;

      if (
        existingResolved &&
        (!body?.previousSlug || body.previousSlug === rawRequestedSlug)
      ) {
        const existingRecord = existingResolved.record;
        isCustomized = Boolean(
          existingRecord?.customized ||
            !GENERATED_SLUG_PATTERN.test(rawRequestedSlug),
        );
      } else {
        isCustomized =
          !GENERATED_SLUG_PATTERN.test(rawRequestedSlug) ||
          Boolean(body?.previousSlug && body.previousSlug !== rawRequestedSlug);
      }
    } else {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generatePublishSlug();
        const existing = await resolvePublishRecord(env, candidate);
        if (!existing) {
          slug = candidate;
          break;
        }
      }
      isCustomized = false;
    }
    if (!slug) {
      return jsonResponse(503, {
        error: "Could not allocate a unique publish slug. Try again.",
      });
    }

    // Apply the badge policy to the stored documents (home + sub-pages).
    const publishedHtml = showBadge
      ? injectCorezBadge(html)
      : stripCorezBadge(html);
    for (const pageName of Object.keys(pages)) {
      pages[pageName] = showBadge
        ? injectCorezBadge(pages[pageName])
        : stripCorezBadge(pages[pageName]);
    }

    // Which chat this page came from. Deleting that chat unpublishes the page
    // (see cleanupChatStorage), so the lineage is stored with the record rather
    // than only in the browser that published it.
    let publishSessionId =
      typeof body?.sessionId === "string" &&
      SAFE_STORAGE_SEGMENT.test(body.sessionId.trim())
        ? body.sessionId.trim().slice(0, 160)
        : null;
    if (!publishSessionId) {
      const previous = await resolvePublishRecord(env, slug).catch(() => null);
      const previousSessionId = previous?.record?.sessionId;
      if (typeof previousSessionId === "string" && previousSessionId) {
        publishSessionId = previousSessionId;
      }
    }

    const record = {
      slug,
      title,
      html: publishedHtml,
      badge: showBadge,
      customized: isCustomized,
      ownerUserId: uid,
      createdAt: new Date().toISOString(),
    };
    if (publishSessionId) {
      record.sessionId = publishSessionId;
    }
    if (Object.keys(pages).length > 0) {
      record.pages = pages;
    }

    // Clean up previous slug if renamed — only when the caller owns it.
    if (
      body?.previousSlug &&
      body.previousSlug !== slug &&
      PUBLISH_SLUG_PATTERN.test(body.previousSlug)
    ) {
      const prevResolved = await resolvePublishRecord(env, body.previousSlug).catch(() => null);
      const prevRecord = prevResolved?.record || null;
      if (prevRecord) {
        if (prevRecord?.ownerUserId && prevRecord.ownerUserId !== uid) {
          return jsonResponse(403, {
            error: "The previous slug belongs to another user.",
          });
        }
      }
      await deletePublishRecord(env, body.previousSlug).catch(() => {});
    }

    await writePublishRecord(env, uid, slug, record);

    // Public-asset markers: every /api/assets/<key> referenced by the
    // published document(s) becomes readable by anonymous visitors.
    try {
      const referencedKeys = extractReferencedAssetKeys([
        html,
        ...Object.values(pages),
      ]);
      for (const assetKey of referencedKeys) {
        await env.ASSET_BUCKET.put(assetPubMarkerKey(assetKey), uid, {
          httpMetadata: { contentType: "text/plain" },
        });
      }
    } catch {
      // ignore: markers are an optimization, not a correctness dependency
    }

    return jsonResponse(200, {
      success: true,
      slug,
      url: `/${slug}`,
      customized: isCustomized,
      badge: showBadge,
    });
  }

  // GET /api/publish - the caller's own published pages, for the settings panel.
  if (pathname === "/api/publish" && request.method === "GET") {
    const uid = await sessionUid(request, env);
    if (!uid) {
      return jsonResponse(401, { error: "Authentication required." });
    }
    if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.list !== "function") {
      return jsonResponse(530, {
        error: "R2 storage (ASSET_BUCKET) is not configured.",
      });
    }
    const { records: owned, truncated: ownedTruncated, supported } =
      await listUserPublishRecords(env, uid);
    if (!supported && owned.length === 0) {
      return jsonResponse(500, {
        error: "Could not read published pages right now.",
      });
    }
    // Legacy flat records owned by this user (pre-move publishes).
    const { records: all } = await scanPublishRecords(env).catch(() => ({
      records: [],
    }));
    const seen = new Set(owned.map(({ record }) => record?.slug));
    for (const entry of all || []) {
      if (entry?.record?.ownerUserId !== uid) continue;
      if (entry?.record?.slug && seen.has(entry.record.slug)) continue;
      if (owned.length >= MAX_OWNED_PUBLISHES) break;
      owned.push(entry);
      if (entry?.record?.slug) seen.add(entry.record.slug);
    }
    const pages = [];
    let omitted = ownedTruncated;
    for (const { key, record } of owned) {
      if (record?.ownerUserId && record.ownerUserId !== uid) continue;
      // Legacy unowned records are unattributable here (same rule as DELETE).
      if (!record?.ownerUserId) continue;
      if (pages.length >= MAX_OWNED_PUBLISHES) {
        omitted = true;
        break;
      }
      pages.push(publishRecordSummary(key, record));
    }
    pages.sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );
    return jsonResponse(200, { pages, truncated: omitted });
  }

  // GET /api/publish/<slug> - the caller's own EDITABLE copy of a page.
  const ownerCopyMatch = pathname.match(
    /^\/api\/publish\/([a-z0-9][a-z0-9-]{1,48}[a-z0-9])$/,
  );
  if (ownerCopyMatch && request.method === "GET") {
    const uid = await sessionUid(request, env);
    if (!uid) {
      return jsonResponse(401, { error: "Authentication required." });
    }
    if (!env?.ASSET_BUCKET) {
      return jsonResponse(530, {
        error: "R2 storage (ASSET_BUCKET) is not configured.",
      });
    }
    const slug = ownerCopyMatch[1];
    const resolved = await resolvePublishRecord(env, slug).catch(() => null);
    const record = resolved?.record || null;
    if (!record) {
      return jsonResponse(404, { error: "Published page not found." });
    }
    if (!record.ownerUserId) {
      return jsonResponse(403, {
        error:
          "This published page predates ownership records, so it cannot be edited here.",
      });
    }
    if (record.ownerUserId !== uid) {
      return jsonResponse(403, {
        error: "This published page belongs to another account.",
      });
    }
    const pages = {};
    if (record.pages && typeof record.pages === "object") {
      for (const [name, pageHtml] of Object.entries(record.pages)) {
        if (
          typeof pageHtml === "string" &&
          PUBLISH_PAGE_NAME_PATTERN.test(name)
        ) {
          pages[name] = stripCorezBadge(pageHtml);
        }
      }
    }
    return jsonResponse(200, {
      slug,
      url: `/${slug}`,
      title: typeof record.title === "string" ? record.title : "",
      html: stripCorezBadge(typeof record.html === "string" ? record.html : ""),
      pages,
      badge: record.badge === true,
      customized: record.customized === true,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
    });
  }

  // DELETE /api/publish/<slug> - unpublish one of the caller's pages.
  const unpublishMatch = pathname.match(PUBLISH_UNPUBLISH_PATH_PATTERN);
  if (unpublishMatch && request.method === "DELETE") {
    const uid = await sessionUid(request, env);
    if (!uid) {
      return jsonResponse(401, { error: "Authentication required." });
    }
    if (!env?.ASSET_BUCKET) {
      return jsonResponse(530, {
        error: "R2 storage (ASSET_BUCKET) is not configured.",
      });
    }
    const retryAfter = publishRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(
        429,
        { error: "Too many publish requests. Try again shortly." },
        { "Retry-After": String(retryAfter) },
      );
    }

    const slug = unpublishMatch[1];
    const resolved = await resolvePublishRecord(env, slug).catch(() => null);
    const record = resolved?.record || null;
    if (!record) {
      let legacyRecord = null;
      try {
        const stored = await env.ASSET_BUCKET.get(legacyPublishKey(slug));
        if (stored) legacyRecord = JSON.parse(await stored.text());
      } catch {}
      if (!legacyRecord) {
        return jsonResponse(404, { error: "Published page not found." });
      }
      if (!legacyRecord?.ownerUserId) {
        return jsonResponse(403, {
          error:
            "This published page predates ownership records, so it cannot be removed from settings.",
        });
      }
      if (legacyRecord.ownerUserId !== uid) {
        return jsonResponse(403, {
          error: "This published page belongs to another account.",
        });
      }
      await deletePublishRecord(env, slug).catch(() => {});
      return jsonResponse(200, { success: true, slug, url: `/${slug}` });
    }
    if (!record?.ownerUserId) {
      return jsonResponse(403, {
        error:
          "This published page predates ownership records, so it cannot be removed from settings.",
      });
    }
    if (record.ownerUserId !== uid) {
      return jsonResponse(403, {
        error: "This published page belongs to another account.",
      });
    }

    await deletePublishRecord(env, slug);
    await dropUnreferencedAssetMarkers(env, record);

    return jsonResponse(200, { success: true, slug, url: `/${slug}` });
  }

  // GET /<slug>/<page>.html - serve one page of a published multi-page creation.
  if (request.method === "GET") {
    const pageMatch = pathname.slice(1).match(PUBLISH_PAGE_PATTERN);
    if (pageMatch) {
      if (!env?.ASSET_BUCKET) {
        return jsonResponse(530, {
          error: "R2 storage (ASSET_BUCKET) is not configured.",
        });
      }
      const [, slug, pageName] = pageMatch;
      const resolved = await resolvePublishRecord(env, slug);
      if (!resolved) {
        return jsonResponse(404, { error: "Published creation not found." });
      }
      const record = resolved.record;
      const pageHtml =
        typeof record?.pages?.[pageName] === "string"
          ? record.pages[pageName]
          : "";
      if (!pageHtml) {
        return jsonResponse(404, { error: "Published page not found." });
      }
      await recordSitePageView(env, request, ctx, {
        slug,
        page: pageName,
        record,
      });
      return new Response(repairMalformedHtml(pageHtml), {
        headers: {
          ...publishedPageHeaders({ frameable: true }),
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }

  // GET /<slug>/ - serve the home page at a trailing-slash URL.
  if (request.method === "GET") {
    const slugRootMatch = pathname.match(PUBLISH_SLUG_ROOT_PATTERN);
    if (slugRootMatch) {
      if (!env?.ASSET_BUCKET) {
        return jsonResponse(530, {
          error: "R2 storage (ASSET_BUCKET) is not configured.",
        });
      }
      const slug = slugRootMatch[1];
      const resolved = await resolvePublishRecord(env, slug);
      if (!resolved) {
        return jsonResponse(404, { error: "Published creation not found." });
      }
      const record = resolved.record;
      const html = typeof record?.html === "string" ? record.html : "";
      if (!html) {
        return jsonResponse(404, { error: "Published creation not found." });
      }
      await recordSitePageView(env, request, ctx, {
        slug,
        page: HOME_PAGE,
        record,
      });
      return new Response(repairMalformedHtml(html), {
        headers: publishedPageHeaders({ frameable: true }),
      });
    }
  }

  // GET /<slug> - serve a published creation to anyone (bare root path).
  if (
    request.method === "GET" &&
    !RESERVED_SLUGS.has(pathname.slice(1)) &&
    PUBLISH_SLUG_PATTERN.test(pathname.slice(1))
  ) {
    if (!env?.ASSET_BUCKET) {
      return typeof env.ASSETS?.fetch === "function" && typeof serveAssets === "function"
        ? serveAssets(request, env)
        : jsonResponse(530, {
            error: "R2 storage (ASSET_BUCKET) is not configured.",
          });
    }
    const slug = pathname.slice(1);
    const resolved = await resolvePublishRecord(env, slug);
    if (!resolved) {
      if (GENERATED_SLUG_PATTERN.test(slug)) {
        return jsonResponse(404, { error: "Published creation not found." });
      }
      return typeof env.ASSETS?.fetch === "function" && typeof serveAssets === "function"
        ? serveAssets(request, env)
        : jsonResponse(404, { error: "Published creation not found." });
    }
    const record = resolved.record;
    if (
      record?.pages &&
      typeof record.pages === "object" &&
      Object.keys(record.pages).length > 0
    ) {
      return new Response(null, {
        status: 301,
        headers: { Location: `/${slug}/` },
      });
    }
    const html = typeof record?.html === "string" ? record.html : "";
    if (!html) {
      return jsonResponse(404, { error: "Published creation not found." });
    }
    await recordSitePageView(env, request, ctx, {
      slug,
      page: HOME_PAGE,
      record,
    });
    return new Response(repairMalformedHtml(html), {
      headers: publishedPageHeaders({ frameable: true }),
    });
  }

  return jsonResponse(405, { error: "Method not allowed." });
}
