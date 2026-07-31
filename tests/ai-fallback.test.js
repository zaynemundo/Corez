import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateAIResponse, generateLocalAIResponse, isRevisionContextPrompt, trimConversationForRequest, extractCodeFromMessage } from '../src/services/aiService.js';

const GAME_HTML = `<!DOCTYPE html><html><body><canvas id="game"></canvas><script>function gameLoop(){requestAnimationFrame(gameLoop);}requestAnimationFrame(gameLoop);</script></body></html>`;

function revisionPrompt(request) {
  return `[Context: The user is requesting a revision for the following code block]\n\`\`\`\n${GAME_HTML}\n\`\`\`\n\nUser Request: ${request}`;
}

describe('Hosted AI fallback behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects revision-context prompts', () => {
    expect(isRevisionContextPrompt(revisionPrompt('add a shop'))).toBe(true);
    expect(isRevisionContextPrompt('add a shop to my game')).toBe(false);
  });

  it('never discards the code or fabricates a new app for revision requests when hosted AI is down', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'OPENROUTER_API_KEY is not set' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse(revisionPrompt('Revise code: add a shop and a hold click and reload animation'), []);

    expect(response).toContain('I can see the code you want to revise');
    expect(response).toContain('add a shop and a hold click and reload animation');
    expect(response).toContain('OPENROUTER_API_KEY is not set');
    expect(response).not.toContain('```html');
    expect(response).not.toContain('Share the snippet');
  });

  it('reports hosted AI unavailability for code-help with an embedded code block', async () => {
    const response = await generateLocalAIResponse(
      'Help me fix this:\n```js\nlet x = 1;\n```',
      new Error('Hosted AI request failed: 503')
    );

    expect(response).toContain('hosted AI service is currently unavailable');
    expect(response).not.toContain('Share the snippet');
  });

  it('still synthesizes a new app locally for genuine creation prompts when hosted AI is down', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'down' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('Build me a chess game', []);

    expect(response).toContain('```html');
    expect(response).not.toContain('I can see the code you want to revise');
  });

  it('never fabricates an unrelated app for app types the local fallback cannot synthesize', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'down' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('Build me a landing page for a bakery', []);

    expect(response).toContain("doesn't match any app template");
    expect(response).not.toContain('```html');
  });

  it('routes revision requests to the hosted AI when it is available', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/ai') {
        return Response.json({ content: 'Here is the revised game with a shop.' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse(revisionPrompt('add a shop'), []);

    expect(response).toBe('Here is the revised game with a shop.');
    expect(fetchMock).toHaveBeenCalledWith('/api/ai', expect.anything());
  });

  it('strips reasoning blocks from hosted replies', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      content: '<think>I will plan the shop layout.</think>Here is the revised game.'
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse(revisionPrompt('add a shop'), []);

    expect(response).toBe('Here is the revised game.');
    expect(response).not.toContain('<think>');
  });

  it('rejects a thinking-only hosted reply instead of showing it', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      content: '<think>I will plan the shop layout so the action bar is always visible'
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse(revisionPrompt('add a shop and keep the action bar'), []);

    expect(response).not.toContain('<think>');
    expect(response).toContain('I can see the code you want to revise');
    expect(response).toContain('unavailable');
  });

  it('propagates an abort while the response body is downloading instead of fabricating a fallback reply', async () => {
    const abortController = new AbortController();
    const fetchMock = vi.fn(async (_url, _options) => {
      abortController.abort();
      return {
        ok: true,
        json: async () => {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateAIResponse('Tell me about black roses', [], abortController.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledWith('/api/ai', expect.objectContaining({ signal: abortController.signal }));
  });

  it('keeps conversation history compact for low input tokens', async () => {
    const bigCodeBlock = 'x'.repeat(20 * 1024);
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: i % 3 === 0 ? bigCodeBlock : `message ${i}`
    }));

    const trimmed = trimConversationForRequest(history);

    expect(trimmed.length).toBeLessThanOrEqual(6);
    expect(trimmed[trimmed.length - 1]).toEqual(history[history.length - 1]);
    for (const m of trimmed) {
      if (m.content.length > 3000) expect(m.content).toMatch(/\[truncated\]$/);
    }
    expect(JSON.stringify(trimmed).length).toBeLessThan(60 * 1024);

    // Single oversized message still fits within the compact cap
    const single = trimConversationForRequest([{ role: 'user', content: 'y'.repeat(300 * 1024) }]);
    expect(single.length).toBe(1);
    expect(JSON.stringify(single).length).toBeLessThan(60 * 1024);
  });

  it('salvages code from a truncated response with an unterminated code fence', () => {
    const truncated = 'Here is your 3D game:\n\n```html\n<!DOCTYPE html>\n<html>\n<body>\n<canvas id="game"></canvas>\n<script>\nconst scene = new THREE.Scene();\nscene.add(new THREE.BoxGeometry());';

    const code = extractCodeFromMessage(truncated);

    expect(code).toContain('<!DOCTYPE html>');
    expect(code).toContain('THREE.Scene');

    // Prose without a fence must not be misdetected as code
    expect(extractCodeFromMessage('Sorry, the game generation failed.')).toBeNull();
    // Plain prose that merely mentions angle brackets stays null
    expect(extractCodeFromMessage('Use <div> tags in React.')).toBeNull();
  });
});
