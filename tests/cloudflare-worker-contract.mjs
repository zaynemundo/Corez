import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/chat/completions';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
delete process.env.OPENROUTER_API_KEY;

// Every provider payload captured across the whole run: none may ever carry
// an output-token cap.
const capturedPayloads = [];

function env(overrides = {}) {
  return {
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
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, OPENCODE_URL);
      invocation = { url, payload: JSON.parse(init.body) };
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Worker response' } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };
    const response = await post(
      JSON.stringify({ prompt: 'Test request', intent }),
      env({ OPENCODE_GO_API_KEY: 'sk-opencode-test' })
    );
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
  return invocation.payload.messages[0].content;
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

  // With no provider key configured, /api/ai reports an honest 502 instead of
  // silently pretending to generate.
  const noProviderResponse = await post(
    JSON.stringify({ prompt: 'Explain black roses' }),
    env()
  );
  assert.equal(noProviderResponse.status, 502);
  assert.deepEqual(await json(noProviderResponse), {
    error: 'Unable to generate AI response.',
    detail: 'all providers returned no usable response'
  });

  // Greeting fast-path: no LLM round-trip is required, so it succeeds even
  // without any AI provider configured.
  const greetingResponse = await post(
    JSON.stringify({ prompt: 'Hello' }),
    env()
  );
  assert.equal(greetingResponse.status, 200);
  assert.equal((await json(greetingResponse)).model, 'corez-greeting');

  const missingPromptResponse = await post(JSON.stringify({ prompt: '   ' }));
  assert.equal(missingPromptResponse.status, 400);

  const malformedResponse = await post('{');
  assert.equal(malformedResponse.status, 400);
  assert.match((await json(malformedResponse)).error, /Request body rejected/);

  // Bodies beyond the memory-exhaustion guard are rejected with a distinct,
  // honest error message. The guard (24 MB) sits far above any legitimate
  // conversation payload, so normal AI tasks are never squeezed.
  const oversizedResponse = await post(JSON.stringify({
    prompt: 'Explain this',
    messages: [{ role: 'user', content: 'x'.repeat(25 * 1024 * 1024) }]
  }));
  assert.equal(oversizedResponse.status, 400);
  assert.match((await json(oversizedResponse)).error, /byte limit/);

  // Large-but-legitimate conversations pass through unchanged: no fixed
  // history windows or per-message caps at the platform boundary.
  {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({
        choices: [{ message: { content: 'Large conversation accepted' } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      const largeConversationResponse = await post(JSON.stringify({
        prompt: 'Keep going',
        messages: [
          { role: 'user', content: 'Early requirement: preserve offline mode.' },
          { role: 'assistant', content: 'x'.repeat(2 * 1024 * 1024) },
          { role: 'user', content: 'Continue implementing.' }
        ]
      }), env({ OPENCODE_GO_API_KEY: 'sk-opencode-test' }));
      assert.equal(largeConversationResponse.status, 200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const nullBodyResponse = await post(JSON.stringify(null));
  assert.equal(nullBodyResponse.status, 400);
  assert.deepEqual(await json(nullBodyResponse), {
    error: 'Prompt is required.'
  });

  let invocation;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, OPENCODE_URL);
      invocation = { url, payload: JSON.parse(init.body) };
      capturedPayloads.push(invocation.payload);
      return new Response(JSON.stringify({
        choices: [{ message: { content: '  Worker response  ' } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const successResponse = await post(
      JSON.stringify({
        prompt: 'Build a timer',
        model: 'client/model-must-be-ignored',
        intent: { type: 'app', summary: 'Build a timer app.' },
        executionPrompt: 'Build a timer\n\n--- Awwwards Visual Design Principles ---\nStyle Target: Luxury Dark Mode'
      }),
      env({
        OPENCODE_GO_API_KEY: 'sk-opencode-test',
        __INSPIRATION_FETCH: async () => ({ sites: [], category: 'websites', source: 'Awwwards' })
      })
    );

    assert.equal(successResponse.status, 200);
    assert.deepEqual(await json(successResponse), {
      content: 'Worker response',
      model: 'opencode:deepseek-v4-flash'
    });
    assert.equal(invocation.payload.model, 'deepseek-v4-flash');
    assert.deepEqual(Object.keys(invocation.payload), ['model', 'messages']);
    // The execution prompt (with the Awwwards design spec) reaches the model
    // as the user message instead of the bare prompt.
    assert.equal(invocation.payload.messages[1].content, 'Build a timer\n\n--- Awwwards Visual Design Principles ---\nStyle Target: Luxury Dark Mode');
    assert.match(invocation.payload.messages[0].content, /Build a timer app/);
    assert.match(invocation.payload.messages[0].content, /Inferred intent: app/);

    let generalPayload;
    globalThis.fetch = async (url, init) => {
      assert.equal(url, OPENCODE_URL);
      generalPayload = JSON.parse(init.body);
      capturedPayloads.push(generalPayload);
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'General response' } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };
    const generalResponse = await post(
      JSON.stringify({ prompt: 'Explain edge computing' }),
      env({ OPENCODE_GO_API_KEY: 'sk-opencode-test' })
    );
    assert.equal(generalResponse.status, 200);
    assert.deepEqual(Object.keys(generalPayload), ['model', 'messages']);
    assert.match(generalPayload.messages[0].content, /Adaptive Routing - Fast Path/);
    assert.match(generalPayload.messages[0].content, /Inferred intent: general/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // A DeepSeek-only environment falls back to the official DeepSeek API: the
  // request succeeds with the deepseek label and a plain OpenAI-style payload.
  {
    const originalFetch = globalThis.fetch;
    let deepseekPayload;
    try {
      let opencodePayload;
      globalThis.fetch = async (url, init) => {
        assert.equal(url, DEEPSEEK_URL);
        deepseekPayload = JSON.parse(init.body);
        capturedPayloads.push(deepseekPayload);
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'DeepSeek fallback response' } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const deepseekResp = await post(
        JSON.stringify({ prompt: 'Explain black roses', intent: { type: 'general' } }),
        env({ DEEPSEEK_API_KEY: 'sk-deepseek-test' })
      );
      assert.equal(deepseekResp.status, 200);
      const deepseekData = await deepseekResp.json();
      assert.equal(deepseekData.content, 'DeepSeek fallback response');
      assert.equal(deepseekData.model, 'deepseek:deepseek-v4-flash');
      assert.equal(deepseekPayload.model, 'deepseek-v4-flash');
      assert.equal(deepseekPayload.stream, false);
      // No max_tokens cap: output length is unbounded (model default)
      assert.equal(deepseekPayload.max_tokens, undefined);
      assert.equal(deepseekPayload.max_completion_tokens, undefined);
      assert.ok(Array.isArray(deepseekPayload.messages));
      assert.equal(deepseekPayload.messages.at(-1).content, 'Explain black roses');
      assert.equal(deepseekPayload.reasoning, undefined);
      assert.equal(deepseekPayload.provider, undefined);

      // With OPENCODE_GO_API_KEY configured, the request succeeds and the
      // payload carries no provider-specific or reasoning-effort fields.
      globalThis.fetch = async (url, init) => {
        assert.equal(url, OPENCODE_URL);
        opencodePayload = JSON.parse(init.body);
        capturedPayloads.push(opencodePayload);
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'OpenCode Go response' } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };
      const opencodeKeyResp = await post(
        JSON.stringify({ prompt: 'Explain black roses', intent: { type: 'general' } }),
        env({ OPENCODE_GO_API_KEY: 'sk-opencode-test' })
      );
      assert.equal(opencodeKeyResp.status, 200);
      const opencodeKeyData = await opencodeKeyResp.json();
      assert.equal(opencodeKeyData.content, 'OpenCode Go response');
      assert.equal(opencodeKeyData.model, 'opencode:deepseek-v4-flash');
      assert.equal(opencodePayload.model, 'deepseek-v4-flash');
      // No max_tokens cap: output length is unbounded (model default)
      assert.equal(opencodePayload.max_tokens, undefined);
      assert.ok(Array.isArray(opencodePayload.messages));
      assert.equal(opencodePayload.messages.at(-1).content, 'Explain black roses');
      assert.equal(opencodePayload.reasoning, undefined);
      assert.equal(opencodePayload.provider, undefined);

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
        env({ OPENCODE_GO_API_KEY: 'sk-opencode-test' }),
        '198.51.100.107'
      );
      assert.equal(thinkStripResp.status, 200);
      assert.equal((await json(thinkStripResp)).content, 'Here is the revised game.');

      // A thinking-only OpenCode Go reply is retried once with a continuation
      // nudge so the actual answer is produced instead of raw reasoning.
      let opencodeGoCalls = 0;
      globalThis.fetch = async (_url, init) => {
        const payload = JSON.parse(init.body);
        capturedPayloads.push(payload);
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
        capturedPayloads.push(payload);
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
        capturedPayloads.push(payload);
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
        capturedPayloads.push(payload);
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

      // OpenCode Go is preferred as hard as possible: a transient gateway
      // failure is retried once before any other provider is consulted.
      let opencodeRetryCalls = 0;
      globalThis.fetch = async (url, init) => {
        if (url === 'https://opencode.ai/zen/go/v1/chat/completions') {
          opencodeRetryCalls += 1;
          capturedPayloads.push(JSON.parse(init.body));
          if (opencodeRetryCalls === 1) {
            return new Response(JSON.stringify({ error: 'temporary gateway hiccup' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response(JSON.stringify({
            choices: [{ message: { content: 'Recovered on the OpenCode Go retry' } }]
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        throw new Error(`Unexpected provider consulted: ${url}`);
      };
      const opencodeRetryResp = await post(
        JSON.stringify({ prompt: 'Explain fallback chain' }),
        env({
          AI: undefined,
          OPENCODE_GO_API_KEY: 'sk-opencode-test',
          DEEPSEEK_API_KEY: 'sk-deepseek-test'
        }),
        '198.51.100.110'
      );
      assert.equal(opencodeRetryResp.status, 200);
      const opencodeRetryData = await json(opencodeRetryResp);
      assert.equal(opencodeRetryData.content, 'Recovered on the OpenCode Go retry');
      assert.equal(opencodeRetryData.model, 'opencode:deepseek-v4-flash');
      assert.equal(opencodeRetryCalls, 2);

      // Transient-only OpenCode failure with no further provider: the retry
      // schedule is persisted and the request reports a resumable task
      // instead of a 502 (200 retry-scheduled with a taskId).
      globalThis.fetch = async (url) => {
        assert.equal(url, 'https://opencode.ai/zen/go/v1/chat/completions');
        return new Response('{}', { status: 503 });
      };
      const opencodeFailResp = await post(
        JSON.stringify({ prompt: 'Explain fallback chain' }),
        env({ OPENCODE_GO_API_KEY: 'sk-opencode-test', __COREZ_RETRY_SLEEP_MS: '0' })
      );
      assert.equal(opencodeFailResp.status, 200);
      const opencodeFailData = await json(opencodeFailResp);
      assert.equal(opencodeFailData.status, 'retry-scheduled');
      assert.match(opencodeFailData.taskId, /^rt-[0-9a-f]{8}$/);
      assert.ok(opencodeFailData.retryAfterSeconds >= 1);

      // OpenCode PERMANENT failure with no further provider still ends in an
      // honest 502 whose detail names the failed provider.
      globalThis.fetch = async (url) => {
        assert.equal(url, 'https://opencode.ai/zen/go/v1/chat/completions');
        return new Response('{}', { status: 401 });
      };
      const opencodePermanentFailResp = await post(
        JSON.stringify({ prompt: 'Explain fallback chain' }),
        env({ OPENCODE_GO_API_KEY: 'sk-opencode-test' })
      );
      assert.equal(opencodePermanentFailResp.status, 502);
      const opencodePermanentFailData = await json(opencodePermanentFailResp);
      assert.equal(opencodePermanentFailData.error, 'Unable to generate AI response.');
      assert.match(opencodePermanentFailData.detail, /opencode/);
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

  let historyPayload;
  const historyOriginalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, OPENCODE_URL);
      historyPayload = JSON.parse(init.body);
      capturedPayloads.push(historyPayload);
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'History response' } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };
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
      env({ OPENCODE_GO_API_KEY: 'sk-opencode-test' })
    );
    assert.equal(historyResponse.status, 200);
  } finally {
    globalThis.fetch = historyOriginalFetch;
  }
  assert.deepEqual(
    historyPayload.messages.slice(1).map((message) => message.content),
    ['Earlier question', 'Earlier answer', 'Current question']
  );

  // Online multiplayer routing: WebSocket upgrades go to the GameRoom Durable
  // Object; invalid ids, missing upgrade headers, and missing bindings are
  // rejected before any DO call.
  let gameRoomId = null;
  const gameRoomsBinding = {
    idFromName: (name) => ({ name }),
    get: (id) => {
      gameRoomId = id.name;
      return {
        fetch: async () => new Response('room stub', { status: 200 })
      };
    }
  };
  const gameWsResponse = await worker.fetch(
    new Request('https://corez.test/api/game/ws/dm-123', {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade' }
    }),
    env({ GAME_ROOMS: gameRoomsBinding })
  );
  assert.equal(gameWsResponse.status, 200);
  assert.equal(await gameWsResponse.text(), 'room stub');
  assert.equal(gameRoomId, 'dm-123');

  const gameWsBadId = await worker.fetch(
    new Request('https://corez.test/api/game/ws/BAD%2FID', {
      headers: { Upgrade: 'websocket' }
    }),
    env({ GAME_ROOMS: gameRoomsBinding })
  );
  assert.equal(gameWsBadId.status, 400);

  const gameWsNoUpgrade = await worker.fetch(
    new Request('https://corez.test/api/game/ws/dm-123'),
    env({ GAME_ROOMS: gameRoomsBinding })
  );
  assert.equal(gameWsNoUpgrade.status, 400);
  assert.equal(gameRoomId, 'dm-123');

  // Cross-site WebSocket hijacking guard: a browser-style Origin from a
  // different host is rejected before any DO call.
  const gameWsCrossSite = await worker.fetch(
    new Request('https://corez.test/api/game/ws/dm-123', {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade', Origin: 'https://evil.example' }
    }),
    env({ GAME_ROOMS: gameRoomsBinding })
  );
  assert.equal(gameWsCrossSite.status, 403);
  assert.equal(gameRoomId, 'dm-123');

  // A same-host Origin (the normal browser flow) is accepted.
  const gameWsSameOrigin = await worker.fetch(
    new Request('https://corez.test/api/game/ws/dm-123', {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade', Origin: 'https://corez.test' }
    }),
    env({ GAME_ROOMS: gameRoomsBinding })
  );
  assert.equal(gameWsSameOrigin.status, 200);
  assert.equal(await gameWsSameOrigin.text(), 'room stub');
  assert.equal(gameRoomId, 'dm-123');

  const gameWsNoBinding = await worker.fetch(
    new Request('https://corez.test/api/game/ws/dm-123', {
      headers: { Upgrade: 'websocket' }
    }),
    env()
  );
  assert.equal(gameWsNoBinding.status, 503);

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

  // Image generation via OpenRouter FLUX when OPENROUTER_API_KEY is
  // configured: the payload targets black-forest-labs/flux-1-schnell and the
  // parsed image URL is returned with the FLUX model label.
  const imageOriginalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, OPENROUTER_URL);
      const payload = JSON.parse(init.body);
      capturedPayloads.push(payload);
      assert.equal(payload.model, 'black-forest-labs/flux-1-schnell');
      assert.equal(payload.max_tokens, undefined);
      assert.equal(payload.max_completion_tokens, undefined);
      assert.deepEqual(payload.messages, [{ role: 'user', content: 'A futuristic city' }]);
      return new Response(JSON.stringify({
        choices: [{ message: { images: [{ url: 'https://img.example.com/flux-city.png' }] } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };
    const imageResponse = await worker.fetch(
      new Request('https://corez.test/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'A futuristic city' })
      }),
      env({ OPENROUTER_API_KEY: 'sk-openrouter-test' })
    );
    assert.equal(imageResponse.status, 200);
    const imageData = await imageResponse.json();
    assert.equal(imageData.image, 'https://img.example.com/flux-city.png');
    assert.equal(imageData.model, 'black-forest-labs/flux-1-schnell');
  } finally {
    globalThis.fetch = imageOriginalFetch;
  }

  // A provider-returned non-https image URL is rejected (SSRF guard): the
  // response is an honest 502 and no fetch of the http URL is attempted.
  const insecureImageOriginalFetch = globalThis.fetch;
  let insecureFetchAttempted = false;
  try {
    globalThis.fetch = async (url, _init) => {
      if (typeof url === 'string' && url.startsWith('http://')) {
        insecureFetchAttempted = true;
        return new Response('nope', { status: 500 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { images: [{ url: 'http://internal.example/steal.png' }] } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };
    const insecureImageResponse = await worker.fetch(
      new Request('https://corez.test/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'A futuristic city' })
      }),
      env({ OPENROUTER_API_KEY: 'sk-openrouter-test' })
    );
    assert.equal(insecureImageResponse.status, 502);
    assert.equal(insecureFetchAttempted, false);
  } finally {
    globalThis.fetch = insecureImageOriginalFetch;
  }

  // With no provider key configured an honest 503 is returned and no image
  // fetch is attempted (no fake image provider ever answers).
  const imageNoKeyResponse = await worker.fetch(
    new Request('https://corez.test/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'A futuristic city' })
    }),
    env()
  );
  assert.equal(imageNoKeyResponse.status, 503);
  assert.match((await json(imageNoKeyResponse)).error, /no image provider is configured/);

  // Test /api/memory store + keyword search (no Workers AI embeddings)
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
  const memoryEnv = () => env({ ASSET_BUCKET: memoryBucket });

  const memoryPost = (path, body, environment = memoryEnv()) => worker.fetch(
    new Request(`https://corez.test${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    environment
  );

  // Memory records are stored without embeddings (no Workers AI).
  const store1 = await memoryPost('/api/memory/store', { userId: 'u1', key: 'k1', text: 'User prefers blue themes.' });
  assert.equal(store1.status, 200);
  const store1Data = await json(store1);
  assert.equal(store1Data.embeddingStored, false);
  assert.equal(store1Data.record.embedding, undefined);
  assert.equal(store1Data.record.embeddingModel, undefined);

  await memoryPost('/api/memory/store', { userId: 'u1', key: 'k2', text: 'User plays chess on weekends.' });
  await memoryPost('/api/memory/store', { userId: 'u1', key: 'k3', text: 'User works with React and Vite.' });

  // Search is keyword-based (no Workers AI embeddings/rerank)
  const keywordSearch = await memoryPost('/api/memory/search', { userId: 'u1', query: 'chess' });
  assert.equal(keywordSearch.status, 200);
  const keywordData = await json(keywordSearch);
  assert.equal(keywordData.source, 'keyword');
  assert.ok(keywordData.matches.some(m => m.key === 'k2'));
  assert.ok(keywordData.matches.every(m => m.score === undefined && m.similarity === undefined));

  // Category filter still narrows keyword search
  const categorySearch = await memoryPost('/api/memory/search', { userId: 'u1', query: 'blue', category: 'general' });
  assert.equal(categorySearch.status, 200);
  assert.equal((await json(categorySearch)).source, 'keyword');

  // A query matching nothing returns an empty keyword result
  const noMatchSearch = await memoryPost('/api/memory/search', { userId: 'u1', query: 'quantum physics' });
  assert.equal(noMatchSearch.status, 200);
  assert.deepEqual((await json(noMatchSearch)).matches, []);

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
  const publishCsp = publishedPage.headers.get('content-security-policy');
  assert.match(publishCsp, /sandbox allow-scripts/);
  assert.match(publishCsp, /script-src 'unsafe-inline'/);
  assert.match(publishCsp, /style-src 'unsafe-inline'/);
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

  // No provider payload ever carries an output-token cap: generations run as
  // long as the model needs, across every provider in the fallback chain.
  for (const payload of capturedPayloads) {
    assert.equal(payload.max_tokens, undefined);
    assert.equal(payload.max_completion_tokens, undefined);
  }

  console.log('Cloudflare Worker behavior contract passed.');
}

await run();
