import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const launch = vi.fn();
vi.mock('@cloudflare/puppeteer', () => ({
  default: { launch: (...args) => launch(...args) },
}));

import {
  needsRuntimeCheck,
  prepareRuntimeHtml,
  runRuntimeVerification,
} from '../worker/runtimeVerifier.js';

function makeBrowser() {
  const handlers = new Map();
  const page = {
    on: vi.fn((event, handler) => handlers.set(event, handler)),
    setRequestInterception: vi.fn(async () => {}),
    setViewport: vi.fn(async () => {}),
    setContent: vi.fn(async () => {}),
    evaluate: vi.fn(async () => ({
      three: 'object',
      webgl: true,
      canvasCount: 1,
      canvasVisible: true,
      bodyText: 'EVENT HORIZON',
      title: 'Event Horizon',
      hasFallbackText: false,
    })),
    screenshot: vi.fn(async () => 'ZmFrZQ=='),
  };
  const browser = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => {}),
  };
  return { browser, page, handlers };
}

const HTML = `<!DOCTYPE html><html><head></head><body>
<canvas id="scene"></canvas>
<script>const scene = new THREE.Scene();</script>
</body></html>`;

describe('runtime verifier', () => {
  beforeEach(() => {
    launch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects executable pages and injects the Three.js runtime', () => {
    expect(needsRuntimeCheck(HTML)).toBe(true);
    expect(prepareRuntimeHtml(HTML)).toContain('three.min.js');
    expect(needsRuntimeCheck('<h1>Static</h1>')).toBe(false);
  });

  it('passes a page with a loaded THREE global and WebGL', async () => {
    const { browser } = makeBrowser();
    launch.mockResolvedValue(browser);

    const result = await runRuntimeVerification({ BROWSER: {} }, HTML);
    expect(result.checked).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(browser.close).toHaveBeenCalled();
  });

  it('reports an uncaught page error as a repair failure', async () => {
    const { browser, page, handlers } = makeBrowser();
    page.setContent.mockImplementation(async () => {
      handlers.get('pageerror')?.(new Error('Uncaught ReferenceError: THREE'));
    });
    launch.mockResolvedValue(browser);

    const result = await runRuntimeVerification({ BROWSER: {} }, HTML);
    expect(result.checked).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'runtime-error' }),
      ]),
    );
  });

  it('reports a WebGL fallback even when the page is structurally valid', async () => {
    const { browser, page } = makeBrowser();
    page.evaluate.mockResolvedValue({
      three: 'undefined',
      webgl: false,
      canvasCount: 1,
      canvasVisible: true,
      bodyText: 'WEBGL UNAVAILABLE',
      title: 'Event Horizon',
      hasFallbackText: true,
    });
    launch.mockResolvedValue(browser);

    const result = await runRuntimeVerification({ BROWSER: {} }, HTML);
    expect(result.checked).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining([
        'runtime-three-missing',
        'runtime-webgl-unavailable',
        'runtime-fallback-active',
      ]),
    );
  });

  it('skips cleanly when Browser Run is not configured', async () => {
    const result = await runRuntimeVerification({}, HTML);
    expect(result.checked).toBe(false);
    expect(result.skipped).toBe(true);
    expect(launch).not.toHaveBeenCalled();
  });
});
