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

  // DuckDuckGo is tried first: its instant-answer results win over Wikipedia.
  const ddgResponse = await post(
    { query: 'what is a black rose' },
    {
      __SEARCH_FETCH: async (url) => {
        const u = new URL(url);
        if (u.hostname === 'api.duckduckgo.com') {
          return Response.json({
            AbstractText: 'A black rose is a rose with dark petals.',
            AbstractURL: 'https://duckduckgo.com/?q=black+rose',
            Heading: 'Black Rose',
            RelatedTopics: []
          });
        }
        return Response.json({ query: { search: [] } });
      }
    }
  );
  assert.equal(ddgResponse.status, 200);
  const ddgData = await ddgResponse.json();
  assert.equal(ddgData.results[0].source, 'DuckDuckGo');
  assert.equal(ddgData.results[0].url, 'https://duckduckgo.com/?q=black+rose');

  // Results are bounded (max 8).
  const manyResponse = await post(
    { query: 'many results' },
    { __SEARCH_FETCH: wikipediaResults(Array.from({ length: 20 }, (_, i) => `Result ${i + 1}`)) }
  );
  assert.equal(manyResponse.status, 200);
  const manyData = await manyResponse.json();
  assert.ok(manyData.results.length <= 8);

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

  console.log('Web search Worker contract passed.');
}

await run();
