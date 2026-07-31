import assert from 'node:assert/strict';
import worker, {
  buildSwarmAgentSpecs,
  runAdaptiveAgentPool,
  shouldUseSwarm
} from '../worker/swarm-index.js';

const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
delete process.env.OPENROUTER_API_KEY;

function environment(overrides = {}) {
  return {
    AI: {
      async run() {
        return {
          choices: [{ message: { content: 'Base Worker response' } }]
        };
      }
    },
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
  assert.ok(expandedSpecs.length >= 28);
  assert.ok(expandedSpecs.length > simpleSpecs.length);
  assert.equal(new Set(expandedSpecs.map((spec) => spec.agentId)).size, expandedSpecs.length);

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
  const openRouterRequests = [];

  try {
    globalThis.fetch = async (url, init) => {
      assert.ok(url === 'https://openrouter.ai/api/v1/chat/completions' || url === 'https://opencode.ai/api/v1/chat/completions' || url === 'https://opencode.ai/zen/go/v1/chat/completions');
      const payload = JSON.parse(init.body);
      openRouterRequests.push(payload);

      const systemPrompt = payload.messages?.[0]?.content || '';
      const content = systemPrompt.includes('lead synthesis agent')
        ? 'Integrated live swarm response'
        : `Specialist contribution ${openRouterRequests.length}`;

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
      OPENROUTER_API_KEY: 'test-openrouter-key',
      SWARM_AGENT_TIMEOUT_MS: '2000',
      SWARM_RESPONSE_DEADLINE_MS: '2000',
      SWARM_SYNTHESIS_TIMEOUT_MS: '2000'
    }));

    assert.equal(response.status, 200);
    const data = await response.json();
    const expectedAgentCount = buildSwarmAgentSpecs('app', body.prompt).length;

    assert.equal(data.content, 'Integrated live swarm response');
    assert.match(data.model, /deepseek/i);
    assert.equal(data.swarm.enabled, true);
    assert.equal(data.swarm.created, expectedAgentCount);
    assert.equal(data.swarm.completed, expectedAgentCount);
    assert.equal(data.swarm.failed, 0);
    assert.equal(data.swarm.skipped, 0);
    assert.equal(openRouterRequests.length, expectedAgentCount + 1);

    for (const payload of openRouterRequests) {
      assert.match(payload.model, /deepseek/i);
      assert.equal(payload.reasoning.effort, 'high');
      assert.equal(payload.reasoning.exclude, true);
      assert.equal(payload.provider.sort, 'throughput');
      assert.equal(payload.provider.allow_fallbacks, true);
      assert.equal(payload.provider.require_parameters, true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Swarm routes to the official DeepSeek API when DEEPSEEK_API_KEY is set
  {
    const originalFetch = globalThis.fetch;
    const deepSeekRequests = [];
    try {
      globalThis.fetch = async (url, init) => {
        assert.equal(url, 'https://api.deepseek.com/chat/completions');
        const payload = JSON.parse(init.body);
        deepSeekRequests.push(payload);

        const systemPrompt = payload.messages?.[0]?.content || '';
        const content = systemPrompt.includes('lead synthesis agent')
          ? 'Integrated DeepSeek swarm response'
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
        DEEPSEEK_API_KEY: 'sk-deepseek-test',
        SWARM_AGENT_TIMEOUT_MS: '2000',
        SWARM_RESPONSE_DEADLINE_MS: '2000',
        SWARM_SYNTHESIS_TIMEOUT_MS: '2000'
      }));

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.content, 'Integrated DeepSeek swarm response');
      assert.equal(data.swarm.enabled, true);
      assert.ok(deepSeekRequests.length > 1);

      for (const payload of deepSeekRequests) {
        assert.equal(payload.model, 'deepseek-v4-flash');
        assert.equal(payload.reasoning, undefined);
        assert.equal(payload.provider, undefined);
        assert.equal(payload.max_tokens, undefined);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Swarm prefers OpenCode Go when BOTH opencode and DeepSeek keys are set
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
          ? 'Integrated opencode swarm response'
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
        DEEPSEEK_API_KEY: 'sk-deepseek-test',
        SWARM_AGENT_TIMEOUT_MS: '2000',
        SWARM_RESPONSE_DEADLINE_MS: '2000',
        SWARM_SYNTHESIS_TIMEOUT_MS: '2000'
      }));

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.content, 'Integrated opencode swarm response');
      assert.ok(openCodeRequests.length > 1);
      assert.equal(openCodeRequests[0].provider, undefined);
      assert.equal(openCodeRequests[0].reasoning, undefined);
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
  assert.equal(delegatedResponse.status, 200);
  assert.deepEqual(await delegatedResponse.json(), {
    content: 'Base Worker response',
    model: '@cf/moonshotai/kimi-k2.7-code',
    contextWindowTokens: 256_000
  });

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
