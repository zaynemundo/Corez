// COREZ end-to-end /api/ai tests — the full request pipeline through the
// real worker entrypoint:
//   frontend-equivalent request -> HTTP request -> /api/ai -> auth/rate-limit
//   -> router -> provider -> response processor -> validation -> response
//
// Labels: INTEGRATION (mocked provider) / E2E (real HTTP-shaped requests).
// The provider is mocked so these tests are deterministic; LIVE PROVIDER
// runs live against the real provider through scripts/evaluate-benchmark.mjs.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import swarmWorker from '../worker/entry.js';

const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/chat/completions';
const env = { OPENCODE_GO_API_KEY: 'sk-test', __COREZ_RETRY_SLEEP_MS: '0' };

function post(worker, body, customEnv = env) {
  return worker.fetch(
    new Request('https://corez.test/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    customEnv
  );
}

function mockOpenAI(content, extra = {}) {
  return Response.json({
    choices: [{ message: { content, role: 'assistant' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 120, completion_tokens: 340 },
    ...extra
  });
}

function mockSSEBody(chunks, usage = { prompt_tokens: 10, completion_tokens: 20 }) {
  const parts = chunks.map((text) => `data: ${JSON.stringify({
    choices: [{ delta: { content: text }, finish_reason: null }]
  })}\n\n`);
  parts.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage })}\n\n`);
  parts.push('data: [DONE]\n\n');
  return new Response(parts.join(''), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' }
  });
}

describe('E2E /api/ai pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes a request through provider -> response processor -> API response', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      expect(url).toBe(OPENCODE_URL);
      const body = JSON.parse(init.body);
      expect(body.model).toBe('deepseek-v4-flash');
      expect(body.messages[0].role).toBe('system');
      return mockOpenAI('This is a complete and correct answer about compilers. A compiler translates source code into machine code. An interpreter runs code line by line.');
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await post(swarmWorker, {
      prompt: 'Explain the difference between a compiler and an interpreter.',
      intent: { type: 'explanation', summary: 'Explain a technical concept plainly.' }
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.content).toContain('compiler');
    // Diagnostics are part of the API contract.
    expect(data.diagnostics).toBeTruthy();
    expect(data.diagnostics.truncationDetected).toBe(false);
    expect(typeof data.diagnostics.ttftMs).toBe('number');
    expect(data.diagnostics.inputTokens).toBe(120);
    expect(data.diagnostics.outputTokens).toBe(340);
    expect(data.provider).toBe('opencode-go');
  });

  it('rejects empty provider output instead of returning it to the user', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOpenAI('')));
    const response = await post(swarmWorker, { prompt: 'Hello there' });
    expect(response.status).toBe(502);
  });

  it('repairs a truncated provider answer before returning it', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push(init);
      if (calls.length === 1) {
        // First call: truncated answer.
        return mockOpenAI('Here is the full explanation of the internet. Data travels in packets between computers using protocols such as');
      }
      // Repair call: completes the sentence.
      return mockOpenAI(' and IP addresses to identify every machine on the network.');
    }));

    const response = await post(swarmWorker, {
      prompt: 'Explain how the internet works',
      intent: { type: 'explanation', summary: 'Explain a technical concept plainly.' }
    });
    const data = await response.json();
    expect(data.diagnostics.repaired).toBe(true);
    expect(data.diagnostics.truncationDetected).toBe(false);
    expect(data.content).toContain('IP addresses');
  });

  it('returns project state for follow-up continuity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOpenAI(
      "Here's a snake game.\n\n```jsx\nexport default function App() {\n  const [score, setScore] = useState(0);\n  return <canvas ref={canvasRef} />;\n}\n```"
    )));

    const response = await post(swarmWorker, {
      prompt: 'Build me a snake game with a score counter and a game over screen.',
      intent: { type: 'app', summary: 'Create a playable snake game.' },
      messages: [{ role: 'user', content: 'Build me a snake game with a score counter and a game over screen.' }]
    });
    const data = await response.json();
    expect(data.projectState).toBeTruthy();
    expect(data.projectState.framework).toBe('react');
    expect(data.projectState.rendering).toBe('canvas');
    expect(data.projectState.features).toContain('scoring');
  });

  it('injects the project context into the system prompt on follow-up turns', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      const systemPrompts = body.messages.filter((m) => m.role === 'system').map((m) => m.content);
      const joined = systemPrompts.join('\n');
      expect(joined).toContain('EXISTING PROJECT STATE');
      expect(joined).toContain('Framework: react');
      expect(joined).toContain('PRESERVE');
      return mockOpenAI("```jsx\nexport default function App() {\n  const [score, setScore] = useState(0);\n  const speed = 60;\n  return <canvas />;\n}\n```");
    });
    vi.stubGlobal('fetch', fetchMock);

    const project = {
      projectType: 'game',
      framework: 'react',
      language: 'javascript',
      rendering: 'canvas',
      features: ['scoring', 'controls', 'game-over']
    };
    const response = await post(swarmWorker, {
      prompt: 'Now make the snake speed up gradually instead of jumping between levels.',
      intent: { type: 'app', summary: 'Modify the existing snake game.' },
      messages: [
        { role: 'user', content: 'Build me a snake game with a score counter.' },
        { role: 'assistant', content: '```jsx\nexport default function App() {}\n```' }
      ],
      project
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.diagnostics.continuity).toBeTruthy();
    expect(data.diagnostics.continuity.checks['preserved-framework']).toBe(true);
  });

  it('streams SSE deltas when the client requests streaming', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockSSEBody(['The ', 'internet ', 'works ', 'by packets.'])));
    const response = await post(swarmWorker, {
      prompt: 'Explain how the internet works',
      intent: { type: 'explanation', summary: 'Explain a technical concept plainly.' },
      stream: true
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await response.text();
    const deltas = [...text.matchAll(/data: (\{.*?\})\n\n/g)].map((m) => JSON.parse(m[1]));
    const deltaText = deltas.filter((e) => e.type === 'delta').map((e) => e.text).join('');
    expect(deltaText).toBe('The internet works by packets.');
    const done = deltas.find((e) => e.type === 'done');
    expect(done).toBeTruthy();
    const diag = deltas.find((e) => e.type === 'diagnostics');
    expect(diag.diagnostics.ttftMs).toBeGreaterThanOrEqual(0);
  });

  it('restricts the direct Worker hostname to approved CoreZ origins', async () => {
    const unrelatedRoute = await swarmWorker.fetch(new Request('https://ai.zayne-mayo.workers.dev/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://corez.pro' },
      body: JSON.stringify({ prompt: 'paid image' })
    }), env);
    expect(unrelatedRoute.status).toBe(404);

    const blocked = await swarmWorker.fetch(new Request('https://ai.zayne-mayo.workers.dev/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://attacker.example' },
      body: JSON.stringify({ prompt: 'hello', stream: true })
    }), env);
    expect(blocked.status).toBe(403);

    const missingOrigin = await swarmWorker.fetch(new Request('https://ai.zayne-mayo.workers.dev/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello', stream: true })
    }), env);
    expect(missingOrigin.status).toBe(403);

    const allowed = await swarmWorker.fetch(new Request('https://ai.zayne-mayo.workers.dev/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://corez.pro' },
      body: JSON.stringify({ prompt: 'hello', stream: true })
    }), env);
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://corez.pro');

    const allowedChatDomain = await swarmWorker.fetch(new Request('https://ai.zayne-mayo.workers.dev/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://chat.corez.pro' },
      body: JSON.stringify({ prompt: 'hello', stream: true })
    }), env);
    expect(allowedChatDomain.status).toBe(200);
    expect(allowedChatDomain.headers.get('Access-Control-Allow-Origin')).toBe('https://chat.corez.pro');
  });

  it('restricts the direct hostname when Cloudflare rewrites request.url to a configured route', async () => {
    const rewritten = new Request('https://corez.pro/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': 'ai.zayne-mayo.workers.dev',
        'Origin': 'https://attacker.example'
      },
      body: JSON.stringify({ prompt: 'hello', stream: true })
    });
    const response = await swarmWorker.fetch(rewritten, env);
    expect(response.status).toBe(403);
  });

  it('rate-limits abusive clients at the auth layer', async () => {
    const fetchMock = vi.fn(async () => mockOpenAI('answer'));
    vi.stubGlobal('fetch', fetchMock);
    // The limit is 20/min per client; hitting 25 must return 429s.
    let saw429 = false;
    for (let i = 0; i < 25; i += 1) {
      const response = await post(swarmWorker, { prompt: 'hi', intent: { type: 'general' } });
      if (response.status === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});
