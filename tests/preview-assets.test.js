import { describe, it, expect, vi } from 'vitest';
import { inlinePreviewAssets } from '../src/utils/previewAssets.js';

function imageResponse(bytes = [137, 80, 78, 71]) {
  return {
    ok: true,
    blob: async () => new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
  };
}

describe('inlinePreviewAssets', () => {
  it('inlines private absolute and relative asset URLs with the session', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push({ url, init });
      return imageResponse();
    });
    const html =
      '<img src="https://corez.pro/api/assets/photo.png">' +
      '<div style="background:url(/api/assets/background.png)"></div>';

    const out = await inlinePreviewAssets(html, {
      fetchImpl,
      baseUrl: 'https://corez.pro',
    });

    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.init.credentials === 'include')).toBe(true);
    expect(out).not.toContain('/api/assets/photo.png');
    expect(out).not.toContain('/api/assets/background.png');
    expect(out.match(/data:image\/png;base64,/g)).toHaveLength(2);
  });

  it('keeps the original URL when the asset is missing or not an image', async () => {
    const missing = vi.fn(async () => ({ ok: false, blob: async () => new Blob([]) }));
    const html = '<img src="/api/assets/missing.png">';
    expect(await inlinePreviewAssets(html, { fetchImpl: missing })).toBe(html);

    const notImage = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['not an image'], { type: 'text/plain' }),
    }));
    expect(await inlinePreviewAssets(html, { fetchImpl: notImage })).toBe(html);
  });

  it('does not fetch when the document has no asset URLs', async () => {
    const fetchImpl = vi.fn();
    const html = '<h1>No assets</h1>';
    expect(await inlinePreviewAssets(html, { fetchImpl })).toBe(html);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
