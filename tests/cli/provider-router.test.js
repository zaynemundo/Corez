import { describe, it, expect } from 'vitest';
import { ModelProviderRouter } from '../../packages/agent-core/providers/index.js';

describe('ModelProviderRouter', () => {
  it('exposes available models catalog', () => {
    const router = new ModelProviderRouter();
    const models = router.getAvailableModels();

    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models.some(m => m.id === 'deepseek-v4-pro')).toBe(true);
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
});
