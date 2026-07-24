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
    expect(formatted).toContain('TargetComponent = App');
  });
});
