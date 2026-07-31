import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isExplicitImageRequest, createImageTitle, generateAIResponse } from '../src/services/aiService.js';

describe('FLUX image request routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('derives a proper title caption from image requests', () => {
    const cases = [
      ['give me an image of a black rose', 'Black Rose'],
      ['generate a picture of a black rose', 'Black Rose'],
      ['show me a photo of a cat', 'Cat'],
      ['create a logo for my startup', 'My Startup'],
      ['i want an image of a sunset', 'Sunset'],
      ['make an image of a castle for my game', 'Castle for My Game'],
      ['give me an image', 'Generated Image'],
      ['draw a picture of the eiffel tower', 'Eiffel Tower'],
      ['render a photo of a red rose in a vase', 'Red Rose in a Vase']
    ];
    for (const [prompt, expected] of cases) {
      expect(createImageTitle(prompt), prompt).toBe(expected);
    }
  });

  it('detects explicit image requests including mid-conversation phrasing', () => {
    const cases = [
      ['give me an image', true],
      ['generate a picture of a black rose', true],
      ['show me a photo of a cat', true],
      ['create a logo for my startup', true],
      ['make an image of a castle for my game', true],
      ['i want an image of a sunset', true],
      ['what is a black rose', false],
      ['explain how image generation works', false],
      ['write an email about images', false],
      ['fix the image upload bug', false],
      ['explain image compression', false],
      ['draw a diagram of a database', false]
    ];
    for (const [prompt, expected] of cases) {
      expect(isExplicitImageRequest(prompt), prompt).toBe(expected);
    }
  });

  it('routes an image request mid-conversation to the FLUX endpoint instead of the LLM', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/image') {
        return Response.json({ image: 'data:image/png;base64,FAKE', model: '@cf/black-forest-labs/flux-1-schnell' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // history length > 1 simulates a continuing conversation (e.g. after "what is a black rose")
    const history = [
      { role: 'user', content: 'what is a black rose' },
      { role: 'assistant', content: 'A black rose is a rose with dark petals.' }
    ];
    const response = await generateAIResponse('give me an image', history);

    expect(response).toContain('![Generated Image](data:image/png;base64,FAKE)');
    expect(fetchMock).toHaveBeenCalledWith('/api/image', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith('/api/ai', expect.anything());
  });

  it('routes a first-message image request to the FLUX endpoint', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/image') {
        return Response.json({ image: 'https://example.com/rose.png' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('generate a picture of a black rose', []);

    expect(response).toContain('![Black Rose](https://example.com/rose.png)');
    expect(fetchMock).toHaveBeenCalledWith('/api/image', expect.anything());
  });

  it('never calls the image endpoint for non-image prompts', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/ai') return Response.json({ content: 'Hosted answer.' });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await generateAIResponse('explain how image generation works', []);

    expect(response).toBe('Hosted answer.');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/image', expect.anything());
  });

  it('replaces [IMAGE_PROMPT:] tags in hosted AI responses with FLUX images', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/ai') {
        return Response.json({ content: 'Here is your image.\n\n[IMAGE_PROMPT: a sunset over the ocean]' });
      }
      if (url === '/api/image') {
        return Response.json({ image: 'https://example.com/sunset.png' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('tell me a story', []);

    expect(response).toContain('![Sunset Over the Ocean](https://example.com/sunset.png)');
    expect(response).not.toContain('[IMAGE_PROMPT:');
    expect(fetchMock).toHaveBeenCalledWith('/api/image', expect.anything());
  });

  it('falls back to a rendered SVG only when the FLUX endpoint is unavailable', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'not configured' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await generateAIResponse('give me an image', []);

    expect(response).toContain('data:image/svg+xml');
    expect(fetchMock).toHaveBeenCalledWith('/api/image', expect.anything());
  });
});
