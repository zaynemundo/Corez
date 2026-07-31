import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const MODEL = '@cf/moonshotai/kimi-k2.7-code';
const FLUX_MODEL = '@cf/black-forest-labs/flux-1-schnell';
delete process.env.OPENROUTER_API_KEY;

function env(overrides = {}) {
  return {
    AI: {
      async run() {
        return {
          choices: [{ message: { content: '  Worker response  ' } }]
        };
      }
    },
    ASSETS: {
      async fetch(request) {
        return new Response(`asset:${new URL(request.url).pathname}`, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    },
    ...overrides
  };
}

async function json(response) {
  return response.json();
}

async function post(body, environment = env()) {
  return worker.fetch(
    new Request('https://corez.test/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    }),
    environment
  );
}

async function captureSystemPrompt(intent) {
  let invocation;
  const response = await post(
    JSON.stringify({ prompt: 'Test request', intent }),
    env({
      AI: {
        async run(model, input) {
          invocation = { model, input };
          return {
            choices: [{ message: { content: 'Worker response' } }]
          };
        }
      }
    })
  );

  assert.equal(response.status, 200);
  assert.equal(invocation.model, MODEL);
  return invocation.input.messages[0].content;
}

async function run() {
  const assetResponse = await worker.fetch(
    new Request('https://corez.test/dashboard'),
    env()
  );
  assert.equal(await assetResponse.text(), 'asset:/dashboard');

  const unknownApiResponse = await worker.fetch(
    new Request('https://corez.test/api/unknown'),
    env()
  );
  assert.equal(unknownApiResponse.status, 404);
  assert.equal(unknownApiResponse.headers.get('content-type'), 'application/json');
  assert.deepEqual(await json(unknownApiResponse), {
    error: 'API route not found.'
  });

  const marketRouteResponse = await worker.fetch(
    new Request('https://corez.test/api/market', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }),
    env()
  );
  assert.equal(marketRouteResponse.status, 503);
  assert.equal((await marketRouteResponse.json()).error.code, 'not_configured');

  const legacyRouteResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter'),
    env()
  );
  assert.equal(legacyRouteResponse.status, 404);

  const methodResponse = await worker.fetch(
    new Request('https://corez.test/api/ai'),
    env()
  );
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get('content-type'), 'application/json');

  const missingBindingResponse = await post(
    JSON.stringify({ prompt: 'Explain black roses' }),
    env({ AI: undefined })
  );
  assert.equal(missingBindingResponse.status, 503);
  assert.deepEqual(await json(missingBindingResponse), {
    error: 'Workers AI is not configured.'
  });

  // Greeting fast-path: no LLM round-trip is required, so it succeeds even
  // without any AI provider binding configured.
  const greetingResponse = await post(
    JSON.stringify({ prompt: 'Hello' }),
    env({ AI: undefined })
  );
  assert.equal(greetingResponse.status, 200);
  assert.equal((await json(greetingResponse)).model, 'corez-greeting');

  const missingPromptResponse = await post(JSON.stringify({ prompt: '   ' }));
  assert.equal(missingPromptResponse.status, 400);

  const malformedResponse = await post('{');
  assert.equal(malformedResponse.status, 400);
  assert.deepEqual(await json(malformedResponse), {
    error: 'Request body must be valid JSON.'
  });

  const nullBodyResponse = await post(JSON.stringify(null));
  assert.equal(nullBodyResponse.status, 400);
  assert.deepEqual(await json(nullBodyResponse), {
    error: 'Prompt is required.'
  });

  let invocation;
  const successResponse = await post(
    JSON.stringify({
      prompt: 'Build a timer',
      model: 'client/model-must-be-ignored',
      intent: { type: 'app', summary: 'Build a timer app.' }
    }),
    env({
      AI: {
        async run(model, input) {
          invocation = { model, input };
          return {
            choices: [{ message: { content: '  Worker response  ' } }]
          };
        }
      }
    })
  );

  assert.equal(successResponse.status, 200);
  assert.deepEqual(await json(successResponse), {
    content: 'Worker response',
    model: MODEL
  });
  assert.equal(invocation.model, MODEL);
  assert.deepEqual(Object.keys(invocation.input), ['messages']);
  assert.equal(invocation.input.messages[1].content, 'Build a timer');
  assert.match(invocation.input.messages[0].content, /Build a timer app/);
  assert.match(invocation.input.messages[0].content, /Inferred intent: app/);

  let generalInput;
  const generalResponse = await post(
    JSON.stringify({ prompt: 'Explain edge computing' }),
    env({
      AI: {
        async run(_model, input) {
          generalInput = input;
          return {
            choices: [{ message: { content: 'General response' } }]
          };
        }
      }
    })
  );
  assert.equal(generalResponse.status, 200);
  assert.deepEqual(Object.keys(generalInput), ['messages']);
  assert.match(generalInput.messages[0].content, /Adaptive Routing - Fast Path/);
  assert.match(generalInput.messages[0].content, /Inferred intent: general/);

  const codeHelpPrompt = await captureSystemPrompt({
    type: 'code-help',
    summary: 'Fix a React component.'
  });
  assert.match(codeHelpPrompt, /Adaptive Routing - Coding Path/);
  assert.match(codeHelpPrompt, /Inferred intent: code-help/);

  const swarmPrompt = await captureSystemPrompt({
    type: 'swarm',
    summary: 'Coordinate multiple agents.'
  });
  assert.match(swarmPrompt, /Adaptive Routing - Complex Path/);
  assert.match(swarmPrompt, /Inferred intent: swarm/);

  const retiredIntentPrompt = await captureSystemPrompt({
    type: 'coding',
    summary: 'Retired client label.'
  });
  assert.match(retiredIntentPrompt, /Adaptive Routing - Fast Path/);
  assert.match(retiredIntentPrompt, /Inferred intent: general/);
  assert.doesNotMatch(retiredIntentPrompt, /Inferred intent: coding/);

  let historyInput;
  const historyResponse = await post(
    JSON.stringify({
      prompt: 'Current question',
      intent: { type: 'general', summary: 'Answer directly.' },
      messages: [
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier answer' },
        { role: 'user', content: 'Current question' }
      ]
    }),
    env({
      AI: {
        async run(_model, input) {
          historyInput = input;
          return {
            choices: [{ message: { content: 'History response' } }]
          };
        }
      }
    })
  );
  assert.equal(historyResponse.status, 200);
  assert.deepEqual(
    historyInput.messages.slice(1).map((message) => message.content),
    ['Earlier question', 'Earlier answer', 'Current question']
  );

  const originalConsoleError = console.error;
  let loggedError;
  console.error = (entry) => { loggedError = entry; };
  let thrownResponse;
  try {
    thrownResponse = await post(
      JSON.stringify({ prompt: 'Tell me about black roses' }),
      env({
        AI: {
          async run() {
            throw { message: 'binding failure token=super-secret-value' };
          }
        }
      })
    );
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(thrownResponse.status, 502);
  const thrownBody = await thrownResponse.text();
  assert.deepEqual(JSON.parse(thrownBody), {
    error: 'Unable to generate AI response.'
  });
  assert.doesNotMatch(thrownBody, /super-secret-value/);
  assert.deepEqual(JSON.parse(loggedError), {
    message: 'Workers AI generation failed',
    error: 'binding failure token=[REDACTED]'
  });

  const emptyResponse = await post(
    JSON.stringify({ prompt: 'Tell me about black roses' }),
    env({
      AI: {
        async run() {
          return { choices: [] };
        }
      }
    })
  );
  assert.equal(emptyResponse.status, 502);
  assert.deepEqual(await json(emptyResponse), {
    error: 'Workers AI returned an empty response.'
  });

  // Test /api/image FLUX endpoint
  const imageMethodResponse = await worker.fetch(
    new Request('https://corez.test/api/image'),
    env()
  );
  assert.equal(imageMethodResponse.status, 405);

  const imageMissingPromptResponse = await worker.fetch(
    new Request('https://corez.test/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' })
    }),
    env()
  );
  assert.equal(imageMissingPromptResponse.status, 400);

  let fluxInvocation;
  const dummyBuffer = new Uint8Array([137, 80, 78, 71]).buffer;
  const imageSuccessResponse = await worker.fetch(
    new Request('https://corez.test/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'A futuristic city' })
    }),
    env({
      AI: {
        async run(model, input) {
          fluxInvocation = { model, input };
          return dummyBuffer;
        }
      }
    })
  );
  assert.equal(imageSuccessResponse.status, 200);
  const imageJsonData = await json(imageSuccessResponse);
  assert.equal(fluxInvocation.model, FLUX_MODEL);
  assert.deepEqual(fluxInvocation.input, { prompt: 'A futuristic city', num_steps: 4 });
  assert.equal(imageJsonData.model, FLUX_MODEL);
  assert.match(imageJsonData.image, /^data:image\/png;base64,/);

  // Test /api/memory store + search with embeddings and rerank
  const memoryStore = new Map();
  const memoryBucket = {
    put: async (key, value, options) => {
      memoryStore.set(key, { value, contentType: options?.httpMetadata?.contentType || 'application/octet-stream' });
    },
    get: async (key) => memoryStore.has(key) ? {
      text: async () => memoryStore.get(key).value,
      arrayBuffer: async () => memoryStore.get(key).value,
      writeHttpMetadata: (headers) => { headers.set('Content-Type', memoryStore.get(key).contentType); },
      httpEtag: 'mock-etag'
    } : null,
    delete: async (key) => { memoryStore.delete(key); },
    list: async ({ prefix }) => ({ objects: [...memoryStore.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) })
  };
  const noAiMemoryEnv = () => env({ ASSET_BUCKET: memoryBucket, AI: undefined });
  const embeddingOnlyEnv = () => env({
    ASSET_BUCKET: memoryBucket,
    AI: {
      async run(model, input) {
        if (model === '@cf/baai/bge-small-en-v1.5') {
          const text = String(input.text[0] || '');
          return {
            shape: [1, 4],
            data: [[
              0.3 + (text.includes('blue') ? 0.5 : 0.1),
              0.3 + (text.includes('theme') ? 0.5 : 0.1),
              0.3 + (text.includes('chess') ? 0.5 : 0.1),
              0.3 + (text.includes('react') || text.includes('vite') ? 0.5 : 0.1)
            ]]
          };
        }
        throw new Error('reranker unavailable');
      }
    }
  });
  const memoryEnv = () => env({
    ASSET_BUCKET: memoryBucket,
    AI: {
      async run(model, input) {
        if (model === '@cf/baai/bge-small-en-v1.5') {
          const text = String(input.text[0] || '');
          return {
            shape: [1, 4],
            data: [[
              0.3 + (text.includes('blue') ? 0.5 : 0.1),
              0.3 + (text.includes('theme') ? 0.5 : 0.1),
              0.3 + (text.includes('chess') ? 0.5 : 0.1),
              0.3 + (text.includes('react') || text.includes('vite') ? 0.5 : 0.1)
            ]]
          };
        }
        if (model === '@cf/baai/bge-reranker-base') {
          // Match the real Workers AI API shape: contexts input, result output
          const docs = input.contexts ?? [];
          return {
            result: docs.map((doc, index) => ({
              index,
              // The blue-theme document wins reranking wherever cosine ranked it
              relevance_score: String(doc.text ?? doc).includes('blue') ? 0.9 : 0.5
            }))
          };
        }
        return { choices: [{ message: { content: 'Worker response' } }] };
      }
    }
  });

  const memoryPost = (path, body, environment = memoryEnv()) => worker.fetch(
    new Request(`https://corez.test${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    environment
  );

  // Store a memory without AI binding -> no embedding stored
  const storeNoAi = await worker.fetch(
    new Request('https://corez.test/api/memory/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', key: 'k1', text: 'User prefers blue themes.' })
    }),
    noAiMemoryEnv()
  );
  assert.equal(storeNoAi.status, 200);
  const storeNoAiData = await json(storeNoAi);
  assert.equal(storeNoAiData.record.embedding, undefined);

  // Store memories WITH AI binding -> embeddings persisted
  const store1 = await memoryPost('/api/memory/store', { userId: 'u1', key: 'k1', text: 'User prefers blue themes.' });
  assert.equal(store1.status, 200);
  const store1Data = await json(store1);
  assert.ok(Array.isArray(store1Data.record.embedding) && store1Data.record.embedding.length === 4);

  await memoryPost('/api/memory/store', { userId: 'u1', key: 'k2', text: 'User plays chess on weekends.' });
  await memoryPost('/api/memory/store', { userId: 'u1', key: 'k3', text: 'User works with React and Vite.' });

  // Semantic search with rerank
  const semanticSearch = await memoryPost('/api/memory/search', { userId: 'u1', query: 'favorite color scheme' });
  assert.equal(semanticSearch.status, 200);
  const semanticData = await json(semanticSearch);
  assert.equal(semanticData.source, 'semantic');
  assert.equal(semanticData.rerank, true);
  assert.ok(semanticData.matches.length >= 1 && semanticData.matches.length <= 5);
  assert.ok(semanticData.matches.every(m => typeof m.score === 'number'));
  // Blue-theme memory should win reranking for a color-scheme query
  assert.equal(semanticData.matches[0].key, 'k1');

  // Semantic search without a reranker falls back to pure embedding ranking
  const noRerankSearch = await memoryPost('/api/memory/search', { userId: 'u1', query: 'favorite color scheme' }, embeddingOnlyEnv());
  const noRerankData = await json(noRerankSearch);
  assert.equal(noRerankData.source, 'semantic');
  assert.equal(noRerankData.rerank, false);
  assert.ok(noRerankData.matches.length >= 1);
  assert.ok(noRerankData.matches.every(m => typeof m.similarity === 'number'));

  // Keyword fallback: category filter still works via the semantic path
  const categorySearch = await memoryPost('/api/memory/search', { userId: 'u1', query: 'blue', category: 'general' });
  assert.equal(categorySearch.status, 200);

  // Keyword-only search when AI binding is missing
  const keywordSearch = await worker.fetch(
    new Request('https://corez.test/api/memory/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', query: 'chess' })
    }),
    noAiMemoryEnv()
  );
  assert.equal(keywordSearch.status, 200);
  const keywordData = await json(keywordSearch);
  assert.equal(keywordData.source, 'keyword');
  assert.ok(keywordData.matches.some(m => m.key === 'k2'));

  // Empty query returns all category-filtered memories with keyword source
  const emptyQuery = await memoryPost('/api/memory/search', { userId: 'u1', query: '' });
  const emptyQueryData = await json(emptyQuery);
  assert.equal(emptyQueryData.source, 'keyword');
  assert.equal(emptyQueryData.matches.length, 3);

  // Delete a memory
  const deleteMem = await worker.fetch(
    new Request('https://corez.test/api/memory/u1/k1', { method: 'DELETE' }),
    memoryEnv()
  );
  assert.equal(deleteMem.status, 200);

  // Asset upload validation: reject arbitrary content types, keys, and malformed data URLs
  const uploadBadType = await worker.fetch(
    new Request('https://corez.test/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'evil.html', dataUrl: 'data:text/html;base64,PGh0bWw+', mimeType: 'text/html' })
    }),
    memoryEnv()
  );
  assert.equal(uploadBadType.status, 400);

  const uploadBadKey = await worker.fetch(
    new Request('https://corez.test/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: '../../escape', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png' })
    }),
    memoryEnv()
  );
  assert.equal(uploadBadKey.status, 400);

  const uploadMismatch = await worker.fetch(
    new Request('https://corez.test/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'ok.png', dataUrl: 'data:text/html;base64,PGh0bWw+', mimeType: 'image/png' })
    }),
    memoryEnv()
  );
  assert.equal(uploadMismatch.status, 400);

  const uploadMalformed = await worker.fetch(
    new Request('https://corez.test/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'ok.png', dataUrl: 'data:image/png;base64,!!!not-base64!!!', mimeType: 'image/png' })
    }),
    memoryEnv()
  );
  assert.equal(uploadMalformed.status, 400);

  const uploadValid = await worker.fetch(
    new Request('https://corez.test/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'ok.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png' })
    }),
    memoryEnv()
  );
  assert.equal(uploadValid.status, 200);
  const uploadValidData = await json(uploadValid);
  assert.equal(uploadValidData.url, '/api/assets/ok.png');

  // Asset GET serves with security headers; SVG gets a CSP sandbox
  const svgUpload = await worker.fetch(
    new Request('https://corez.test/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'icon.svg', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+', mimeType: 'image/svg+xml' })
    }),
    memoryEnv()
  );
  assert.equal(svgUpload.status, 200);
  const svgGet = await worker.fetch(new Request('https://corez.test/api/assets/icon.svg'), memoryEnv());
  assert.equal(svgGet.status, 200);
  assert.ok(String(svgGet.headers.get('content-security-policy') || '').includes('sandbox'));

  console.log('Cloudflare Worker behavior contract passed.');
}

await run();
