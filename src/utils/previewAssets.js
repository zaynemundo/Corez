/**
 * Private R2 assets are addressed as `/api/assets/<key>`. The canvas preview
 * runs in a sandboxed, originless iframe, so it cannot send the owner's session
 * cookie and the route correctly answers 404 for those private assets. Before
 * handing the document to the iframe, fetch the owner's images with the app's
 * session and inline them as data URLs. Published pages are unaffected: their
 * assets are made public by the publish marker.
 */

export const PREVIEW_ASSET_URL =
  /(?:https:\/\/(?:www\.)?corez\.pro)?\/api\/assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,254}/g;

export const PREVIEW_ASSET_MAX_COUNT = 12;
export const PREVIEW_ASSET_MAX_BYTES = 8 * 1024 * 1024;

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
}

/**
 * Replace same-origin private asset URLs with data URLs.
 *
 * Failures are deliberately non-fatal: the original URL stays in the document
 * and the preview's own error reporter explains the missing asset. A failed
 * inline must never hide the rest of the site.
 */
export async function inlinePreviewAssets(html, options = {}) {
  const source = String(html || "");
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!source || !fetchImpl) return source;

  const baseUrl =
    options.baseUrl ||
    (typeof location !== "undefined" && location.origin
      ? location.origin
      : "https://corez.pro");

  const matches = [...new Set(source.match(PREVIEW_ASSET_URL) || [])];
  if (!matches.length) return source;

  // Group URLs by their absolute form so an absolute and a relative reference
  // to the same asset share one fetch. Replace the longest spelling first so
  // the relative path inside an absolute URL cannot corrupt the data URL.
  const groups = new Map();
  for (const match of matches) {
    let absolute;
    try {
      // Fetch through the current origin even when the generated page spells
      // out https://corez.pro: chat.corez.pro and corez.pro run the same
      // worker, and a relative request keeps the session cookie same-origin.
      const parsed = match.startsWith("http") ? new URL(match) : null;
      const path = parsed ? parsed.pathname + parsed.search : match;
      absolute = new URL(path, baseUrl).href;
    } catch {
      continue;
    }
    const variants = groups.get(absolute) || [];
    variants.push(match);
    groups.set(absolute, variants);
  }

  let output = source;
  const entries = [...groups.entries()].slice(0, PREVIEW_ASSET_MAX_COUNT);
  for (const [absolute, variants] of entries) {
    try {
      const response = await fetchImpl(absolute, { credentials: "include" });
      if (!response.ok) continue;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/") || blob.size > PREVIEW_ASSET_MAX_BYTES) {
        continue;
      }
      const dataUrl = await blobToDataUrl(blob);
      for (const variant of [...variants].sort((a, b) => b.length - a.length)) {
        output = output.split(variant).join(dataUrl);
      }
    } catch {
      // Non-fatal: leave the original URL in place.
    }
  }
  return output;
}
