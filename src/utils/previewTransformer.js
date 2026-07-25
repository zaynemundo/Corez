/**
 * Transforms raw HTML or React JSX code into a self-contained HTML document
 * ready to be rendered safely inside an iframe.
 */
export function formatCodeForPreview(rawCode) {
  if (!rawCode || typeof rawCode !== 'string') return '';
  const trimmed = rawCode.trim();

  // 1. If it's already a full HTML document, return as-is
  if (/^\s*<!DOCTYPE html/i.test(trimmed) || /^\s*<html/i.test(trimmed)) {
    return trimmed;
  }

  // 2. Prepare JSX / React code for browser standalone Babel compilation
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
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react,typescript">
    const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext } = React;

    // Global THREE Fallback Stub
    var ThreeStub = window.THREE || {
      Vector3: function(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; },
      Color: function(c){ this.c=c; },
      Scene: function(){ this.add=function(){}; },
      PerspectiveCamera: function(){},
      WebGLRenderer: function(){ this.setSize=function(){}; this.render=function(){}; this.domElement=document.createElement('canvas'); },
      Mesh: function(){},
      BoxGeometry: function(){},
      MeshStandardMaterial: function(){}
    };
    window.__THREE_STUB__ = ThreeStub;
    var THREE = window.THREE || ThreeStub;

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
        return () => cancelAnimationFrame(id);
      }, [cb]);
    };
    var OrbitControls = () => null;
    var useThree = () => ({ camera: { position: [0, 0, 5] }, scene: {}, gl: {}, size: { width: 800, height: 600 } });
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
        : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/25";
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
            const candidate = eval(compName);
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
