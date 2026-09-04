import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/responses';
const _DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
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
  return (invocation.payload.input || invocation.payload.messages)[0].content;
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
    const successBody = await json(successResponse);
    // New API contract: the worker returns provider + diagnostics alongside
    // content/model so clients can report truncation, repairs and latency.
    assert.equal(successBody.content, 'Worker response');
    assert.equal(successBody.model, 'opencode:muse-spark-1.3-contributor');
    assert.equal(successBody.provider, 'opencode-go');
    assert.equal(successBody.diagnostics.truncationDetected, false);
    assert.equal(successBody.diagnostics.repaired, false);
    assert.equal(typeof successBody.diagnostics.ttftMs, 'number');
    assert.equal(invocation.payload.model, 'muse-spark-1.3-contributor');
    assert.ok(Array.isArray(invocation.payload.input || invocation.payload.messages));
    assert.ok(['model', 'messages', 'input', 'reasoning', 'temperature'].includes(Object.keys(invocation.payload)[0]) || Object.keys(invocation.payload).includes('model'));
    // Payload must contain model + input/messages and may include reasoning/temperature for Muse Spark 1.3
    assert.ok(Object.keys(invocation.payload).includes('model'));
    assert.ok(Object.keys(invocation.payload).includes('input') || Object.keys(invocation.payload).includes('messages'));
    assert.equal(invocation.payload.max_tokens, undefined);
    assert.equal(invocation.payload.max_completion_tokens, undefined);
    if (invocation.payload.reasoning !== undefined) {
      assert.ok(typeof invocation.payload.reasoning === 'object');
      assert.ok(['low', 'medium', 'high', 'xhigh'].includes(invocation.payload.reasoning.effort));
      assert.equal(invocation.payload.reasoning.exclude, true);
    }
    // The execution prompt (with the Awwwards design spec) reaches the model
    // as the user message instead of the bare prompt.
    assert.equal((invocation.payload.input || invocation.payload.messages)[1].content, 'Build a timer\n\n--- Awwwards Visual Design Principles ---\nStyle Target: Luxury Dark Mode');
    assert.match((invocation.payload.input || invocation.payload.messages)[0].content, /Build a timer app/);
    assert.match((invocation.payload.input || invocation.payload.messages)[0].content, /Inferred intent: app/);

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
    // No output-token caps anywhere: every request is uncapped so reasoning
    // models can think as long as they need. Reasoning/temperature may be present for Muse Spark 1.3.
    assert.ok(Object.keys(generalPayload).includes('model'));
    assert.ok(Object.keys(generalPayload).includes('input') || Object.keys(generalPayload).includes('messages'));
    assert.equal(generalPayload.max_tokens, undefined);
    assert.equal(generalPayload.max_completion_tokens, undefined);
    if (generalPayload.reasoning !== undefined) {
      assert.ok(['low', 'medium', 'high', 'xhigh'].includes(generalPayload.reasoning.effort));
    }
    assert.equal(generalPayload.max_tokens, undefined);
    assert.match((generalPayload.input || generalPayload.messages)[0].content, /Adaptive Routing - Fast Path/);
    assert.match((generalPayload.input || generalPayload.messages)[0].content, /Inferred intent: general/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // DeepSeek-only is no longer supported for chat: with only DEEPSEEK_API_KEY
  // and no OPENCODE_GO_API_KEY, /api/ai returns honest 502 (no chat provider).
  {
    const originalFetch = globalThis.fetch;
    try {
      let opencodePayload;
      globalThis.fetch = async () => {
        throw new Error('no chat provider should be called when only DeepSeek key is present');
      };

      const deepseekResp = await post(
        JSON.stringify({ prompt: 'Explain black roses', intent: { type: 'general' } }),
        env({ DEEPSEEK_API_KEY: 'sk-deepseek-test' })
      );
      assert.equal(deepseekResp.status, 502);
      const deepseekData = await deepseekResp.json();
      assert.equal(deepseekData.error, 'Unable to generate AI response.');

      // With OPENCODE_GO_API_KEY configured, the request succeeds and the
      // payload carries reasoning for Muse Spark 1.3 but no provider-specific fields.
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
      assert.equal(opencodeKeyData.model, 'opencode:muse-spark-1.3-contributor');
      assert.equal(opencodePayload.model, 'muse-spark-1.3-contributor');
      // No output-token caps anywhere: general requests are uncapped too.
      assert.equal(opencodePayload.max_tokens, undefined);
      assert.ok(Array.isArray(opencodePayload.input || opencodePayload.messages));
      assert.equal((opencodePayload.input || opencodePayload.messages).at(-1).content, 'Explain black roses');
      assert.ok(opencodePayload.reasoning && typeof opencodePayload.reasoning === 'object');
      assert.ok(['low', 'medium', 'high', 'xhigh'].includes(opencodePayload.reasoning.effort));
      assert.equal(opencodePayload.reasoning.exclude, true);
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

      // A thinking-only OpenCode Go reply is reasoning, never the answer:
      // with no built-in recovery the provider fails honestly (no second
      // call with a continuation nudge) and the request returns 502.
      let opencodeGoCalls = 0;
      globalThis.fetch = async (_url, init) => {
        const payload = JSON.parse(init.body);
        capturedPayloads.push(payload);
        opencodeGoCalls += 1;
        return new Response(JSON.stringify({
          choices: [{ message: { content: '', reasoning_content: 'Let me think about the gun model.' } }]
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
      assert.equal(opencodeNudgeResp.status, 502);
      const opencodeNudgeData = await opencodeNudgeResp.json();
      assert.match(opencodeNudgeData.error, /Unable to generate AI response/);
      assert.match(opencodeNudgeData.detail, /empty or reasoning-only/);
      assert.equal(opencodeGoCalls, 1);

      // A truncated thinking-only reply (unclosed <think> marker, no closing
      // tag) is reasoning too: it must never surface, and the provider fails
      // honestly instead of being nudged.
      let opencodeTruncatedCalls = 0;
      globalThis.fetch = async (_url, init) => {
        const payload = JSON.parse(init.body);
        capturedPayloads.push(payload);
        opencodeTruncatedCalls += 1;
        return new Response(JSON.stringify({
          choices: [{ message: { content: '<think>I will plan the shop layout carefully so the action bar is always visible' } }]
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
      assert.equal(opencodeTruncatedResp.status, 502);
      const opencodeTruncatedData = await opencodeTruncatedResp.json();
      assert.match(opencodeTruncatedData.error, /Unable to generate AI response/);
      assert.equal(opencodeTruncatedCalls, 1);

      // OpenCode Go wins when BOTH opencode and DeepSeek keys are configured
      globalThis.fetch = async (url, init) => {
        assert.equal(url, 'https://opencode.ai/zen/go/v1/responses');
        const payload = JSON.parse(init.body);
        capturedPayloads.push(payload);
        assert.equal(payload.model, 'muse-spark-1.3-contributor');
        assert.ok(payload.reasoning && typeof payload.reasoning === 'object');
        assert.ok(['low', 'medium', 'high', 'xhigh'].includes(payload.reasoning.effort));
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
      assert.equal(opencodePreferredData.model, 'opencode:muse-spark-1.3-contributor');

      // Client-supplied body.model is never trusted: the server-controlled
      // model list always wins.
      globalThis.fetch = async (_url, init) => {
        const payload = JSON.parse(init.body);
        capturedPayloads.push(payload);
        assert.equal(payload.model, 'muse-spark-1.3-contributor');
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
        if (url === 'https://opencode.ai/zen/go/v1/responses') {
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
      assert.equal(opencodeRetryData.model, 'opencode:muse-spark-1.3-contributor');
      assert.equal(opencodeRetryCalls, 2);

      // Transient-only OpenCode failure with no further provider: the retry
      // schedule is persisted and the request reports a resumable task
      // instead of a 502 (200 retry-scheduled with a taskId).
      globalThis.fetch = async (url) => {
        assert.equal(url, 'https://opencode.ai/zen/go/v1/responses');
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
        assert.equal(url, 'https://opencode.ai/zen/go/v1/responses');
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

  const complexPrompt = await captureSystemPrompt({
    type: 'app',
    summary: 'Build a complex multiplayer game.',
    primaryIntent: 'game_creation'
  });
  assert.match(complexPrompt, /Adaptive Routing - App & Game Creation Path/);
  assert.match(complexPrompt, /Inferred intent: app/);
  assert.doesNotMatch(complexPrompt, /Complex Path/);

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
    (historyPayload.input || historyPayload.messages).slice(1).map((message) => message.content),
    ['Earlier question', 'Earlier answer', 'Current question']
  );

  // Non-streaming creation harness: the client may skip SSE entirely — the
  // worker runs the ENTIRE build loop and answers with the finished artifact
  // as a single JSON body (corez.pro -> provider -> wait -> full response).
  {
    const harnessArtifact = '<!DOCTYPE html>\n<html lang="en"><head><title>G</title></head>\n<body><canvas id="c"></canvas>\n<button id="startBtn">Play</button>\n<script>\nlet state=\'menu\',score=0,lives=3;\ndocument.getElementById(\'startBtn\').addEventListener(\'click\',function(){state=\'playing\';});\nfunction gameLoop(){ update(); render(); }\nfunction update(){ if(state!==\'playing\')return; score++; if(score>100){state=\'victory\';} if(lives<=0){state=\'gameover\';} }\nfunction render(){}\ndocument.addEventListener(\'keydown\', function(){});\ncanvas.addEventListener(\'mousemove\', function(){});\nrequestAnimationFrame(gameLoop);\n</script></body></html>';
    const harnessOriginalFetch = globalThis.fetch;
    try {
      let harnessProviderCalls = 0;
      globalThis.fetch = async (url, init) => {
        assert.equal(url, OPENCODE_URL);
        harnessProviderCalls += 1;
        const body = JSON.parse(init.body);
        // The harness always streams FROM the provider; only the
        // client-facing delivery is non-streaming.
        assert.equal(body.stream, true);
        // The build phase runs on muse-spark-1.3-contributor (the designated build executor).
        assert.equal(body.model, 'muse-spark-1.3-contributor');
        const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
        return new Response(
          sse({ choices: [{ delta: { content: harnessArtifact }, finish_reason: null }] })
          + sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })
          + 'data: [DONE]\n\n',
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        );
      };
      const harnessResponse = await post(
        JSON.stringify({
          prompt: 'Build a game',
          intent: { type: 'app', primaryIntent: 'game_creation' },
          harness: true,
          stream: false
        }),
        env({ OPENCODE_GO_API_KEY: 'sk-opencode-test' })
      );
      assert.equal(harnessResponse.status, 200);
      assert.match(harnessResponse.headers.get('content-type'), /application\/json/);
      const harnessBody = await json(harnessResponse);
      assert.equal(typeof harnessBody.content, 'string');
      assert.match(harnessBody.content, /<!DOCTYPE html>/);
      assert.ok(harnessBody.diagnostics?.harness, 'harness diagnostics ride in the JSON body');
      assert.ok(harnessProviderCalls >= 1);
    } finally {
      globalThis.fetch = harnessOriginalFetch;
    }
  }

  // Live grounding: a media-release question ("LOOM's latest singles") MUST
  // trigger a real web search and inject the results into the model payload
  // — it is never answered from memory. The internal /api/search call runs
  // through the injected __SEARCH_FETCH stub.
  {
    const liveGroundingOriginalFetch = globalThis.fetch;
    try {
      let livePayload;
      globalThis.fetch = async (url, init) => {
        assert.equal(url, OPENCODE_URL);
        livePayload = JSON.parse(init.body);
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'Grounded answer' } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };
      const liveResponse = await post(
        JSON.stringify({ prompt: "What are LOOM's latest singles?" }),
        env({
          OPENCODE_GO_API_KEY: 'sk-opencode-test',
          __SEARCH_FETCH: async (url) => {
            const u = new URL(url);
            if (u.hostname === 'en.wikipedia.org') {
              return Response.json({
                query: { search: [{ title: 'LOOM (band)', snippet: 'LOOM is an indie rock band.', wordcount: 5 }] }
              });
            }
            return Response.json({ AbstractText: '', RelatedTopics: [] });
          }
        })
      );
      assert.equal(liveResponse.status, 200);
      assert.equal((await json(liveResponse)).content, 'Grounded answer');
      const systemContent = (livePayload.input || livePayload.messages)
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n');
      assert.match(systemContent, /media-releases/);
      assert.match(systemContent, /Live search results/);
      assert.match(systemContent, /LOOM \(band\)/);
    } finally {
      globalThis.fetch = liveGroundingOriginalFetch;
    }
  }

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

  // Image generation via OpenRouter when OPENROUTER_API_KEY is configured:
  // the payload targets the default image model (Nano Banana 2 lite) and the
  // parsed image URL is returned with the model label that served it.
  const imageOriginalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, OPENROUTER_URL);
      const payload = JSON.parse(init.body);
      capturedPayloads.push(payload);
      assert.equal(payload.model, 'google/gemini-3.1-flash-lite-image');
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
    assert.equal(imageData.model, 'google/gemini-3.1-flash-lite-image');
  } finally {
    globalThis.fetch = imageOriginalFetch;
  }

  // OPENROUTER_IMAGE_MODEL overrides the image model chain with one model.
  const overrideImageOriginalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(JSON.parse(init.body).model, 'custom/image-model-x');
      return new Response(JSON.stringify({
        choices: [{ message: { images: [{ url: 'https://img.example.com/custom.png' }] } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };
    const overrideImageResponse = await worker.fetch(
      new Request('https://corez.test/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'A futuristic city' })
      }),
      env({ OPENROUTER_API_KEY: 'sk-openrouter-test', OPENROUTER_IMAGE_MODEL: 'custom/image-model-x' })
    );
    assert.equal(overrideImageResponse.status, 200);
    assert.equal((await json(overrideImageResponse)).model, 'custom/image-model-x');
  } finally {
    globalThis.fetch = overrideImageOriginalFetch;
  }

  // A reference image (the user's own image) is forwarded to the provider as
  // OpenAI-style multimodal content so the image model edits/stylises the
  // reference instead of inventing from text alone.
  const referenceImageOriginalFetch = globalThis.fetch;
  const referenceImageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  try {
    globalThis.fetch = async (url, init) => {
      const payload = JSON.parse(init.body);
      capturedPayloads.push(payload);
      assert.equal(payload.model, 'google/gemini-3.1-flash-lite-image');
      assert.deepEqual(payload.messages, [{
        role: 'user',
        content: [
          { type: 'text', text: 'Restyle my photo in watercolour' },
          { type: 'image_url', image_url: { url: referenceImageDataUrl } }
        ]
      }]);
      return new Response(JSON.stringify({
        choices: [{ message: { images: [{ url: 'https://img.example.com/restyled.png' }] } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };
    const referenceImageResponse = await worker.fetch(
      new Request('https://corez.test/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Restyle my photo in watercolour', referenceImage: referenceImageDataUrl })
      }),
      env({ OPENROUTER_API_KEY: 'sk-openrouter-test' })
    );
    assert.equal(referenceImageResponse.status, 200);
    assert.equal((await json(referenceImageResponse)).image, 'https://img.example.com/restyled.png');
  } finally {
    globalThis.fetch = referenceImageOriginalFetch;
  }

  // A public https reference URL is accepted and forwarded verbatim.
  const httpsReferenceOriginalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      const payload = JSON.parse(init.body);
      assert.deepEqual(payload.messages[0].content[1], {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/user-photo.png' }
      });
      return new Response(JSON.stringify({
        choices: [{ message: { images: [{ url: 'https://img.example.com/https-ref.png' }] } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };
    const httpsReferenceResponse = await worker.fetch(
      new Request('https://corez.test/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Keep this person but change the background', referenceImage: 'https://cdn.example.com/user-photo.png' })
      }),
      env({ OPENROUTER_API_KEY: 'sk-openrouter-test' })
    );
    assert.equal(httpsReferenceResponse.status, 200);
  } finally {
    globalThis.fetch = httpsReferenceOriginalFetch;
  }

  // Malformed or unsafe reference images are rejected with a 400 before any
  // provider call: no plain-text data URLs, no http URLs, no internal hosts.
  const unsafeReferenceOriginalFetch = globalThis.fetch;
  let unsafeProviderAttempted = false;
  try {
    globalThis.fetch = async (_url, _init) => {
      unsafeProviderAttempted = true;
      return new Response(JSON.stringify({ choices: [] }), { status: 200 });
    };
    for (const badReference of [
      'data:text/plain;base64,aGVsbG8=',
      'data:image/png;base64,%%%%',
      'http://cdn.example.com/user-photo.png',
      'https://169.254.169.254/latest/meta-data/',
      'https://localhost/photo.png',
      'not-a-url'
    ]) {
      const badReferenceResponse = await worker.fetch(
        new Request('https://corez.test/api/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'restyle this', referenceImage: badReference })
        }),
        env({ OPENROUTER_API_KEY: 'sk-openrouter-test' })
      );
      assert.equal(badReferenceResponse.status, 400, `referenceImage "${badReference}" must be rejected`);
      assert.match((await json(badReferenceResponse)).error, /referenceImage/);
    }
    assert.equal(unsafeProviderAttempted, false, 'no provider call for invalid reference images');
  } finally {
    globalThis.fetch = unsafeReferenceOriginalFetch;
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

  // A provider-returned https URL pointing at a private / cloud-metadata
  // host is also rejected (SSRF guard) even though the scheme is https:
  // the worker never fetches loopback, private, or link-local ranges.
  const metadataImageOriginalFetch = globalThis.fetch;
  let metadataFetchAttempted = false;
  try {
    globalThis.fetch = async (url, _init) => {
      if (typeof url === 'string' && url.includes('169.254.169.254')) {
        metadataFetchAttempted = true;
        return new Response('imds', { status: 200 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { images: [{ url: 'https://169.254.169.254/latest/meta-data/iam/security-credentials/' }] } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };
    const metadataImageResponse = await worker.fetch(
      new Request('https://corez.test/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'A futuristic city' })
      }),
      env({ OPENROUTER_API_KEY: 'sk-openrouter-test' })
    );
    assert.equal(metadataImageResponse.status, 502);
    assert.match((await json(metadataImageResponse)).error, /non-public image URL/);
    assert.equal(metadataFetchAttempted, false);
  } finally {
    globalThis.fetch = metadataImageOriginalFetch;
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
      memoryStore.set(key, { value, contentType: options?.httpMetadata?.contentType || 'application/octet-stream', customMetadata: options?.customMetadata || {} });
    },
    get: async (key) => memoryStore.has(key) ? {
      text: async () => memoryStore.get(key).value,
      arrayBuffer: async () => {
        const v = memoryStore.get(key).value;
        return typeof v === 'string' ? new TextEncoder().encode(v).buffer : v;
      },
      writeHttpMetadata: (headers) => { headers.set('Content-Type', memoryStore.get(key).contentType); },
      httpEtag: 'mock-etag',
      customMetadata: memoryStore.get(key).customMetadata || {},
      body: memoryStore.get(key).value
    } : null,
    head: async (key) => memoryStore.has(key) ? { customMetadata: memoryStore.get(key).customMetadata || {}, httpEtag: 'mock-etag' } : null,
    delete: async (key) => { memoryStore.delete(key); },
    list: async ({ prefix, limit } = {}) => {
      const keys = [...memoryStore.keys()].filter(k => k.startsWith(prefix || ''));
      const sliced = typeof limit === 'number' ? keys.slice(0, limit) : keys;
      return { objects: sliced.map(key => ({ key })) };
    }
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
  // POST /api/memory/store now derives userId from the session (uid), not
  // body.userId — a malicious body userId is ignored and the request
  // succeeds as the session user (dev in this test env).
  const badMemoryStoreUser = await memoryPost('/api/memory/store', { userId: '../escape', key: 'k', text: 'x' });
  assert.equal(badMemoryStoreUser.status, 200);
  const badMemoryStoreUserBody = await json(badMemoryStoreUser);
  assert.equal(badMemoryStoreUserBody.userId, 'dev');

  const badMemoryStoreKey = await memoryPost('/api/memory/store', { userId: 'u1', key: 'a/b', text: 'x' });
  assert.equal(badMemoryStoreKey.status, 400);

  const badMemoryPath = await worker.fetch(
    new Request('https://corez.test/api/memory/%2E%2E%2Fescape', { method: 'GET' }),
    memoryEnv()
  );
  // GET /api/memory/:userId now scopes to the session user (uid) and ignores the path param, so a traversal attempt is not rejected — it simply lists the session user's memories.
  assert.equal(badMemoryPath.status, 200);

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

  // 1-time custom slug migration: moves creation from auto-generated slug to custom slug
  const customSlugRes = await worker.fetch(
    new Request('https://corez.test/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'my-custom-portfolio', previousSlug: publishData.slug, html: '<h1>Custom Portfolio</h1>', sessionId: 'user-1' })
    }),
    memoryEnv()
  );
  assert.equal(customSlugRes.status, 200);
  const customSlugData = await json(customSlugRes);
  assert.equal(customSlugData.slug, 'my-custom-portfolio');
  assert.equal(customSlugData.url, '/my-custom-portfolio');
  assert.equal(customSlugData.customized, true);

  // Reserved slug rejection
  const reservedSlugRes = await worker.fetch(
    new Request('https://corez.test/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'admin', html: '<h1>Admin</h1>' })
    }),
    memoryEnv()
  );
  assert.equal(reservedSlugRes.status, 400);

  // Invalid slug rejection (e.g., consecutive hyphens)
  const invalidSlugRes = await worker.fetch(
    new Request('https://corez.test/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'bad--slug', html: '<h1>Bad</h1>' })
    }),
    memoryEnv()
  );
  assert.equal(invalidSlugRes.status, 400);

  // Slug collision rejection when renaming to an already-taken slug
  const collisionRes = await worker.fetch(
    new Request('https://corez.test/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'my-custom-portfolio', previousSlug: 'other-existing-site', html: '<h1>Hijack</h1>' })
    }),
    memoryEnv()
  );
  assert.equal(collisionRes.status, 409);

  // Attempting a second custom slug change is rejected (1-time change limit)
  const secondRenameRes = await worker.fetch(
    new Request('https://corez.test/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'my-second-portfolio', previousSlug: 'my-custom-portfolio', html: '<h1>Second</h1>' })
    }),
    memoryEnv()
  );
  assert.equal(secondRenameRes.status, 400);
  const secondRenameError = await json(secondRenameRes);
  assert.match(secondRenameError.error, /already been customized once/i);

  // Updating content under the SAME custom slug is permitted
  const sameSlugRes = await worker.fetch(
    new Request('https://corez.test/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'my-custom-portfolio', previousSlug: 'my-custom-portfolio', html: '<h1>Updated Content</h1>' })
    }),
    memoryEnv()
  );
  assert.equal(sameSlugRes.status, 200);

  // Multi-page publishes: a validated pages map is stored alongside the home
  // document and each page is served at /<slug>/<page>.html with sandbox
  // headers plus a CORS allow-origin (sandboxed pages fetch-swap across the
  // opaque origin).
  const publishMulti = await worker.fetch(
    new Request('https://corez.test/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Multi Page Site',
        html: '<!DOCTYPE html><html><body><h1>Home</h1><a href="about.html">About</a></body></html>',
        pages: {
          'about.html': '<!DOCTYPE html><html><body><h1>About Page</h1></body></html>',
          'contact.html': '<!DOCTYPE html><html><body><h1>Contact Page</h1></body></html>',
          '../escape.html': '<!DOCTYPE html><html><body>Traversal</body></html>',
          'evil/name.html': '<!DOCTYPE html><html><body>Slash</body></html>',
          'BIG.html': '<h1>Upper case name is valid</h1>'
        }
      })
    }),
    memoryEnv()
  );
  assert.equal(publishMulti.status, 200);
  const publishMultiData = await json(publishMulti);

  const multiRecord = JSON.parse(memoryStore.get(`publish/${publishMultiData.slug}.json`).value);
  assert.ok(multiRecord.pages);
  assert.equal(multiRecord.pages['about.html'], '<!DOCTYPE html><html><body><h1>About Page</h1></body></html>');
  assert.equal(multiRecord.pages['../escape.html'], undefined);
  assert.equal(multiRecord.pages['evil/name.html'], undefined);

  const aboutPage = await worker.fetch(
    new Request(`https://corez.test/${publishMultiData.slug}/about.html`, { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(aboutPage.status, 200);
  assert.match(aboutPage.headers.get('content-type'), /text\/html/);
  assert.equal(aboutPage.headers.get('access-control-allow-origin'), '*');
  assert.match(aboutPage.headers.get('content-security-policy'), /sandbox allow-scripts/);
  assert.equal(await aboutPage.text(), '<!DOCTYPE html><html><body><h1>About Page</h1></body></html>');

  // Multi-page home pages serve at the trailing-slash root /<slug>/ so every
  // relative link (<a href="about.html">) resolves to /<slug>/about.html —
  // never the site root. The bare /<slug> path redirects to the root.
  const multiHomeBare = await worker.fetch(
    new Request(`https://corez.test/${publishMultiData.slug}`, { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(multiHomeBare.status, 301);
  assert.equal(multiHomeBare.headers.get('location'), `/${publishMultiData.slug}/`);

  const multiHome = await worker.fetch(
    new Request(`https://corez.test/${publishMultiData.slug}/`, { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(multiHome.status, 200);
  assert.match(multiHome.headers.get('content-type'), /text\/html/);
  assert.equal(await multiHome.text(), '<!DOCTYPE html><html><body><h1>Home</h1><a href="about.html">About</a></body></html>');

  // Unknown sub-pages are 404s, and traversal/invalid paths never match.
  const missingPage = await worker.fetch(
    new Request(`https://corez.test/${publishMultiData.slug}/pricing.html`, { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(missingPage.status, 404);

  const traversalPage = await worker.fetch(
    new Request(`https://corez.test/${publishMultiData.slug}/%2E%2E%2Fsecret.html`, { method: 'GET' }),
    memoryEnv()
  );
  assert.equal(traversalPage.status, 200);
  assert.equal(await traversalPage.text(), `asset:/${publishMultiData.slug}/%2E%2E%2Fsecret.html`);

  // Invalid page names in the pages map are dropped, never stored.
  assert.equal(multiRecord.pages['evil/name.html'], undefined);

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
  assert.deepEqual(Object.keys(junkRecord).sort(), ['createdAt', 'customized', 'html', 'ownerUserId', 'slug', 'title']);
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

  // Oversized decoded payloads are rejected (413) instead of filling R2.
  const uploadTooLarge = await worker.fetch(
    new Request('https://corez.test/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'big.png',
        dataUrl: `data:image/png;base64,${Buffer.alloc(11 * 1024 * 1024).toString('base64')}`,
        mimeType: 'image/png'
      })
    }),
    memoryEnv()
  );
  assert.equal(uploadTooLarge.status, 413);

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

  // No payload ever carries an output-token cap: every request is uncapped,
  // so reasoning models can think as long as they need and deliverables are
  // never cut off mid-generation.
  for (const payload of capturedPayloads) {
    assert.equal(payload.max_tokens, undefined);
    assert.equal(payload.max_completion_tokens, undefined);
  }

  console.log('Cloudflare Worker behavior contract passed.');
}

await run();
