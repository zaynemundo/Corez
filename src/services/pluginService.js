/**
 * Corez Plugin Registry & Service
 * Handles plugin discovery, registration, persistent toggle state, and custom plugin runtime definitions.
 */

export const DEFAULT_PLUGINS = [
  {
    id: 'market-quote-plugin',
    name: 'Live Financial Market Quotes',
    version: '1.0.0',
    description: 'Fetch real-time stock prices, forex rates, and crypto market quotes via Twelve Data API integration.',
    category: 'data',
    type: 'ai-tool',
    enabled: true,
    author: 'Corez Engineering',
    permissions: ['network:api/market'],
    icon: 'TrendingUp'
  },
  {
    id: 'math-calculator-plugin',
    name: 'Interactive Math & Graphing Calculator',
    version: '1.2.0',
    description: 'Interactive canvas widget for evaluating algebraic formulas, plotting functions, and solving equations.',
    category: 'tools',
    type: 'sandboxed-widget',
    enabled: true,
    author: 'Corez Engineering',
    permissions: ['canvas:render'],
    icon: 'Calculator',
    code: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; text-align: center; }
    input, button { padding: 10px 14px; font-size: 16px; border-radius: 8px; border: 1px solid #334155; margin: 6px; background: #1e293b; color: white; }
    button { background: #3b82f6; cursor: pointer; border: none; font-weight: 600; }
    button:hover { background: #2563eb; }
    #result { margin-top: 20px; font-size: 24px; font-weight: bold; color: #38bdf8; }
  </style>
</head>
<body>
  <h2>📐 Math & Graphing Calculator</h2>
  <input type="text" id="expr" placeholder="e.g. Math.sin(Math.PI / 4) * 10" style="width: 80%;" />
  <br/>
  <button onclick="calc()">Evaluate Expression</button>
  <div id="result">0</div>
  <script>
    function calc() {
      try {
        const val = eval(document.getElementById('expr').value);
        document.getElementById('result').innerText = 'Result: ' + val;
      } catch (err) {
        document.getElementById('result').innerText = 'Error: ' + err.message;
      }
    }
  </script>
</body>
</html>`
  },
  {
    id: 'color-palette-plugin',
    name: 'UI Color Palette & Design Studio',
    version: '1.0.1',
    description: 'Generates harmonious HSL/Hex color schemes, glassmorphism gradients, and CSS export tokens.',
    category: 'design',
    type: 'sandboxed-widget',
    enabled: true,
    author: 'Corez Design System',
    permissions: ['canvas:render'],
    icon: 'Palette',
    code: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui, sans-serif; background: #111827; color: #f9fafb; margin: 0; padding: 20px; text-align: center; }
    .swatch-grid { display: flex; gap: 12px; justify-content: center; margin-top: 20px; }
    .swatch { width: 90px; height: 90px; border-radius: 12px; display: flex; align-items: flex-end; justify-content: center; padding: 8px; font-size: 12px; font-weight: bold; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5); }
    button { padding: 10px 18px; border-radius: 8px; border: none; background: #6366f1; color: white; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <h2>🎨 UI Color Palette Studio</h2>
  <button onclick="generate()">Generate Random Harmony</button>
  <div className="swatch-grid" id="grid"></div>
  <script>
    function generate() {
      const hue = Math.floor(Math.random() * 360);
      const colors = [
        \`hsl(\${hue}, 80%, 60%)\`,
        \`hsl(\${(hue + 30) % 360}, 75%, 55%)\`,
        \`hsl(\${(hue + 180) % 360}, 70%, 50%)\`,
        \`hsl(\${(hue + 210) % 360}, 85%, 65%)\`
      ];
      const grid = document.getElementById('grid');
      grid.innerHTML = colors.map(c => \`<div class="swatch" style="background:\${c}">\${c}</div>\`).join('');
    }
    generate();
  </script>
</body>
</html>`
  },
  {
    id: 'code-scratchpad-plugin',
    name: 'Live Code Sandbox & Scratchpad',
    version: '1.1.0',
    description: 'Instant JavaScript snippet tester and regex playground with real-time browser console logging.',
    category: 'productivity',
    type: 'sandboxed-widget',
    enabled: true,
    author: 'Corez Engineering',
    permissions: ['canvas:render', 'storage:local'],
    icon: 'Terminal',
    code: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: monospace; background: #090d16; color: #4ade80; margin: 0; padding: 16px; }
    textarea { width: 100%; height: 180px; background: #131b2e; color: #38bdf8; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; font-family: inherit; font-size: 14px; box-sizing: border-box; }
    button { margin-top: 10px; padding: 10px 16px; background: #22c55e; color: black; border: none; font-weight: bold; border-radius: 6px; cursor: pointer; }
    #console { margin-top: 14px; background: #000; padding: 12px; border-radius: 6px; min-height: 80px; white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <h3>⚡ Live JavaScript Scratchpad</h3>
  <textarea id="code">const numbers = [1, 2, 3, 4, 5];\nconst squared = numbers.map(n => n * n);\nconsole.log('Squared array:', squared);</textarea>
  <br/>
  <button onclick="run()">▶ Run Code</button>
  <div id="console">// Console output will appear here</div>
  <script>
    function run() {
      const out = document.getElementById('console');
      out.innerText = '';
      const oldLog = console.log;
      console.log = function(...args) {
        out.innerText += args.join(' ') + '\\n';
        oldLog.apply(console, args);
      };
      try {
        new Function(document.getElementById('code').value)();
      } catch(err) {
        out.innerText += 'Error: ' + err.message;
      } finally {
        console.log = oldLog;
      }
    }
  </script>
</body>
</html>`
  }
];

const STORAGE_KEY = 'corez_plugins';

/**
 * Retrieve all registered plugins (combining defaults and custom user plugins).
 */
export function getPlugins() {
  if (typeof window === 'undefined') return DEFAULT_PLUGINS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PLUGINS));
      return DEFAULT_PLUGINS;
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return DEFAULT_PLUGINS;
    return parsed;
  } catch (err) {
    console.error('Failed to read plugins from localStorage:', err);
    return DEFAULT_PLUGINS;
  }
}

/**
 * Get currently enabled plugins.
 */
export function getEnabledPlugins() {
  return getPlugins().filter((plugin) => plugin.enabled === true);
}

/**
 * Toggle plugin enabled/disabled status.
 */
export function togglePlugin(pluginId) {
  const plugins = getPlugins();
  const updated = plugins.map((p) => (
    p.id === pluginId ? { ...p, enabled: !p.enabled } : p
  ));
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

/**
 * Register a new custom user plugin.
 */
export function registerCustomPlugin(pluginData) {
  if (!pluginData || typeof pluginData !== 'object') {
    throw new Error('Plugin data must be an object.');
  }
  if (!pluginData.name || typeof pluginData.name !== 'string' || !pluginData.name.trim()) {
    throw new Error('Plugin name is required.');
  }

  const newPlugin = {
    id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: pluginData.name.trim(),
    version: pluginData.version || '1.0.0',
    description: pluginData.description?.trim() || 'Custom user created plugin',
    category: pluginData.category || 'custom',
    type: pluginData.type || 'sandboxed-widget',
    enabled: true,
    author: pluginData.author || 'User',
    permissions: pluginData.permissions || ['canvas:render'],
    icon: pluginData.icon || 'Puzzle',
    code: pluginData.code || '<div>Custom Plugin Payload</div>'
  };

  const plugins = getPlugins();
  const updated = [...plugins, newPlugin];
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return newPlugin;
}

/**
 * Uninstall/remove a custom plugin.
 */
export function uninstallPlugin(pluginId) {
  const plugins = getPlugins();
  const updated = plugins.filter((p) => p.id !== pluginId);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

/**
 * Reset plugins back to factory defaults.
 */
export function resetPluginsToDefault() {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PLUGINS));
  }
  return DEFAULT_PLUGINS;
}
