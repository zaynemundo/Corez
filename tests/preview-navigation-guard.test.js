// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { formatCodeForPreview } from '../src/utils/previewTransformer.js';

// jsdom does not execute <script> elements injected via innerHTML, so the
// guard must be evaluated explicitly. Extract it from the generated document.
function installGuard(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const guard = scripts.find((s) => s.includes('navigation guard') || s.includes("closest('a[href]')"));
  expect(guard, 'guard script present').toBeTruthy();
  // Evaluate only the guard block (strip the unrelated onerror/mousedown bits
  // by evaluating the whole script — the onerror bits are harmless in jsdom).
  const fn = new Function(guard);
  fn.call(window);
}

describe('preview navigation guard', () => {
  it('injects the navigation guard into plain HTML previews', () => {
    const html = formatCodeForPreview('<button>Click me</button>');
    expect(html).toContain("document.addEventListener('submit', function(e) { e.preventDefault(); }, true)");
    expect(html).toContain("closest('a[href]')");
  });

  it('injects the navigation guard into React previews', () => {
    const jsx = 'export default function App() { return <button>Go</button>; }';
    const html = formatCodeForPreview(jsx);
    expect(html).toContain("document.addEventListener('submit', function(e) { e.preventDefault(); }, true)");
    expect(html).toContain("closest('a[href]')");
  });

  it('keeps already-complete HTML documents unchanged', () => {
    const doc = '<!DOCTYPE html><html><body><h1>hi</h1></body></html>';
    expect(formatCodeForPreview(doc)).toBe(doc);
  });

  it('prevents form submissions from blanking the preview', () => {
    const html = formatCodeForPreview(`
      <form action="/go" method="post">
        <button type="submit">Submit</button>
      </form>
    `);
    document.body.innerHTML = html;
    installGuard(html);
    const form = document.querySelector('form');
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    // The capture-phase guard prevents the default navigation, so the
    // iframe stays on its srcdoc instead of blanking white.
    expect(event.defaultPrevented).toBe(true);
    document.body.innerHTML = '';
  });

  it('blocks anchor navigation away from the preview', () => {
    const html = formatCodeForPreview('<a href="https://example.com/page">Link</a>');
    document.body.innerHTML = html;
    installGuard(html);
    const anchor = document.querySelector('a');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, target: anchor });
    anchor.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    document.body.innerHTML = '';
  });

  it('allows same-page hash and javascript: links', () => {
    const html = formatCodeForPreview('<a href="#section">Hash</a><a href="javascript:void(0)">JS</a>');
    document.body.innerHTML = html;
    installGuard(html);
    const [hashLink, jsLink] = document.querySelectorAll('a');
    const hashClick = new MouseEvent('click', { bubbles: true, cancelable: true, target: hashLink });
    hashLink.dispatchEvent(hashClick);
    expect(hashClick.defaultPrevented).toBe(false);

    const jsClick = new MouseEvent('click', { bubbles: true, cancelable: true, target: jsLink });
    jsLink.dispatchEvent(jsClick);
    expect(jsClick.defaultPrevented).toBe(false);
    document.body.innerHTML = '';
  });

  it('allows _blank links to open in a new tab', () => {
    const html = formatCodeForPreview('<a href="https://example.com" target="_blank">New tab</a>');
    document.body.innerHTML = html;
    installGuard(html);
    const anchor = document.querySelector('a');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, target: anchor });
    anchor.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    document.body.innerHTML = '';
  });
});
