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

  // 3. Comment out / convert ESM import statements
  processed = processed.replace(/^import\s+.*?from\s+['"].*?['"];?/gm, (match) => {
    if (match.includes('lucide-react')) {
      const iconMatches = match.match(/\{([^}]+)\}/);
      if (iconMatches && iconMatches[1]) {
        const icons = iconMatches[1].split(',').map(i => i.trim()).filter(Boolean);
        return icons.map(icon => `const ${icon} = LucideStub;`).join('\n');
      }
    }
    return `// ${match}`;
  });

  // 4. Handle default export patterns cleanly
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
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; padding: 0; background: #09090b; color: #f4f4f5; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; min-height: 100vh; }
    #root { min-height: 100vh; display: flex; flex-direction: column; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext } = React;

    // Fallback Icon Component for lucide-react imports
    const LucideStub = ({ size = 20, className = '', ...props }) => (
      <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10" />
      </svg>
    );

    ${processed}

    try {
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
      document.getElementById('root').innerHTML = '<div style="padding: 2rem; color: #ef4444; font-family: sans-serif;"><h3>Runtime Error</h3><pre>' + err.message + '</pre></div>';
    }
  </script>
</body>
</html>`;
}
