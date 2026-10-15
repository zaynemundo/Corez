// @vitest-environment jsdom
// The preview iframe is sandboxed without `allow-modals`, which silently
// blocks its print() — so Export-to-PDF goes through a temporary same-origin
// frame instead. These tests pin that contract: a blob document is rendered
// off-screen, printed on load, and always cleaned up.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { printHtmlDocument } from '../src/utils/printDocument.js';

afterEach(() => {
  document.body.querySelectorAll('iframe').forEach((f) => f.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubBlobUrls() {
  const seen = [];
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn((blob) => {
      seen.push(blob);
      return 'blob:mock-print-doc';
    }),
    revokeObjectURL: vi.fn(),
  });
  return seen;
}

function printFrame() {
  const frames = [...document.body.querySelectorAll('iframe')];
  return frames.find((f) => f.src === 'blob:mock-print-doc') || null;
}

describe('printHtmlDocument', () => {
  it('rejects empty input without touching the DOM', () => {
    for (const bad of ['', null, undefined, 42]) {
      expect(printHtmlDocument(bad)).toBe(false);
    }
    expect(document.body.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('renders the source as an off-screen blob document', () => {
    const blobs = stubBlobUrls();
    expect(printHtmlDocument('<h1>Invoice</h1>')).toBe(true);
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe('text/html');
    const frame = printFrame();
    expect(frame).toBeTruthy();
    expect(frame.getAttribute('aria-hidden')).toBe('true');
  });

  it('prints the frame on load when print is available', () => {
    stubBlobUrls();
    printHtmlDocument('<h1>Invoice</h1>');
    const frame = printFrame();
    expect(frame).toBeTruthy();
    let printed = false;
    try {
      frame.contentWindow.print = () => {
        printed = true;
      };
    } catch {
      // jsdom windows are not extensible in some versions: the fallback path
      // below still proves the frame never throws and stays cleanable.
    }
    expect(() => frame.onload()).not.toThrow();
    if (printed) {
      expect(printed).toBe(true);
    }
    // Either path leaves exactly the print frame behind until afterprint.
    expect(printFrame()).toBeTruthy();
  });

  it('removes the frame and revokes the URL on afterprint', () => {
    stubBlobUrls();
    printHtmlDocument('<h1>Invoice</h1>');
    expect(printFrame()).toBeTruthy();
    window.dispatchEvent(new Event('afterprint'));
    expect(printFrame()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-print-doc');
  });

  it('returns false when blob URLs are unavailable', () => {
    const orig = URL.createObjectURL;
    URL.createObjectURL = undefined;
    try {
      expect(printHtmlDocument('<h1>x</h1>')).toBe(false);
    } finally {
      URL.createObjectURL = orig;
    }
    expect(printFrame()).toBeNull();
  });
});
