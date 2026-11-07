import { describe, it, expect } from 'vitest';
import worker, { buildAndroidAssetLinks } from '../worker/index.js';

/**
 * Android App Links verification.
 *
 * `https://corez.pro/.well-known/assetlinks.json` must list the certificate
 * that actually signed the installed app. A debug-signed test build and a
 * future release keystore therefore get different fingerprints, supplied via
 * the deployment environment rather than hard-coded here.
 */
describe('Android App Links document', () => {
  it('returns an empty list until fingerprints are configured', () => {
    expect(buildAndroidAssetLinks({})).toEqual([]);
    expect(buildAndroidAssetLinks({ ANDROID_APP_SHA256: '  ,  ' })).toEqual([]);
  });

  it('normalises and splits configured fingerprints', () => {
    const links = buildAndroidAssetLinks({
      ANDROID_APP_SHA256: 'aa:bb:cc, dd:ee:ff',
      ANDROID_APP_PACKAGE: 'pro.corez.app',
    });
    expect(links).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'pro.corez.app',
          sha256_cert_fingerprints: ['AA:BB:CC', 'DD:EE:FF'],
        },
      },
    ]);
  });

  it('serves the verification document as JSON', async () => {
    const response = await worker.fetch(
      new Request('https://corez.pro/.well-known/assetlinks.json'),
      { ANDROID_APP_SHA256: 'aa:bb:cc' },
      {},
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = await response.json();
    expect(body[0].target.package_name).toBe('pro.corez.app');
    expect(body[0].target.sha256_cert_fingerprints).toEqual(['AA:BB:CC']);
  });

  it('serves an empty array when the deployment has no fingerprint', async () => {
    const response = await worker.fetch(
      new Request('https://corez.pro/.well-known/assetlinks.json'),
      {},
      {},
    );
    expect(await response.json()).toEqual([]);
  });
});
