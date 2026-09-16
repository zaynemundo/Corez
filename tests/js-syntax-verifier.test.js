import { describe, it, expect } from 'vitest';
import { findInlineScriptSyntaxErrors } from '../worker/jsSyntax.js';
import { verifyCreation } from '../worker/creationVerifier.js';

function withScript(code, attrs = '') {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"></head><body><canvas id="c"></canvas><script${attrs}>\n${code}\n</script></body></html>`;
}

describe('inline script syntax verification', () => {
  it('accepts valid game code', () => {
    const html = withScript(`
      const canvas = document.getElementById("c");
      const ctx = canvas.getContext("2d");
      function loop() { ctx.fillRect(0, 0, 10, 10); requestAnimationFrame(loop); }
      requestAnimationFrame(loop);
    `);
    expect(findInlineScriptSyntaxErrors(html)).toEqual([]);
    const verification = verifyCreation(html, { intentType: 'game_creation' });
    expect(verification.failures.some((f) => f.code === 'js-syntax-error')).toBe(false);
    // The same fixture fails OTHER game checks (key polling, resize) — the
    // syntax gate must not pile noise onto unrelated failures.
    expect(verification.failures.map((f) => f.code)).not.toContain('js-syntax-error');
  });

  it('catches the exact "missing } in compound statement" class that shipped broken', () => {
    // A single missing closing brace: the old brace heuristic allowed up to a
    // ±10 difference across the whole document, so this passed verification and
    // the preview died with a bare syntax error.
    const html = withScript(`
      function shoot() {
        if (keys["Space"]) {
          bullets.push({ x: 1 });
      }
      requestAnimationFrame(loop);
    `);
    const errors = findInlineScriptSyntaxErrors(html);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/unexpected|missing|expected/i);
    expect(errors[0].line).toBeGreaterThan(2);

    const verification = verifyCreation(html, { intentType: 'game_creation' });
    expect(verification.passed).toBe(false);
    const failure = verification.failures.find((f) => f.code === 'js-syntax-error');
    expect(failure).toBeTruthy();
    expect(failure.detail).toMatch(/invalid JavaScript at line \d+/);
  });

  it('reports the line the browser would report, offset by the document', () => {
    const filler = '\n'.repeat(30);
    const html = `<!DOCTYPE html><html><body><canvas></canvas><script>${filler}const ok = 1;\nfunction broken( {\n</script></body></html>`;
    const errors = findInlineScriptSyntaxErrors(html);
    expect(errors).toHaveLength(1);
    // Line 2 of the script + 30 blank lines + the tag's own line.
    expect(errors[0].line).toBeGreaterThanOrEqual(33);
  });

  it('parses module scripts as modules and skips non-JS blocks', () => {
    const moduleHtml = `<!DOCTYPE html><html><body><script type="module">import * as THREE from "https://unpkg.com/three/build/three.module.js";\nnew THREE.Scene();</script></body></html>`;
    expect(findInlineScriptSyntaxErrors(moduleHtml)).toEqual([]);

    // A JSX/JSON block is not plain ECMAScript: never a false syntax failure.
    const jsxHtml = `<!DOCTYPE html><html><body><script type="text/babel">const A = () => <div className="x" />;</script><script type="application/ld+json">{"a": 1,}</script></body></html>`;
    expect(findInlineScriptSyntaxErrors(jsxHtml)).toEqual([]);

    const importMap = `<!DOCTYPE html><html><head><script type="importmap">{"imports": {"three": "https://unpkg.com/three"}}</script></head><body></body></html>`;
    expect(findInlineScriptSyntaxErrors(importMap)).toEqual([]);
  });

  it('ignores external scripts and never reports more than the cap', () => {
    const external = `<!DOCTYPE html><html><body><script src="https://unpkg.com/three"></script></body></html>`;
    expect(findInlineScriptSyntaxErrors(external)).toEqual([]);

    const manyBad = `<!DOCTYPE html><html><body>${Array.from({ length: 6 }, () => '<script>function a( {</script>').join('')}</body></html>`;
    expect(findInlineScriptSyntaxErrors(manyBad)).toHaveLength(3);
    expect(findInlineScriptSyntaxErrors(manyBad, { maxErrors: 5 })).toHaveLength(5);
  });
});
