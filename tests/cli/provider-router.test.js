import { describe, it, expect, vi, afterEach } from 'vitest';
import { ModelProviderRouter } from '../../packages/agent-core/providers/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ModelProviderRouter', () => {
  it('exposes a catalog with unique model ids', () => {
    const router = new ModelProviderRouter();
    const models = router.getAvailableModels();

    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models.some(m => m.id === 'deepseek-flash')).toBe(true);
    const ids = models.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('runs local agent fallback simulation when no API key is set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const router = new ModelProviderRouter();
    const res = await router.generate({
      messages: [{ role: 'user', content: 'inspect project files' }],
      tools: [{ name: 'list_directory', description: 'List files' }]
    });

    expect(res).toBeDefined();
    expect(Boolean(res.content || res.toolCalls.length > 0)).toBe(true);
    // Simulated output is marked so callers can tell it from a real answer.
    expect(res.offline).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails loudly instead of fabricating output when a configured provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )));

    const router = new ModelProviderRouter({ opencodeApiKey: 'test-key' });
    await expect(router.generate({
      messages: [{ role: 'user', content: 'hi' }]
    })).rejects.toThrow(/HTTP 401/);
  });

  it('routes OpenCode Go requests through the same zen/go gateway as the worker', async () => {
    const router = new ModelProviderRouter({ opencodeApiKey: 'test-key' });
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, init) => {
        expect(url).toBe('https://opencode.ai/zen/go/v1/chat/completions');
        expect(init.headers.Authorization).toBe('Bearer test-key');
        expect(init.headers['x-opencode-session']).toMatch(/^ses_[A-Za-z0-9]+$/);
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'Visible <thinking>secret</thinking>gateway response' } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const res = await router.generate({ messages: [{ role: 'user', content: 'hi' }] });
      // Inline reasoning never reaches the caller.
      expect(res.content).toBe('Visible gateway response');
      expect(res.content).not.toContain('secret');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('honours an explicit endpoint and API mode override', async () => {
    let calledUrl;
    let payload;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calledUrl = url;
      payload = JSON.parse(init.body);
      return Response.json({
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'legacy response' }]
          }
        ]
      });
    }));

    const router = new ModelProviderRouter({
      opencodeApiKey: 'test-key',
      endpoint: 'https://opencode.test/custom',
      api: 'responses'
    });
    const res = await router.generate({ messages: [{ role: 'user', content: 'hi' }] });

    expect(calledUrl).toBe('https://opencode.test/custom');
    expect(payload.input).toEqual([{ role: 'user', content: 'hi' }]);
    expect(payload.messages).toBeUndefined();
    expect(res.content).toBe('legacy response');
  });
});
