import { describe, it, expect } from 'vitest';
import { ModelProviderRouter, cosineSimilarity, ToolRegistry } from '../../packages/agent-core/index.js';

describe('Vector Embeddings (perplexity/pplx-embed-v1-0.6b)', () => {
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
