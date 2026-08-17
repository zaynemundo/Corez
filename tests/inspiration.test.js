import { describe, it, expect, vi } from 'vitest';
import { fetchAwwwardsInspiration } from '../src/services/inspirationService.js';
import { improveCodingPrompt } from '../src/services/aiService.js';
import { detectInspirationCategory, fetchAwwwardsInspiration as workerFetch } from '../worker/inspiration.js';

describe('Awwwards inspiration client', () => {
  it('returns normalized sites on success', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      kind: 'inspiration',
      query: 'portfolio',
      category: 'portfolio',
      sites: [{ title: 'David Spaeth', url: 'https://www.awwwards.com/sites/david-spaeth' }],
      meta: { source: 'Awwwards' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAwwwardsInspiration('design a portfolio website');
    expect(result.sites[0]).toEqual({
      title: 'David Spaeth',
      url: 'https://www.awwwards.com/sites/david-spaeth',
      source: 'Awwwards'
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/inspiration', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ query: 'design a portfolio website' })
    }));
    vi.unstubAllGlobals();
  });

  it('returns empty sites on worker failure (never blocks, never fabricates)', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'down' }, { status: 502 }));
    const result = await fetchAwwwardsInspiration('portfolio');
    expect(result.sites).toEqual([]);
    expect(result.category).toBe('websites');
    vi.unstubAllGlobals();
  });

  it('propagates abort', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', async (_url, _options) => {
      controller.abort();
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    await expect(fetchAwwwardsInspiration('portfolio', controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    vi.unstubAllGlobals();
  });

  it('rejects empty prompts gracefully', async () => {
    const result = await fetchAwwwardsInspiration('   ');
    expect(result.sites).toEqual([]);
  });
});

describe('improveCodingPrompt with live inspiration', () => {
  it('appends real Awwwards references to the app design spec', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      kind: 'inspiration',
      category: 'portfolio',
      sites: [{ title: 'Acid Crunch', url: 'https://www.awwwards.com/sites/acid-crunch' }]
    }));
    vi.stubGlobal('fetch', fetchMock);

    const prompt = await improveCodingPrompt('Build me a portfolio website', { type: 'app' });
    expect(prompt).toContain('Awwwards Visual Design Principles');
    expect(prompt).toContain('Live Awwwards Design Inspiration');
    expect(prompt).toContain('https://www.awwwards.com/sites/acid-crunch');
    vi.unstubAllGlobals();
  });

  it('falls back to static design tokens when inspiration is unavailable', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'no' }, { status: 503 }));
    const prompt = await improveCodingPrompt('Build me a portfolio website', { type: 'app' });
    expect(prompt).toContain('Awwwards Visual Design Principles');
    expect(prompt).not.toContain('Live Awwwards Design Inspiration');
    vi.unstubAllGlobals();
  });
});

describe('Worker inspiration parsing', () => {
  it('detects categories from keywords', () => {
    expect(detectInspirationCategory('Build me an e-commerce store with a cart').key).toBe('e-commerce');
    expect(detectInspirationCategory('A restaurant website').key).toBe('food-drink');
    expect(detectInspirationCategory('anything else').key).toBe('websites');
  });

  it('extracts and normalizes real site slugs from HTML', async () => {
    const html = '<html><body><a href="/sites/acid-crunch">x</a><a href="/sites/paul-kalkbrenner">y</a></body></html>';
    const result = await workerFetch('portfolio', async () => new Response(html, { status: 200 }));
    expect(result.sites[0].title).toBe('Acid Crunch');
    expect(result.sites[0].url).toBe('https://www.awwwards.com/sites/acid-crunch');
    expect(result.sites[1].title).toBe('Paul Kalkbrenner');
    expect(result.category).toBe('portfolio');
  });

  it('visits site pages to extract liveUrl, description, screenshotUrl, videoUrls, and tags when available', async () => {
    const categoryHtml = '<html><body><a href="/sites/partake-foods">Partake</a></body></html>';
    const siteHtml = `<!DOCTYPE html><html>
      <head>
        <meta name="description" content="Custom storefront &amp; brand experience" />
        <meta property="og:image" content="https://assets.awwwards.com/awards/submissions/preview.png" />
      </head>
      <body>
        <a href="https://partakefoods.com" class="visit-site">Visit Site</a>
        <video src="https://assets.awwwards.com/awards/element/animation.mp4"></video>
        <a href="/websites/animation/">Animation</a>
        <a href="/websites/colorful/">Colorful</a>
      </body>
    </html>`;

    const result = await workerFetch('food-drink', async (url) => {
      if (url.includes('/websites/')) return new Response(categoryHtml, { status: 200 });
      if (url.includes('/sites/')) return new Response(siteHtml, { status: 200 });
      return new Response('not found', { status: 404 });
    });

    expect(result.sites[0]).toMatchObject({
      title: 'Partake Foods',
      url: 'https://www.awwwards.com/sites/partake-foods',
      liveUrl: 'https://partakefoods.com',
      description: 'Custom storefront & brand experience',
      screenshotUrl: 'https://assets.awwwards.com/awards/submissions/preview.png',
      videoUrls: ['https://assets.awwwards.com/awards/element/animation.mp4'],
      tags: ['Animation', 'Colorful']
    });
  });

  it('returns empty sites on fetch failure — never fabricated', async () => {
    const result = await workerFetch('portfolio', async () => { throw new Error('down'); });
    expect(result.sites).toEqual([]);
  });
});
