/**
 * Transforms raw HTML or React JSX code into a self-contained HTML document
 * ready to be rendered safely inside an iframe.
 */

import { repairMalformedHtml } from './htmlRepair.js';

// Multi-page site support: the model may emit multiple full HTML documents
// inside ONE code block, separated by page markers:
//
//   <!-- CORESITE-PAGES: index.html, about.html, contact.html -->
//   <!-- PAGE: index.html -->
//   <!DOCTYPE html>...
//   <!-- PAGE: about.html -->
//   <!DOCTYPE html>...
//
// The splitter below turns that into a { pages } list; any malformed or
// marker-less output falls back to a single page (today's behaviour).
export const MULTI_PAGE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}\.html$/i;
export const MAX_MULTI_PAGE_COUNT = 12;
export const MAX_MULTI_PAGE_TOTAL_BYTES = 2 * 1024 * 1024;

const MULTI_PAGE_MARKER_PATTERN = /^\s*<!--\s*PAGE:\s*([^\s>]+)\s*-->\s*$/gm;
const MULTI_PAGE_HEADER_PATTERN = /^\s*<!--\s*CORESITE-PAGES:[\s\S]*?-->\s*$/gm;

/**
 * Splits a model output into pages when it uses the multi-page marker
 * convention. Returns { isMultiPage, pages: [{ name, html }] }. Falls back to
 * a single "index.html" page for anything malformed so the preview contract
 * never breaks.
 */
export function parseMultiPageSite(rawCode) {
  if (!rawCode || typeof rawCode !== 'string') {
    return { isMultiPage: false, pages: [{ name: 'index.html', html: rawCode || '' }] };
  }

  const trimmed = rawCode.trim();
  const hasMarker = MULTI_PAGE_MARKER_PATTERN.test(trimmed);
  MULTI_PAGE_MARKER_PATTERN.lastIndex = 0;
  if (!hasMarker) {
    return { isMultiPage: false, pages: [{ name: 'index.html', html: trimmed }] };
  }

  const segments = trimmed.split(MULTI_PAGE_MARKER_PATTERN);
  // segments = [preamble, name1, html1, name2, html2, ...]
  const pages = [];
  let totalBytes = 0;

  for (let i = 1; i + 1 < segments.length; i += 2) {
    const name = segments[i].trim();
    if (!MULTI_PAGE_NAME_PATTERN.test(name)) continue;

    let html = segments[i + 1].replace(MULTI_PAGE_HEADER_PATTERN, '').trim();
    if (!html) continue;
    if (pages.length >= MAX_MULTI_PAGE_COUNT) break;

    totalBytes += html.length;
    if (totalBytes > MAX_MULTI_PAGE_TOTAL_BYTES) break;

    pages.push({ name, html });
  }

  if (pages.length === 0) {
    return { isMultiPage: false, pages: [{ name: 'index.html', html: trimmed }] };
  }

  // Index page (if present) must come first so the preview opens on the home
  // page even when the model lists pages out of order.
  pages.sort((a, b) => {
    if (a.name === 'index.html') return -1;
    if (b.name === 'index.html') return 1;
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
    return { valid: false, issues: [{ severity: 'error', page: null, message: 'No pages were produced.' }] };
  }

  const names = new Set(pages.map((p) => p.name));
  if (!names.has('index.html')) {
    issues.push({ severity: 'error', page: null, message: 'Missing index.html home page.' });
  }

  for (const page of pages) {
    const html = typeof page?.html === 'string' ? page.html : '';
    if (!html.trim()) {
      issues.push({ severity: 'error', page: page.name, message: `${page.name} is empty.` });
      continue;
    }
    if (!/<\/html>/i.test(html)) {
      issues.push({ severity: 'warn', page: page.name, message: `${page.name} is not a complete HTML document (missing closing </html>).` });
    }

    for (const match of html.matchAll(INTERNAL_LINK_PATTERN)) {
      const href = match[1].trim();
      if (!href || href.charAt(0) === '#' || ABSOLUTE_URL_PATTERN.test(href) || PROTOCOL_RELATIVE_PATTERN.test(href)) {
        continue;
      }
      const target = href.split(/[#?]/)[0].split('/').pop();
      if (!PAGE_TARGET_PATTERN.test(target)) continue;
      if (!names.has(target)) {
        issues.push({ severity: 'error', page: page.name, message: `${page.name} links to missing page ${target}.` });
      }
    }
  }

  return { valid: issues.every((issue) => issue.severity !== 'error'), issues };
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
  if (!html || typeof html !== 'string' || !pageNames || pageNames.length === 0) return html;
  const script = `<script>${MULTI_PAGE_ROUTER_SCRIPT}</script>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${script}\n</head>`);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}\n</body>`);
  return `${html}\n${script}`;
}

/**
 * Fullscreen game patch injected into every canvas-based preview/published
 * document. Many generated games are authored as a fixed-resolution canvas
 * (e.g. 960x540) wrapped in a bordered, max-width "block" that leaves the
 * background cut off. This patch forces the main canvas to cover the entire
 * viewport with a scale-to-cover transform (game logic keeps running in its
 * own internal coordinates) and strips the bordered wrapper, so games fill
 * the whole screen on desktop and mobile.
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
      canvas.style.position = 'fixed';
      canvas.style.left = '50%';
      canvas.style.top = '50%';
      canvas.style.maxWidth = 'none';
      canvas.style.maxHeight = 'none';
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var apply = function () {
        var s = Math.max((window.innerWidth * dpr) / w, (window.innerHeight * dpr) / h);
        canvas.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
        canvas.style.transformOrigin = 'center center';
      };
      apply();
      window.addEventListener('resize', apply);
      window.addEventListener('orientationchange', apply);
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
  if (!html || typeof html !== 'string' || !html.includes('<canvas')) return html;
  const script = `<script>${FULLSCREEN_GAME_PATCH}</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}\n</body>`);
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
    document.addEventListener('click', function(e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var href = (a.getAttribute('href') || '').trim();
      if (href === '' || href.charAt(0) === '#') return;
      if (/^javascript:/i.test(href)) return;
      e.preventDefault();
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        window.open(href, '_blank', 'noopener');
      }
    }, true);
  })();`;

export function injectNavigationGuard(html) {
  if (!html || typeof html !== 'string') return html;
  const script = `<script>${NAVIGATION_GUARD_SCRIPT}</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}\n</body>`);
  return `${html}\n${script}`;
}

// Preview documents run inside sandboxed srcdoc iframes. srcdoc documents
// inherit the parent app's CSP, so every preview carries its own explicit
// policy: AI-generated inline scripts/styles and CDN libraries keep working
// while the preview document stays originless. Mirrors the worker's
// published-page policy (publishedPageHeaders in worker/index.js) so
// in-app previews and published links behave identically.
const PREVIEW_CSP = "default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src data: https: blob:; font-src data: https:; media-src data: https: blob:; connect-src https:";

function withPreviewCsp(html) {
  if (!html || typeof html !== 'string') return html;
  const meta = `  <meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n${meta}`);
  }
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n${meta}\n</head>\n<body>\n${html}\n</body>\n</html>`;
}

export function formatCodeForPreview(rawCode) {
  if (!rawCode || typeof rawCode !== 'string') return '';
  // Deterministic repair of model-output corruption (missing or mangled
  // <script>/<style> opening tags) that would otherwise make the browser
  // render the block as visible page text. Safe on well-formed documents
  // (no-op) and on React/JSX code (guarded internally).
  const trimmed = repairMalformedHtml(rawCode.trim());
  const stripped = trimmed.replace(/^(?:\s*<!--[\s\S]*?-->\s*)+/i, '').trim();

  // 1. If it's already a full HTML document, return as-is
  if (/^<!DOCTYPE html/i.test(stripped) || /^<html/i.test(stripped)) {
    return withPreviewCsp(injectNavigationGuard(injectFullscreenGamePatch(trimmed)));
  }

  // 2. If it's pure HTML/CSS/JS without React/JSX syntax, wrap into a clean preview HTML document
  const isReactJsx = /export\s+default|export\s+(?:const|let|var|function|class)|import\s+React|React\.|className\s*=|useState\s*\(|useEffect\s*\(|useRef\s*\(|useMemo\s*\(|useCallback\s*\(|useReducer\s*\(|useContext\s*\(|createContext\s*\(|onClick\s*=\s*\{|onChange\s*=\s*\{|return\s*\(\s*<|return\s*<|function\s+[A-Z]|const\s+[A-Z][A-Za-z0-9_]*\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/i.test(trimmed);

  if (!isReactJsx && (/<[a-z0-9-]+[\s>]/i.test(trimmed) || /<style[\s>]/i.test(trimmed) || /<script[\s>]/i.test(trimmed) || /document\.get|document\.query|window\.add/i.test(trimmed))) {
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
      if (root && (!root.innerHTML || root.innerHTML.trim() === '')) {
        root.innerHTML = '<div style="padding: 2rem; background: #18181b; color: #f87171; font-family: monospace; border-radius: 12px; margin: 2rem; border: 1px solid #ef444433;">' +
          '<h3 style="margin-top:0; color:#ef4444; font-size:1.1rem;">Preview Execution Error</h3>' +
          '<p style="color:#e4e4e7; font-size:0.9rem; white-space:pre-wrap;">' + String(msg || error) + '</p>' +
          '</div>';
      }
      return false;
    };
    window.addEventListener('mousedown', function() { window.focus(); });
  </script>
</head>
<body>
  ${trimmed}
  <script>${FULLSCREEN_GAME_PATCH}</script>
  <script>${NAVIGATION_GUARD_SCRIPT}</script>
</body>
</html>`);
  }

  // 3. Prepare JSX / React code for browser standalone Babel compilation
  let processed = rawCode;

  // Clean file comment headers like `// App.tsx` or `// components/layout/Navbar.tsx`
  processed = processed.replace(/^\/\/\s*[\w./-]+\.(?:tsx|jsx|ts|js)\s*$/gm, '');

  // 3. Convert or remove ESM import statements
  processed = processed.replace(/import\s+[\s\S]*?(?:from\s+['"].*?['"]|['"].*?['"])\s*;?/g, (match) => {
    if (match.includes('lucide-react')) {
      const iconMatches = match.match(/\{([\s\S]*?)\}/);
      if (iconMatches && iconMatches[1]) {
        const icons = iconMatches[1].split(',').map(i => i.trim()).filter(Boolean);
        return icons.map(icon => `const ${icon} = LucideStub;`).join('\n');
      }
    }
    if (match.includes('three')) {
      if (/import\s+(\*\s+as\s+THREE|THREE)\s+from/i.test(match) || /import\s+THREE\b/i.test(match)) {
        return `var THREE = window.THREE || window.__THREE_STUB__;`;
      }
      const componentMatches = match.match(/\{([\s\S]*?)\}/);
      if (componentMatches && componentMatches[1]) {
        const comps = componentMatches[1].split(',').map(c => c.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        return comps.map(comp => `var ${comp} = (window.THREE && window.THREE['${comp}']) || window.__3D_STUBS__?.['${comp}'] || CanvasStub;`).join('\n');
      }
      return `var THREE = window.THREE || window.__THREE_STUB__;`;
    }
    if (match.includes('@react-three/fiber') || match.includes('@react-three/drei')) {
      const componentMatches = match.match(/\{([\s\S]*?)\}/);
      if (componentMatches && componentMatches[1]) {
        const comps = componentMatches[1].split(',').map(c => c.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        return comps.map(comp => `var ${comp} = window.__3D_STUBS__?.['${comp}'] || CanvasStub;`).join('\n');
      }
    }
    return '';
  });

  // Clean TypeScript interfaces and type declarations
  processed = processed.replace(/export\s+interface\s+[A-Za-z0-9_]+\s*\{[\s\S]*?\}/g, '');
  processed = processed.replace(/interface\s+[A-Za-z0-9_]+\s*\{[\s\S]*?\}/g, '');
  processed = processed.replace(/export\s+type\s+[A-Za-z0-9_]+\s*=[\s\S]*?;/g, '');
  processed = processed.replace(/type\s+[A-Za-z0-9_]+\s*=[\s\S]*?;/g, '');

  // Strip generic type arguments on hooks (e.g. useRef<HTMLDivElement>(null) -> useRef(null))
  processed = processed.replace(/(useRef|useState|useMemo|useCallback|useContext|useReducer|createRef|forwardRef)\s*<[\s\S]*?>/g, '$1');

  // Strip TypeScript type assertions (e.g. `as const`, `as any`, `as HTMLDivElement`, `as const satisfies ...`)
  processed = processed.replace(/\s+as\s+(?:const|any|unknown|boolean|number|string|React\.[A-Za-z0-9_]+|[A-Za-z0-9_]+)/g, '');

  // 4. Clean up export statements
  // Strip named exports like `export const X = ...` -> `const X = ...`
  processed = processed.replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ');

  // export default function FunctionName
  processed = processed.replace(/export\s+default\s+function\s+([A-Za-z0-9_]+)/g, (_, name) => {
    return `function ${name}`;
  });

  // export default class ClassName
  processed = processed.replace(/export\s+default\s+class\s+([A-Za-z0-9_]+)/g, (_, name) => {
    return `class ${name}`;
  });

  // export default const/let/var Name = ...
  processed = processed.replace(/export\s+default\s+(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=/g, (_, name) => {
    return `const ${name} = `;
  });

  // export default Identifier;
  processed = processed.replace(/export\s+default\s+([A-Za-z0-9_]+)\s*;?/g, (_, name) => {
    return `window.__COREZ_APP__ = ${name};`;
  });

  // Anonymous default export: export default () => ... or export default function() ...
  if (/export\s+default\s+function\s*\(/.test(processed)) {
    processed = processed.replace(/export\s+default\s+function\s*\(/, 'function App(');
  } else if (/export\s+default\s*/.test(processed)) {
    processed = processed.replace(/export\s+default\s*/, 'const App = ');
  }

  // 5. If code starts directly with a JSX tag (e.g. <div ...>), wrap it in function App
  if (/^\s*<[A-Za-z0-9_.]+/i.test(processed.trim())) {
    processed = `function App() {\n  return (\n${processed}\n  );\n}`;
  }

  // Extract all capital letter function/const component names defined in code for fallback detection
  const componentMatches = Array.from(
    new Set(
      [...processed.matchAll(/(?:function|class|const|let|var)\s+([A-Z][A-Za-z0-9_]*)/g)].map(m => m[1])
    )
  );

  return withPreviewCsp(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Corez Live App Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; padding: 0; background: #09090b; color: #f4f4f5; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; min-height: 100vh; }
    #root { min-height: 100vh; display: flex; flex-direction: column; }
  </style>
  <script>
    window.onerror = function(msg, url, lineNo, columnNo, error) {
      var root = document.getElementById('root');
      if (root && (!root.innerHTML || root.innerHTML.trim() === '')) {
        root.innerHTML = '<div style="padding: 2rem; background: #18181b; color: #f87171; font-family: monospace; border-radius: 12px; margin: 2rem; border: 1px solid #ef444433;">' +
          '<h3 style="margin-top:0; color:#ef4444; font-size:1.1rem;">Preview Compilation Error</h3>' +
          '<p style="color:#e4e4e7; font-size:0.9rem; white-space:pre-wrap;">' + String(msg || error) + '</p>' +
          '</div>';
      }
      return false;
    };
    window.addEventListener('mousedown', function() { window.focus(); });
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react,typescript">
    const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext } = React;

    // Mock DOM Element with addEventListener & event handlers for 3D renderers & OrbitControls
    var mockDomElement = (typeof document !== 'undefined' && document.createElement)
      ? document.createElement('canvas')
      : {
          addEventListener: function(){},
          removeEventListener: function(){},
          getBoundingClientRect: function(){ return { left:0, top:0, width:800, height:600 }; },
          style: {},
          clientWidth: 800,
          clientHeight: 600
        };

    var mockGl = {
      domElement: mockDomElement,
      setSize: function(){},
      render: function(){},
      setPixelRatio: function(){},
      shadowMap: {}
    };

    // Global THREE Fallback Stub & Top-Level Class Declarations
    var ThreeStub = window.THREE || {
      Vector3: function(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; },
      Vector2: function(x=0,y=0){ this.x=x; this.y=y; },
      Color: function(c){ this.c=c; },
      Scene: function(){ this.add=function(){}; this.remove=function(){}; },
      PerspectiveCamera: function(){ this.position={set:function(){},x:0,y:0,z:0}; this.lookAt=function(){}; },
      OrthographicCamera: function(){ this.position={set:function(){},x:0,y:0,z:0}; this.lookAt=function(){}; },
      WebGLRenderer: function(){ this.setSize=function(){}; this.render=function(){}; this.setPixelRatio=function(){}; this.domElement=mockDomElement; this.shadowMap={}; },
      Mesh: function(){ this.position={set:function(){},x:0,y:0,z:0}; this.rotation={set:function(){},x:0,y:0,z:0}; },
      Group: function(){ this.add=function(){}; this.position={set:function(){},x:0,y:0,z:0}; },
      BoxGeometry: function(){},
      PlaneGeometry: function(){},
      SphereGeometry: function(){},
      CylinderGeometry: function(){},
      MeshStandardMaterial: function(){},
      MeshBasicMaterial: function(){},
      AmbientLight: function(){},
      DirectionalLight: function(){ this.position={set:function(){},x:0,y:0,z:0}; },
      PointLight: function(){ this.position={set:function(){},x:0,y:0,z:0}; },
      SpotLight: function(){ this.position={set:function(){},x:0,y:0,z:0}; },
      Raycaster: function(){ this.setFromCamera=function(){}; this.intersectObjects=function(){ return []; }; },
      Clock: function(){ this.getDelta = function(){ return 0.016; }; this.getElapsedTime = function(){ return performance.now()/1000; }; },
      Fog: function(){},
      FogExp2: function(){}
    };
    window.__THREE_STUB__ = ThreeStub;
    var THREE = window.THREE || ThreeStub;

    function makeSafeClass(className, fallback) {
      var RealClass = (window.THREE && window.THREE[className]) || fallback;
      var SafeWrapper = function() {
        var args = Array.prototype.slice.call(arguments);
        try {
          return Reflect.construct(RealClass, args, new.target || SafeWrapper);
        } catch (e) {
          try {
            return new RealClass(...args);
          } catch (e2) {
            return {};
          }
        }
      };
      if (RealClass && RealClass.prototype) {
        SafeWrapper.prototype = RealClass.prototype;
      }
      return SafeWrapper;
    }

    var PerspectiveCamera = makeSafeClass('PerspectiveCamera', ThreeStub.PerspectiveCamera);
    var OrthographicCamera = makeSafeClass('OrthographicCamera', ThreeStub.OrthographicCamera);
    var Scene = makeSafeClass('Scene', ThreeStub.Scene);
    var WebGLRenderer = makeSafeClass('WebGLRenderer', ThreeStub.WebGLRenderer);
    var Vector3 = makeSafeClass('Vector3', ThreeStub.Vector3);
    var Vector2 = makeSafeClass('Vector2', ThreeStub.Vector2);
    var Color = makeSafeClass('Color', ThreeStub.Color);
    var Mesh = makeSafeClass('Mesh', ThreeStub.Mesh);
    var Group = makeSafeClass('Group', ThreeStub.Group);
    var BoxGeometry = makeSafeClass('BoxGeometry', ThreeStub.BoxGeometry);
    var PlaneGeometry = makeSafeClass('PlaneGeometry', ThreeStub.PlaneGeometry);
    var SphereGeometry = makeSafeClass('SphereGeometry', ThreeStub.SphereGeometry);
    var CylinderGeometry = makeSafeClass('CylinderGeometry', ThreeStub.CylinderGeometry);
    var MeshStandardMaterial = makeSafeClass('MeshStandardMaterial', ThreeStub.MeshStandardMaterial);
    var MeshBasicMaterial = makeSafeClass('MeshBasicMaterial', ThreeStub.MeshBasicMaterial);
    var AmbientLight = makeSafeClass('AmbientLight', ThreeStub.AmbientLight);
    var DirectionalLight = makeSafeClass('DirectionalLight', ThreeStub.DirectionalLight);
    var PointLight = makeSafeClass('PointLight', ThreeStub.PointLight);
    var SpotLight = makeSafeClass('SpotLight', ThreeStub.SpotLight);
    var Raycaster = makeSafeClass('Raycaster', ThreeStub.Raycaster);
    var Clock = makeSafeClass('Clock', ThreeStub.Clock);
    var Fog = makeSafeClass('Fog', ThreeStub.Fog);
    var FogExp2 = makeSafeClass('FogExp2', ThreeStub.FogExp2);

    // Fallback Canvas & 3D Graphics Component Stubs
    var CanvasStub = ({ children, className = '', style = {}, ...props }) => {
      const canvasRef = React.useRef(null);
      React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let animId;
        const render = () => {
          canvas.width = canvas.clientWidth || 600;
          canvas.height = canvas.clientHeight || 400;
          ctx.fillStyle = '#09090b';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          animId = requestAnimationFrame(render);
        };
        render();
        return () => cancelAnimationFrame(animId);
      }, []);

      return (
        <div className="relative w-full h-full min-h-[350px] overflow-hidden rounded-xl border border-white/10" style={{ background: '#09090b', ...style }} {...props}>
          <canvas ref={canvasRef} className="w-full h-full block" />
          <div className="absolute inset-0 pointer-events-none">{children}</div>
        </div>
      );
    };

    var Canvas = CanvasStub;
    var useFrame = (cb) => {
      React.useEffect(() => {
        let id;
        const loop = (t) => {
          if (cb) cb({ clock: { getElapsedTime: () => t / 1000 } }, 0.016);
          id = requestAnimationFrame(loop);
        };
        id = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(loop);
      }, [cb]);
    };
    var OrbitControls = makeSafeClass('OrbitControls', function() {
      this.update = function(){};
      this.dispose = function(){};
      this.enabled = true;
    });
    var useThree = () => ({
      camera: { position: [0, 0, 5], lookAt: function(){} },
      scene: { add: function(){}, remove: function(){} },
      gl: mockGl,
      size: { width: 800, height: 600 }
    });
    var Float = ({ children }) => <div className="animate-pulse">{children}</div>;
    var Html = ({ children, className = '' }) => <div className="absolute">{children}</div>;
    var Text = ({ children, fontSize = 16, color = '#fff' }) => <span style={{ fontSize, color }}>{children}</span>;

    window.__3D_STUBS__ = { Canvas: CanvasStub, useFrame, OrbitControls, useThree, Float, Html, Text };

    // Fallback Icon Component for lucide-react imports
    var LucideStub = ({ size = 20, className = '', children, ...props }) => (
      <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10" />
      </svg>
    );

    // Fallback stubs for common UI layout primitives & hooks if omitted
    const Container = ({ children, className = '', ...props }) => (
      <div className={\`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 \${className}\`} {...props}>{children}</div>
    );

    const Button = ({ children, variant = 'primary', size = 'md', className = '', icon, href, ...props }) => {
      const base = "inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200";
      const styles = variant === 'secondary'
        ? "bg-white/10 text-white hover:bg-white/20 border border-white/10"
        : "bg-indigo-600 text-white hover:bg-indigo-500";
      const sizes = size === 'xl' ? "px-6 py-3.5 text-base" : "px-4 py-2 text-sm";
      const content = (
        <>
          {icon && <span className="mr-2">{icon}</span>}
          {children}
        </>
      );
      if (href) return <a href={href} className={\`\${base} \${styles} \${sizes} \${className}\`} {...props}>{content}</a>;
      return <button className={\`\${base} \${styles} \${sizes} \${className}\`} {...props}>{content}</button>;
    };

    const useScrollPosition = () => {
      const [pos, setPos] = useState(0);
      useEffect(() => {
        const handle = () => setPos(window.scrollY);
        window.addEventListener('scroll', handle);
        return () => window.removeEventListener('scroll', handle);
      }, []);
      return pos;
    };

    const useReducedMotion = () => false;

    try {
      ${processed}

      let TargetComponent = null;

      // 1. Check window.__COREZ_APP__ explicitly registered by default export
      if (typeof window.__COREZ_APP__ !== 'undefined' && window.__COREZ_APP__) {
        TargetComponent = window.__COREZ_APP__;
      }
      // 2. Check standard names
      else if (typeof App !== 'undefined') TargetComponent = App;
      else if (typeof Main !== 'undefined') TargetComponent = Main;
      else if (typeof Dashboard !== 'undefined') TargetComponent = Dashboard;
      else if (typeof Widget !== 'undefined') TargetComponent = Widget;
      else if (typeof Game !== 'undefined') TargetComponent = Game;
      else if (typeof Component !== 'undefined') TargetComponent = Component;

      // 3. Fallback: Check declared capital letter components
      if (!TargetComponent) {
        const candidateNames = ${JSON.stringify(componentMatches)};
        for (let i = candidateNames.length - 1; i >= 0; i--) {
          const compName = candidateNames[i];
          try {
            const candidate = window[compName];
            if (typeof candidate === 'function' || (typeof candidate === 'object' && candidate !== null)) {
              TargetComponent = candidate;
              break;
            }
          } catch (e) {}
        }
      }

      if (TargetComponent) {
        ReactDOM.createRoot(document.getElementById('root')).render(<TargetComponent />);
      } else {
        document.getElementById('root').innerHTML = '<div style="padding: 2rem; color: #ef4444; font-family: sans-serif;"><h3>Preview Warning</h3><p>Could not auto-detect a React component. Please ensure your code exports or defines a React component.</p></div>';
      }
      } catch (err) {
      document.getElementById('root').innerHTML = '<div style="padding: 2rem; color: #ef4444; font-family: sans-serif; white-space: pre-wrap;"><h3>Runtime Error</h3><p>' + err.message + '</p></div>';
    }
  </script>
  <script>${FULLSCREEN_GAME_PATCH}</script>
  <script>${NAVIGATION_GUARD_SCRIPT}</script>
</body>
</html>`);
}
