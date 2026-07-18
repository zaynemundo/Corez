import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const originalFetch = globalThis.fetch;

function env(overrides = {}) {
  return {
    OPENROUTER_API_KEY: 'test-secret',
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
  assert.equal(
    unknownApiResponse.headers.get('content-type'),
    'application/json'
  );
  assert.deepEqual(await json(unknownApiResponse), {
    error: 'API route not found.'
  });

  const methodResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter'),
    env()
  );
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get('content-type'), 'application/json');

  const missingKeyResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' })
    }),
    env({ OPENROUTER_API_KEY: '' })
  );
  assert.equal(missingKeyResponse.status, 503);

  const missingPromptResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' })
    }),
    env()
  );
  assert.equal(missingPromptResponse.status, 400);

  const malformedResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    }),
    env()
  );
  assert.equal(malformedResponse.status, 400);

  const nullBodyResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(null)
    }),
    env()
  );
  assert.equal(nullBodyResponse.status, 400);
  assert.deepEqual(await json(nullBodyResponse), {
    error: 'Prompt is required.'
  });

  let upstreamRequest;
  globalThis.fetch = async (request, init) => {
    upstreamRequest = { request, init };
    return Response.json({
      choices: [{ message: { content: '  Worker response  ' } }]
    });
  };

  const successResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Build a timer',
        intent: { type: 'app', summary: 'Build a timer app.' }
      })
    }),
    env({
      OPENROUTER_MODEL: 'test/model',
      OPENROUTER_REASONING_EFFORT: 'invalid'
    })
  );

  assert.equal(successResponse.status, 200);
  assert.deepEqual(await json(successResponse), {
    content: 'Worker response',
    model: 'test/model'
  });
  assert.equal(
    upstreamRequest.init.headers.Authorization,
    'Bearer test-secret'
  );
  const upstreamBody = JSON.parse(upstreamRequest.init.body);
  assert.equal(upstreamBody.model, 'test/model');
  assert.equal(upstreamBody.reasoning_effort, 'xhigh');
  assert.equal(upstreamBody.max_tokens, 3200);
  assert.match(upstreamBody.messages[0].content, /Build a timer app/);

  let defaultModelBody;
  globalThis.fetch = async (_request, init) => {
    defaultModelBody = JSON.parse(init.body);
    return Response.json({
      choices: [{ message: { content: 'Default model response' } }]
    });
  };
  const defaultModelResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Use the default model' })
    }),
    env()
  );
  assert.equal(defaultModelResponse.status, 200);
  assert.equal(defaultModelBody.model, 'deepseek/deepseek-v4-flash');
  assert.equal(
    (await json(defaultModelResponse)).model,
    'deepseek/deepseek-v4-flash'
  );

  let requestModelBody;
  globalThis.fetch = async (_request, init) => {
    requestModelBody = JSON.parse(init.body);
    return Response.json({
      choices: [{ message: { content: 'Request model response' } }]
    });
  };
  const requestModelResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Use the request model',
        model: 'request/model'
      })
    }),
    env({ OPENROUTER_MODEL: 'environment/model' })
  );
  assert.equal(requestModelResponse.status, 200);
  assert.equal(requestModelBody.model, 'request/model');
  assert.equal((await json(requestModelResponse)).model, 'request/model');

  globalThis.fetch = async () => new Response('rate limited', { status: 429 });
  const upstreamFailureResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' })
    }),
    env()
  );
  assert.equal(upstreamFailureResponse.status, 502);
  assert.equal((await json(upstreamFailureResponse)).status, 429);

  globalThis.fetch = async () => {
    throw new Error('network unavailable: test-secret');
  };
  const thrownFetchResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' })
    }),
    env()
  );
  assert.equal(thrownFetchResponse.status, 500);
  assert.equal(thrownFetchResponse.headers.get('content-type'), 'application/json');
  const thrownFetchBody = await thrownFetchResponse.text();
  assert.deepEqual(JSON.parse(thrownFetchBody), {
    error: 'Unable to generate AI response.'
  });
  assert.doesNotMatch(thrownFetchBody, /test-secret/);

  globalThis.fetch = async () => Response.json({ choices: [] });
  const emptyChoicesResponse = await worker.fetch(
    new Request('https://corez.test/api/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' })
    }),
    env()
  );
  assert.equal(emptyChoicesResponse.status, 502);
  assert.equal(emptyChoicesResponse.headers.get('content-type'), 'application/json');
  assert.deepEqual(await json(emptyChoicesResponse), {
    error: 'OpenRouter returned an empty response.'
  });

  console.log('Cloudflare Worker behavior contract passed.');
}

try {
  await run();
} finally {
  globalThis.fetch = originalFetch;
}
