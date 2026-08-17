import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isExplicitImageRequest,
  isMixedQuestionImageRequest,
  extractImageSubject,
  extractQuestionPrompt,
  createImageTitle,
  generateAIResponse,
} from '../src/services/aiService.js';

describe('image request routing', () => {
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
      ['render a photo of a red rose in a vase', 'Red Rose in a Vase'],
      ['show me an image of a black rose and explain what it is', 'Black Rose']
    ];
    for (const [prompt, expected] of cases) {
      expect(createImageTitle(prompt), prompt).toBe(expected);
    }
  });

  it('detects mixed question + image requests', () => {
    const mixed = [
      'what is black rose and can you show me an image',
      'what is a black rose? show me a picture',
      'explain photosynthesis and give me a picture',
      'tell me about the eiffel tower and show me a photo'
    ];
    for (const prompt of mixed) {
      expect(isMixedQuestionImageRequest(prompt), prompt).toBe(true);
    }

    const notMixed = [
      'what is a black rose',
      'show me an image of a black rose',
      'explain how image generation works',
      'generate a picture of a castle'
    ];
    for (const prompt of notMixed) {
      expect(isMixedQuestionImageRequest(prompt), prompt).toBe(false);
    }
  });

  it('extracts the image subject and question from a mixed request', () => {
    const prompt = 'what is black rose and can you show me an image';
    expect(extractImageSubject(prompt)).toBe('black rose');
    expect(extractQuestionPrompt(prompt)).toBe('what is black rose');
    expect(createImageTitle(extractImageSubject(prompt))).toBe('Black Rose');
  });

  it('answers the question AND renders the image for mixed requests', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/image') {
        return Response.json({ image: 'data:image/png;base64,FAKE' });
      }
      if (url === '/api/ai') {
        return Response.json({ content: 'A black rose is a rose with dark petals.' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('what is black rose and can you show me an image', []);

    expect(response).toContain('A black rose is a rose with dark petals.');
    expect(response).toContain('![](data:image/png;base64,FAKE)');
    expect(fetchMock).toHaveBeenCalledWith('/api/image', expect.anything());
    expect(fetchMock).toHaveBeenCalledWith('/api/ai', expect.anything());
  });

  it('detects explicit image requests including mid-conversation phrasing', () => {
    const cases = [
      ['give me an image', true],
      ['generate a picture of a black rose', true],
      ['show me a photo of a cat', true],
      ['create a logo for my startup', true],
      ['make an image of a castle for my game', true],
      ['i want an image of a sunset', true],
      ['/image a futuristic hovercraft', true],
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
        return Response.json({ image: 'data:image/png;base64,FAKE', model: 'black-forest-labs/flux-1-schnell' });
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

    expect(response).toContain('![](data:image/png;base64,FAKE)');
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

    expect(response).toContain('![](https://example.com/rose.png)');
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

  it('replaces [IMAGE_PROMPT:] tags in hosted AI responses with generated images', async () => {
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

    expect(response).toContain('![](https://example.com/sunset.png)');
    expect(response).not.toContain('[IMAGE_PROMPT:');
    expect(fetchMock).toHaveBeenCalledWith('/api/image', expect.anything());
  });

  it('uses a clearly labelled local placeholder when the image endpoint is unavailable', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'not configured' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await generateAIResponse('give me an image', []);

    expect(response).toContain('data:image/svg+xml');
    expect(decodeURIComponent(response)).toContain('LOCAL IMAGE PLACEHOLDER');
    expect(fetchMock).toHaveBeenCalledWith('/api/image', expect.anything());
  });

  it('forwards the user reference image to the image endpoint', async () => {
    const referenceImage = 'data:image/png;base64,REFERENCE_BASE64';
    let forwardedBody = null;
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/image') {
        forwardedBody = JSON.parse(init.body);
        return Response.json({ image: 'data:image/png;base64,FAKE' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // A user message carrying an image attachment thumb (the reference the
    // user gave) followed by an image request routes the reference along.
    const history = [
      { role: 'user', content: 'here is my photo', attachments: [{ name: 'me.png', type: 'image/png', thumb: referenceImage }] },
      { role: 'assistant', content: 'Got it.' },
    ];
    const response = await generateAIResponse('give me an image: turn my photo into a cartoon', history);

    expect(forwardedBody).not.toBeNull();
    expect(forwardedBody.referenceImage).toBe(referenceImage);
    expect(forwardedBody.prompt).toBeTruthy();
    expect(response).toContain('![](data:image/png;base64,FAKE)');
    expect(fetchMock).toHaveBeenCalledWith('/api/image', expect.anything());
  });

  it('sends no referenceImage when the user gave no image', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/image') {
        const body = JSON.parse(init.body);
        expect(body.referenceImage).toBeUndefined();
        return Response.json({ image: 'data:image/png;base64,FAKE' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('give me an image of a castle', []);

    expect(response).toContain('![](data:image/png;base64,FAKE)');
    expect(fetchMock).toHaveBeenCalledWith('/api/image', expect.anything());
  });
});
