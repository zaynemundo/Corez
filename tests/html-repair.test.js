import { describe, it, expect } from 'vitest';
import { repairMalformedHtml as workerRepair } from '../worker/htmlRepair.js';
import { repairMalformedHtml as clientRepair } from '../src/utils/htmlRepair.js';

// The observed failure: the model omitted the <script> opening tag, so the
// browser renders the whole JavaScript block (and the trailing </script>) as
// visible page text.
const BROKEN_SCRIPT = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
body{background:#0a0a0a;color:#fff}
</style>
</head>
<body>
<header class="nav"><a href="#home">CV</a></header>
<section id="home"><h1>Christian Vestil</h1></section>
// Reveal + skill bars
const io=new IntersectionObserver(entries=>{
entries.forEach(e=>{
if(e.isIntersecting){
e.target.classList.add('in');
e.target.querySelectorAll('.bar-fill').forEach(b=>{ b.style.width=b.dataset.w; });
}
});
},{threshold:0.18});
document.querySelectorAll('.reveal, [data-bars]').forEach(el=> io.observe(el));
document.getElementById('year').textContent=new Date().getFullYear();
</script>
</body>
</html>`;

const GOOD_DOC = `<!DOCTYPE html><html><head><style>body{}</style></head><body><div>hi</div><script>console.log('x');</script></body></html>`;

function counts(html) {
  return {
    scriptOpens: (html.match(/<script\b/gi) || []).length,
    scriptCloses: (html.match(/<\/script\s*>/gi) || []).length,
    styleOpens: (html.match(/<style\b/gi) || []).length,
    styleCloses: (html.match(/<\/style\s*>/gi) || []).length
  };
}

describe('repairMalformedHtml (worker + client copies)', () => {
  const impls = [
    ['worker', workerRepair],
    ['client', clientRepair]
  ];

  for (const [name, repair] of impls) {
    describe(name, () => {
      it('wraps an orphan script body (missing <script> opening tag) in a real <script> block', () => {
        const fixed = repair(BROKEN_SCRIPT);
        const c = counts(fixed);
        expect(c.scriptOpens).toBe(1);
        expect(c.scriptCloses).toBe(1);
        // The opening tag must be inserted directly before the JS body.
        expect(fixed).toContain('<script>\n// Reveal + skill bars');
        // Every line of the original body is preserved.
        expect(fixed).toContain('document.getElementById(\'year\')');
        expect(fixed).toContain('</body>');
        expect(fixed).toContain('</html>');
      });

      it('leaves a well-formed document unchanged', () => {
        expect(repair(GOOD_DOC)).toBe(GOOD_DOC);
      });

      it('leaves adjacent legitimate script blocks unchanged', () => {
        const doc = '<!DOCTYPE html><html><head></head><body><script>a()</script><script>b()</script></body></html>';
        expect(repair(doc)).toBe(doc);
      });

      it('leaves script tags with attributes unchanged', () => {
        const doc = '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body></body></html>';
        expect(repair(doc)).toBe(doc);
      });

      it('fixes a "<<script>" mangled opening tag', () => {
        const broken = GOOD_DOC.replace('<script>', '<<script>');
        const fixed = repair(broken);
        const c = counts(fixed);
        expect(c.scriptOpens).toBe(1);
        expect(c.scriptCloses).toBe(1);
        expect(fixed).toContain('<script>console.log');
      });

      it('fixes an HTML-escaped opening tag ("&lt;script&gt;")', () => {
        const broken = GOOD_DOC.replace('<script>', '&lt;script&gt;');
        const fixed = repair(broken);
        expect(counts(fixed).scriptOpens).toBe(1);
        expect(counts(fixed).scriptCloses).toBe(1);
      });

      it('truncates a <script> opening tag that swallowed the first lines of the block', () => {
        const broken = `<!DOCTYPE html><html><head></head><body><div>ok</div>
<script
// first line of js
const x=1;
console.log(x);
</script>
</body></html>`;
        const fixed = repair(broken);
        const c = counts(fixed);
        expect(c.scriptOpens).toBe(1);
        expect(c.scriptCloses).toBe(1);
        expect(fixed).toContain('<script>\n// first line of js');
        // The block body must survive the repair.
        expect(fixed).toContain('console.log(x);');
      });

      it('wraps an orphan <style> body too', () => {
        const broken = `<!DOCTYPE html><html><head></head><body>
<section>hero</section>
p{color:red}
.foo{color:blue}
</style>
</body></html>`;
        const fixed = repair(broken);
        const c = counts(fixed);
        expect(c.styleOpens).toBe(1);
        expect(c.styleCloses).toBe(1);
        expect(fixed).toContain('<style>\np{color:red}');
        expect(fixed).toContain('.foo{color:blue}');
      });

      it('strips stray junk after the final </html>', () => {
        expect(repair(GOOD_DOC + '<fpoq/>}')).toBe(GOOD_DOC);
      });

      it('never touches React/JSX code', () => {
        const jsx = `import React from 'react';
const App = () => <div className="a">{'</script>'}</div>;
export default App;`;
        expect(repair(jsx)).toBe(jsx);
      });
    });
  }

  it('worker and client copies behave identically', () => {
    expect(clientRepair(BROKEN_SCRIPT)).toBe(workerRepair(BROKEN_SCRIPT));
    expect(clientRepair(GOOD_DOC)).toBe(workerRepair(GOOD_DOC));
  });
});
