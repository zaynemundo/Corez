import { describe, it, expect } from 'vitest';
import worker from '../worker/index.js';
import { buildAppleAppSiteAssociation } from '../worker/iosLinks.js';

describe('Apple App Site Association', () => {
  it('returns no details until a Team ID is configured', () => {
    expect(buildAppleAppSiteAssociation({})).toEqual({
      applinks: { details: [] },
    });
    expect(
      buildAppleAppSiteAssociation({ APPLE_TEAM_ID: 'not-a-team' }),
    ).toEqual({ applinks: { details: [] } });
  });

  it('builds the universal-link document from the deployment Team ID', () => {
    const doc = buildAppleAppSiteAssociation({
      APPLE_TEAM_ID: 'AB12CD34EF',
      APPLE_BUNDLE_ID: 'pro.corez.app',
    });
    expect(doc.applinks.details).toEqual([
      {
        appID: 'AB12CD34EF.pro.corez.app',
        paths: ['/chat', '/chat/*', '/sites', '/sites/*', '/share/chat/*'],
      },
    ]);
  });

  it('serves the association file as JSON at the Apple path', async () => {
    const response = await worker.fetch(
      new Request(
        'https://corez.pro/.well-known/apple-app-site-association',
      ),
      { APPLE_TEAM_ID: 'AB12CD34EF' },
      {},
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = await response.json();
    expect(body.applinks.details[0].appID).toBe(
      'AB12CD34EF.pro.corez.app',
    );
  });
});
