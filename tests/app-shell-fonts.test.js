import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

/**
 * The app shell must not put a third-party font stylesheet on the critical
 * path: it costs two extra DNS + TLS handshakes and up to fifteen font
 * requests before the UI can render, and it cannot be cached immutably by our
 * own asset pipeline. Both families the UI actually renders are vendored and
 * content-hashed under /assets instead.
 */
describe('App shell font delivery', () => {
  it('never links a third-party font host from the shell', () => {
    const html = read('index.html');
    expect(html).not.toMatch(/fonts\.googleapis\.com/);
    expect(html).not.toMatch(/fonts\.gstatic\.com/);
    expect(html).not.toMatch(/rel="preconnect"[^>]*href="https?:\/\//);
  });

  it('declares only self-hosted faces and ships every referenced file', () => {
    const css = read('src/fonts.css');
    expect(css).toMatch(/@font-face/);
    expect(css).not.toMatch(/url\(\s*["']?https?:/);

    const refs = [...css.matchAll(/url\("\.\/(assets\/fonts\/[^"]+)"\)/g)].map(
      (match) => match[1],
    );
    expect(refs.length).toBeGreaterThanOrEqual(4);

    const shipped = readdirSync(path.join(root, 'src', 'assets', 'fonts'));
    for (const ref of refs) {
      expect(shipped).toContain(path.basename(ref));
    }
  });

  it('keeps the two families the UI renders and drops the unused one', () => {
    const css = read('src/fonts.css');
    expect(css).toMatch(/font-family: "Outfit"/);
    expect(css).toMatch(/font-family: "JetBrains Mono"/);
    // Inter was downloaded on every page load but --font-sans is a system
    // stack, so the family never rendered. Re-adding it is a design decision.
    expect(css).not.toMatch(/font-family: "Inter"/);
  });
});
