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

async function post(body, environment = env(), clientIp = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (clientIp) headers['CF-Connecting-IP'] = clientIp;
  return worker.fetch(
    new Request('https://corez.test/api/ai', {
      method: 'POST',
      headers,
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
  assert.match((await json(malformedResponse)).error, /Request body rejected/);

  // Oversized bodies are rejected with a distinct, honest error message
  const oversizedResponse = await post(JSON.stringify({
    prompt: 'Explain this',
    messages: [{ role: 'user', content: 'x'.repeat(300 * 1024) }]
  }));
  assert.equal(oversizedResponse.status, 400);
  assert.match((await json(oversizedResponse)).error, /byte limit/);

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

  // DeepSeek official API is the primary provider when DEEPSEEK_API_KEY is set
  {
    const originalFetch = globalThis.fetch;
    let deepSeekPayload;
    try {
      globalThis.fetch = async (url, init) => {
        assert.equal(url, 'https://api.deepseek.com/chat/completions');
        deepSeekPayload = JSON.parse(init.body);
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'DeepSeek official response' } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const deepSeekResp = await post(
        JSON.stringify({ prompt: 'Explain black roses', intent: { type: 'general' } }),
        env({ AI: undefined, DEEPSEEK_API_KEY: 'sk-deepseek-test' })
      );
      assert.equal(deepSeekResp.status, 200);
      const dsData = await deepSeekResp.json();
      assert.equal(dsData.content, 'DeepSeek official response');
      assert.equal(dsData.model, 'deepseek:deepseek-v4-flash');
      assert.equal(deepSeekPayload.model, 'deepseek-v4-flash');
      assert.equal(deepSeekPayload.stream, false);
      // No max_tokens cap: output length is unbounded (model default)
      assert.equal(deepSeekPayload.max_tokens, undefined);
      assert.ok(Array.isArray(deepSeekPayload.messages));
      assert.equal(deepSeekPayload.messages.at(-1).content, 'Explain black roses');
      assert.equal(deepSeekPayload.reasoning, undefined);
      assert.equal(deepSeekPayload.provider, undefined);

      // DEEPSEEK_MODEL env override is honored
      const deepSeekModelResp = await post(
        JSON.stringify({ prompt: 'Hi there' }),
        env({
          AI: undefined,
          DEEPSEEK_API_KEY: 'sk-deepseek-test',
          DEEPSEEK_MODEL: 'deepseek-chat'
        })
      );
      const dsModelData = await deepSeekModelResp.json();
      assert.equal(dsModelData.model, 'deepseek:deepseek-chat');
      assert.equal(deepSeekPayload.model, 'deepseek-chat');

      // Thinking-mode responses with empty content but populated
      // reasoning_content are internal thought, never the answer: the worker
      // falls through to the next provider instead of handing back raw <think>
      // text (DeepSeek default thinking mode can return content: '' for
      // complex prompts).
      globalThis.fetch = async () => new Response(JSON.stringify({
        choices: [{ message: { content: '', reasoning_content: 'I thought through the revision steps carefully.' } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      const thinkingResp = await post(
        JSON.stringify({
          prompt: '[Context: The user is requesting a revision for the following code block]\n```html\n<canvas id="g"></canvas>\n```\n\nUser Request: fix movement',
          intent: { type: 'code-help', summary: 'Revise embedded code.' }
        }),
        env({
          AI: {
            async run() {
              return { response: 'Workers AI revision answer' };
            }
          },
          DEEPSEEK_API_KEY: 'sk-deepseek-test'
        }),
        '198.51.100.106'
      );
      assert.equal(thinkingResp.status, 200);
      const thinkingData = await thinkingResp.json();
      assert.equal(thinkingData.content, 'Workers AI revision answer');
      assert.equal(thinkingData.content.includes('reasoning'), false);

      // Inline <think> blocks in the content field are stripped before the
      // answer is returned.
      globalThis.fetch = async () => new Response(JSON.stringify({
        choices: [{ message: { content: '<think>I will plan the code layout.</think>Here is the revised game.' } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      const thinkStripResp = await post(
        JSON.stringify({ prompt: 'Revise my game' }),
        env({ AI: undefined, DEEPSEEK_API_KEY: 'sk-deepseek-test' }),
        '198.51.100.107'
      );
      assert.equal(thinkStripResp.status, 200);
      assert.equal((await json(thinkStripResp)).content, 'Here is the revised game.');

      // A thinking-only OpenCode Go reply is retried once with a continuation
      // nudge so the actual answer is produced instead of raw reasoning.
      let opencodeGoCalls = 0;
      globalThis.fetch = async (_url, init) => {
        const payload = JSON.parse(init.body);
        opencodeGoCalls += 1;
        if (opencodeGoCalls === 1) {
          return new Response(JSON.stringify({
            choices: [{ message: { content: '', reasoning_content: 'Let me think about the gun model.' } }]
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        assert.equal(payload.model, 'deepseek-v4-flash');
        const nudge = payload.messages[payload.messages.length - 1];
        assert.match(nudge.content, /only internal reasoning/i);
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'Here is the revised FPS with a gun.' } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };
      const opencodeNudgeResp = await post(
        JSON.stringify({
          prompt: '[Context: The user is requesting a revision for the following code block]\n```html\n<canvas id="g"></canvas>\n```\n\nUser Request: add a gun',
          intent: { type: 'app', summary: 'Revise embedded game.' }
        }),
        env({ AI: undefined, OPENCODE_GO_API_KEY: 'sk-opencode-test' }),
        '198.51.100.105'
      );
      assert.equal(opencodeNudgeResp.status, 200);
      const opencodeNudgeData = await opencodeNudgeResp.json();
      assert.equal(opencodeNudgeData.content, 'Here is the revised FPS with a gun.');
      assert.equal(opencodeNudgeData.model, 'opencode:deepseek-v4-flash');
      assert.equal(opencodeGoCalls, 2);

      // A truncated thinking-only reply (unclosed <think> marker, no closing
      // tag) is reasoning too: it must never surface, and the continuation
      // nudge applies exactly like an empty reply.
      let opencodeTruncatedCalls = 0;
      globalThis.fetch = async (_url, init) => {
        const payload = JSON.parse(init.body);
        opencodeTruncatedCalls += 1;
        if (opencodeTruncatedCalls === 1) {
          return new Response(JSON.stringify({
            choices: [{ message: { content: '<think>I will plan the shop layout carefully so the action bar is always visible' } }]
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        assert.match(payload.messages[payload.messages.length - 1].content, /only internal reasoning/i);
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'Here is the revised game with the shop and action bar.' } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };
      const opencodeTruncatedResp = await post(
        JSON.stringify({
          prompt: '[Context: The user is requesting a revision for the following code block]\n```html\n<canvas id="g"></canvas>\n```\n\nUser Request: add a shop',
          intent: { type: 'app', summary: 'Revise embedded game.' }
        }),
        env({ AI: undefined, OPENCODE_GO_API_KEY: 'sk-opencode-test' }),
        '198.51.100.109'
      );
      assert.equal(opencodeTruncatedResp.status, 200);
      const opencodeTruncatedData = await opencodeTruncatedResp.json();
      assert.equal(opencodeTruncatedData.content, 'Here is the revised game with the shop and action bar.');
      assert.equal(opencodeTruncatedCalls, 2);

      // OpenCode Go wins when BOTH opencode and DeepSeek keys are configured
      globalThis.fetch = async (url, init) => {
        assert.equal(url, 'https://opencode.ai/zen/go/v1/chat/completions');
        const payload = JSON.parse(init.body);
        assert.equal(payload.model, 'deepseek-v4-flash');
        assert.equal(payload.reasoning, undefined);
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'OpenCode Go preferred response' } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };
      const opencodePreferredResp = await post(
        JSON.stringify({ prompt: 'Explain black roses', intent: { type: 'general' } }),
        env({
          AI: undefined,
          OPENCODE_GO_API_KEY: 'sk-opencode-test',
          DEEPSEEK_API_KEY: 'sk-deepseek-test'
        })
      );
      assert.equal(opencodePreferredResp.status, 200);
      const opencodePreferredData = await opencodePreferredResp.json();
      assert.equal(opencodePreferredData.content, 'OpenCode Go preferred response');
      assert.equal(opencodePreferredData.model, 'opencode:deepseek-v4-flash');

      // Client-supplied body.model is never trusted: the server-controlled
      // model list always wins.
      globalThis.fetch = async (_url, init) => {
        const payload = JSON.parse(init.body);
        assert.equal(payload.model, 'deepseek-v4-flash');
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'Server model used' } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };
      const modelIgnoreResp = await post(
        JSON.stringify({ prompt: 'Explain black roses', model: 'gpt-4o-mini' }),
        env({ AI: undefined, OPENCODE_GO_API_KEY: 'sk-opencode-test' }),
        '198.51.100.108'
      );
      assert.equal(modelIgnoreResp.status, 200);
      assert.equal((await json(modelIgnoreResp)).content, 'Server model used');

      // OpenCode failure falls through to DeepSeek
      globalThis.fetch = async (url) => {
        if (url === 'https://opencode.ai/zen/go/v1/chat/completions') {
          return new Response('{}', { status: 503 });
        }
        assert.equal(url, 'https://api.deepseek.com/chat/completions');
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'DeepSeek after OpenCode failure' } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };
      const opencodeFailResp = await post(
        JSON.stringify({ prompt: 'Explain fallback chain' }),
        env({
          AI: undefined,
          OPENCODE_GO_API_KEY: 'sk-opencode-test',
          DEEPSEEK_API_KEY: 'sk-deepseek-test'
        })
      );
      const opencodeFailData = await opencodeFailResp.json();
      assert.equal(opencodeFailData.content, 'DeepSeek after OpenCode failure');
      assert.equal(opencodeFailData.model, 'deepseek:deepseek-v4-flash');

      // DeepSeek failure falls through to the next provider (Workers AI)
      globalThis.fetch = async () => new Response('{}', { status: 502 });
      const deepSeekFallbackResp = await post(
        JSON.stringify({ prompt: 'Explain fallback' }),
        env({
          AI: {
            async run(_model, input) {
              generalInput = input;
              return {
                choices: [{ message: { content: 'Workers AI after DeepSeek failure' } }]
              };
            }
          },
          DEEPSEEK_API_KEY: 'sk-deepseek-test'
        })
      );
      assert.equal(deepSeekFallbackResp.status, 200);
      const dsFallbackData = await deepSeekFallbackResp.json();
      assert.equal(dsFallbackData.content, 'Workers AI after DeepSeek failure');
      assert.equal(dsFallbackData.model, '@cf/moonshotai/kimi-k2.7-code');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

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

  // Native Workers AI envelope ({ response: ... }) must not be misread as an
  // empty answer just because there is no OpenAI-style choices array.
  const nativeShapeResponse = await post(
    JSON.stringify({ prompt: 'Explain fallback' }),
    env({
      AI: {
        async run() {
          return { response: 'Native Workers AI response' };
        }
      }
    }),
    '198.51.100.101'
  );
  assert.equal(nativeShapeResponse.status, 200);
  assert.deepEqual(await json(nativeShapeResponse), {
    content: 'Native Workers AI response',
    model: '@cf/moonshotai/kimi-k2.7-code'
  });

  // A nested envelope ({ result: { response: ... } }) is normalized too.
  const wrappedShapeResponse = await post(
    JSON.stringify({ prompt: 'Explain fallback' }),
    env({
      AI: {
        async run() {
          return { result: { response: 'Wrapped Workers AI response' } };
        }
      }
    }),
    '198.51.100.102'
  );
  assert.equal(wrappedShapeResponse.status, 200);
  assert.equal((await json(wrappedShapeResponse)).content, 'Wrapped Workers AI response');

  // An empty primary result must not dead-end the request: the next Workers
  // AI model in the chain is attempted before reporting failure.
  let workersAiRunCount = 0;
  const emptyPrimaryResponse = await post(
    JSON.stringify({ prompt: 'Explain fallback' }),
    env({
      AI: {
        async run(_model) {
          workersAiRunCount += 1;
          if (workersAiRunCount === 1) return { choices: [] };
          return { response: 'Recovered via secondary Workers AI model' };
        }
      }
    }),
    '198.51.100.103'
  );
  assert.equal(emptyPrimaryResponse.status, 200);
  assert.deepEqual(await json(emptyPrimaryResponse), {
    content: 'Recovered via secondary Workers AI model',
    model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'
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

  // Store memories WITH AI binding -> embeddings persisted server-side only
  const store1 = await memoryPost('/api/memory/store', { userId: 'u1', key: 'k1', text: 'User prefers blue themes.' });
  assert.equal(store1.status, 200);
  const store1Data = await json(store1);
  assert.equal(store1Data.embeddingStored, true);
  assert.equal(store1Data.record.embedding, undefined);
  assert.equal(store1Data.record.embeddingModel, undefined);

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

  // Storage key segments are validated on every endpoint: no slashes, no
  // leading dots, and no traversal via decoded path segments.
  const badMemoryStoreUser = await memoryPost('/api/memory/store', { userId: '../escape', key: 'k', text: 'x' });
  assert.equal(badMemoryStoreUser.status, 400);

  const badMemoryStoreKey = await memoryPost('/api/memory/store', { userId: 'u1', key: 'a/b', text: 'x' });
  assert.equal(badMemoryStoreKey.status, 400);

  const badMemoryPath = await worker.fetch(
    new Request('https://corez.test/api/memory/%2E%2E%2Fescape', { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(badMemoryPath.status, 400);

  const badAppStore = await worker.fetch(
    new Request('https://corez.test/api/apps/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: '../escape', appId: 'a1', code: '<html></html>' })
    }),
    memoryEnv()
  );
  assert.equal(badAppStore.status, 400);

  const badAppPath = await worker.fetch(
    new Request('https://corez.test/api/apps/session%2Fid/a1', { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(badAppPath.status, 400);

  // Publish: creates a shareable slug, serves the creation with sandbox
  // headers, and falls through to static assets for non-slug bare paths.
  const publishStore = await worker.fetch(
    new Request('https://corez.test/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'FPS Game', html: '<!DOCTYPE html><html><body><h1>Shared FPS</h1></body></html>' })
    }),
    memoryEnv()
  );
  assert.equal(publishStore.status, 200);
  const publishData = await json(publishStore);
  assert.match(publishData.slug, /^[a-z0-9]{4,8}-[0-9]{1,6}$/);
  assert.equal(publishData.url, `/${publishData.slug}`);

  const publishedPage = await worker.fetch(
    new Request(`https://corez.test${publishData.url}`, { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(publishedPage.status, 200);
  assert.match(publishedPage.headers.get('content-type'), /text\/html/);
  assert.match(publishedPage.headers.get('content-security-policy'), /sandbox/);
  assert.equal(await publishedPage.text(), '<!DOCTYPE html><html><body><h1>Shared FPS</h1></body></html>');

  // Republishing under the same slug updates the existing link
  const republish = await worker.fetch(
    new Request('https://corez.test/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: publishData.slug, html: '<h1>v2</h1>' })
    }),
    memoryEnv()
  );
  assert.equal(republish.status, 200);
  const republishedPage = await worker.fetch(
    new Request(`https://corez.test/${publishData.slug}`, { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(republishedPage.status, 200);
  assert.equal(await republishedPage.text(), '<h1>v2</h1>');

  // Publish without content is rejected
  const publishEmpty = await worker.fetch(
    new Request('https://corez.test/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Empty' })
    }),
    memoryEnv()
  );
  assert.equal(publishEmpty.status, 400);

  // Unknown slug is a 404
  const publishMissing = await worker.fetch(
    new Request('https://corez.test/zzz999-000', { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(publishMissing.status, 404);

  // Non-slug bare paths fall through to the SPA / static assets
  const spaFallback = await worker.fetch(
    new Request('https://corez.test/not-a-slug-path', { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(spaFallback.status, 200);
  assert.equal(await spaFallback.text(), 'asset:/not-a-slug-path');

  // Only the app document is ever published: chat-ish fields sent by a
  // client are ignored, never persisted, and never served.
  const publishWithJunk = await worker.fetch(
    new Request('https://corez.test/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Only App',
        html: '<h1>App Only</h1>',
        sessionId: 'secret-session',
        messages: [{ role: 'user', content: 'private chat text' }],
        history: ['private history'],
        prompt: 'create a game'
      })
    }),
    memoryEnv()
  );
  assert.equal(publishWithJunk.status, 200);
  const junkData = await json(publishWithJunk);
  const junkRecord = JSON.parse(memoryStore.get(`publish/${junkData.slug}.json`).value);
  assert.deepEqual(Object.keys(junkRecord).sort(), ['createdAt', 'html', 'slug', 'title']);
  assert.equal(junkRecord.html, '<h1>App Only</h1>');
  assert.equal(junkRecord.sessionId, undefined);
  assert.equal(junkRecord.messages, undefined);

  const junkPage = await worker.fetch(
    new Request(`https://corez.test/${junkData.slug}`, { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(junkPage.status, 200);
  assert.equal(await junkPage.text(), '<h1>App Only</h1>');

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

  // Asset GET validates the key format too (no %2F traversal reads).
  const assetGetBadKey = await worker.fetch(
    new Request('https://corez.test/api/assets/%2E%2E%2Fsecret.json', { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(assetGetBadKey.status, 400);
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
