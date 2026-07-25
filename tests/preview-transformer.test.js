import { describe, it, expect } from 'vitest';
import { formatCodeForPreview } from '../src/utils/previewTransformer.js';

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
});
