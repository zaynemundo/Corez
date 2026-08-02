import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { detectInspirationCategory, fetchAwwwardsInspiration } from '../worker/inspiration.js';

function post(body, env = {}) {
  return worker.fetch(
    new Request('https://corez.test/api/inspiration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  );
}

function awwwardsHtml(slugs) {
  const anchors = slugs
    .map((slug) => `<a href="/sites/${slug}" class="site">${slug}</a>`)
    .join('\n');
  return `<!DOCTYPE html><html><body><div class="list">${anchors}</div></body></html>`;
}

async function run() {
  // Method not allowed for GET.
  const methodResponse = await worker.fetch(new Request('https://corez.test/api/inspiration'), {});
  assert.equal(methodResponse.status, 405);

  // Missing / empty / oversized queries rejected.
  assert.equal((await post({ query: '' })).status, 400);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ query: 'x'.repeat(301) })).status, 400);

  // Category detection: portfolio keywords resolve to the portfolio category.
  assert.equal(detectInspirationCategory('Build me a portfolio site').key, 'portfolio');
  assert.equal(detectInspirationCategory('An e-commerce store with a cart').key, 'e-commerce');
  assert.equal(detectInspirationCategory('A restaurant website').key, 'food-drink');
  assert.equal(detectInspirationCategory('Unknown query here').key, 'websites');

  // Real site slugs are extracted and normalized from server-rendered HTML.
  const slugHtml = awwwardsHtml(['acid-crunch', 'paul-kalkbrenner', 'warm-fuzzy']);
  const parsed = await fetchAwwwardsInspiration('portfolio site', async () => new Response(slugHtml, { status: 200 }));
  assert.equal(parsed.sites.length, 3);
  assert.equal(parsed.sites[0].title, 'Acid Crunch');
  assert.equal(parsed.sites[0].url, 'https://www.awwwards.com/sites/acid-crunch');
  assert.equal(parsed.category, 'portfolio');
  assert.equal(parsed.source, 'Awwwards');

  // Duplicate slugs collapse; results are bounded.
  const dupHtml = awwwardsHtml(['same-site', 'same-site', 'other-site']);
  const deduped = await fetchAwwwardsInspiration('any', async () => new Response(dupHtml, { status: 200 }));
  assert.equal(deduped.sites.length, 2);

  // Fetch failure -> honest empty list, never fabricated sites.
  const failing = await fetchAwwwardsInspiration('portfolio', async () => { throw new Error('network down'); });
  assert.equal(failing.sites.length, 0);
  const nonOk = await fetchAwwwardsInspiration('portfolio', async () => new Response('blocked', { status: 403 }));
  assert.equal(nonOk.sites.length, 0);

  // Endpoint: 200 with normalized payload.
  const response = await post(
    { query: 'design a portfolio website' },
    { __INSPIRATION_FETCH: async () => new Response(awwwardsHtml(['david-spaeth', 'forms']), { status: 200 }) }
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.kind, 'inspiration');
  assert.equal(data.category, 'portfolio');
  assert.equal(data.sites[0].url, 'https://www.awwwards.com/sites/david-spaeth');
  assert.equal(data.sites[0].title, 'David Spaeth');
  assert.ok(typeof data.meta.servedAt === 'string');

  // Endpoint: HTML with no slugs -> honest empty sites (200, no fabrication).
  const emptyResponse = await post(
    { query: 'portfolio' },
    { __INSPIRATION_FETCH: async () => new Response('<html><body>no data</body></html>', { status: 200 }) }
  );
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual((await emptyResponse.json()).sites, []);

  // Endpoint: fetch failure -> 200 with empty sites (inspiration is best-effort).
  const failResponse = await post(
    { query: 'portfolio' },
    { __INSPIRATION_FETCH: async () => { throw new Error('down'); } }
  );
  assert.equal(failResponse.status, 200);
  assert.deepEqual((await failResponse.json()).sites, []);

  console.log('Awwwards inspiration contract passed.');
}

await run();
