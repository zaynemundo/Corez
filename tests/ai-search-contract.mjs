/**
 * Contract tests for the AI Search retrieval endpoint: POST /api/ai-search
 * returns indexed content chunks ONLY — it never generates chat text. All
 * conversation generation stays on the OpenCode Go gateway
 * (deepseek-v4-flash) via /api/ai.
 */
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const DEFAULT_INSTANCE = 'corez';

function post(body, env = {}, method = 'POST') {
  return worker.fetch(
    new Request('https://corez.test/api/ai-search', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  );
}

function mockBinding(handlers = {}) {
  const searches = [];
  const binding = {
    get: (name) => ({
      search: async (args) => {
        searches.push({ name, args });
        if (handlers.throwError) throw new Error(handlers.throwError);
        return handlers.response ?? {
          search_query: args.query,
          chunks: [
            { id: 'c1', type: 'text', score: 0.91, text: 'Cloudflare docs chunk one.', item: { key: 'docs/page1.md', timestamp: 123, metadata: {} } },
            { id: 'c2', type: 'text', score: 0.72, text: 'Cloudflare docs chunk two.', item: { key: 'docs/page2.md', timestamp: 124, metadata: {} } }
          ]
        };
      }
    })
  };
  return { binding, searches };
}

async function run() {
  // Method not allowed for GET.
  const methodResponse = await worker.fetch(new Request('https://corez.test/api/ai-search'), {});
  assert.equal(methodResponse.status, 405);

  // Validation: query is required and bounded.
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ query: '   ' })).status, 400);
  assert.equal((await post({ query: 'x'.repeat(2001) })).status, 400);
  assert.equal((await post('not json')).status, 400);

  // Validation: instance name, retrieval type, threshold.
  assert.equal((await post({ query: 'q', instance: '../escape' })).status, 400);
  assert.equal((await post({ query: 'q', instance: 'UPPER_CASE' })).status, 400);
  assert.equal((await post({ query: 'q', retrieval_type: 'fuzzy' })).status, 400);
  assert.equal((await post({ query: 'q', match_threshold: 1.5 })).status, 400);

  // Honest 503 when no AI_SEARCH binding is configured.
  const noBinding = await post({ query: 'how does caching work?' });
  assert.equal(noBinding.status, 503);
  assert.match((await noBinding.json()).error, /AI_SEARCH binding/i);

  // Success: retrieval-only call through the namespace binding, with
  // bge-reranker-base reranking enabled by default.
  const { binding, searches } = mockBinding();
  const ok = await post({
    query: 'how does caching work?',
    max_results: 5,
    match_threshold: 0.5,
    context_expansion: 1
  }, { AI_SEARCH: binding });
  assert.equal(ok.status, 200);
  assert.equal(searches.length, 1);
  assert.equal(searches[0].name, DEFAULT_INSTANCE);
  const call = searches[0].args;
  assert.equal(call.query, 'how does caching work?');
  assert.equal(call.ai_search_options.retrieval.retrieval_type, 'hybrid');
  assert.equal(call.ai_search_options.retrieval.max_num_results, 5);
  assert.equal(call.ai_search_options.retrieval.match_threshold, 0.5);
  assert.equal(call.ai_search_options.retrieval.context_expansion, 1);
  assert.deepEqual(call.ai_search_options.reranking, {
    enabled: true,
    model: '@cf/baai/bge-reranker-base'
  });
  const data = await ok.json();
  assert.equal(data.instance, DEFAULT_INSTANCE);
  assert.equal(data.model, 'ai-search-retrieval');
  assert.equal(data.search_query, 'how does caching work?');
  assert.equal(data.results.length, 2);
  assert.equal(data.results[0].id, 'c1');
  assert.equal(data.results[0].score, 0.91);
  assert.equal(data.results[0].text, 'Cloudflare docs chunk one.');
  assert.equal(data.results[0].item.key, 'docs/page1.md');

  // A custom instance is resolved at runtime through the namespace binding.
  const { binding: binding2, searches: searches2 } = mockBinding();
  const custom = await post({ query: 'q', instance: 'docs' }, { AI_SEARCH: binding2 });
  assert.equal(custom.status, 200);
  assert.equal(searches2[0].name, 'docs');

  // rerank: false disables the reranking step.
  const { binding: binding3, searches: searches3 } = mockBinding();
  await post({ query: 'q', rerank: false }, { AI_SEARCH: binding3 });
  assert.equal(searches3[0].args.ai_search_options.reranking, undefined);

  // Bounds: max_results and context_expansion are clamped.
  const { binding: binding4, searches: searches4 } = mockBinding();
  await post({ query: 'q', max_results: 999, context_expansion: 99 }, { AI_SEARCH: binding4 });
  assert.equal(searches4[0].args.ai_search_options.retrieval.max_num_results, 50);
  assert.equal(searches4[0].args.ai_search_options.retrieval.context_expansion, 3);

  // Provider failures are honest 502s; empty chunk lists are a valid result.
  const failing = await post({ query: 'q' }, { AI_SEARCH: mockBinding({ throwError: 'boom' }).binding });
  assert.equal(failing.status, 502);
  const empty = await post({ query: 'q' }, { AI_SEARCH: mockBinding({ response: { chunks: [] } }).binding });
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).results, []);

  console.log('AI Search retrieval contract passed.');
}

await run();
