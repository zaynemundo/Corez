import { describe, it, expect } from 'vitest';
import { ModelProviderRouter } from '../../packages/agent-core/providers/index.js';

describe('ModelProviderRouter', () => {
  it('exposes available models catalog', () => {
    const router = new ModelProviderRouter();
    const models = router.getAvailableModels();

    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models.some(m => m.id === 'muse-spark-1.2-contributor')).toBe(true);
  });

  it('registers the Muse Spark 1.2 ModLens vision variant in the catalog', () => {
    const router = new ModelProviderRouter();
    const modlens = router.getAvailableModels().find(m => m.id === 'muse-spark-1.2-contributor-modlens');

    expect(modlens).toBeDefined();
    expect(modlens.name).toMatch(/Muse Spark 1.2/);
    expect(modlens.provider).toBe('modlens');
    expect(modlens.role).toMatch(/Vision/i);
    // Off by default; true when enabled via options or MODLENS_ENABLED.
    expect(modlens.configured).toBe(false);

    const enabled = new ModelProviderRouter({ modlensEnabled: true });
    expect(enabled.getAvailableModels().find(m => m.id === 'muse-spark-1.2-contributor-modlens').configured).toBe(true);
  });

  it('runs local agent fallback simulation when no API key is set', async () => {
    const router = new ModelProviderRouter();
    const res = await router.generate({
      messages: [{ role: 'user', content: 'inspect project files' }],
      tools: [{ name: 'list_directory', description: 'List files' }]
    });

    expect(res).toBeDefined();
    expect(Boolean(res.content || res.toolCalls.length > 0)).toBe(true);
  });

  it('routes OpenCode Go requests through the same zen/go gateway as the worker', async () => {
    const router = new ModelProviderRouter({ opencodeApiKey: 'test-key' });
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, init) => {
        expect(url).toBe('https://opencode.ai/zen/go/v1/chat/completions');
        expect(init.headers.Authorization).toBe('Bearer test-key');
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'gateway response' } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const res = await router.generate({ messages: [{ role: 'user', content: 'hi' }] });
      expect(res.content).toBe('gateway response');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
