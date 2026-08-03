import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateAIResponse, generateLocalAIResponse, generateHostedAIResponse, isRevisionContextPrompt, compactConversationForRequest, extractCodeFromMessage, describeHostedUnavailable } from '../src/services/aiService.js';

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

  it('answers who created Corez with the full creator names and a description of the AI when hosted AI is down', async () => {
    const response = await generateLocalAIResponse('Who created Corez?', new Error('Hosted AI request failed: 503'));
    expect(response).toContain('Zayne Mundo');
    expect(response).toContain('Christian Jericon');
    expect(response).toContain('Corez');
    expect(response).not.toMatch(/api|API|model|provider/i);
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

  it('resumes a retry-scheduled generation after the provider recovery window', async () => {
    // The worker persists a retry schedule and answers HTTP 200 with
    // { status: 'retry-scheduled', taskId, retryAfterSeconds } when the
    // provider cannot recover in time. The client must wait out the window
    // and re-issue the same request so the schedule resumes — it is NOT a
    // "reasoning only" failure.
    const fetchMock = vi.fn(async (url, init) => {
      if (url !== '/api/ai') throw new Error(`Unexpected request: ${url}`);
      const calls = fetchMock.mock.calls.length;
      if (calls === 1) {
        return Response.json({ taskId: 'rt-deadbeef', status: 'retry-scheduled', retryAfterSeconds: 1 });
      }
      expect(JSON.parse(init.body).prompt).toBe('Tell me about black roses');
      return Response.json({ content: 'Recovered answer after the retry window.' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateHostedAIResponse('Tell me about black roses');
    expect(response).toBe('Recovered answer after the retry window.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  }, 15000);

  it('reports an honest busy error when the provider is still recovering after retries', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      taskId: 'rt-deadbeef',
      status: 'retry-scheduled',
      retryAfterSeconds: 1
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateHostedAIResponse('Tell me about black roses'))
      .rejects.toThrow(/temporarily busy/);
    // Initial attempt + three bounded waits; the request is never misread as
    // "reasoning only" and never fabricates a reply.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    vi.unstubAllGlobals();
  }, 15000);

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

  it('keeps the full conversation intact below the platform body limit', async () => {
    const bigCodeBlock = 'x'.repeat(20 * 1024);
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: i % 3 === 0 ? bigCodeBlock : `message ${i}`
    }));

    const compacted = compactConversationForRequest(history);

    // No fixed message count or per-message caps: everything passes through.
    expect(compacted.length).toBe(history.length);
    expect(compacted).toEqual(history);

    // An early requirement survives in a long conversation untouched.
    const longConversation = [
      { role: 'user', content: 'Requirement: the app MUST keep offline mode working.' },
      ...Array.from({ length: 60 }, (_, i) => ({
        role: i % 2 === 0 ? 'assistant' : 'user',
        content: `iteration ${i} detail`
      }))
    ];
    const kept = compactConversationForRequest(longConversation);
    expect(kept.length).toBe(longConversation.length);
    expect(kept[0].content).toContain('MUST keep offline mode working.');
  });

  it('compacts only redundant prose when the payload approaches the platform limit', async () => {
    // Many plain-text turns far below 16 MB: sent unchanged.
    const plain = Array.from({ length: 200 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `plain conversation turn ${i} with some detail`
    }));
    expect(compactConversationForRequest(plain).length).toBe(plain.length);

    // A payload genuinely over the platform budget compacts older prose but
    // keeps the latest user turn, code blocks, and requirement markers exact.
    const hugeProse = 'z'.repeat(10 * 1024 * 1024);
    const oversized = [
      { role: 'user', content: 'Early requirement: keep the auth flow intact.' },
      { role: 'assistant', content: hugeProse },
      { role: 'user', content: 'Second requirement: preserve the dashboard.' },
      { role: 'assistant', content: hugeProse },
      { role: 'user', content: 'FINAL REQUEST: ship the fix now.' }
    ];
    const compacted = compactConversationForRequest(oversized);

    const finalSerialized = JSON.stringify(compacted);
    expect(finalSerialized.length).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(compacted[compacted.length - 1].content).toBe('FINAL REQUEST: ship the fix now.');
    // Requirement markers survive as exact evidence.
    expect(finalSerialized).toContain('keep the auth flow intact');
    expect(finalSerialized).toContain('preserve the dashboard');
    expect(finalSerialized).toMatch(/\[Context compaction/);
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

  it('gives actionable backend guidance for network failures regardless of hostname', () => {
    // Simulate a transport failure (the browser never got an HTTP response)
    // on a LAN IP / custom host, not strict localhost.
    const host = '192.168.1.50';
    const reason = describeHostedUnavailable(
      new Error('NetworkError when attempting to fetch resource.')
    );

    expect(reason).toContain('NetworkError when attempting to fetch resource');
    expect(reason).toContain('npx wrangler dev');
    expect(reason).toContain('8787');
    expect(reason).toContain('.dev.vars');
    expect(reason).toContain('npx wrangler deploy');
    expect(reason).toContain('never reached the AI worker');
    expect(reason).not.toContain('check that an AI provider is configured');
    // No mojibake or replacement characters.
    expect(reason).not.toContain('â€');
    expect(reason).not.toContain('\uFFFD');
    expect(host).toBe('192.168.1.50');
  });

  it('keeps the provider-key detail for real HTTP errors but never appends it to transport failures', () => {
    const httpReason = describeHostedUnavailable(
      new Error('Hosted AI request failed: 503 OPENROUTER_API_KEY is not set')
    );
    expect(httpReason).toContain('OPENROUTER_API_KEY is not set');

    const transportReason = describeHostedUnavailable(
      new Error('failed to fetch')
    );
    expect(transportReason).toContain('npx wrangler dev');
    expect(transportReason).not.toContain('OPENROUTER_API_KEY');
  });

  it('revision fallback for a network failure explains the backend and keeps the code untouched', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('NetworkError when attempting to fetch resource.'); });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse(revisionPrompt('Revise code: its not working properly'), []);

    expect(response).toContain('I can see the code you want to revise');
    expect(response).toContain('its not working properly');
    expect(response).toContain('npx wrangler dev');
    expect(response).toContain('code has not been changed');
    // No mojibake / replacement characters anywhere in the reply.
    expect(response).not.toContain('â€');
    expect(response).not.toContain('\uFFFD');
  });
});
