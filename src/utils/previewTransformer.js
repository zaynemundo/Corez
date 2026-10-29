/**
 * Transforms raw HTML or React JSX code into a self-contained HTML document
 * ready to be rendered safely inside an iframe.
 */

import { repairMalformedHtml, stripJunkAfterDocumentEnd } from "./htmlRepair.js";
import { buildReactPreviewHtml } from "./previewReactRuntime.js";

// Multi-page site support: the model may emit multiple full HTML documents
// inside ONE code block, separated by page markers:
//
//   <!-- CORESITE-PAGES: index.html, about.html, contact.html -->
//   <!-- PAGE: index.html -->
//   <!DOCTYPE html>...
//   <!-- PAGE: about.html -->
//   <!DOCTYPE html>...
//
// The splitter below turns that into a { pages } list. A leading document
// without its own marker is adopted as index.html (see
// extractLeadingPageDocument); any other malformed or marker-less output falls
// back to a single page (today's behaviour).
export const MULTI_PAGE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}\.html$/i;
export const MAX_MULTI_PAGE_COUNT = 12;
export const MAX_MULTI_PAGE_TOTAL_BYTES = 2 * 1024 * 1024;

const MULTI_PAGE_MARKER_PATTERN = /^\s*<!--\s*PAGE:\s*([^\s>]+)\s*-->\s*$/gm;
const MULTI_PAGE_HEADER_PATTERN = /^\s*<!--\s*CORESITE-PAGES:[\s\S]*?-->\s*$/gm;

// A page document begins at its doctype or <html> tag. Anything the model put
// before that (a CORESITE-PAGES header, a stray sentence) is not page content.
const DOCUMENT_START_PATTERN = /<!DOCTYPE\s+html[^>]*>|<html[\s>]/i;

/**
 * A page is exactly one HTML document. Models routinely keep writing after the
 * last `</html>`: a markdown "Verification checklist", a summary paragraph, a
 * stray code fence. Browsers render all of that as page text, so an untrimmed
 * page showed the model's notes at the bottom of the preview and of the
 * published site. This normaliser slices a page from its document start
 * (dropping any prose or fence line before it) and cuts the commentary that
 * trails its closing tag. Documents missing the closing tag are left intact so
 * the truncation repair still sees them.
 */
export function normalizePageDocument(html) {
  if (!html || typeof html !== "string") return "";
  let out = html;
  const start = DOCUMENT_START_PATTERN.exec(out);
  if (start && start.index > 0) out = out.slice(start.index);
  return stripJunkAfterDocumentEnd(out).trim();
}

/**
 * The model routinely writes the home page straight into the code block and
 * only starts emitting `<!-- PAGE: ... -->` markers from the SECOND document.
 * The text before the first marker is then a complete page, not preamble junk,
 * so it is returned as a document (sliced from its doctype) instead of being
 * dropped. Returns "" when the preamble holds no document at all.
 */
function extractLeadingPageDocument(preamble) {
  if (typeof preamble !== "string") return "";
  const cleaned = preamble.replace(MULTI_PAGE_HEADER_PATTERN, "");
  const start = cleaned.search(DOCUMENT_START_PATTERN);
  if (start === -1) return "";
  return normalizePageDocument(cleaned.slice(start));
}

/**
 * Where does a multi-page artifact begin inside a model reply?
 *
 * This is the ONE place that decides. Two independent copies of this rule used
 * to exist — one in `ChatMessage.extractUnfencedDeliverable`, one in the
 * truncated-response salvage inside `aiService.extractCodeFromMessage` — and
 * both searched for the first `<!-- PAGE: ... -->` marker and sliced from
 * there. Because models write the home page UNMARKED and only start marking
 * from the second document, both silently deleted index.html, which surfaced as
 * "Missing index.html home page" plus a dangling link per navigation element,
 * with publishing blocked.
 *
 * A document start that precedes the first marker is the unmarked home page, so
 * the earliest of the two wins. Returns -1 when the text holds no artifact.
 */
export function findArtifactStartIndex(text) {
  if (!text || typeof text !== "string") return -1;

  const markerIdx = text.search(/<!--\s*(?:PAGE|CORESITE-PAGES):\s*[^\s>]+\s*-->/i);
  const documentIdx = text.search(DOCUMENT_START_PATTERN);

  // A document that begins before the first marker is the unmarked home page.
  if (documentIdx !== -1 && (markerIdx === -1 || documentIdx < markerIdx)) {
    const remaining = text.slice(documentIdx);
    // Only trust it when it actually looks like a document, so a stray
    // "<html" mentioned in prose does not become the artifact start.
    if (
      remaining.includes("</html>") ||
      remaining.includes("</body>") ||
      remaining.includes("</head>") ||
      remaining.includes("<style") ||
      remaining.includes("<script")
    ) {
      return documentIdx;
    }
  }

  return markerIdx;
}

/**
 * Canonicalises the marker convention on a multi-page artifact by giving an
 * unmarked leading document its own `<!-- PAGE: index.html -->` marker.
 *
 * Models are told every page is delimited by its own marker, but they reliably
 * read "separated by markers" as "markers go BETWEEN pages" and write the home
 * page before the first marker. The parser tolerates that, but every other
 * consumer — a copy-paste of the artifact, a repair round-trip, the user
 * reading the code — then sees a site whose first page has no name. Making the
 * marker explicit here means the convention holds no matter what the model did.
 *
 * A single-page artifact (no markers at all) is returned untouched: adding a
 * marker would falsely turn it into a multi-page site.
 */
export function ensureLeadingPageMarker(code) {
  if (!code || typeof code !== "string") return code;

  const firstMarker = code.search(/<!--\s*PAGE:\s*[^\s>]+\s*-->/i);
  if (firstMarker === -1) return code;

  // An explicit index.html marker already exists: nothing to add.
  if (/<!--\s*PAGE:\s*index\.html\s*-->/i.test(code)) return code;

  const documentStart = code.search(DOCUMENT_START_PATTERN);
  if (documentStart === -1 || documentStart > firstMarker) return code;

  return `<!-- PAGE: index.html -->\n${code}`;
}

/**
 * Splits a model output into pages when it uses the multi-page marker
 * convention. Returns { isMultiPage, pages: [{ name, html }] }. A complete
 * document written before the first marker becomes index.html. Falls back to
 * a single "index.html" page for anything malformed so the preview contract
 * never breaks.
 */
export function parseMultiPageSite(rawCode) {
  if (!rawCode || typeof rawCode !== "string") {
    return {
      isMultiPage: false,
      pages: [{ name: "index.html", html: rawCode || "" }],
    };
  }

  const trimmed = rawCode.trim();
  const hasMarker = MULTI_PAGE_MARKER_PATTERN.test(trimmed);
  MULTI_PAGE_MARKER_PATTERN.lastIndex = 0;
  if (!hasMarker) {
    return {
      isMultiPage: false,
      pages: [{ name: "index.html", html: normalizePageDocument(trimmed) }],
    };
  }

  const segments = trimmed.split(MULTI_PAGE_MARKER_PATTERN);
  // segments = [preamble, name1, html1, name2, html2, ...]
  const pages = [];
  const seenNames = new Set();
  let totalBytes = 0;

  for (let i = 1; i + 1 < segments.length; i += 2) {
    const name = segments[i].trim();
    if (!MULTI_PAGE_NAME_PATTERN.test(name)) continue;
    // A duplicated emission of the same page (the model restarts and writes
    // the whole site twice) must not turn into two preview tabs: the first
    // complete version of a page wins.
    if (seenNames.has(name)) continue;

    const html = normalizePageDocument(
      segments[i + 1].replace(MULTI_PAGE_HEADER_PATTERN, ""),
    );
    if (!html) continue;
    if (pages.length >= MAX_MULTI_PAGE_COUNT) break;

    totalBytes += html.length;
    if (totalBytes > MAX_MULTI_PAGE_TOTAL_BYTES) break;

    seenNames.add(name);
    pages.push({ name, html });
  }

  // Adopt an unmarked leading document as the home page. Dropping it deleted
  // index.html from the site: the preview opened on an arbitrary sub-page and
  // the completeness gate blocked publishing with "Missing index.html home
  // page", even though the model had emitted a perfectly good home document.
  // An explicitly marked index.html always wins over the unmarked one.
  if (!pages.some((page) => page.name === "index.html")) {
    const leadingHtml = extractLeadingPageDocument(segments[0]);
    if (
      leadingHtml &&
      pages.length < MAX_MULTI_PAGE_COUNT &&
      totalBytes + leadingHtml.length <= MAX_MULTI_PAGE_TOTAL_BYTES
    ) {
      pages.unshift({ name: "index.html", html: leadingHtml });
    }
  }

  if (pages.length === 0) {
    return {
      isMultiPage: false,
      pages: [{ name: "index.html", html: normalizePageDocument(trimmed) }],
    };
  }

  // Index page (if present) must come first so the preview opens on the home
  // page even when the model lists pages out of order.
  pages.sort((a, b) => {
    if (a.name === "index.html") return -1;
    if (b.name === "index.html") return 1;
    return a.name.localeCompare(b.name);
  });

  return { isMultiPage: pages.length > 1, pages };
}

// Absolute or protocol-relative URLs never point at pages inside the site.
const INTERNAL_LINK_PATTERN = /\bhref\s*=\s*["']([^"']+)["']/gi;
const PAGE_TARGET_PATTERN = /([a-z0-9][a-z0-9_-]{0,63}\.html)(?:[#?][^"']*)?$/i;
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const PROTOCOL_RELATIVE_PATTERN = /^\/\//i;

/**
 * Completeness gate for a parsed multi-page site. Checks that the output is
 * actually complete before it is shown or published:
 *  - index.html exists (the site opens on a home page)
 *  - no page is empty
 *  - every internal .html link points at an existing page
 *  - pages are full HTML documents, not fragments
 * External links (https:, mailto:, tel:, protocol-relative) are ignored.
 *
 * Returns { valid, issues: [{ severity: 'error'|'warn', page, message }] }.
 * 'error' issues make the site incomplete; 'warn' issues are quality notes.
 */
export function validateMultiPageSite(pages) {
  const issues = [];

  if (!Array.isArray(pages) || pages.length === 0) {
    return {
      valid: false,
      issues: [
        { severity: "error", page: null, message: "No pages were produced." },
      ],
    };
  }

  const names = new Set(pages.map((p) => p.name));
  if (!names.has("index.html")) {
    issues.push({
      severity: "error",
      page: null,
      message: "Missing index.html home page.",
    });
  }

  for (const page of pages) {
    const html = typeof page?.html === "string" ? page.html : "";
    if (!html.trim()) {
      issues.push({
        severity: "error",
        page: page.name,
        message: `${page.name} is empty.`,
      });
      continue;
    }
    if (!/<\/html>/i.test(html)) {
      issues.push({
        severity: "warn",
        page: page.name,
        message: `${page.name} is not a complete HTML document (missing closing </html>).`,
      });
    }

    for (const match of html.matchAll(INTERNAL_LINK_PATTERN)) {
      const href = match[1].trim();
      if (
        !href ||
        href.charAt(0) === "#" ||
        ABSOLUTE_URL_PATTERN.test(href) ||
        PROTOCOL_RELATIVE_PATTERN.test(href)
      ) {
        continue;
      }
      const target = href.split(/[#?]/)[0].split("/").pop();
      if (!PAGE_TARGET_PATTERN.test(target)) continue;
      if (!names.has(target)) {
        issues.push({
          severity: "error",
          page: page.name,
          message: `${page.name} links to missing page ${target}.`,
        });
      }
    }
  }

  return { valid: issues.every((issue) => issue.severity !== "error"), issues };
}

/**
 * Router script injected into every multi-page preview/published document.
 * Intercepts clicks on internal .html links and:
 *  - inside the sandboxed preview iframe: forwards the target page to the
 *    parent via postMessage so the parent swaps the srcdoc (no navigation),
 *  - on a published top-level page: fetches the sub-page and swaps the
 *    document in place (the sandbox CSP blocks real URL navigation).
 * Hash links and external links keep the existing guard behaviour.
 */
export const MULTI_PAGE_ROUTER_SCRIPT = `
(function () {
  var pageNamePattern = /^[a-z0-9][a-z0-9_-]{0,63}\\.html$/i;
  function resolvePageName(href) {
    if (!href) return null;
    var clean = href.split('#')[0].split('?')[0].trim();
    if (clean.indexOf('/') !== -1) clean = clean.slice(clean.lastIndexOf('/') + 1);
    if (!pageNamePattern.test(clean)) return null;
    return clean;
  }
  // Published pages are served at /<slug>/<page>.html but the home page is
  // served at the bare /<slug> path, so a relative href like "about.html"
  // resolves against the site root there and misses the slug directory.
  // Rebuild the directory the current page was served from and fetch every
  // sub-page relative to it.
  function pageBase() {
    var path = (window.location && window.location.pathname) || '/';
    var slash = path.lastIndexOf('/');
    if (slash < 0) return '/';
    var last = path.slice(slash + 1);
    if (last.indexOf('.') !== -1) return path.slice(0, slash + 1);
    return path.charAt(path.length - 1) === '/' ? path : path + '/';
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = (a.getAttribute('href') || '').trim();
    if (href.charAt(0) === '#' || /^javascript:/i.test(href)) return;
    // Absolute URLs are never internal pages (the navigation guard opens
    // them in a real new tab); only relative .html links route to pages.
    if (/^(?:[a-z]+:)?\\/\\//i.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href)) return;
    var page = resolvePageName(href);
    if (!page) return;
    e.preventDefault();
    try {
      if (window.self !== window.top && window.parent && window.parent.postMessage) {
        window.parent.postMessage({ type: 'corez-nav', page: page }, '*');
        return;
      }
      fetch(pageBase() + page).then(function (res) {
        if (!res.ok) throw new Error('Page not found: ' + page);
        return res.text();
      }).then(function (htmlText) {
        document.open();
        document.write(htmlText);
        document.close();
      }).catch(function () {});
    } catch (err) {}
  }, true);
})();`;

export function injectMultiPageRouter(html, pageNames) {
  if (!html || typeof html !== "string" || !pageNames || pageNames.length === 0)
    return html;
  const script = `<script>${MULTI_PAGE_ROUTER_SCRIPT}</script>`;
  if (/<\/head>/i.test(html))
    return html.replace(/<\/head>/i, `${script}\n</head>`);
  if (/<\/body>/i.test(html))
    return html.replace(/<\/body>/i, `${script}\n</body>`);
  return `${html}\n${script}`;
}

/**
 * Fullscreen game patch injected into every canvas-based preview/published
 * document. Many generated games are authored as a fixed-resolution canvas
 * (e.g. 960x540) wrapped in a bordered, max-width "block" that leaves the
 * background cut off. This patch strips the bordered wrapper and stretches the
 * main canvas to the viewport with plain CSS box sizing — no transform, so the
 * game is never magnified past the screen (game logic keeps running in its own
 * internal coordinates) and games fill the whole screen on desktop and mobile.
 */
export const FULLSCREEN_GAME_PATCH = `
(function () {
  function applyToCanvas() {
    try {
      var canvases = document.querySelectorAll('canvas');
      if (!canvases || canvases.length === 0) return false;
      var best = null, bestArea = 0;
      for (var i = 0; i < canvases.length; i++) {
        var c = canvases[i];
        var w = parseInt(c.getAttribute('width'), 10) || 0;
        var h = parseInt(c.getAttribute('height'), 10) || 0;
        var area = w * h;
        if (area > bestArea) { bestArea = area; best = { el: c, w: w, h: h }; }
      }
      if (!best || bestArea <= 0) return false;
      var w = best.w, h = best.h, canvas = best.el;
      var hay = ((canvas.id || '') + ' ' + (canvas.className || '') + ' ' + (document.title || '') + ' ' + ((document.body && document.body.className) || '')).toLowerCase();
      var gameHint = /(game|arcade|player|score|enemy|pixel|retro)/.test(hay);
      var resHint = w >= 480 && h >= 360 && w <= 1920 && h <= 1080;
      if (!gameHint && !resHint) return false;
      var html = document.documentElement, body = document.body;
      if (html) { html.style.margin = '0'; html.style.padding = '0'; html.style.width = '100%'; html.style.height = '100%'; html.style.overflow = 'hidden'; }
      if (body) { body.style.margin = '0'; body.style.padding = '0'; body.style.width = '100%'; body.style.height = '100%'; body.style.overflow = 'hidden'; }
      var style = document.createElement('style');
      style.textContent = '#game-container, .game-container, #gameCanvasContainer, .canvas-container { position: fixed !important; inset: 0 !important; width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important; margin: 0 !important; padding: 0 !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; background: #0c0d14 !important; }';
      (document.head || document.documentElement).appendChild(style);
      // Fill the viewport with plain CSS box sizing and no transform at all.
      // The previous scale-to-cover multiplied the viewport by devicePixelRatio
      // (min(dpr, 2)) while the canvas was already laid out in CSS pixels, so on
      // any HiDPI display the canvas was scaled roughly twice as far as needed
      // and magnified past the viewport - only the middle of the game stayed
      // visible. Layout size is now the viewport and nothing is transformed.
      canvas.style.position = 'fixed';
      canvas.style.left = '0';
      canvas.style.top = '0';
      canvas.style.maxWidth = 'none';
      canvas.style.maxHeight = 'none';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      return true;
    } catch (e) { return false; }
  }
  var attempts = 0;
  (function poll() {
    if (applyToCanvas()) return;
    attempts++;
    if (attempts < 20) setTimeout(poll, 500);
  })();
})();`;

export function injectFullscreenGamePatch(html) {
  if (!html || typeof html !== "string" || !html.includes("<canvas"))
    return html;
  const script = `<script>${FULLSCREEN_GAME_PATCH}</script>`;
  if (/<\/body>/i.test(html))
    return html.replace(/<\/body>/i, `${script}\n</body>`);
  return `${html}\n${script}`;
}

/**
 * Navigation guard injected into every preview/published document (full HTML
 * documents included). Inside the sandboxed preview iframe, a same-frame
 * navigation would leave the srcdoc and blank the preview to white, so every
 * link click is intercepted: external links (http(s), mailto, tel) open in a
 * real new tab, and every other relative navigation is prevented. Hash and
 * javascript: links keep their default behaviour. The multi-page router is
 * injected separately and registered first (head), so internal .html links
 * are routed to pages before this guard sees them.
 */
export const NAVIGATION_GUARD_SCRIPT = `
  (function () {
    document.addEventListener('submit', function(e) { e.preventDefault(); }, true);
    // data: URL prefix expected for a dead download link, by file extension.
    // A null prefix accepts the only embedded data: URL of any kind.
    function dataPrefixFor(href, wantsDownloadAttr) {
      var m = /\\.([a-z0-9]+)([?#]|$)/i.exec(href || '');
      var ext = m ? m[1].toLowerCase() : '';
      var map = {
        pdf: 'data:application/pdf',
        png: 'data:image/png', jpg: 'data:image/jpeg', jpeg: 'data:image/jpeg',
        gif: 'data:image/gif', webp: 'data:image/webp', svg: 'data:image/svg+xml',
        mp3: 'data:audio/', mp4: 'data:video/', webm: 'data:video/',
        txt: 'data:text/plain', md: 'data:text/', csv: 'data:text/',
        json: 'data:application/json'
      };
      if (ext && map[ext]) return map[ext];
      return wantsDownloadAttr ? null : false;
    }
    // The bytes of a file the page embedded (an <embed> next to a separate
    // download link is the common model pattern). Only rescues when exactly
    // one matching data: URL exists, so a wrong file can never download.
    function findEmbeddedFileUrl(prefix) {
      try {
        if (prefix === false || typeof document.querySelectorAll !== 'function') return null;
        var found = [];
        var els = document.querySelectorAll('embed[src], object[data], iframe[src], source[src], img[src], a[href]');
        for (var i = 0; i < els.length; i += 1) {
          var el = els[i];
          if (!el.getAttribute) continue;
          var v = String(el.getAttribute('src') || el.getAttribute('data') || el.getAttribute('href') || '').trim();
          if (/^data:/i.test(v) && (!prefix || v.toLowerCase().indexOf(prefix) === 0)) found.push(v);
        }
        return found.length === 1 ? found[0] : null;
      } catch (err) { return null; }
    }
    document.addEventListener('click', function(e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var href = (a.getAttribute('href') || '').trim();
      if (href === '' || href.charAt(0) === '#') return;
      if (/^javascript:/i.test(href)) return;
      // blob:/data: are same-origin local resources: the download button of a
      // generated document creates one and clicks an anchor on it. Blocking
      // those clicks (or letting CSP block the navigation) made "Download
      // .pdf" do nothing in the preview; they never leave the sandbox, so the
      // default action is allowed through.
      if (/^(blob:|data:)/i.test(href)) return;
      e.preventDefault();
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        window.open(href, '_blank', 'noopener');
        return;
      }
      // A relative link to a FILE (not a page) would otherwise die silently:
      // the asset does not exist in the preview, so the click does nothing
      // and the user concludes downloads are broken. Rescue it when the page
      // embedded the bytes as a data: URL; otherwise tell the parent, which
      // explains the missing file instead of staying silent.
      var wantsDownloadAttr = false;
      try { wantsDownloadAttr = typeof a.hasAttribute === 'function' && a.hasAttribute('download'); } catch (err) {}
      var isFileLike = wantsDownloadAttr || /\\.(pdf|csv|txt|md|json|doc|docx|xls|xlsx|ppt|pptx|zip|png|jpe?g|gif|webp|svg|mp3|mp4|webm)([?#]|$)/i.test(href);
      if (!isFileLike) return;
      var embedded = findEmbeddedFileUrl(dataPrefixFor(href, wantsDownloadAttr));
      if (embedded) {
        try {
          // Re-firing hits the data: branch above, which lets it through; the
          // flag keeps a pathological DOM from looping.
          if (!a.__corezRescued) {
            a.__corezRescued = true;
            a.setAttribute('href', embedded);
            a.click();
          }
        } catch (err) {}
        return;
      }
      try {
        if (window.parent && window.parent !== window && window.parent.postMessage) {
          var name = href.split('?')[0].split('#')[0].split('/').pop() || href;
          window.parent.postMessage({ type: 'corez-download-missing', href: href, name: name }, '*');
        }
      } catch (err) {}
    }, true);
  })();`;

export function injectNavigationGuard(html) {
  if (!html || typeof html !== "string") return html;
  const script = `<script>${NAVIGATION_GUARD_SCRIPT}</script>`;
  if (/<\/body>/i.test(html))
    return html.replace(/<\/body>/i, `${script}\n</body>`);
  return `${html}\n${script}`;
}

// Previews run in a sandboxed srcdoc iframe the parent cannot inspect (no
// same-origin access), so a runtime error or a blocked CDN script leaves the
// user staring at a blank white frame with no explanation. This reporter runs
// first in every preview document and forwards failures to the parent canvas
// panel: uncaught errors, unhandled rejections, failed resource loads
// (including CSP-blocked CDN scripts), and securitypolicyviolation events.
// Messages are deduplicated, capped, and carry no user data beyond the error
// text and URL the browser already exposes.
export const PREVIEW_ERROR_REPORTER_SCRIPT = `
  (function () {
    if (window.__corezErrorReporter) return;
    window.__corezErrorReporter = true;
    var seen = {};
    function report(kind, message, source, line) {
      try {
        var text = String(message || 'Unknown preview error').slice(0, 500);
        var src = source ? String(source).slice(0, 200) : '';
        var key = kind + '|' + text + '|' + src + '|' + (line || 0);
        if (seen[key]) return;
        seen[key] = true;
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'corez-preview-error',
            kind: kind,
            message: text,
            source: src,
            line: Number(line) || 0
          }, '*');
        }
      } catch (e) {}
    }
    window.addEventListener('error', function (event) {
      if (event && event.message) {
        report('error', event.message, event.filename, event.lineno);
        return;
      }
      var target = event && event.target;
      var url = target && (target.src || target.href);
      if (url) report('resource', 'Failed to load ' + url, url, 0);
    }, true);
    window.addEventListener('unhandledrejection', function (event) {
      var reason = event && event.reason;
      report(
        'unhandledrejection',
        reason && reason.message ? reason.message : reason,
        '',
        0
      );
    });
    document.addEventListener('securitypolicyviolation', function (event) {
      var directive = event && event.violatedDirective ? event.violatedDirective : 'csp';
      var blocked = event && event.blockedURI ? event.blockedURI : '';
      report('csp', 'Blocked by ' + directive + (blocked ? ': ' + blocked : ''), blocked, 0);
    });
  })();`;

// Preview documents run inside sandboxed srcdoc iframes. srcdoc documents
// inherit the parent app's CSP, so every preview carries its own explicit
// policy: AI-generated inline scripts/styles and CDN libraries keep working
// while the preview document stays originless. Mirrors the worker's
// published-page policy (publishedPageHeaders in worker/index.js) so
// in-app previews and published links behave identically.
// `default-src blob:` lets a generated document download a file it built
// locally: the research report's "Download .pdf" button creates a Blob URL and
// clicks an anchor on it, and `default-src 'none'` blocked that navigation —
// the button silently did nothing in the preview. Blob URLs are same-origin
// and never leave the sandbox, so they add no network surface.
//
// The source list must NOT contain `'none'`: per CSP, `'none'` is only valid
// as the SOLE source expression, and a directive that breaks that rule is
// discarded by the browser — `default-src 'none' blob:` therefore failed open
// (the whole directive was ignored) while still looking correct in the file.
// `default-src blob:` keeps the directive valid and blocks every network
// fetch. `navigate-to` is not required for downloads and is omitted
// deliberately (a report's links must still be blocked from navigating the
// frame away).
const PREVIEW_CSP =
  "default-src blob:; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src data: https: blob:; font-src data: https:; media-src data: https: blob:; connect-src https:";

/**
 * A revision can leave an early call to a function that reads a top-level
 * `const reduceMotion` declared later in the same script. That is a temporal
 * dead-zone ReferenceError before the page paints ("can't access lexical
 * declaration 'reduceMotion' before initialization"). Hoist the declaration to
 * the top of its script; the initializer has no dependency on earlier code.
 */
function hoistReducedMotionDeclaration(html) {
  if (!html || typeof html !== "string") return html;
  return html.replace(
    /<script([^>]*)>([\s\S]*?)<\/script>/gi,
    (full, attrs, body) => {
      const declaration = body.match(
        /^(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*window\.matchMedia\([^;\n]*\)\.matches;?[ \t]*$/m,
      );
      if (!declaration || declaration.index === 0) return full;
      const stripped = body
        .replace(declaration[0], "")
        .replace(/^\n+/, "");
      return `<script${attrs}>\n${declaration[0]}\n${stripped}</script>`;
    },
  );
}

function withPreviewCsp(html) {
  if (!html || typeof html !== "string") return html;
  const head = `  <meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">\n  <script>${PREVIEW_ERROR_REPORTER_SCRIPT}</script>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n${head}`);
  }
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n${head}\n</head>\n<body>\n${html}\n</body>\n</html>`;
}

export function formatCodeForPreview(rawCode) {
  if (!rawCode || typeof rawCode !== "string") return "";
  // Deterministic repair of model-output corruption (missing or mangled
  // <script>/<style> opening tags) that would otherwise make the browser
  // render the block as visible page text. Safe on well-formed documents
  // (no-op) and on React/JSX code (guarded internally).
  const trimmed = repairMalformedHtml(rawCode.trim());
  const stripped = trimmed.replace(/^(?:\s*<!--[\s\S]*?-->\s*)+/i, "").trim();

  // 1. If it's already a full HTML document, return as-is. The page is
  //    normalised to its own document first: commentary the model left after
  //    the closing </html> renders as page text, and the preview iframe is the
  //    last place before a user sees it.
  if (/^<!DOCTYPE html/i.test(stripped) || /^<html/i.test(stripped)) {
    const page = normalizePageDocument(trimmed) || trimmed;
    return withPreviewCsp(
      hoistReducedMotionDeclaration(
        injectNavigationGuard(injectFullscreenGamePatch(page)),
      ),
    );
  }

  // 2. If it's pure HTML/CSS/JS without React/JSX syntax, wrap into a clean preview HTML document
  const isReactJsx =
    /export\s+default|export\s+(?:const|let|var|function|class)|import\s+React|React\.|className\s*=|useState\s*\(|useEffect\s*\(|useRef\s*\(|useMemo\s*\(|useCallback\s*\(|useReducer\s*\(|useContext\s*\(|createContext\s*\(|onClick\s*=\s*\{|onChange\s*=\s*\{|return\s*\(\s*<|return\s*<|function\s+[A-Z]|const\s+[A-Z][A-Za-z0-9_]*\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/i.test(
      trimmed,
    );

  if (
    !isReactJsx &&
    (/<[a-z0-9-]+[\s>]/i.test(trimmed) ||
      /<style[\s>]/i.test(trimmed) ||
      /<script[\s>]/i.test(trimmed) ||
      /document\.get|document\.query|window\.add/i.test(trimmed))
  ) {
    return withPreviewCsp(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Corez Live Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; padding: 0; background: #09090b; color: #f4f4f5; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; min-height: 100vh; }
  </style>
  <script>
    window.onerror = function(msg, url, lineNo, columnNo, error) {
      var root = document.body;
      if (root && !root.hasChildNodes()) {
        var box = document.createElement('div');
        box.setAttribute('style', 'padding: 2rem; background: #18181b; color: #f87171; font-family: monospace; border-radius: 12px; margin: 2rem; border: 1px solid #ef444433;');
        var heading = document.createElement('h3');
        heading.setAttribute('style', 'margin-top:0; color:#ef4444; font-size:1.1rem;');
        heading.textContent = 'Preview Execution Error';
        var detail = document.createElement('p');
        detail.setAttribute('style', 'color:#e4e4e7; font-size:0.9rem; white-space:pre-wrap;');
        detail.textContent = String(msg || error);
        box.appendChild(heading);
        box.appendChild(detail);
        root.appendChild(box);
      }
      return false;
    };
    window.addEventListener('mousedown', function() { window.focus(); });
  </script>
</head>
<body>
  ${hoistReducedMotionDeclaration(trimmed)}
  <script>${FULLSCREEN_GAME_PATCH}</script>
  <script>${NAVIGATION_GUARD_SCRIPT}</script>
</body>
</html>`);
  }

  return buildReactPreviewHtml(rawCode, {
    withPreviewCsp,
    FULLSCREEN_GAME_PATCH,
    NAVIGATION_GUARD_SCRIPT,
  });
}
