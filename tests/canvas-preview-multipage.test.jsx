// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup, act } from '@testing-library/react';
import CanvasPreview from '../src/components/CanvasPreview.jsx';
import { formatCodeForPreview, injectMultiPageRouter } from '../src/utils/previewTransformer.js';

const MULTI_PAGE_CODE = `<!-- CORESITE-PAGES: index.html, about.html -->
<!-- PAGE: index.html -->
<!DOCTYPE html><html><body><h1>Home</h1><a href="about.html">About</a></body></html>
<!-- PAGE: about.html -->
<!DOCTYPE html><html><body><h1>About Us</h1></body></html>`;

afterEach(cleanup);

function renderPreview(code = MULTI_PAGE_CODE) {
  return render(
    <CanvasPreview code={code} title="Test Site" onClose={() => {}} isFullScreen={false} onToggleFullScreen={() => {}} />
  );
}

function withFakeIframeWindow(container) {
  const iframe = container.querySelector('iframe');
  const fakeWindow = { name: 'fake-preview-window' };
  Object.defineProperty(iframe, 'contentWindow', { value: fakeWindow, configurable: true });
  return fakeWindow;
}

describe('CanvasPreview multi-page sites', () => {
  it('renders one tab per parsed page', () => {
    renderPreview();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['index.html', 'about.html']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('starts on the index page and renders it in the iframe', () => {
    renderPreview();
    const iframe = screen.getByTitle('Live Application Preview (Desktop)');
    expect(iframe.getAttribute('srcdoc')).toContain('<h1>Home</h1>');
    expect(iframe.getAttribute('srcdoc')).toContain("type: 'corez-nav'");
  });

  it('swaps the iframe document when a tab is clicked', () => {
    renderPreview();
    fireEvent.click(screen.getByRole('tab', { name: 'about.html' }));
    const iframe = screen.getByTitle('Live Application Preview (Desktop)');
    expect(iframe.getAttribute('srcdoc')).toContain('<h1>About Us</h1>');
    expect(iframe.getAttribute('srcdoc')).not.toContain('<h1>Home</h1>');
  });

  it('navigates to a known page when the iframe posts a corez-nav message', () => {
    const { container } = renderPreview();
    const fakeWindow = withFakeIframeWindow(container);
    const event = new MessageEvent('message', {
      source: fakeWindow,
      data: { type: 'corez-nav', page: 'about.html' }
    });
    act(() => {
      window.dispatchEvent(event);
    });
    const iframe = container.querySelector('iframe');
    expect(iframe.getAttribute('srcdoc')).toContain('<h1>About Us</h1>');
  });

  it('ignores corez-nav messages from unknown sources', () => {
    const { container } = renderPreview();
    const iframe = container.querySelector('iframe');
    const event = new MessageEvent('message', {
      source: null,
      data: { type: 'corez-nav', page: 'about.html' }
    });
    window.dispatchEvent(event);
    expect(iframe.getAttribute('srcdoc')).toContain('<h1>Home</h1>');
  });

  it('ignores corez-nav messages for pages that do not exist', () => {
    const { container } = renderPreview();
    const fakeWindow = withFakeIframeWindow(container);
    const iframe = container.querySelector('iframe');
    const event = new MessageEvent('message', {
      source: fakeWindow,
      data: { type: 'corez-nav', page: '../secret.html' }
    });
    window.dispatchEvent(event);
    expect(iframe.getAttribute('srcdoc')).toContain('<h1>Home</h1>');
  });

  it('ignores malformed messages entirely', () => {
    const { container } = renderPreview();
    const fakeWindow = withFakeIframeWindow(container);
    const iframe = container.querySelector('iframe');
    const event = new MessageEvent('message', {
      source: fakeWindow,
      data: 'not-an-object'
    });
    window.dispatchEvent(event);
    expect(iframe.getAttribute('srcdoc')).toContain('<h1>Home</h1>');
  });

  it('does not render page tabs for single-page creations', () => {
    renderPreview('<!DOCTYPE html><html><body><h1>Single</h1></body></html>');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});

describe('multi-page router script', () => {
  function routerFn() {
    const html = injectMultiPageRouter(formatCodeForPreview('<a href="about.html">About</a>'), ['index.html', 'about.html']);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const router = scripts.find((s) => s.includes('corez-nav'));
    expect(router, 'router script present').toBeTruthy();
    return new Function('window', 'document', router);
  }

  it('intercepts internal .html links and posts a corez-nav message in an iframe context', () => {
    const fn = routerFn();
    const posted = [];
    const fakeWindow = {
      self: { frame: true },
      top: { top: true },
      parent: { postMessage: (data) => posted.push(data) }
    };
    fn.call(fakeWindow, fakeWindow, document);

    document.body.innerHTML = '<a href="about.html">About</a>';
    const anchor = document.querySelector('a');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, target: anchor });
    anchor.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(posted).toEqual([{ type: 'corez-nav', page: 'about.html' }]);
    document.body.innerHTML = '';
  });

  it('leaves hash links, absolute URLs, and non-page links alone', () => {
    const fn = routerFn();
    const fakeWindow = {
      self: { frame: true },
      top: { top: true },
      parent: { postMessage: () => {} }
    };
    fn.call(fakeWindow, fakeWindow, document);

    document.body.innerHTML = `
      <a href="#section">Hash</a>
      <a href="https://example.com">Absolute</a>
      <a href="https://site.com/about.html">External page</a>
      <a href="mailto:hi@example.com">Mail</a>
    `;
    const clicks = [...document.querySelectorAll('a')].map((anchor) => {
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, target: anchor });
      anchor.dispatchEvent(click);
      return click;
    });
    for (const click of clicks) {
      expect(click.defaultPrevented).toBe(false);
    }
    document.body.innerHTML = '';
  });

  it('fetch-swaps the document on a published top-level page', async () => {
    const fn = routerFn();
    const pageDoc = '<!DOCTYPE html><html><body><h1>Fetched About</h1></body></html>';
    // Top-level context: self === top, so the router falls through to fetch.
    const topWindow = { top: true };
    const fakeWindow = {
      self: topWindow,
      top: topWindow,
      parent: { postMessage: () => {} }
    };
    fn.call(fakeWindow, fakeWindow, document);

    const fetchStub = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(pageDoc) }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchStub;

    document.body.innerHTML = '<a href="about.html">About</a>';
    document.open = () => {};
    const writeCalls = [];
    document.write = (text) => writeCalls.push(text);
    document.close = () => {};
    const anchor = document.querySelector('a');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, target: anchor });
    anchor.dispatchEvent(click);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(click.defaultPrevented).toBe(true);
    expect(fetchStub).toHaveBeenCalledWith('about.html');
    expect(writeCalls.join('')).toContain('<h1>Fetched About</h1>');
    globalThis.fetch = originalFetch;
    document.body.innerHTML = '';
  });
});
