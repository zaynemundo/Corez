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
});
