/**
 * Contract tests for the Workers AI ranking models: POST /api/rerank
 * (@cf/baai/bge-reranker-base) and POST /api/embed (@cf/baai/bge-m3), plus
 * the free Workers AI ranking path in /api/search (rerank first, embedding
 * cosine similarity as fallback, before any keyed provider).
 */
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const RERANK_MODEL = '@cf/baai/bge-reranker-base';
const EMBED_MODEL = '@cf/baai/bge-m3';

function post(path, body, env = {}, method = 'POST') {
  return worker.fetch(
    new Request(`https://corez.test${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  );
}

function mockAI(handler) {
  return { run: handler };
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
  // ---------- /api/rerank ----------
  const rerankGet = await worker.fetch(new Request('https://corez.test/api/rerank'), {});
  assert.equal(rerankGet.status, 405);

  assert.equal((await post('/api/rerank', {})).status, 400);
  assert.equal((await post('/api/rerank', { query: '   ', contexts: ['x'] })).status, 400);
  assert.equal((await post('/api/rerank', { query: 'x'.repeat(1025), contexts: ['x'] })).status, 400);
  assert.equal((await post('/api/rerank', { query: 'q' })).status, 400);
  assert.equal((await post('/api/rerank', { query: 'q', contexts: [] })).status, 400);
  assert.equal((await post('/api/rerank', { query: 'q', contexts: Array.from({ length: 51 }, () => 'x') })).status, 400);
  assert.equal((await post('/api/rerank', { query: 'q', contexts: ['x', ''] })).status, 400);
  assert.equal((await post('/api/rerank', { query: 'q', contexts: ['x'.repeat(2001)] })).status, 400);
  assert.equal((await post('/api/rerank', { query: 'q', contexts: [42] })).status, 400);

  // Honest 503 when no AI binding is configured.
  const noBinding = await post('/api/rerank', { query: 'q', contexts: ['a', 'b'] });
  assert.equal(noBinding.status, 503);
  assert.match((await noBinding.json()).error, /AI binding/i);

  // Success: scores pass through with the original context index.
  let rerankCalls = 0;
  const ai = mockAI(async (model, inputs) => {
    rerankCalls += 1;
    assert.equal(model, RERANK_MODEL);
    assert.equal(inputs.query, 'Which one is cooler?');
    assert.deepEqual(inputs.contexts, [{ text: 'a cyberpunk lizard' }, { text: 'a cyberpunk cat' }]);
    assert.equal(inputs.top_k, 1);
    // The real provider shape: { response: [{ id, score }] }.
    return { response: [{ id: 1, score: 2.4 }, { id: 0, score: 1.1 }] };
  });
  const rerankOk = await post('/api/rerank', {
    query: 'Which one is cooler?',
    contexts: ['a cyberpunk lizard', 'a cyberpunk cat'],
    top_k: 1
  }, { AI: ai });
  assert.equal(rerankOk.status, 200);
  assert.equal(rerankCalls, 1);
  const rerankData = await rerankOk.json();
  assert.equal(rerankData.model, RERANK_MODEL);
  assert.deepEqual(rerankData.results, [{ index: 1, score: 2.4 }, { index: 0, score: 1.1 }]);

  // The legacy { results: [{ index, score }] } shape is tolerated too.
  ai.run = async () => ({ results: [{ index: 0, score: 1 }] });
  assert.equal((await post('/api/rerank', { query: 'q', contexts: ['x'] }, { AI: ai })).status, 200);

  // top_k is clamped into [1, 50].
  ai.run = async (model, inputs) => {
    assert.equal(inputs.top_k, 50);
    return { response: [{ id: 0, score: 1 }] };
  };
  assert.equal((await post('/api/rerank', { query: 'q', contexts: ['x'], top_k: 999 }, { AI: ai })).status, 200);
  ai.run = async (model, inputs) => {
    assert.equal(inputs.top_k, 1);
    return { response: [{ id: 0, score: 1 }] };
  };
  assert.equal((await post('/api/rerank', { query: 'q', contexts: ['x'], top_k: -5 }, { AI: ai })).status, 200);

  // Provider failures and empty score lists are honest 502s.
  const failing = await post('/api/rerank', { query: 'q', contexts: ['x'] }, { AI: mockAI(async () => { throw new Error('boom'); }) });
  assert.equal(failing.status, 502);
  const emptyScores = await post('/api/rerank', { query: 'q', contexts: ['x'] }, { AI: mockAI(async () => ({ response: [] })) });
  assert.equal(emptyScores.status, 502);

  // ---------- /api/embed ----------
  const embedGet = await worker.fetch(new Request('https://corez.test/api/embed'), {});
  assert.equal(embedGet.status, 405);

  assert.equal((await post('/api/embed', {})).status, 400);
  assert.equal((await post('/api/embed', { text: '   ' })).status, 400);
  assert.equal((await post('/api/embed', { text: [] })).status, 400);
  assert.equal((await post('/api/embed', { text: Array.from({ length: 65 }, () => 'x') })).status, 400);
  assert.equal((await post('/api/embed', { text: 'x'.repeat(8001) })).status, 400);
  assert.equal((await post('/api/embed', { text: [42] })).status, 400);

  const embedNoBinding = await post('/api/embed', { text: 'hello' });
  assert.equal(embedNoBinding.status, 503);
  assert.match((await embedNoBinding.json()).error, /AI binding/i);

  // Single string input -> single vector.
  let embedCalls = 0;
  const embedAi = mockAI(async (model, inputs) => {
    embedCalls += 1;
    assert.equal(model, EMBED_MODEL);
    assert.equal(inputs.text, 'hello world');
    return { shape: [1, 3], data: [[0.1, 0.2, 0.3]] };
  });
  const embedOk = await post('/api/embed', { text: 'hello world' }, { AI: embedAi });
  assert.equal(embedOk.status, 200);
  assert.equal(embedCalls, 1);
  const embedData = await embedOk.json();
  assert.equal(embedData.model, EMBED_MODEL);
  assert.deepEqual(embedData.shape, [1, 3]);
  assert.deepEqual(embedData.data, [[0.1, 0.2, 0.3]]);

  // Array input -> batch vectors aligned with the input order.
  embedAi.run = async (model, inputs) => {
    assert.deepEqual(inputs.text, ['a', 'b', 'c']);
    return { shape: [3, 2], data: [[1, 0], [0, 1], [1, 1]] };
  };
  const embedBatch = await post('/api/embed', { text: ['a', 'b', 'c'] }, { AI: embedAi });
  assert.equal(embedBatch.status, 200);
  assert.deepEqual((await embedBatch.json()).data, [[1, 0], [0, 1], [1, 1]]);

  // Provider failures and wrong vector counts are honest 502s.
  const embedFail = await post('/api/embed', { text: 'x' }, { AI: mockAI(async () => { throw new Error('boom'); }) });
  assert.equal(embedFail.status, 502);
  const embedMismatch = await post('/api/embed', { text: ['x', 'y'] }, { AI: mockAI(async () => ({ data: [[1]] })) });
  assert.equal(embedMismatch.status, 502);

  // ---------- /api/search uses the free Workers AI ranking first ----------
  let rankingModel = null;
  const searchAi = mockAI(async (model, inputs) => {
    rankingModel = model;
    assert.equal(model, RERANK_MODEL);
    assert.equal(inputs.query, 'red turtles');
    assert.ok(Array.isArray(inputs.contexts) && inputs.contexts.length === 2);
    assert.equal(typeof inputs.contexts[0].text, 'string');
    // Rerank input stays compact (<=160 chars per doc) so the whole result
    // list fits the ~512-token input window of bge-reranker-base.
    assert.ok(inputs.contexts.every((entry) => entry.text.length <= 160));
    // Reverse scores: Beta is more relevant. Real provider shape.
    return { response: [{ id: 1, score: 3.0 }, { id: 0, score: 0.5 }] };
  });
  const searchResponse = await post('/api/search', { query: 'red turtles' }, {
    AI: searchAi,
    __SEARCH_FETCH: wikipediaResults(['Alpha', 'Beta'])
  });
  assert.equal(searchResponse.status, 200);
  assert.equal(rankingModel, RERANK_MODEL);
  const searchData = await searchResponse.json();
  assert.equal(searchData.meta.rerank, 'rerank');
  assert.equal(searchData.meta.rerankProvider, 'workers-ai');
  assert.equal(searchData.results[0].title, 'Beta');
  assert.equal(searchData.results[1].title, 'Alpha');

  // Rerank returning garbage falls back to bge-m3 embedding similarity.
  const embedSearchAi = mockAI(async (model, inputs) => {
    if (model === RERANK_MODEL) return { response: [] }; // partial -> failure
    assert.equal(model, EMBED_MODEL);
    assert.deepEqual(inputs.text, ['red turtles', 'Alpha. Alpha snippet.', 'Beta. Beta snippet.']);
    return {
      shape: [3, 3],
      data: [
        [1, 0, 0], // query
        [0, 1, 0], // Alpha (low similarity)
        [1, 0, 0]  // Beta (high similarity)
      ]
    };
  });
  const embedSearchResponse = await post('/api/search', { query: 'red turtles' }, {
    AI: embedSearchAi,
    __SEARCH_FETCH: wikipediaResults(['Alpha', 'Beta'])
  });
  assert.equal(embedSearchResponse.status, 200);
  const embedSearchData = await embedSearchResponse.json();
  assert.equal(embedSearchData.meta.rerank, 'embeddings');
  assert.equal(embedSearchData.meta.rerankProvider, 'workers-ai');
  assert.equal(embedSearchData.results[0].title, 'Beta');

  // WORKERS_AI_RERANK_DISABLED / WORKERS_AI_EMBED_DISABLED skip the binding.
  let aiCalled = false;
  const disabledResponse = await post('/api/search', { query: 'red turtles' }, {
    AI: mockAI(async () => { aiCalled = true; return { results: [] }; }),
    WORKERS_AI_RERANK_DISABLED: 'true',
    WORKERS_AI_EMBED_DISABLED: 'true',
    __SEARCH_FETCH: wikipediaResults(['Alpha', 'Beta'])
  });
  assert.equal(disabledResponse.status, 200);
  assert.equal(aiCalled, false, 'disabled Workers AI ranking must never be called');
  assert.equal((await disabledResponse.json()).meta.rerank, null);

  // A failing Workers AI binding falls through to the keyed providers.
  const originalFetch4 = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      if (String(url) === 'https://opencode.ai/zen/go/v1/rerank') {
        const body = JSON.parse(init.body);
        assert.equal(body.model, 'voyageai/rerank-2.5');
        const n = body.documents.length;
        return Response.json({
          results: Array.from({ length: n }, (_, i) => ({ index: n - 1 - i, relevance_score: n - i }))
        });
      }
      const u = new URL(url);
      if (u.hostname === 'en.wikipedia.org') {
        return Response.json({
          query: { search: [{ title: 'Alpha', snippet: 'A.', wordcount: 5 }, { title: 'Beta', snippet: 'B.', wordcount: 5 }] }
        });
      }
      return Response.json({ AbstractText: '', RelatedTopics: [] });
    };
    const fallbackResponse = await post('/api/search', { query: 'red turtles' }, {
      AI: mockAI(async () => { throw new Error('binding down'); }),
      OPENCODE_GO_API_KEY: 'sk-opencode',
      __SEARCH_FETCH: wikipediaResults(['Alpha', 'Beta'])
    });
    assert.equal(fallbackResponse.status, 200);
    const fallbackData = await fallbackResponse.json();
    assert.equal(fallbackData.meta.rerank, 'rerank');
    assert.equal(fallbackData.meta.rerankProvider, 'opencode');
  } finally {
    globalThis.fetch = originalFetch4;
  }

  console.log('Workers AI rerank + embed contract passed.');
}

await run();
