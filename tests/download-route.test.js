import { describe, it, expect } from 'vitest';
import worker from '../worker/index.js';

function fakeBucket({ apk = 'apk-bytes', size = 9, range = null } = {}) {
  return {
    head: async () => (apk === null ? null : { size, key: 'downloads/corez.apk' }),
    get: async () => {
      if (apk === null) return null;
      return {
        body: apk,
        size,
        httpEtag: '"etag-1"',
        range,
      };
    },
  };
}

function fakeMetadataBucket(payload) {
  return {
    head: async () => ({ size: 100 }),
    get: async (key) =>
      key === 'downloads/latest.json' && payload
        ? { text: async () => JSON.stringify(payload) }
        : null,
  };
}

describe('Android download route', () => {
  it('serves the landing page with a download link and install steps', async () => {
    const response = await worker.fetch(
      new Request('https://corez.pro/download'),
      { ASSET_BUCKET: fakeBucket({ size: 100 * 1024 * 1024 }) },
      {},
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('CoreZ for Android');
    expect(html).toContain('href="/download/corez.apk"');
    expect(html).toContain('Install unknown apps');
    expect(html).toContain('100.0 MB');
  });

  it('streams the APK with Android package headers', async () => {
    const response = await worker.fetch(
      new Request('https://corez.pro/download/corez.apk'),
      { ASSET_BUCKET: fakeBucket() },
      {},
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.android.package-archive',
    );
    expect(response.headers.get('content-disposition')).toContain(
      'attachment; filename="CoreZ-0.1.1.apk"',
    );
    expect(response.headers.get('content-length')).toBe('9');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(await response.text()).toBe('apk-bytes');
  });

  it('supports range requests for resumable downloads', async () => {
    const response = await worker.fetch(
      new Request('https://corez.pro/download/corez.apk', {
        headers: { range: 'bytes=2-4' },
      }),
      {
        ASSET_BUCKET: fakeBucket({
          apk: 'pkg',
          size: 10,
          range: { offset: 2, length: 3 },
        }),
      },
      {},
    );
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(response.headers.get('content-length')).toBe('3');
  });

  it('answers HEAD without a body and 405 for other methods', async () => {
    const head = await worker.fetch(
      new Request('https://corez.pro/download/corez.apk', { method: 'HEAD' }),
      { ASSET_BUCKET: fakeBucket() },
      {},
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');

    const post = await worker.fetch(
      new Request('https://corez.pro/download', { method: 'POST' }),
      { ASSET_BUCKET: fakeBucket() },
      {},
    );
    expect(post.status).toBe(405);
  });

  it('publishes the latest version metadata for the update gate', async () => {
    const response = await worker.fetch(
      new Request('https://corez.pro/download/latest.json'),
      {
        ASSET_BUCKET: fakeMetadataBucket({
          versionName: '0.1.1',
          versionCode: 2,
          apkUrl: 'https://corez.pro/download/corez.apk',
          pageUrl: 'https://corez.pro/download',
          notes: 'Theme artwork and markdown fixes.',
        }),
      },
      {},
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = await response.json();
    expect(body.versionCode).toBe(2);
    expect(body.versionName).toBe('0.1.1');
    expect(body.pageUrl).toBe('https://corez.pro/download');
  });

  it('returns a non-triggering fallback when no metadata exists', async () => {
    const response = await worker.fetch(
      new Request('https://corez.pro/download/latest.json'),
      { ASSET_BUCKET: fakeMetadataBucket(null) },
      {},
    );
    expect(response.status).toBe(200);
    expect((await response.json()).versionCode).toBe(0);
  });

  it('fails honestly when the build is not uploaded', async () => {
    const response = await worker.fetch(
      new Request('https://corez.pro/download/corez.apk'),
      { ASSET_BUCKET: fakeBucket({ apk: null }) },
      {},
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('not available');
  });
});
