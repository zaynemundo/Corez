import assert from 'node:assert/strict';
import worker from '../worker/index.js';

function post(body, env = {}) {
  return worker.fetch(
    new Request('https://corez.test/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  );
}

function wikipediaResults(titles) {
  return async (url) => {
    const u = new URL(url);
    if (u.hostname === 'en.wikipedia.org') {
      return Response.json({
        query: { search: titles.map((title) => ({ title, snippet: `${title} snippet.`, wordcount: 5 })) }
      });
    }
    return Response.json({ AbstractText: '', RelatedTopics: [] });
  };
}

async function run() {
  // Method not allowed for GET.
  const methodResponse = await worker.fetch(new Request('https://corez.test/api/search'), {});
  assert.equal(methodResponse.status, 405);

  // Empty / missing / oversized queries are rejected.
  assert.equal((await post({ query: '' })).status, 400);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ query: 'x'.repeat(201) })).status, 400);
  assert.equal((await post('not json')).status, 400);

  // Keyless path: Wikipedia results are normalized with real URLs.
  const freeResponse = await post(
    { query: 'web search' },
    { __SEARCH_FETCH: wikipediaResults(['Web Search', 'Search Engine']) }
  );
  assert.equal(freeResponse.status, 200);
  const freeData = await freeResponse.json();
  assert.equal(freeData.kind, 'search');
  assert.ok(freeData.results.length >= 1);
  assert.equal(freeData.results[0].url, 'https://en.wikipedia.org/wiki/Web_Search');
  assert.equal(freeData.results[0].source, 'Wikipedia');
  assert.ok(typeof freeData.results[0].title === 'string' && freeData.results[0].title.length > 0);
  assert.ok(typeof freeData.meta.servedAt === 'string');

  // Both providers run and merge: Wikipedia results plus DuckDuckGo Lite
  // results, deduped by URL.
  const mergedResponse = await post(
    { query: 'red turtles' },
    {
      __SEARCH_FETCH: async (url) => {
        const u = new URL(url);
        if (u.hostname === 'lite.duckduckgo.com') {
          return new Response(
            `<html><body>
              <a rel="nofollow" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://www.thesprucepets.com/red-eared-sliders')}&amp;rut=abc" class='result-link'>Red-Eared Slider Care</a>
              <td class='result-snippet'>They are popular pets.</td>
              <a rel="nofollow" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://en.wikipedia.org/wiki/Red-eared_slider')}&amp;rut=def" class='result-link'>Red-eared slider - Wikipedia</a>
              <td class='result-snippet'>A subspecies of the pond slider.</td>
            </body></html>`,
            { status: 200, headers: { 'Content-Type': 'text/html' } }
          );
        }
        return Response.json({
          query: { search: [{ title: 'Red-eared slider', snippet: 'A terrapin.', wordcount: 5 }] }
        });
      }
    }
  );
  assert.equal(mergedResponse.status, 200);
  const mergedData = await mergedResponse.json();
  assert.ok(Array.isArray(mergedData.results));
  // DuckDuckGo result is present with its real (decoded) URL.
  const ddgResult = mergedData.results.find((r) => r.source === 'DuckDuckGo');
  assert.ok(ddgResult, 'DuckDuckGo results must be merged in');
  assert.equal(ddgResult.url, 'https://www.thesprucepets.com/red-eared-sliders');
  assert.equal(ddgResult.title, 'Red-Eared Slider Care');
  // The Wikipedia page appears in both providers but is deduped by URL.
  const wikiResults = mergedData.results.filter((r) => r.url === 'https://en.wikipedia.org/wiki/Red-eared_slider');
  assert.equal(wikiResults.length, 1);
  assert.ok(mergedData.meta.sources.includes('Wikipedia') && mergedData.meta.sources.includes('DuckDuckGo'));
  assert.ok(mergedData.results.length <= 8);

  // Results are bounded (max 8).
  const manyResponse = await post(
    { query: 'many results' },
    { __SEARCH_FETCH: wikipediaResults(Array.from({ length: 20 }, (_, i) => `Result ${i + 1}`)) }
  );
  assert.equal(manyResponse.status, 200);
  const manyData = await manyResponse.json();
  assert.ok(manyData.results.length <= 12);

  // Every provider returning nothing -> honest 502, never fabricated results.
  const emptyResponse = await post(
    { query: 'zzzzzqqqqq' },
    { __SEARCH_FETCH: async () => Response.json({}) }
  );
  assert.equal(emptyResponse.status, 502);
  const emptyData = await emptyResponse.json();
  assert.match(emptyData.error, /no usable results/i);

  // Provider failures also produce the honest 502.
  const failingResponse = await post(
    { query: 'anything' },
    { __SEARCH_FETCH: async () => { throw new Error('provider offline'); } }
  );
  assert.equal(failingResponse.status, 502);
  assert.match((await failingResponse.json()).error, /no usable results/i);

  // Rerank is best-effort: without an OpenRouter key nothing is sent and the
  // merged order is returned untouched.
  const noKeyResponse = await post(
    { query: 'red turtles' },
    { __SEARCH_FETCH: wikipediaResults(['Alpha', 'Beta']) }
  );
  const noKeyData = await noKeyResponse.json();
  assert.equal(noKeyData.meta.rerank, null);
  assert.equal(noKeyData.results[0].title, 'Alpha');

  // With OPENROUTER_API_KEY the rerank model re-orders by relevance score.
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('/rerank')) {
        const body = JSON.parse(init.body);
        assert.equal(body.model, 'nvidia/llama-nemotron-rerank-vl-1b-v2:free');
        assert.ok(Array.isArray(body.documents) && body.documents.length === 2);
        const n = body.documents.length;
        return Response.json({
          results: Array.from({ length: n }, (_, i) => ({ index: n - 1 - i, relevance_score: n - i }))
        });
      }
      throw new Error(`unexpected ranking URL: ${url}`);
    };
    const rerankResponse = await post(
      { query: 'red turtles' },
      {
        OPENROUTER_API_KEY: 'sk-test',
        __SEARCH_FETCH: wikipediaResults(['Alpha', 'Beta'])
      }
    );
    assert.equal(rerankResponse.status, 200);
    const rerankData = await rerankResponse.json();
    assert.equal(rerankData.meta.rerank, 'rerank');
    // Mock scores reverse the order: Beta scores higher.
    assert.equal(rerankData.results[0].title, 'Beta');
    assert.equal(rerankData.results[1].title, 'Alpha');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // When rerank is unavailable, embedding cosine similarity ranks instead.
  const originalFetch2 = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/rerank')) return new Response('down', { status: 500 });
      if (String(url).includes('/embeddings')) {
        return Response.json({
          data: [
            { index: 0, embedding: [1, 0, 0] }, // query
            { index: 1, embedding: [0, 1, 0] }, // Alpha (low)
            { index: 2, embedding: [1, 0, 0] } // Beta (high)
          ]
        });
      }
      throw new Error(`unexpected ranking URL: ${url}`);
    };
    const embedResponse = await post(
      { query: 'red turtles' },
      {
        OPENROUTER_API_KEY: 'sk-test',
        __SEARCH_FETCH: wikipediaResults(['Alpha', 'Beta'])
      }
    );
    const embedData = await embedResponse.json();
    assert.equal(embedData.meta.rerank, 'embeddings');
    assert.equal(embedData.results[0].title, 'Beta');
  } finally {
    globalThis.fetch = originalFetch2;
  }

  // Both ranking paths failing keeps the merged order — search never breaks.
  const originalFetch3 = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('down', { status: 503 });
    const downResponse = await post(
      { query: 'red turtles' },
      {
        OPENROUTER_API_KEY: 'sk-test',
        __SEARCH_FETCH: wikipediaResults(['Alpha', 'Beta'])
      }
    );
    assert.equal(downResponse.status, 200);
    const downData = await downResponse.json();
    assert.equal(downData.meta.rerank, null);
    assert.equal(downData.results[0].title, 'Alpha');
  } finally {
    globalThis.fetch = originalFetch3;
  }

  // Deep research mode (detail: true) attaches full Wikipedia extracts to the
  // top Wikipedia results.
  const detailResponse = await post(
    { query: 'red turtles', detail: true },
    {
      __SEARCH_FETCH: async (url) => {
        const u = new URL(url);
        if (u.hostname === 'en.wikipedia.org' && u.searchParams.get('prop') === 'extracts') {
          const title = u.searchParams.get('titles');
          return Response.json({
            query: { pages: { 1: { title, extract: `${title} full article text. `.repeat(50) } } }
          });
        }
        if (u.hostname === 'en.wikipedia.org') {
          return Response.json({ query: { search: [{ title: 'Red turtle', snippet: 'S.', wordcount: 5 }] } });
        }
        return Response.json({});
      }
    }
  );
  assert.equal(detailResponse.status, 200);
  const detailData = await detailResponse.json();
  assert.equal(detailData.meta.extracted, true);
  const withExtract = detailData.results.find((r) => r.extract);
  assert.ok(withExtract, 'extracts must be attached in detail mode');
  assert.ok(withExtract.extract.length >= 100);

  // Plain searches never attach extracts.
  const plainResponse = await post(
    { query: 'red turtles' },
    { __SEARCH_FETCH: wikipediaResults(['Alpha']) }
  );
  const plainData = await plainResponse.json();
  assert.equal(plainData.meta.extracted, false);
  assert.ok(plainData.results.every((r) => r.extract === undefined));

  console.log('Web search Worker contract passed.');
}

await run();
