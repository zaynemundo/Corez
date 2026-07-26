import { describe, it, expect } from 'vitest';
import { ModelProviderRouter, cosineSimilarity, ToolRegistry } from '../../packages/agent-core/index.js';

describe('Vector Embeddings (nvidia/nemotron-3-embed-1b:free)', () => {
  it('generates vector embeddings with default model nvidia/nemotron-3-embed-1b:free', async () => {
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
    }, {
      authorize: async request => {
        expect(request.category).toBe('network');
        return { allowed: true };
      }
    });

    expect(result.model).toContain('nvidia/nemotron-3-embed-1b:free');
    expect(result.dimensions).toBeGreaterThan(0);
    expect(Array.isArray(result.embedding)).toBe(true);
  });

  it('does not execute embed_text without network approval', async () => {
    await expect(new ToolRegistry().executeTool('embed_text', {
      text: 'private source text'
    })).rejects.toMatchObject({ code: 'TOOL_APPROVAL_REQUIRED' });
  });
});
