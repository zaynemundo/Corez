import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import swarmWorker from '../worker/entry.js';

const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/responses';

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

  it('answers greetings instantly with a natural reply and no LLM provider call', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('LLM should not be called for greetings');
    });
    vi.stubGlobal('fetch', fetchMock);

    // Natural greeting contract: short, human, creation-oriented — never the
    // robotic fixed line. Identity questions carry the persona.
    for (const prompt of ['hi', 'hello', 'hey', 'good morning']) {
      const response = await post(swarmWorker, {}, { prompt });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.content).not.toContain("Hello! I'm COREZ AI");
      expect(data.content.length).toBeLessThan(120);
      expect(data.content).toMatch(/building|create|idea/i);
      expect(data.model).toBe('corez-greeting');
    }
    for (const prompt of ['who are you', 'what is your name']) {
      const response = await post(swarmWorker, {}, { prompt });
      const data = await response.json();
      expect(data.content).toContain('COREZ AI');
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

  it('routes high-complexity app requests inline (no swarm intercept, single LLM call)', async () => {
    const fetchMock = vi.fn(async (url) => {
      expect(url).toBe(OPENCODE_URL);
      return Response.json({ choices: [{ message: { content: 'inline game answer' } }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await post(swarmWorker, {
      OPENCODE_GO_API_KEY: 'test',
      __INSPIRATION_FETCH: async () => ({ sites: [], category: 'gaming', source: 'Awwwards' })
    }, {
      prompt: 'Build a complete multiplayer RPG with persistent saves',
      intent: { type: 'app', summary: 'Complex game' },
      complexity: 'high'
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    // Swarm routing is disabled: the request runs inline through the direct
    // path, so a streamed client always receives SSE (never a JSON body the
    // stream parser would misread as an empty stream).
    expect(data.content).toBe('inline game answer');
    expect(data.swarm).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not fetch web-design inspiration for a plain typed game request', async () => {
    const inspirationFetch = vi.fn(async () => ({
      sites: [{ title: 'Web Design Reference', url: 'https://example.com' }],
      category: 'gaming',
      source: 'Awwwards'
    }));
    let providerPayload;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      providerPayload = JSON.parse(init.body);
      return Response.json({ choices: [{ message: { content: 'game answer' } }] });
    }));

    const response = await post(swarmWorker, {
      OPENCODE_GO_API_KEY: 'test',
      __INSPIRATION_FETCH: inspirationFetch
    }, {
      prompt: 'Build a playable snake game',
      intent: { type: 'app', summary: 'Create an interactive application.' }
    });

    expect(response.status).toBe(200);
    expect(inspirationFetch).not.toHaveBeenCalled();
    const payloadMsgs = providerPayload.input || providerPayload.messages;
    expect(payloadMsgs[0].content).toContain('do NOT default to retro, pixel art, neon, or another fixed aesthetic');
    expect(payloadMsgs.some((message) => /Live design inspiration from Awwwards/.test(message.content))).toBe(false);
  });

  it('keeps web-design inspiration for non-game app requests', async () => {
    const inspirationFetch = vi.fn(async () => ({
      sites: [{ title: 'App Reference', url: 'https://example.com' }],
      category: 'websites',
      source: 'Awwwards'
    }));
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      choices: [{ message: { content: 'app answer' } }]
    })));

    const response = await post(swarmWorker, {
      OPENCODE_GO_API_KEY: 'test',
      __INSPIRATION_FETCH: inspirationFetch
    }, {
      prompt: 'Build a timer app',
      intent: { type: 'app', summary: 'Create a timer app.' },
      fineIntent: { type: 'app', primaryIntent: 'app' }
    });

    expect(response.status).toBe(200);
    expect(inspirationFetch).toHaveBeenCalledTimes(1);
  });

  it('routes both simple and complex requests to OpenCode Go with adaptive reasoning effort and no output-token caps', async () => {
    // General (explanation) request: low reasoning effort for speed, uncapped output.
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
    expect(generalPayload.model).toBe('muse-spark-1.3-contributor');
    expect(generalPayload.reasoning).toEqual({ effort: 'low', exclude: true });
    expect(generalPayload.temperature).toBeDefined();
    expect(generalPayload.max_completion_tokens).toBeUndefined();
    // No output-token caps anywhere: general answers run uncapped so
    // reasoning models can think as long as they need.
    expect(generalPayload.max_tokens).toBeUndefined();

    // Complex app request: high reasoning effort for thoroughness, still uncapped.
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
    expect(complexPayload.model).toBe('muse-spark-1.3-contributor');
    expect(complexPayload.reasoning).toEqual({ effort: 'high', exclude: true });
    expect(complexPayload.temperature).toBeDefined();
    expect(complexPayload.max_tokens).toBeUndefined();
    expect(complexPayload.max_completion_tokens).toBeUndefined();
  });
});
