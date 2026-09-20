// Custom domains for published creations — Cloudflare for SaaS / Custom
// Hostnames.
//
// STATUS: implemented but NOT WIRED. Nothing imports this module yet, so it
// cannot affect a request. To finish the feature:
//   1. worker/index.js: route "/api/domains*" to handleDomainsApi and call
//      handleCustomDomainRequest() before the normal routes (a Host that is not
//      a platform host is a customer domain).
//   2. worker/entry.js: add "/api/domains" to authPaths.
//   3. wrangler.jsonc: route the fallback origin (customers.corez.pro) to this
//      Worker and set CUSTOM_HOSTNAME_FALLBACK_ORIGIN.
//   4. Settings → Publishing: a per-page domain row (add / verify / remove).
//   5. Unpublish: call removeDomainsForSlug so a removed page releases its
//      hostnames instead of leaving them billing.
//
// Model
//   corez.pro/<slug>          always available, free
//   <customer domain>         Standard or Premium, served from the same Worker
//
// How the traffic flows: the customer points a CNAME at our fallback origin
// (CUSTOM_HOSTNAME_FALLBACK_ORIGIN, e.g. customers.corez.pro), which is routed
// to this Worker. Cloudflare terminates TLS for the customer hostname and
// forwards the request with that Host header, so a request whose Host is not one
// of our own hostnames is a customer domain and is looked up here:
//
//   domains/<hostname>.json  ->  { hostname, slug, ownerUserId, status, ... }
//
// Records live in R2 rather than D1 because a lookup happens on every request
// for a customer domain and R2 keys are a direct get() with no query. A page is
// only ever served from a domain record that points at an existing publish
// record, and unpublishing a page removes its domains (and their Cloudflare
// custom hostnames) so nothing is left billing or dangling.
//
// When the Cloudflare API token/zone are not configured, every mutating call
// fails honestly with `custom_domains_not_configured` instead of pretending the
// domain was connected.

import { jsonResponse } from "./utils.js";
import { getActiveSubscription } from "./subscriptions.js";
import { verifySession } from "./auth.js";

/**
 * Caller identity, with the same dev fallback the rest of the Worker uses:
 * without AUTH_SECRET (local development) the identity is 'dev' and is never
 * trusted for anything but local work.
 */
async function resolveUid(request, env) {
  const session = await verifySession(request, env).catch(() => null);
  if (session?.uid) return session.uid;
  if (!env?.AUTH_SECRET) return "dev";
  return null;
}

export const DOMAIN_PREFIX = "domains/";
export const MAX_DOMAINS_PER_USER = 5;
export const MAX_DOMAINS_PER_SLUG = 3;
export const CF_API_BASE = "https://api.cloudflare.com/client/v4";

// Hosts that belong to the platform. Anything else is treated as a customer
// domain, so this list is the security boundary between "our site" and "their
// site": a hostname here is never served from a domain record.
const PLATFORM_HOST_SUFFIXES = [".pages.dev", ".workers.dev", ".app.github.dev"];

export function platformHostSet(env) {
  const hosts = new Set([
    "corez.pro",
    "www.corez.pro",
    "chat.corez.pro",
    "web.corez.pro",
    "localhost",
    "127.0.0.1",
    "::1",
  ]);
  const fallback = normalizeHostname(env?.CUSTOM_HOSTNAME_FALLBACK_ORIGIN);
  if (fallback) hosts.add(fallback);
  return hosts;
}

export function isPlatformHost(host, env) {
  const normalized = normalizeHostname(host);
  if (!normalized) return true;
  if (platformHostSet(env).has(normalized)) return true;
  if (!normalized.includes(".")) return true; // bare label (localhost:3000 etc.)
  return PLATFORM_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/** Lowercase, strip a trailing dot and any port. Returns null for junk. */
export function normalizeHostname(raw) {
  if (typeof raw !== "string") return null;
  let host = raw.trim().toLowerCase();
  if (!host) return null;
  // Drop a port if one is present.
  host = host.replace(/:\d+$/, "");
  // Drop a single trailing dot (FQDN form).
  host = host.replace(/\.$/, "");
  if (host.length === 0 || host.length > 253) return null;
  return host;
}

const LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * A hostname we are willing to register with Cloudflare: at least two labels,
 * ASCII letters/digits/hyphens (punycode is fine, unicode is not), no wildcard,
 * no IP address, and not one of our own hosts.
 */
export function validateHostname(raw, env) {
  const host = normalizeHostname(raw);
  if (!host) return { ok: false, error: "Enter a domain name." };
  if (host.includes("*")) {
    return { ok: false, error: "Wildcards are not supported. Add each domain separately." };
  }
  if (/^[0-9.]+$/.test(host)) {
    return { ok: false, error: "Enter a domain name, not an IP address." };
  }
  const labels = host.split(".");
  if (labels.length < 2) {
    return { ok: false, error: "Enter a full domain, for example www.yoursite.com." };
  }
  for (const label of labels) {
    if (!LABEL_PATTERN.test(label)) {
      return {
        ok: false,
        error: "Domains may contain letters, numbers and hyphens only.",
      };
    }
  }
  const tld = labels[labels.length - 1];
  if (tld.length < 2) {
    return { ok: false, error: "That does not look like a valid domain." };
  }
  if (isPlatformHost(host, env)) {
    return {
      ok: false,
      error: "That domain belongs to Corez. Use your own domain.",
    };
  }
  return { ok: true, hostname: host };
}

export function domainRecordKey(hostname) {
  return `${DOMAIN_PREFIX}${normalizeHostname(hostname) || "invalid"}.json`;
}

/** Whether the deployment can register custom hostnames at all. */
export function domainFeatureConfig(env) {
  const token = typeof env?.CF_API_TOKEN === "string" ? env.CF_API_TOKEN.trim() : "";
  const zoneId = typeof env?.CF_ZONE_ID === "string" ? env.CF_ZONE_ID.trim() : "";
  const fallbackOrigin = normalizeHostname(env?.CUSTOM_HOSTNAME_FALLBACK_ORIGIN);
  if (env?.CUSTOM_DOMAINS_DISABLED === "1") {
    return { enabled: false, reason: "custom_domains_disabled" };
  }
  if (!token || !zoneId) {
    return { enabled: false, reason: "custom_domains_not_configured" };
  }
  if (!fallbackOrigin) {
    return { enabled: false, reason: "custom_domains_fallback_origin_missing" };
  }
  return { enabled: true, token, zoneId, fallbackOrigin };
}

export function isPaidPlan(plan) {
  const value = String(plan || "free").toLowerCase();
  return value === "standard" || value === "premium";
}

/** The plan gate: Standard and Premium may connect domains. */
export async function requirePaidPlan(env, uid) {
  const sub = await getActiveSubscription(env, uid).catch(() => null);
  const plan = sub?.plan || "free";
  const expired = sub?.status === "expired" || sub?.isExpired === true;
  if (expired || !isPaidPlan(plan)) {
    return {
      ok: false,
      plan,
      error: "Custom domains are available on Standard and Premium. corez.pro/<slug> stays free.",
    };
  }
  return { ok: true, plan };
}

// ---------------------------------------------------------------- Cloudflare

async function cfRequest(env, config, method, path, body) {
  try {
    const response = await fetch(`${CF_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success === false) {
      const detail = Array.isArray(data?.errors) && data.errors.length > 0
        ? data.errors.map((error) => error?.message || error?.code).filter(Boolean).join("; ")
        : `Cloudflare API returned ${response.status}.`;
      return { ok: false, status: response.status, error: detail, result: data?.result ?? null };
    }
    return { ok: true, status: response.status, result: data?.result ?? null };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: `Could not reach the Cloudflare API: ${error?.message || "network error"}.`,
      result: null,
    };
  }
}

/** Turn a Cloudflare custom hostname into the status the settings panel shows. */
export function summarizeCustomHostname(customHostname) {
  const sslStatus = String(customHostname?.ssl?.status || "").toLowerCase();
  const status = String(customHostname?.status || "").toLowerCase();
  let state = "pending";
  if (status === "active" && sslStatus === "active") state = "active";
  else if (status === "blocked") state = "blocked";
  else if (sslStatus === "active" && status !== "active") state = "pending";
  const verificationErrors = [];
  for (const group of [
    customHostname?.verification_errors,
    customHostname?.ssl?.validation_errors,
  ]) {
    if (Array.isArray(group)) {
      for (const entry of group) {
        const message = typeof entry === "string" ? entry : entry?.message;
        if (message) verificationErrors.push(String(message).slice(0, 200));
      }
    }
  }
  const ownership = customHostname?.ownership_verification;
  return {
    state,
    status,
    sslStatus,
    hostnameId: customHostname?.id ? String(customHostname.id) : null,
    verification: ownership?.name && ownership?.value
      ? { name: String(ownership.name), value: String(ownership.value) }
      : null,
    errors: verificationErrors.slice(0, 3),
  };
}

export async function createCustomHostname(env, config, hostname) {
  const created = await cfRequest(env, config, "POST", `/zones/${config.zoneId}/custom_hostnames`, {
    hostname,
    ssl: { method: "http", type: "dv" },
  });
  if (!created.ok) {
    // A hostname already registered for this zone is not an error for us: it
    // means the customer (or a previous attempt) got that far.
    if (created.status === 409 || /already exists|duplicate/i.test(created.error || "")) {
      const existing = await findCustomHostname(env, config, hostname);
      if (existing.ok && existing.result) return existing;
    }
    return created;
  }
  return { ok: true, result: created.result };
}

export async function findCustomHostname(env, config, hostname) {
  const found = await cfRequest(
    env,
    config,
    "GET",
    `/zones/${config.zoneId}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
  );
  if (!found.ok) return found;
  const list = Array.isArray(found.result) ? found.result : [];
  const match = list.find((entry) => normalizeHostname(entry?.hostname) === hostname) || list[0] || null;
  return { ok: true, result: match };
}

export async function deleteCustomHostname(env, config, hostnameId) {
  if (!hostnameId) return { ok: true, result: null };
  return cfRequest(env, config, "DELETE", `/zones/${config.zoneId}/custom_hostnames/${hostnameId}`);
}

// ------------------------------------------------------------------ storage

async function readJson(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    return JSON.parse(await object.text());
  } catch {
    return null;
  }
}

export async function getDomainForHost(env, host) {
  const hostname = normalizeHostname(host);
  if (!hostname || !env?.ASSET_BUCKET) return null;
  const record = await readJson(env.ASSET_BUCKET, domainRecordKey(hostname));
  if (!record || normalizeHostname(record.hostname) !== hostname) return null;
  return record;
}

/**
 * Every domain record, bounded. Domain counts per deployment are small and
 * there is no per-user index to drift out of sync with the records themselves.
 */
export async function listDomainRecords(env, { limit = 500 } = {}) {
  if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.list !== "function") return [];
  const records = [];
  let cursor;
  let scanned = 0;
  try {
    do {
      const listing = await env.ASSET_BUCKET.list({ prefix: DOMAIN_PREFIX, limit: 100, cursor });
      const objects = Array.isArray(listing?.objects) ? listing.objects : [];
      for (const object of objects) {
        scanned += 1;
        if (scanned > limit) return records;
        const record = await readJson(env.ASSET_BUCKET, object.key);
        if (record?.hostname) records.push(record);
      }
      cursor = listing?.truncated ? listing.cursor : null;
    } while (cursor);
  } catch {
    return records;
  }
  return records;
}

export async function listDomainsForUser(env, uid) {
  const records = await listDomainRecords(env);
  return records.filter((record) => record.ownerUserId === uid);
}

export async function listDomainsForSlug(env, slug) {
  const records = await listDomainRecords(env);
  return records.filter((record) => record.slug === slug);
}

export async function saveDomainRecord(env, record) {
  await env.ASSET_BUCKET.put(domainRecordKey(record.hostname), JSON.stringify(record), {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function deleteDomainRecord(env, hostname) {
  await env.ASSET_BUCKET.delete(domainRecordKey(hostname));
}

/** Detach every domain pointing at a page (used when the page is unpublished). */
export async function removeDomainsForSlug(env, slug, { config = null } = {}) {
  const records = await listDomainsForSlug(env, slug);
  for (const record of records) {
    if (config?.enabled) {
      await deleteCustomHostname(env, config, record.hostnameId).catch(() => null);
    }
    await deleteDomainRecord(env, record.hostname).catch(() => null);
  }
  return records.map((record) => record.hostname);
}

// ------------------------------------------------------------ public serving

const DOMAIN_HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function domainNoticePage(title, message, { status = 200 } = {}) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  :root { color-scheme: dark light; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center;
         background: #000; color: #fff;
         font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 34rem; padding: 2.5rem 1.5rem; text-align: center; }
  h1 { font-size: 1.3rem; margin: 0 0 .6rem; letter-spacing: -.01em; }
  p { margin: 0; color: #a1a1a6; }
</style></head>
<body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
  return new Response(html, { status, headers: DOMAIN_HTML_HEADERS });
}

/**
 * Serve a request that arrived on a customer domain. Returns null when the Host
 * belongs to the platform, so the normal routes handle it.
 */
export async function handleCustomDomainRequest(request, env) {
  const url = new URL(request.url);
  const host = normalizeHostname(request.headers.get("Host") || url.hostname);
  if (!host || isPlatformHost(host, env)) return null;

  // Cloudflare HTTP DCV asks the hostname for a token file before the
  // certificate can be issued. The record only exists after the domain was
  // added, but the challenge is served even while the domain is still pending.
  if (url.pathname.startsWith("/.well-known/cf-custom-hostname-challenge/")) {
    const record = await getDomainForHost(env, host).catch(() => null);
    const token = url.pathname.split("/").filter(Boolean).pop();
    if (record?.verification?.value && record.verification.name?.endsWith(token)) {
      return new Response(record.verification.value, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return domainNoticePage("Method not allowed", "This domain serves a published Corez page.", {
      status: 405,
    });
  }

  if (!env?.ASSET_BUCKET) {
    return domainNoticePage("Not available", "Storage is not configured on this deployment.", {
      status: 503,
    });
  }

  const record = await getDomainForHost(env, host);
  if (!record) {
    return domainNoticePage(
      "This domain is not connected yet",
      "No Corez page is connected to this domain. If you own it, add it to a published page in your Corez settings.",
      { status: 404 },
    );
  }

  if (record.state === "blocked") {
    return domainNoticePage(
      "This domain was blocked",
      "Cloudflare blocked this hostname. Remove it in your Corez settings and add it again, or contact support.",
      { status: 451 },
    );
  }

  const published = await readJson(env.ASSET_BUCKET, `publish/${record.slug}.json`);
  if (!published) {
    return domainNoticePage(
      "This page is no longer published",
      "The Corez page connected to this domain was removed. Publish it again, or connect a different page.",
      { status: 404 },
    );
  }

  const pages = published.pages && typeof published.pages === "object" ? published.pages : {};
  const requested = url.pathname;
  let html = "";
  if (requested === "/" || requested === "/index.html") {
    html = typeof published.html === "string" ? published.html : "";
  } else {
    const pageName = requested.startsWith("/") ? requested.slice(1) : requested;
    // Only real page files, no traversal, no nested directories.
    if (/^[a-z0-9][a-z0-9_-]{0,63}\.html$/i.test(pageName) && typeof pages[pageName] === "string") {
      html = pages[pageName];
    }
  }

  if (!html) {
    return domainNoticePage("Page not found", "That page does not exist on this domain.", {
      status: 404,
    });
  }

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "sandbox allow-scripts allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src data: https: blob:; font-src data: https:; media-src data: https: blob:; connect-src https:",
    },
  });
}

// ------------------------------------------------------------------ the API

function publicDomain(record, env) {
  const config = domainFeatureConfig(env);
  return {
    hostname: record.hostname,
    slug: record.slug,
    state: record.state || "pending",
    sslStatus: record.sslStatus || null,
    createdAt: record.createdAt || null,
    lastCheckedAt: record.lastCheckedAt || null,
    verification: record.verification || null,
    errors: Array.isArray(record.errors) ? record.errors.slice(0, 3) : [],
    dns: config.enabled
      ? { type: "CNAME", name: record.hostname, target: config.fallbackOrigin }
      : null,
  };
}

/**
 * /api/domains — owner-only custom domain management.
 *   GET    /api/domains                 list the caller's domains
 *   POST   /api/domains                 { slug, hostname } connect a domain
 *   POST   /api/domains/verify          { hostname } re-check with Cloudflare
 *   DELETE /api/domains/<hostname>      disconnect a domain
 */
export async function handleDomainsApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/domains")) return null;

  const uid = await resolveUid(request, env);
  if (!uid) return jsonResponse(401, { error: "Authentication required." });

  const config = domainFeatureConfig(env);

  // ---- list: always available, so a downgraded account can still see (and
  //      remove) domains it already has.
  if (url.pathname === "/api/domains" && request.method === "GET") {
    const records = await listDomainsForUser(env, uid);
    records.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return jsonResponse(200, {
      domains: records.map((record) => publicDomain(record, env)),
      available: config.enabled,
      reason: config.enabled ? null : config.reason,
      fallbackOrigin: config.enabled ? config.fallbackOrigin : null,
    });
  }

  // ---- connect a domain to a published page
  if (url.pathname === "/api/domains" && request.method === "POST") {
    if (!config.enabled) {
      return jsonResponse(503, {
        error:
          "Custom domains are not configured on this deployment (Cloudflare API token, zone id and fallback origin are required).",
        code: config.reason,
      });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }
    const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
    if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
      return jsonResponse(400, { error: "Published page not found." });
    }

    const plan = await requirePaidPlan(env, uid);
    if (!plan.ok) {
      return jsonResponse(402, { error: plan.error, code: "plan_required", plan: plan.plan });
    }

    const validated = validateHostname(body?.hostname, env);
    if (!validated.ok) {
      return jsonResponse(400, { error: validated.error });
    }
    const hostname = validated.hostname;

    // The page must exist and belong to the caller.
    const published = await readJson(env.ASSET_BUCKET, `publish/${slug}.json`);
    if (!published) {
      return jsonResponse(404, { error: "Published page not found." });
    }
    if (published.ownerUserId && published.ownerUserId !== uid) {
      return jsonResponse(403, { error: "That published page belongs to another account." });
    }

    const existing = await getDomainForHost(env, hostname);
    if (existing) {
      return jsonResponse(409, {
        error:
          existing.ownerUserId === uid
            ? "That domain is already connected to one of your pages."
            : "That domain is already connected to another account.",
        domain: publicDomain(existing, env),
      });
    }

    const owned = await listDomainsForUser(env, uid);
    if (owned.length >= MAX_DOMAINS_PER_USER) {
      return jsonResponse(409, {
        error: `You can connect up to ${MAX_DOMAINS_PER_USER} domains. Remove one to add another.`,
      });
    }
    if (owned.filter((record) => record.slug === slug).length >= MAX_DOMAINS_PER_SLUG) {
      return jsonResponse(409, {
        error: `A page can have up to ${MAX_DOMAINS_PER_SLUG} domains.`,
      });
    }

    const created = await createCustomHostname(env, config, hostname);
    if (!created.ok) {
      return jsonResponse(502, {
        error: `Cloudflare rejected the domain: ${created.error}`,
      });
    }
    const summary = summarizeCustomHostname(created.result);

    const record = {
      hostname,
      slug,
      ownerUserId: uid,
      createdAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      planAtCreation: plan.plan,
      state: summary.state,
      status: summary.status,
      sslStatus: summary.sslStatus,
      hostnameId: summary.hostnameId,
      verification: summary.verification,
      errors: summary.errors,
    };
    await saveDomainRecord(env, record);

    return jsonResponse(201, {
      domain: publicDomain(record, env),
      dns: { type: "CNAME", name: hostname, target: config.fallbackOrigin },
      next: record.state === "active"
        ? "Domain is live."
        : `Point a CNAME for ${hostname} at ${config.fallbackOrigin}, then press Verify.`,
    });
  }

  // ---- re-check with Cloudflare
  if (url.pathname === "/api/domains/verify" && request.method === "POST") {
    if (!config.enabled) {
      return jsonResponse(503, { error: "Custom domains are not configured on this deployment.", code: config.reason });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }
    const hostname = normalizeHostname(body?.hostname);
    if (!hostname) return jsonResponse(400, { error: "A hostname is required." });

    const record = await getDomainForHost(env, hostname);
    if (!record) return jsonResponse(404, { error: "That domain is not connected." });
    if (record.ownerUserId !== uid) {
      return jsonResponse(403, { error: "That domain belongs to another account." });
    }

    const found = await findCustomHostname(env, config, hostname);
    if (!found.ok) {
      return jsonResponse(502, { error: `Could not check with Cloudflare: ${found.error}` });
    }
    if (!found.result) {
      // Cloudflare no longer knows this hostname (deleted there, or the zone
      // changed). Say so instead of reporting a healthy domain.
      const stale = { ...record, state: "error", lastCheckedAt: new Date().toISOString(), errors: ["Cloudflare has no record of this hostname."] };
      await saveDomainRecord(env, stale);
      return jsonResponse(200, { domain: publicDomain(stale, env) });
    }

    const summary = summarizeCustomHostname(found.result);
    const updated = {
      ...record,
      state: summary.state,
      status: summary.status,
      sslStatus: summary.sslStatus,
      hostnameId: summary.hostnameId || record.hostnameId,
      verification: summary.verification || record.verification,
      errors: summary.errors,
      lastCheckedAt: new Date().toISOString(),
    };
    await saveDomainRecord(env, updated);
    return jsonResponse(200, { domain: publicDomain(updated, env) });
  }

  // ---- disconnect
  const deleteMatch = url.pathname.match(/^\/api\/domains\/([a-z0-9.-]+)$/);
  if (deleteMatch && request.method === "DELETE") {
    const hostname = normalizeHostname(deleteMatch[1]);
    const record = hostname ? await getDomainForHost(env, hostname) : null;
    if (!record) return jsonResponse(404, { error: "That domain is not connected." });
    if (record.ownerUserId !== uid) {
      return jsonResponse(403, { error: "That domain belongs to another account." });
    }
    // Removing is allowed on any plan: a downgrade must never trap a customer
    // in a domain they cannot disconnect.
    if (config.enabled) {
      const removed = await deleteCustomHostname(env, config, record.hostnameId);
      if (!removed.ok) {
        return jsonResponse(502, {
          error: `Cloudflare could not release the hostname: ${removed.error}`,
        });
      }
    }
    await deleteDomainRecord(env, record.hostname);
    return jsonResponse(200, { success: true, hostname: record.hostname });
  }

  return jsonResponse(405, { error: "Method not allowed." });
}
