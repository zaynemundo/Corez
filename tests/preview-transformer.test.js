import { describe, it, expect } from 'vitest';
import { formatCodeForPreview, parseMultiPageSite, injectMultiPageRouter, validateMultiPageSite, MULTI_PAGE_NAME_PATTERN } from '../src/utils/previewTransformer.js';

describe('previewTransformer', () => {
  it('passes through pure HTML documents untouched', () => {
    const html = '<!DOCTYPE html><html><body><h1>Hello</h1></body></html>';
    expect(formatCodeForPreview(html)).toBe(html);
  });

  it('wraps raw JSX code into a runnable HTML document with React & Babel', () => {
    const jsx = `import React, { useState } from 'react';
import { Play } from 'lucide-react';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      <Play /> Count: {count}
    </button>
  );
}`;

    const formatted = formatCodeForPreview(jsx);
    expect(formatted).toContain('<!DOCTYPE html>');
    expect(formatted).toContain('react.production.min.js');
    expect(formatted).toContain('@babel/standalone');
    expect(formatted).toContain('const Play = LucideStub;');
    expect(formatted).toContain('ReactDOM.createRoot');
  });

  it('handles multi-line import statements cleanly without breaking compilation', () => {
    const multilineJsx = `import {
  useState,
  useEffect,
  useRef
} from 'react';
import {
  Sparkles,
  Shield
} from 'lucide-react';

export default function Dashboard() {
  return <div><Sparkles /><Shield />Dashboard</div>;
}`;

    const formatted = formatCodeForPreview(multilineJsx);
    expect(formatted).toContain('const Sparkles = LucideStub;');
    expect(formatted).toContain('const Shield = LucideStub;');
    expect(formatted).not.toContain('import {\n  useState');
  });

  it('registers custom component names with window.__COREZ_APP__ on default export', () => {
    const jsx = `const Dashboard = () => <div>Dashboard</div>; export default Dashboard;`;
    const formatted = formatCodeForPreview(jsx);
    expect(formatted).toContain('window.__COREZ_APP__ = Dashboard');
  });

  it('auto-detects un-exported capital letter components', () => {
    const jsx = `function Counter() { return <div>Count</div>; }`;
    const formatted = formatCodeForPreview(jsx);
    expect(formatted).toContain('"Counter"');
  });

  it('wraps raw bare JSX tags automatically in App component', () => {
    const rawTag = `<div className="card">Hello World</div>`;
    const formatted = formatCodeForPreview(rawTag);
    expect(formatted).toContain('function App()');
  });

  it('handles multi-file code blocks with // App.tsx and // components/Navbar.tsx headers', () => {
    const multiFile = `// App.tsx
import React from 'react';
import Navbar from './components/layout/Navbar';

export default function App() {
  return <div><Navbar /></div>;
}

// components/layout/Navbar.tsx
import React from 'react';
export default function Navbar() {
  return <nav>Navbar</nav>;
}`;

    const formatted = formatCodeForPreview(multiFile);
    expect(formatted).toContain('function App()');
    expect(formatted).toContain('function Navbar()');
    expect(formatted).not.toContain('// App.tsx');
    expect(formatted).not.toContain('import Navbar from');
    expect(formatted).toContain('data-presets="react,typescript"');
  });

  it('strips generic hook parameters and type assertions that cause Babel TSX syntax errors', () => {
    const tsxCode = `
      import React, { useRef, useState } from 'react';
      export default function App() {
        const ref = useRef<HTMLDivElement>(null);
        const [open, setOpen] = useState<boolean>(false);
        const style = { position: 'relative' as const };
        return <div ref={ref} style={style}>App</div>;
      }
    `;

    const formatted = formatCodeForPreview(tsxCode);
    expect(formatted).toContain('useRef(null)');
    expect(formatted).toContain('useState(false)');
    expect(formatted).not.toContain('useRef<HTMLDivElement>');
    expect(formatted).not.toContain('as const');
  });

  it('provides Fallback Canvas and 3D stubs for @react-three/fiber imports to prevent ReferenceError: Canvas is not defined', () => {
    const threeCode = `
      import React from 'react';
      import { Canvas, useFrame } from '@react-three/fiber';
      import { OrbitControls } from '@react-three/drei';

      export default function App() {
        return (
          <Canvas>
            <OrbitControls />
            <mesh>
              <boxGeometry />
              <meshStandardMaterial color="hotpink" />
            </mesh>
          </Canvas>
        );
      }
    `;

    const formatted = formatCodeForPreview(threeCode);
    expect(formatted).toContain('var Canvas =');
    expect(formatted).toContain('var CanvasStub =');
    expect(formatted).toContain('var useFrame =');
    expect(formatted).not.toContain("import { Canvas, useFrame } from '@react-three/fiber'");
  });

  it('includes Three.js CDN script and handles import * as THREE from three without ReferenceError: THREE is not defined', () => {
    const code = `
      import React, { useEffect, useRef } from 'react';
      import * as THREE from 'three';

      export default function Game() {
        const mountRef = useRef(null);
        useEffect(() => {
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
          return () => {};
        }, []);
        return <div ref={mountRef} />;
      }
    `;

    const formatted = formatCodeForPreview(code);
    expect(formatted).toContain('three.min.js');
    expect(formatted).toContain('var THREE = window.THREE || window.__THREE_STUB__;');
    expect(formatted).not.toContain("import * as THREE from 'three'");
  });

  it('provides top-level PerspectiveCamera and Three.js class declarations to prevent ReferenceError: PerspectiveCamera is not defined', () => {
    const code = `
      import React, { useEffect } from 'react';
      export default function Game3D() {
        useEffect(() => {
          const camera = new PerspectiveCamera(75, 1, 0.1, 1000);
          const scene = new Scene();
          const renderer = new WebGLRenderer();
          return () => {};
        }, []);
        return <div>3D Scene</div>;
      }
    `;

    const formatted = formatCodeForPreview(code);
    expect(formatted).toContain('var PerspectiveCamera =');
    expect(formatted).toContain('var Scene =');
    expect(formatted).toContain('var WebGLRenderer =');
  });

  it('handles class constructors invoked both with and without new without throwing TypeError', () => {
    const code = `
      import React, { useEffect } from 'react';
      export default function Game3D() {
        useEffect(() => {
          const cam1 = new PerspectiveCamera(75, 1, 0.1, 1000);
          const cam2 = PerspectiveCamera(75, 1, 0.1, 1000); // without new!
          return () => {};
        }, []);
        return <div>Constructor Test</div>;
      }
    `;

    const formatted = formatCodeForPreview(code);
    expect(formatted).toContain('makeSafeClass');
  });

  it('provides mockGl.domElement with addEventListener to prevent TypeError: gl.domElement is undefined', () => {
    const code = `
      import React, { useEffect } from 'react';
      import { useThree } from '@react-three/fiber';

      export default function R3FComponent() {
        const { gl } = useThree();
        useEffect(() => {
          gl.domElement.addEventListener('pointerdown', () => {});
          return () => {};
        }, [gl]);
        return <div>R3F Scene</div>;
      }
    `;

    const formatted = formatCodeForPreview(code);
    expect(formatted).toContain('mockDomElement');
    expect(formatted).toContain('gl: mockGl');
  });

  it('wraps vanilla HTML, CSS, and JS snippets into a runnable HTML preview document', () => {
    const vanillaCode = `
      <style>
        .box { background: purple; color: white; padding: 20px; }
      </style>
      <div class="box">
        <h1 id="title">Vanilla App</h1>
        <button id="btn">Click me</button>
      </div>
      <script>
        document.getElementById('btn').addEventListener('click', () => {
          document.getElementById('title').textContent = 'Clicked!';
        });
      </script>
    `;

    const formatted = formatCodeForPreview(vanillaCode);
    expect(formatted).toContain('<!DOCTYPE html>');
    expect(formatted).toContain('tailwindcss.com');
    expect(formatted).toContain('<div class="box">');
    expect(formatted).toContain('Clicked!');
    expect(formatted).not.toContain('react.production.min.js');
  });
});

describe('parseMultiPageSite', () => {
  const multiPageCode = `<!-- CORESITE-PAGES: index.html, about.html -->
<!-- PAGE: index.html -->
<!DOCTYPE html><html><body><h1>Home</h1><a href="about.html">About</a></body></html>
<!-- PAGE: about.html -->
<!DOCTYPE html><html><body><h1>About Us</h1></body></html>`;

  it('splits marker-delimited documents into separate pages', () => {
    const result = parseMultiPageSite(multiPageCode);
    expect(result.isMultiPage).toBe(true);
    expect(result.pages.map((p) => p.name)).toEqual(['index.html', 'about.html']);
    expect(result.pages[0].html).toContain('<h1>Home</h1>');
    expect(result.pages[1].html).toContain('<h1>About Us</h1>');
  });

  it('removes the CORESITE-PAGES header from page documents', () => {
    const result = parseMultiPageSite(multiPageCode);
    for (const page of result.pages) {
      expect(page.html).not.toContain('CORESITE-PAGES');
    }
  });

  it('falls back to a single page when no markers are present', () => {
    const result = parseMultiPageSite('<!DOCTYPE html><html><body><h1>Single</h1></body></html>');
    expect(result.isMultiPage).toBe(false);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].name).toBe('index.html');
  });

  it('falls back to a single page when markers are malformed or empty', () => {
    expect(parseMultiPageSite('<!-- PAGE: -->\n<h1>Empty name</h1>').isMultiPage).toBe(false);
    expect(parseMultiPageSite('<!-- PAGE: bad/name.html -->\n<h1>Slash</h1>').isMultiPage).toBe(false);
    expect(parseMultiPageSite('<!-- PAGE: "../evil.html" -->\n<h1>Traversal</h1>').isMultiPage).toBe(false);
    expect(parseMultiPageSite('<!-- PAGE: about.html -->\n   ').isMultiPage).toBe(false);
  });

  it('orders index.html first regardless of marker order', () => {
    const reversed = `<!-- PAGE: about.html -->
<!DOCTYPE html><html><body><h1>About</h1></body></html>
<!-- PAGE: index.html -->
<!DOCTYPE html><html><body><h1>Home</h1></body></html>`;
    const result = parseMultiPageSite(reversed);
    expect(result.pages[0].name).toBe('index.html');
  });

  it('skips pages with invalid names and caps the total page count', () => {
    let code = '<!-- PAGE: index.html -->\n<!DOCTYPE html><html><body>Home</body></html>';
    for (let i = 0; i < 20; i += 1) {
      code += `\n<!-- PAGE: page${i}.html -->\n<!DOCTYPE html><html><body>P${i}</body></html>`;
    }
    const result = parseMultiPageSite(code);
    expect(result.pages.length).toBeLessThanOrEqual(12);
    for (const page of result.pages) {
      expect(MULTI_PAGE_NAME_PATTERN.test(page.name)).toBe(true);
    }
  });

  it('formats each page independently through the preview pipeline', () => {
    const result = parseMultiPageSite(multiPageCode);
    const formatted = formatCodeForPreview(result.pages[1].html);
    expect(formatted).toContain('<!DOCTYPE html>');
    expect(formatted).toContain('<h1>About Us</h1>');
  });

  it('injects the multi-page router into a formatted page', () => {
    const formatted = formatCodeForPreview('<h1>Page</h1>');
    const withRouter = injectMultiPageRouter(formatted, ['index.html', 'about.html']);
    expect(withRouter).toContain("type: 'corez-nav'");
    expect(withRouter).toContain('window.parent.postMessage');
    expect(withRouter).toContain('document.open');
    expect(withRouter).not.toBe(formatted);
  });

  it('injects the router before </body> when the document has no head', () => {
    const doc = '<!DOCTYPE html><html><body><h1>No head</h1></body></html>';
    const withRouter = injectMultiPageRouter(doc, ['index.html']);
    expect(withRouter).toContain("type: 'corez-nav'");
    expect(withRouter).toContain('</body>');
  });

  it('leaves documents untouched when no page names are given for injection', () => {
    const formatted = formatCodeForPreview('<h1>Page</h1>');
    expect(injectMultiPageRouter(formatted, [])).toBe(formatted);
  });
});

describe('validateMultiPageSite', () => {
  const completePages = [
    { name: 'index.html', html: '<!DOCTYPE html><html><body><h1>Home</h1><a href="about.html">About</a></body></html>' },
    { name: 'about.html', html: '<!DOCTYPE html><html><body><h1>About</h1></body></html>' }
  ];

  it('passes a complete site with an index page and resolvable links', () => {
    const result = validateMultiPageSite(completePages);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('flags a missing index.html home page', () => {
    const result = validateMultiPageSite([
      { name: 'about.html', html: '<!DOCTYPE html><html><body><h1>About</h1></body></html>' }
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('Missing index.html'))).toBe(true);
  });

  it('flags broken internal links to pages that do not exist', () => {
    const result = validateMultiPageSite([
      { name: 'index.html', html: '<!DOCTYPE html><html><body><a href="pricing.html">Pricing</a></body></html>' },
      { name: 'about.html', html: '<!DOCTYPE html><html><body>About</body></html>' }
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('missing page pricing.html'))).toBe(true);
  });

  it('flags empty pages and warns about incomplete HTML fragments', () => {
    const result = validateMultiPageSite([
      { name: 'index.html', html: '<!DOCTYPE html><html><body><h1>Home</h1></body></html>' },
      { name: 'empty.html', html: '   ' },
      { name: 'frag.html', html: '<h1>fragment</h1>' }
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('empty.html is empty'))).toBe(true);
    expect(result.issues.some((i) => i.severity === 'warn' && i.message.includes('not a complete HTML document'))).toBe(true);
  });

  it('ignores external, mailto, tel, protocol-relative, and hash-only links', () => {
    const result = validateMultiPageSite([
      {
        name: 'index.html',
        html: [
          '<!DOCTYPE html><html><body>',
          '<a href="https://example.com/faq.html">External</a>',
          '<a href="//cdn.example.com/x.html">CDN</a>',
          '<a href="mailto:hi@example.com">Mail</a>',
          '<a href="tel:+123">Call</a>',
          '<a href="#section">Hash</a>',
          '<a href="about.html#team">With anchor</a>',
          '<a href="about.html?lang=en">With query</a>',
          '</body></html>'
        ].join('')
      },
      { name: 'about.html', html: '<!DOCTYPE html><html><body>About</body></html>' }
    ]);
    expect(result.valid).toBe(true);
  });

  it('resolves links with subdirectories against the page set by basename', () => {
    const result = validateMultiPageSite([
      { name: 'index.html', html: '<!DOCTYPE html><html><body><a href="pages/about.html">About</a></body></html>' },
      { name: 'about.html', html: '<!DOCTYPE html><html><body>About</body></html>' }
    ]);
    expect(result.valid).toBe(true);
  });

  it('rejects an empty page list entirely', () => {
    const result = validateMultiPageSite([]);
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain('No pages');
  });
});
