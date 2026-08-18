// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, act } from '@testing-library/react';
import CanvasPreview from '../src/components/CanvasPreview.jsx';
import { formatCodeForPreview, injectMultiPageRouter } from '../src/utils/previewTransformer.js';

vi.mock('../src/services/appStorageService', () => ({
  publishAppInR2: vi.fn(() => Promise.resolve({ slug: 'test-123', url: '/test-123' }))
}));

import { publishAppInR2 } from '../src/services/appStorageService';

const MULTI_PAGE_CODE = `<!-- CORESITE-PAGES: index.html, about.html -->
<!-- PAGE: index.html -->
<!DOCTYPE html><html><body><h1>Home</h1><a href="about.html">About</a></body></html>
<!-- PAGE: about.html -->
<!DOCTYPE html><html><body><h1>About Us</h1></body></html>`;

const INCOMPLETE_MULTI_PAGE_CODE = `<!-- PAGE: index.html -->
<!DOCTYPE html><html><body><h1>Home</h1><a href="pricing.html">Pricing</a></body></html>
<!-- PAGE: about.html -->
<!DOCTYPE html><html><body><h1>About</h1></body></html>`;

afterEach(cleanup);

beforeEach(() => {
  publishAppInR2.mockClear();
});

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
  it('does not render a page tab bar', () => {
    renderPreview();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('starts on the index page and renders it in the iframe', () => {
    renderPreview();
    const iframe = screen.getByTitle('Live Application Preview (Desktop)');
    expect(iframe.getAttribute('srcdoc')).toContain('<h1>Home</h1>');
    expect(iframe.getAttribute('srcdoc')).toContain("type: 'corez-nav'");
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

  it('shows no tab bar for single-page creations either', () => {
    renderPreview('<!DOCTYPE html><html><body><h1>Single</h1></body></html>');
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('does not show a completeness warning for a complete multi-page site', () => {
    renderPreview();
    expect(screen.queryByText(/Incomplete site/)).toBeNull();
  });

  it('shows an incompleteness banner when the site has broken internal links', () => {
    renderPreview(INCOMPLETE_MULTI_PAGE_CODE);
    expect(screen.getByText(/Incomplete site/)).toBeTruthy();
    expect(screen.getByText(/missing page pricing\.html/)).toBeTruthy();
    expect(screen.getByText(/Publishing is blocked until fixed/)).toBeTruthy();
  });

  it('blocks publishing an incomplete multi-page site', () => {
    renderPreview(INCOMPLETE_MULTI_PAGE_CODE);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(publishAppInR2).not.toHaveBeenCalled();
    expect(screen.getByText(/incomplete: index\.html links to missing page pricing\.html/i)).toBeTruthy();
  });

  it('publishes a complete multi-page site normally', async () => {
    renderPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await act(async () => {});
    expect(publishAppInR2).toHaveBeenCalledTimes(1);
    const payload = publishAppInR2.mock.calls[0][0];
    expect(payload.pages['index.html']).toContain('<h1>Home</h1>');
    expect(payload.pages['about.html']).toContain('<h1>About Us</h1>');
    expect(payload.pages['index.html']).toContain("type: 'corez-nav'");
  });

  it('passes the chat session id to the publish service so revisions update the same link', async () => {
    render(
      <CanvasPreview code={MULTI_PAGE_CODE} title="Test Site" onClose={() => {}} isFullScreen={false} onToggleFullScreen={() => {}} sessionId="session-42" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await act(async () => {});
    expect(publishAppInR2.mock.calls[0][0].sessionId).toBe('session-42');
  });

  it('downloads multi-page creations as a .zip archive', () => {
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-zip');
    URL.revokeObjectURL = vi.fn();
    const appendSpy = vi.spyOn(document.body, 'appendChild');

    render(
      <CanvasPreview code={MULTI_PAGE_CODE} title="Portfolio Site" onClose={() => {}} isFullScreen={false} onToggleFullScreen={() => {}} />
    );

    const downloadBtn = screen.getByTitle(/Download/i);
    fireEvent.click(downloadBtn);

    const anchor = appendSpy.mock.calls.map((c) => c[0]).find((el) => el.tagName === 'A' && el.download?.endsWith('.zip'));
    expect(anchor).toBeTruthy();
    expect(anchor.download).toBe('portfolio-site.zip');

    appendSpy.mockRestore();
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  it('downloads single-page creations as a .html file', () => {
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-html');
    URL.revokeObjectURL = vi.fn();
    const appendSpy = vi.spyOn(document.body, 'appendChild');

    render(
      <CanvasPreview code="<!DOCTYPE html><html><body><h1>Single</h1></body></html>" title="Calculator App" onClose={() => {}} isFullScreen={false} onToggleFullScreen={() => {}} />
    );

    const downloadBtn = screen.getByTitle('Download .html file');
    fireEvent.click(downloadBtn);

    const anchor = appendSpy.mock.calls.map((c) => c[0]).find((el) => el.tagName === 'A' && el.download?.endsWith('.html'));
    expect(anchor).toBeTruthy();
    expect(anchor.download).toBe('calculator-app.html');

    appendSpy.mockRestore();
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
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

  it('fetch-swaps the document on a published sub-page', async () => {
    const fn = routerFn();
    const pageDoc = '<!DOCTYPE html><html><body><h1>Fetched About</h1></body></html>';
    // Top-level context: self === top, so the router falls through to fetch.
    const topWindow = { top: true };
    const fakeWindow = {
      self: topWindow,
      top: topWindow,
      parent: { postMessage: () => {} },
      location: { pathname: '/test-123/about.html' }
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
    expect(fetchStub).toHaveBeenCalledWith('/test-123/about.html');
    expect(writeCalls.join('')).toContain('<h1>Fetched About</h1>');
    globalThis.fetch = originalFetch;
    document.body.innerHTML = '';
  });

  it('resolves sub-pages from the bare published home page against the slug directory', async () => {
    const fn = routerFn();
    const pageDoc = '<!DOCTYPE html><html><body><h1>Fetched About</h1></body></html>';
    // The home page is served at the bare /<slug> path (no trailing slash):
    // a relative "about.html" must fetch /<slug>/about.html, never the root.
    const topWindow = { top: true };
    const fakeWindow = {
      self: topWindow,
      top: topWindow,
      parent: { postMessage: () => {} },
      location: { pathname: '/test-123' }
    };
    fn.call(fakeWindow, fakeWindow, document);

    const fetchStub = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(pageDoc) }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchStub;

    document.body.innerHTML = '<a href="about.html">About</a>';
    document.open = () => {};
    document.write = () => {};
    document.close = () => {};
    const anchor = document.querySelector('a');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, target: anchor });
    anchor.dispatchEvent(click);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(click.defaultPrevented).toBe(true);
    expect(fetchStub).toHaveBeenCalledWith('/test-123/about.html');
    globalThis.fetch = originalFetch;
    document.body.innerHTML = '';
  });

  it('resolves page fetches from a trailing-slash home URL against the slug directory', async () => {
    const fn = routerFn();
    const pageDoc = '<!DOCTYPE html><html><body><h1>Fetched About</h1></body></html>';
    const topWindow = { top: true };
    const fakeWindow = {
      self: topWindow,
      top: topWindow,
      parent: { postMessage: () => {} },
      location: { pathname: '/test-123/' }
    };
    fn.call(fakeWindow, fakeWindow, document);

    const fetchStub = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(pageDoc) }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchStub;

    document.body.innerHTML = '<a href="pages/about.html">About</a>';
    document.open = () => {};
    document.write = () => {};
    document.close = () => {};
    const anchor = document.querySelector('a');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, target: anchor });
    anchor.dispatchEvent(click);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(click.defaultPrevented).toBe(true);
    expect(fetchStub).toHaveBeenCalledWith('/test-123/about.html');
    globalThis.fetch = originalFetch;
    document.body.innerHTML = '';
  });
});
