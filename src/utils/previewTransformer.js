/**
 * Transforms raw HTML or React JSX code into a self-contained HTML document
 * ready to be rendered safely inside an iframe.
 */

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
      fetch(href.split('#')[0]).then(function (res) {
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

export function formatCodeForPreview(rawCode) {
  if (!rawCode || typeof rawCode !== 'string') return '';
  const trimmed = rawCode.trim();

  // 1. If it's already a full HTML document, return as-is
  if (/^\s*<!DOCTYPE html/i.test(trimmed) || /^\s*<html/i.test(trimmed)) {
    return trimmed;
  }

  // 2. If it's pure HTML/CSS/JS without React/JSX syntax, wrap into a clean preview HTML document
  const isReactJsx = /export\s+default|export\s+(?:const|let|var|function|class)|import\s+React|React\.|className\s*=|useState\s*\(|useEffect\s*\(|useRef\s*\(|useMemo\s*\(|useCallback\s*\(|useReducer\s*\(|useContext\s*\(|createContext\s*\(|onClick\s*=\s*\{|onChange\s*=\s*\{|return\s*\(\s*<|return\s*<|function\s+[A-Z]|const\s+[A-Z][A-Za-z0-9_]*\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/i.test(trimmed);

  if (!isReactJsx && (/<[a-z0-9-]+[\s>]/i.test(trimmed) || /<style[\s>]/i.test(trimmed) || /<script[\s>]/i.test(trimmed) || /document\.get|document\.query|window\.add/i.test(trimmed))) {
    return `<!DOCTYPE html>
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
    // Navigation guard: form submissions and anchor navigations inside the
    // sandboxed iframe would leave the srcdoc and blank the preview to
    // Links: same-frame navigation would blank the preview to white, so
    // external links (http(s), mailto, tel) open in a real new tab instead
    // of navigating the iframe. Hash and javascript: links keep default
    // behaviour.
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
  </script>
</head>
<body>
  ${trimmed}
</body>
</html>`;
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

  return `<!DOCTYPE html>
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
    // Navigation guard: form submissions and anchor navigations inside the
    // sandboxed iframe would leave the srcdoc and blank the preview to
    // Links: same-frame navigation would blank the preview to white, so
    // external links (http(s), mailto, tel) open in a real new tab instead
    // of navigating the iframe. Hash and javascript: links keep default
    // behaviour.
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
</body>
</html>`;
}
