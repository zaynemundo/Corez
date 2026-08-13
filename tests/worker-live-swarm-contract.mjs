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
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Inline direct answer' } }]
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

    // Swarm routing is disabled: even a high-complexity /api/ai request runs
    // INLINE through the direct path, so a streamed client always receives
    // SSE (never a JSON body the stream parser would misread as an empty
    // stream and report as 'Hosted AI returned no streamed content.').
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.content, 'Inline direct answer');
    assert.equal(data.swarm, undefined);
    assert.equal(openCodeRequests.length, 1);

    // runSwarmTask stays exported and functional for direct unit use, but it
    // is no longer routed to automatically by /api/ai.
    const direct = await runSwarmTask(
      { prompt: body.prompt, intent: body.intent, complexity: 'high' },
      { OPENCODE_GO_API_KEY: 'sk-opencode-test' },
      null,
      { drain: true, store: createTaskStateStore({}) }
    );
    assert.equal(typeof direct.content, 'string');
    assert.equal(typeof direct.model, 'string');
    assert.equal(typeof direct.taskId, 'string');
    assert.equal(direct.taskStatus, 'completed');
    assert.equal(typeof direct.telemetry, 'object');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // OpenCode Go is the only provider: a DeepSeek key is ignored and the
  // inline route still goes through OpenCode Go (or fails honestly without
  // it). Swarm routing is disabled — even with both keys present the
  // request runs inline through the direct path.
  {
    const originalFetch = globalThis.fetch;
    const openCodeRequests = [];
    try {
      globalThis.fetch = async (url, init) => {
        assert.equal(url, 'https://opencode.ai/zen/go/v1/chat/completions');
        const payload = JSON.parse(init.body);
        openCodeRequests.push(payload);

        const systemPrompt = payload.messages?.[0]?.content || '';
        const content = systemPrompt.includes('lead synthesis agent')
          ? 'Integrated OpenCode swarm response'
          : `Inline answer ${openCodeRequests.length}`;

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
      assert.equal(data.content, 'Inline answer 1');
      assert.equal(data.swarm, undefined);
      // Inline routing: exactly one provider call, no specialist fan-out.
      assert.equal(openCodeRequests.length, 1);

      for (const payload of openCodeRequests) {
        assert.equal(payload.reasoning, undefined);
        assert.equal(payload.provider, undefined);
        assert.equal(payload.max_tokens, undefined);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Without an OpenCode Go key the inline route reports an honest error
  // instead of pretending another provider exists. The provider chain
  // fallback (official DeepSeek API) is stubbed deterministically: a
  // permanent 401 means the worker must return 502 with no live network
  // access.
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
      assert.match(String(payload.error), /Unable to generate AI response/);
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

      // Skills resolved by the chat frontend (e.g. /game -> game-development)
      // must reach every specialist prompt AND the final synthesis, and be
      // persisted in task state so continuations keep them.
      const skills = [
        { id: 'game-development', name: 'Game Development', instructions: 'Build runnable single-file HTML5 canvas games with complete game loops.' },
        { id: 'visual-creative', name: 'Visual Creative Engine', description: '8-bit SVG sprite & visual asset direction.' }
      ];
      const capturedSkillPrompts = [];
      const skillFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url, init) => {
          const messages = JSON.parse(init.body).messages;
          capturedSkillPrompts.push(messages.map((message) => String(message.content || '')).join('\n'));
          const content = 'skill-aware specialist output';
          return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        };
        const skillsStore = createTaskStateStore(baseEnv);
        const skillsTaskId = 'swarm-skills-test';
        const skillsResult = await runSwarmMultiWave({
          taskId: skillsTaskId,
          prompt: expandedPrompt,
          intentType: 'app',
          history: [],
          specs,
          apiKey: 'sk-opencode-test',
          env: baseEnv,
          store: skillsStore,
          skills,
          options: { waveBudget: 6, drain: true }
        });
        assert.equal(skillsResult.completed, true);
        const persistedSkills = (await skillsStore.load(skillsTaskId)).skills;
        assert.deepEqual(persistedSkills.map((s) => s.id), ['game-development', 'visual-creative']);
        assert.equal(
          capturedSkillPrompts.some((text) => text.includes('game-development') && text.includes('HTML5 canvas games')),
          true,
          'specialist prompts must include the game-development skill'
        );
        assert.equal(
          capturedSkillPrompts.some((text) => text.includes('lead synthesis agent') && text.includes('visual-creative')),
          true,
          'synthesis prompt must include the resolved skills'
        );
      } finally {
        globalThis.fetch = skillFetch;
      }

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
