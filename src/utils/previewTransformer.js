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

  // Comment out / convert ESM import statements
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

  // Handle export default syntax
  processed = processed.replace(/export\s+default\s+function\s+([A-Za-z0-9_]+)/g, 'function $1');
  processed = processed.replace(/export\s+default\s+class\s+([A-Za-z0-9_]+)/g, 'class $1');
  processed = processed.replace(/export\s+default\s+([A-Za-z0-9_]+);?/g, '// export default $1;');

  // If anonymous export default, assign to App
  if (/export\s+default\s+function\s*\(/.test(processed)) {
    processed = processed.replace(/export\s+default\s+function\s*\(/, 'function App(');
  } else if (/export\s+default\s*\(/ .test(processed) || /export\s+default\s*\(?props\)?\s*=>/.test(processed)) {
    processed = processed.replace(/export\s+default\s*/, 'const App = ');
  }

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
      if (typeof App !== 'undefined') TargetComponent = App;
      else if (typeof Main !== 'undefined') TargetComponent = Main;
      else if (typeof Component !== 'undefined') TargetComponent = Component;

      if (TargetComponent) {
        ReactDOM.createRoot(document.getElementById('root')).render(<TargetComponent />);
      } else {
        document.getElementById('root').innerHTML = '<div style="padding: 2rem; color: #ef4444; font-family: sans-serif;"><h3>Preview Warning</h3><p>Could not auto-detect a React component (e.g. function App). Please ensure your code exports or defines an App component.</p></div>';
      }
    } catch (err) {
      document.getElementById('root').innerHTML = '<div style="padding: 2rem; color: #ef4444; font-family: sans-serif;"><h3>Runtime Error</h3><pre>' + err.message + '</pre></div>';
    }
  </script>
</body>
</html>`;
}
