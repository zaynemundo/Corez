import { describe, it, expect, vi, afterEach } from 'vitest';
import { ModelProviderRouter, cosineSimilarity, ToolRegistry } from '../../packages/agent-core/index.js';

describe('Vector Embeddings (perplexity/pplx-embed-v1-0.6b)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generates vector embeddings with default model perplexity/pplx-embed-v1-0.6b', async () => {
    const router = new ModelProviderRouter();
    const res = await router.generateEmbeddings({
      input: 'const player = { x: 10, y: 20 };'
    });

    expect(res).toBeDefined();
    expect(res.embeddings).toBeDefined();
    expect(res.embeddings.length).toBe(1);
    expect(Array.isArray(res.embeddings[0])).toBe(true);
    expect(res.embeddings[0].length).toBeGreaterThan(0);
  });

  it('routes embeddings through the OpenCode Go gateway with the deepseek-v4-flash key', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        model: 'perplexity/pplx-embed-v1-0.6b',
        data: [{ embedding: [0.5, 0.5, 0.5] }]
      })
    }));
    vi.stubGlobal('fetch', fetchMock);

    const router = new ModelProviderRouter({ opencodeApiKey: 'sk-opencode' });
    const res = await router.generateEmbeddings({ input: 'hello' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://opencode.ai/zen/go/v1/embeddings');
    expect(init.headers.Authorization).toBe('Bearer sk-opencode');
    expect(JSON.parse(init.body)).toEqual({
      model: 'perplexity/pplx-embed-v1-0.6b',
      input: ['hello']
    });
    expect(res.embeddings).toEqual([[0.5, 0.5, 0.5]]);
    expect(res.offline).toBeUndefined();
  });

  it('honors OPENCODE_EMBED_MODEL and OPENCODE_EMBED_ENDPOINT overrides', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ model: 'custom-embed', data: [{ embedding: [1] }] })
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OPENCODE_EMBED_MODEL', 'custom-embed');
    vi.stubEnv('OPENCODE_EMBED_ENDPOINT', 'https://example.com/v1/embeddings');

    const router = new ModelProviderRouter({ opencodeApiKey: 'sk-opencode' });
    const res = await router.generateEmbeddings({ input: 'hi' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/v1/embeddings');
    expect(JSON.parse(init.body).model).toBe('custom-embed');
    expect(res.embeddings).toEqual([[1]]);
  });

  it('calculates cosine similarity between two vector embeddings', () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];

    const simAB = cosineSimilarity(vecA, vecB);
    const simAC = cosineSimilarity(vecA, vecC);

    expect(simAB).toBeCloseTo(1.0);
    expect(simAC).toBeCloseTo(0.0);
  });

  it('executes embed_text tool via ToolRegistry cleanly', async () => {
    const registry = new ToolRegistry();
    const result = await registry.executeTool('embed_text', {
      text: 'function gameLoop() { update(); render(); }'
    });

    expect(result.model).toContain('perplexity/pplx-embed-v1-0.6b');
    expect(result.dimensions).toBeGreaterThan(0);
    expect(Array.isArray(result.embedding)).toBe(true);
  });
});
