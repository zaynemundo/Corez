import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import swarmWorker from '../worker/swarm-index.js';

const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/chat/completions';

function post(worker, env, body) {
  return worker.fetch(
    new Request('https://corez.test/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  );
}

describe('AI response speed optimizations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers greetings instantly without calling any LLM provider', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('LLM should not be called for greetings');
    });
    vi.stubGlobal('fetch', fetchMock);

    for (const prompt of ['hi', 'hello', 'hey', 'who are you', 'what is your name', 'good morning']) {
      const response = await post(swarmWorker, {}, { prompt });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.content).toContain("Hello! I'm COREZ AI");
      expect(data.model).toBe('corez-greeting');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fast-path greetings that include real requests', async () => {
    const fetchMock = vi.fn(async (url) => {
      expect(url).toBe(OPENCODE_URL);
      return Response.json({ choices: [{ message: { content: 'real answer' } }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await post(swarmWorker, { OPENCODE_GO_API_KEY: 'test' }, { prompt: 'hi, can you build me a timer app?' });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.content).toBe('real answer');
    expect(data.model).not.toBe('corez-greeting');
  });

  it('routes medium-complexity app requests on the fast direct path (single LLM call)', async () => {
    const fetchMock = vi.fn(async (url) => {
      expect(url).toBe(OPENCODE_URL);
      return Response.json({ choices: [{ message: { content: 'direct app answer' } }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await post(swarmWorker, {
      OPENCODE_GO_API_KEY: 'test',
      __INSPIRATION_FETCH: async () => ({ sites: [], category: 'websites', source: 'Awwwards' })
    }, {
      prompt: 'Build a timer app',
      intent: { type: 'app', summary: 'Build a timer' },
      complexity: 'medium'
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.content).toBe('direct app answer');
    expect(data.swarm).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('routes high-complexity app requests through the swarm', async () => {
    const fetchMock = vi.fn(async (url) => {
      expect(url).toBe(OPENCODE_URL);
      const payload = JSON.parse(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].body);
      const systemPrompt = payload.messages?.[0]?.content || '';
      const content = systemPrompt.includes('lead synthesis agent')
        ? 'synthesized game'
        : `specialist ${fetchMock.mock.calls.length}`;
      return Response.json({ choices: [{ message: { content } }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await post(swarmWorker, {
      OPENCODE_GO_API_KEY: 'test',
      SWARM_AGENT_TIMEOUT_MS: '2000',
      SWARM_RESPONSE_DEADLINE_MS: '2000',
      SWARM_SYNTHESIS_TIMEOUT_MS: '2000'
    }, {
      prompt: 'Build a complete multiplayer RPG with persistent saves',
      intent: { type: 'app', summary: 'Complex game' },
      complexity: 'high'
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.content).toBe('synthesized game');
    expect(data.swarm.enabled).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('routes both simple and complex requests to OpenCode Go with no artificial reasoning-effort caps', async () => {
    // General (explanation) request: fast path with a capped output.
    let generalPayload = null;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      expect(url).toBe(OPENCODE_URL);
      if (!generalPayload) generalPayload = JSON.parse(init.body);
      return Response.json({ choices: [{ message: { content: 'answer' } }] });
    }));

    await post(swarmWorker, { OPENCODE_GO_API_KEY: 'test' }, {
      prompt: 'Explain black roses',
      intent: { type: 'explanation' },
      complexity: 'low'
    });

    expect(generalPayload).not.toBeNull();
    expect(generalPayload.model).toBe('deepseek-v4-flash');
    expect(generalPayload.reasoning).toBeUndefined();
    expect(generalPayload.max_completion_tokens).toBeUndefined();
    // Fast path: capped output tokens so general answers come back quickly.
    expect(generalPayload.max_tokens).toBe(700);

    // Complex app request: NO output-token cap and no reasoning-effort cap —
    // the model decides how much reasoning/output the task needs.
    let complexPayload = null;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      expect(url).toBe(OPENCODE_URL);
      if (!complexPayload) complexPayload = JSON.parse(init.body);
      return Response.json({ choices: [{ message: { content: 'answer' } }] });
    }));

    await post(swarmWorker, { OPENCODE_GO_API_KEY: 'test' }, {
      prompt: 'Build a full SaaS platform with auth and billing',
      intent: { type: 'app' },
      complexity: 'high'
    });

    expect(complexPayload).not.toBeNull();
    expect(complexPayload.model).toBe('deepseek-v4-flash');
    expect(complexPayload.reasoning).toBeUndefined();
    expect(complexPayload.max_tokens).toBeUndefined();
    expect(complexPayload.max_completion_tokens).toBeUndefined();
  });
});
