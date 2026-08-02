import assert from 'node:assert/strict';
import worker, {
  buildSwarmAgentSpecs,
  runAdaptiveAgentPool,
  runSwarmMultiWave,
  continueSwarmTask,
  runSwarmTask,
  shouldUseSwarm
} from '../worker/swarm-index.js';
import { createTaskStateStore } from '../worker/utils.js';

const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
delete process.env.OPENROUTER_API_KEY;

function environment(overrides = {}) {
  return {
    ASSETS: {
      async fetch(request) {
        return new Response(`asset:${new URL(request.url).pathname}`);
      }
    },
    ...overrides
  };
}

function post(body, env) {
  return worker.fetch(
    new Request('https://corez.test/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  );
}

async function run() {
  // Swarm gating: only explicit swarm requests, high-complexity app/code-help,
  // or client opt-in (body.swarm === true) use the swarm; everything else is direct.
  assert.equal(shouldUseSwarm('app', 'Build a timer app'), false);
  assert.equal(shouldUseSwarm('app', 'Build a timer app', { complexity: 'high' }), true);
  assert.equal(shouldUseSwarm('app', 'Build a timer app', { complexity: 'epic' }), true);
  assert.equal(shouldUseSwarm('app', 'Build a timer app', { explicitSwarm: true }), true);
  assert.equal(shouldUseSwarm('code-help', 'Fix this React issue'), false);
  assert.equal(shouldUseSwarm('code-help', 'Fix this React issue', { complexity: 'high' }), true);
  assert.equal(shouldUseSwarm('swarm', 'Coordinate several agents'), true);
  assert.equal(shouldUseSwarm('general', 'Hello'), false);
  assert.equal(shouldUseSwarm('app', 'Build an image editor', { hasMedia: true }), false);
  assert.equal(shouldUseSwarm('app', 'Build an image editor', { hasMedia: true, complexity: 'high' }), false);

  const simpleSpecs = buildSwarmAgentSpecs('app', 'Build a timer app');
  const expandedPrompt = Array.from(
    { length: 24 },
    (_, index) => `- Requirement ${index + 1}: implement independent feature ${index + 1}`
  ).join('\n');
  const expandedSpecs = buildSwarmAgentSpecs('app', expandedPrompt);

  assert.ok(simpleSpecs.length >= 5);
  // The wave size is a per-invocation operational boundary, not a total
  // swarm limit: every independent requirement becomes a workstream and is
  // executed in persisted waves.
  assert.equal(expandedSpecs.length, 4 + 24);
  assert.ok(expandedSpecs.length <= 900);
  assert.ok(expandedSpecs.length > simpleSpecs.length);
  assert.equal(new Set(expandedSpecs.map((spec) => spec.agentId)).size, expandedSpecs.length);

  // High-complexity revisions may use specialist analysis where safe: the
  // workstream extractor strips embedded code blocks, so revisions never
  // fragment code into duplicate agents.
  const revisionPrompt = '[Context: The user is requesting a revision for the following code block]\n```html\n<canvas id="g"></canvas>\n```\n\nUser Request: add online multiplayer with a death match mode. And a shop. And more enemies.';
  assert.equal(shouldUseSwarm('app', revisionPrompt, { complexity: 'high' }), true);
  assert.equal(shouldUseSwarm('app', 'Build a new game with ```js\nconsole.log(1)\n``` inside the request', { complexity: 'high' }), true);
  const codeHeavySpecs = buildSwarmAgentSpecs('app', revisionPrompt);
  assert.ok(codeHeavySpecs.length > 0);
  assert.ok(codeHeavySpecs.length <= 900);

  const retryAttempts = new Map();
  const poolResult = await runAdaptiveAgentPool(
    [
      { agentId: 'rate-limited-agent' },
      { agentId: 'healthy-agent' }
    ],
    async (spec, attempt) => {
      retryAttempts.set(spec.agentId, (retryAttempts.get(spec.agentId) || 0) + 1);
      if (spec.agentId === 'rate-limited-agent' && attempt === 0) {
        const error = new Error('429 rate limit');
        error.status = 429;
        throw error;
      }
      return `${spec.agentId}-result`;
    },
    { deadlineMs: 2_000 }
  );

  assert.equal(poolResult.completed.length, 2);
  assert.equal(poolResult.failed.length, 0);
  assert.equal(poolResult.skipped.length, 0);
  assert.equal(retryAttempts.get('rate-limited-agent'), 2);

  const originalFetch = globalThis.fetch;
  const openCodeRequests = [];

  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://opencode.ai/zen/go/v1/chat/completions');
      const payload = JSON.parse(init.body);
      openCodeRequests.push(payload);

      const systemPrompt = payload.messages?.[0]?.content || '';
      const content = systemPrompt.includes('lead synthesis agent')
        ? 'Integrated live swarm response'
        : `Specialist contribution ${openCodeRequests.length}`;

      return new Response(JSON.stringify({
        choices: [{ message: { content } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const body = {
      prompt: 'Build a responsive retro platformer. Add touch controls. Add sound effects.',
      intent: {
        type: 'app',
        summary: 'Build a complete browser game.'
      },
      complexity: 'high',
      messages: [
        { role: 'user', content: 'Build a responsive retro platformer. Add touch controls. Add sound effects.' }
      ]
    };

    const response = await post(body, environment({
      OPENCODE_GO_API_KEY: 'sk-opencode-test',
      SWARM_AGENT_TIMEOUT_MS: '2000',
      SWARM_RESPONSE_DEADLINE_MS: '2000',
      SWARM_SYNTHESIS_TIMEOUT_MS: '2000'
    }));

    assert.equal(response.status, 200);
    const data = await response.json();
    const expectedAgentCount = buildSwarmAgentSpecs('app', body.prompt).length;

    assert.equal(data.content, 'Integrated live swarm response');
    assert.match(data.model, /opencode/i);
    assert.equal(data.swarm.enabled, true);
    assert.equal(data.swarm.created, expectedAgentCount);
    assert.equal(data.swarm.completed, expectedAgentCount);
    assert.equal(data.swarm.failed, 0);
    assert.equal(data.swarm.skipped, 0);

    // 7 completed outputs (4 core + 3 requirements) exceed the collapse
    // threshold, so the hierarchy runs: specialists + one wave summary per
    // wave + one domain summary per domain + the final synthesis call.
    assert.ok(openCodeRequests.length >= expectedAgentCount + 1);
    const synthesisPayload = openCodeRequests.find(
      (payload) => payload.messages?.[0]?.content.includes("You are COREZ AI's lead synthesis agent.")
    );
    assert.ok(synthesisPayload, 'final synthesis call must exist');
    const synthesisUser = synthesisPayload.messages.at(-1).content;
    assert.match(synthesisUser, /Domain summary/);
    assert.doesNotMatch(synthesisUser, /### Contribution/);
    assert.match(synthesisUser, new RegExp(`Hierarchy coverage: ${expectedAgentCount} specialist outputs`));
    assert.ok(openCodeRequests.some((payload) => payload.messages?.[0]?.content.includes('wave summary')));
    assert.ok(openCodeRequests.some((payload) => payload.messages?.[0]?.content.includes('domain summary')));

    for (const payload of openCodeRequests) {
      assert.match(payload.model, /deepseek/i);
      assert.equal(payload.reasoning, undefined);
      assert.equal(payload.provider, undefined);
      assert.equal(payload.max_tokens, undefined);
    }

    // runSwarmTask keeps the documented response shape.
    const direct = await runSwarmTask(
      { prompt: body.prompt, intent: body.intent, complexity: 'high' },
      { OPENCODE_GO_API_KEY: 'sk-opencode-test' },
      null,
      { drain: true, store: createTaskStateStore({}) }
    );
    assert.equal(typeof direct.content, 'string');
    assert.equal(direct.content, 'Integrated live swarm response');
    assert.equal(typeof direct.model, 'string');
    assert.equal(typeof direct.taskId, 'string');
    assert.equal(direct.taskStatus, 'completed');
    assert.equal(typeof direct.telemetry, 'object');
    assert.equal(direct.telemetry.completed, expectedAgentCount);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // OpenCode Go is the only provider: a DeepSeek key is ignored and the
  // swarm still routes through OpenCode Go (or fails honestly without it).
  {
    const originalFetch = globalThis.fetch;
    const deepSeekRequests = [];
    try {
      globalThis.fetch = async (url, init) => {
        assert.equal(url, 'https://opencode.ai/zen/go/v1/chat/completions');
        const payload = JSON.parse(init.body);
        deepSeekRequests.push(payload);

        const systemPrompt = payload.messages?.[0]?.content || '';
        const content = systemPrompt.includes('lead synthesis agent')
          ? 'Integrated OpenCode swarm response'
          : `Specialist contribution ${deepSeekRequests.length}`;

        return new Response(JSON.stringify({
          choices: [{ message: { content } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const body = {
        prompt: 'Build a responsive retro platformer. Add touch controls. Add sound effects.',
        intent: {
          type: 'app',
          summary: 'Build a complete browser game.'
        },
        complexity: 'high',
        messages: [
          { role: 'user', content: 'Build a responsive retro platformer. Add touch controls. Add sound effects.' }
        ]
      };

      const response = await post(body, environment({
        OPENCODE_GO_API_KEY: 'sk-opencode-test',
        DEEPSEEK_API_KEY: 'sk-deepseek-test',
        SWARM_AGENT_TIMEOUT_MS: '2000',
        SWARM_RESPONSE_DEADLINE_MS: '2000',
        SWARM_SYNTHESIS_TIMEOUT_MS: '2000'
      }));

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.content, 'Integrated OpenCode swarm response');
      assert.equal(data.swarm.enabled, true);
      assert.ok(deepSeekRequests.length > 1);

      for (const payload of deepSeekRequests) {
        assert.match(payload.model, /deepseek/i);
        assert.equal(payload.reasoning, undefined);
        assert.equal(payload.provider, undefined);
        assert.equal(payload.max_tokens, undefined);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Without an OpenCode Go key the swarm reports an honest error instead of
  // pretending another provider exists. The provider chain fallback (official
  // DeepSeek API) is stubbed deterministically: a permanent 401 means the
  // worker must return 502 with no live network access.
  {
    const originalFetch = globalThis.fetch;
    const deepSeekRequests = [];
    try {
      globalThis.fetch = async (url) => {
        assert.equal(url, 'https://api.deepseek.com/chat/completions');
        deepSeekRequests.push(url);
        return new Response('unauthorized', { status: 401 });
      };

      const response = await post(
        {
          prompt: 'Build a responsive retro platformer. Add touch controls. Add sound effects.',
          intent: { type: 'app', summary: 'Build a complete browser game.' },
          complexity: 'high'
        },
        environment({ DEEPSEEK_API_KEY: 'sk-deepseek-test' })
      );
      assert.equal(response.status, 502);
      const payload = await response.json();
      assert.match(String(payload.error), /blocked with no usable specialist output/);
      assert.match(String(payload.detail), /No specialist can ever complete/);
      assert.ok(deepSeekRequests.length > 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Durable continuation: task state survives store recreation (a NEW store
  // object bound to the same fake bucket Map), continuations resume rather
  // than restart, and duplicate continuation calls never duplicate work.
  {
    const bucketMap = new Map();
    const bucket = {
      async put(key, value) { bucketMap.set(key, String(value)); },
      async get(key) {
        const value = bucketMap.get(key);
        return value === undefined ? null : { async text() { return value; } };
      },
      async delete(key) { bucketMap.delete(key); }
    };
    const baseEnv = { OPENCODE_GO_API_KEY: 'sk-opencode-test', ASSET_BUCKET: bucket };
    const specs = buildSwarmAgentSpecs('app', expandedPrompt);
    const totalSpecs = specs.length;
    const taskId = 'swarm-durable-continuation-test';

    const originalFetch = globalThis.fetch;
    let providerCalls = 0;
    try {
      globalThis.fetch = async (url, init) => {
        assert.equal(url, 'https://opencode.ai/zen/go/v1/chat/completions');
        providerCalls += 1;
        const payload = JSON.parse(init.body);
        const system = payload.messages?.[0]?.content || '';
        let content;
        if (system.includes("You are COREZ AI's lead synthesis agent.")) {
          content = 'Durable final answer';
        } else if (system.includes('wave summary') || system.includes('domain summary')) {
          content = 'summary ok';
        } else {
          content = 'specialist ok';
        }
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const storeA = createTaskStateStore(baseEnv);
      const first = await runSwarmMultiWave({
        taskId,
        prompt: expandedPrompt,
        intentType: 'app',
        history: [],
        specs,
        apiKey: 'sk-opencode-test',
        env: baseEnv,
        store: storeA,
        options: { waveBudget: 6 }
      });
      assert.equal(first.completed, false);
      assert.ok(first.state.completed.length > 0);
      assert.ok(first.state.queue.length > 0);
      assert.equal(first.state.completed.length + first.state.queue.length, totalSpecs);

      // A NEW store object over the SAME bucket must see the same state.
      const storeB = createTaskStateStore(baseEnv);
      const reloaded = await storeB.load(taskId);
      assert.ok(reloaded);
      assert.equal(reloaded.completed.length, first.state.completed.length);

      let previous = first.state;
      let guard = 0;
      while (previous.queue.length > 0 && guard < 100) {
        const next = await continueSwarmTask({ taskId, env: baseEnv, store: storeB, options: { waveBudget: 6 } });
        assert.ok(['active', 'completed'].includes(next.state.status));
        // Continuation resumes rather than restarts: the queue shrinks and
        // completed work never duplicates an agentId.
        assert.ok(next.state.queue.length < previous.queue.length);
        assert.equal(
          new Set(next.state.completed.map((entry) => entry.spec.agentId)).size,
          next.state.completed.length
        );
        assert.equal(next.state.completed.length + next.state.queue.length, totalSpecs);
        previous = next.state;
        guard += 1;
      }
      assert.equal(previous.status, 'completed');
      assert.equal(previous.queue.length, 0);
      assert.equal(previous.completed.length, totalSpecs);
      assert.equal(previous.finalContent, 'Durable final answer');

      // Duplicate continuation after completion: idempotent — no new waves,
      // no new provider calls, completed work stable.
      const callsAfterCompletion = providerCalls;
      const again = await continueSwarmTask({ taskId, env: baseEnv, store: storeB, options: { waveBudget: 6 } });
      assert.equal(again.completed, true);
      assert.equal(again.state.completed.length, totalSpecs);
      assert.equal(again.state.queue.length, 0);
      assert.equal(providerCalls, callsAfterCompletion);

      // Duplicate mid-flight continuation: the second call advances the next
      // wave deterministically without re-running completed agentIds.
      const taskId2 = 'swarm-duplicate-continuation-test';
      const first2 = await runSwarmMultiWave({
        taskId: taskId2,
        prompt: expandedPrompt,
        intentType: 'app',
        history: [],
        specs,
        apiKey: 'sk-opencode-test',
        env: baseEnv,
        store: storeB,
        options: { waveBudget: 6 }
      });
      assert.equal(first2.completed, false);
      const second2 = await continueSwarmTask({ taskId: taskId2, env: baseEnv, store: storeB, options: { waveBudget: 6 } });
      assert.equal(
        new Set(second2.state.completed.map((entry) => entry.spec.agentId)).size,
        second2.state.completed.length
      );
      assert.ok(second2.state.completed.length > first2.state.completed.length);
      assert.ok(second2.state.queue.length < first2.state.queue.length);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Cancellation during a wave persists status 'cancelled', preserves the
  // completed results and the remaining queue, and never synthesises.
  {
    const bucketMap = new Map();
    const bucket = {
      async put(key, value) { bucketMap.set(key, String(value)); },
      async get(key) {
        const value = bucketMap.get(key);
        return value === undefined ? null : { async text() { return value; } };
      },
      async delete(key) { bucketMap.delete(key); }
    };
    const baseEnv = { OPENCODE_GO_API_KEY: 'sk-opencode-test', ASSET_BUCKET: bucket };
    const specs = buildSwarmAgentSpecs('app', expandedPrompt);
    const taskId = 'swarm-cancel-contract-test';

    const originalFetch = globalThis.fetch;
    let providerCalls = 0;
    try {
      globalThis.fetch = async (url, _init) => {
        assert.equal(url, 'https://opencode.ai/zen/go/v1/chat/completions');
        providerCalls += 1;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const store = createTaskStateStore(baseEnv);
      const first = await runSwarmMultiWave({
        taskId,
        prompt: expandedPrompt,
        intentType: 'app',
        history: [],
        specs,
        apiKey: 'sk-opencode-test',
        env: baseEnv,
        store,
        options: { waveBudget: 6 }
      });
      assert.equal(first.completed, false);
      const callsAfterFirstWave = providerCalls;
      const completedAtCancel = first.state.completed.length;
      const queueAtCancel = first.state.queue.length;

      const controller = new AbortController();
      controller.abort();
      const cancelled = await continueSwarmTask({
        taskId,
        env: baseEnv,
        signal: controller.signal,
        store,
        options: { waveBudget: 6 }
      });
      assert.equal(cancelled.completed, false);
      assert.equal(cancelled.cancelled, true);
      assert.equal(cancelled.state.status, 'cancelled');
      // Results preserved, queue preserved, no synthesis, no new waves.
      assert.equal(cancelled.state.completed.length, completedAtCancel);
      assert.equal(cancelled.state.queue.length, queueAtCancel);
      assert.equal(cancelled.state.finalContent, null);
      assert.equal(providerCalls, callsAfterFirstWave);

      const persisted = await store.load(taskId);
      assert.equal(persisted.status, 'cancelled');
      assert.equal(persisted.completed.length, completedAtCancel);
      assert.equal(persisted.queue.length, queueAtCancel);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const delegatedResponse = await post(
    {
      prompt: 'Explain edge computing',
      intent: { type: 'general', summary: 'Explain directly.' }
    },
    environment()
  );
  assert.equal(delegatedResponse.status, 502);
  const delegatedPayload = await delegatedResponse.json();
  assert.equal(delegatedPayload.error, 'Unable to generate AI response.');
  assert.match(delegatedPayload.detail, /all providers returned no usable response/);

  // Malformed (non-decodable) swarm status ids get a clean 400, never a 500.
  const badStatusResponse = await worker.fetch(
    new Request('https://corez.test/api/swarm/status/%zz', {
      method: 'GET'
    }),
    environment()
  );
  assert.equal(badStatusResponse.status, 400);

  console.log('Live Worker swarm contract passed.');
}

try {
  await run();
} finally {
  if (originalOpenRouterKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
  }
}
