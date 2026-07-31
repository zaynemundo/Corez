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

  console.log('Cloudflare Worker behavior contract passed.');
}

await run();
