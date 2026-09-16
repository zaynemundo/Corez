import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { detectInspirationCategory, fetchAwwwardsInspiration, fetchAwwwardsInspirationCached, INSPIRATION_CACHE_PREFIX, INSPIRATION_FRESH_MS } from '../worker/inspiration.js';

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

function memoryKv() {
  const store = new Map();
  return {
    store,
    writes: 0,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      this.writes += 1;
      store.set(key, value);
    }
  };
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

  // ---------------------------------------------------------------------
  // KV cache: a fresh entry is served without touching awwwards.com at all,
  // so a repeat app build starts immediately instead of waiting on a scrape.
  // ---------------------------------------------------------------------
  const kv = memoryKv();
  let scrapes = 0;
  const scrapeOnce = async () => {
    scrapes += 1;
    return new Response(awwwardsHtml(['acid-crunch', 'forms']), { status: 200 });
  };

  const cold = await fetchAwwwardsInspirationCached({ INSPIRATION_CACHE: kv }, 'build a portfolio site', scrapeOnce);
  assert.equal(cold.cache, 'refreshed');
  assert.equal(cold.sites.length, 2);
  // The scrape uses one fetch per page plus one per inspected site detail, so
  // the cold run is a bounded burst — not a single request.
  const coldFetches = scrapes;
  assert.ok(coldFetches >= 3, 'cold run must actually scrape');
  assert.equal(kv.writes, 1);
  assert.ok(kv.store.has(`${INSPIRATION_CACHE_PREFIX}portfolio`));

  const warm = await fetchAwwwardsInspirationCached(
    { INSPIRATION_CACHE: kv },
    'a different portfolio prompt',
    async () => { throw new Error('the network must not be touched on a fresh hit'); }
  );
  assert.equal(warm.cache, 'fresh');
  assert.equal(warm.sites.length, 2);
  assert.equal(scrapes, coldFetches);

  // A refresh failure must fall back to the cached copy, not an empty list.
  const staleRaw = JSON.stringify({ sites: [{ title: 'Cached Site', url: 'https://www.awwwards.com/sites/cached-site' }], cachedAt: Date.now() - INSPIRATION_FRESH_MS - 1000, source: 'Awwwards' });
  const staleKv = memoryKv();
  staleKv.store.set(`${INSPIRATION_CACHE_PREFIX}portfolio`, staleRaw);
  const stale = await fetchAwwwardsInspirationCached(
    { INSPIRATION_CACHE: staleKv },
    'portfolio',
    async () => { throw new Error('awwwards is down'); }
  );
  assert.equal(stale.cache, 'stale');
  assert.equal(stale.sites[0].title, 'Cached Site');
  assert.equal(staleKv.writes, 0);

  // A failed scrape with nothing cached must never write a fabricated entry.
  const emptyKv = memoryKv();
  const miss = await fetchAwwwardsInspirationCached(
    { INSPIRATION_CACHE: emptyKv },
    'portfolio',
    async () => { throw new Error('awwwards is down'); }
  );
  assert.equal(miss.cache, 'miss');
  assert.deepEqual(miss.sites, []);
  assert.equal(emptyKv.writes, 0);

  // Endpoint reports the cache status so a hit is observable in production.
  const cachedEndpoint = await post(
    { query: 'design a portfolio website' },
    {
      INSPIRATION_CACHE: kv,
      __INSPIRATION_FETCH: async () => { throw new Error('network must not be used'); }
    }
  );
  const cachedData = await cachedEndpoint.json();
  assert.equal(cachedData.meta.cache, 'fresh');
  assert.equal(cachedData.sites.length, 2);

  // Without the binding the endpoint still works (uncached).
  const uncachedEndpoint = await post(
    { query: 'design a portfolio website' },
    { __INSPIRATION_FETCH: async () => new Response(awwwardsHtml(['forms']), { status: 200 }) }
  );
  const uncachedData = await uncachedEndpoint.json();
  assert.equal(uncachedData.sites.length, 1);
  assert.equal(uncachedData.meta.cache, 'refreshed');

  console.log('Awwwards inspiration contract passed.');
}

await run();
