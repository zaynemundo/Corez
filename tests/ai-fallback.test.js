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

  it('never answers explanation prompts with a meta-template when hosted AI is down', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'down' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('What is red?', []);

    expect(response).not.toContain('useful way to think about');
    expect(response).not.toContain('I understand the goal');
    expect(response).toMatch(/hosted AI service is currently unavailable/i);
    expect(response).toMatch(/Core idea/);
    expect(response).toMatch(/Next step/);
  });

  it('states the exact hosted error for explanation fallbacks', async () => {
    const response = await generateLocalAIResponse('What is red?', new Error('Hosted AI request failed: 503'));
    expect(response).toMatch(/hosted AI service is currently unavailable/i);
    expect(response).not.toContain('Hereâ€™s the useful way to think about');
  });

  it('streams hosted responses without a temporal-dead-zone crash', async () => {
    const fetchMock = vi.fn(async () => new Response(
      'data: {"type":"meta"}\n\ndata: {"type":"delta","text":"Red is a color. "}\n\ndata: {"type":"delta","text":"It has the longest wavelength."}\n\ndata: {"type":"done","final":true}\n\n',
      { status: 200 }
    ));
    vi.stubGlobal('fetch', fetchMock);

    const deltas = [];
    const response = await generateHostedAIResponse('What is red?', undefined, [], null, {
      stream: true,
      onDelta: (text) => deltas.push(text)
    });

    expect(response).toBe('Red is a color. It has the longest wavelength.');
    expect(deltas).toEqual(['Red is a color. ', 'It has the longest wavelength.']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails immediately when a stream completes with zero deltas', async () => {
    let aiCalls = 0;
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/inspiration') return Response.json({ sites: [] });
      aiCalls += 1;
      return new Response(
        'data: {"type":"meta"}\n\ndata: {"type":"done","final":true}\n\n',
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateHostedAIResponse('Build a game', undefined, [], null, {
      stream: true,
      onDelta: () => {}
    })).rejects.toThrow('Hosted AI returned no streamed content.');
    // No built-in recovery: the request is issued exactly once.
    expect(aiCalls).toBe(1);
  });

  it('diagnoses a JSON answer delivered as a non-SSE body instead of reporting an empty stream', async () => {
    // A JSON 200 body (e.g. a fast-path answer) has zero `data:` lines; the
    // stream parser must surface the real content, never a fake empty stream.
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/inspiration') return Response.json({ sites: [] });
      return new Response(
        JSON.stringify({ content: 'Greeting from the fast path.', model: 'corez-greeting' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateHostedAIResponse('hi', undefined, [], null, {
      stream: true,
      onDelta: () => {}
    });

    expect(response).toBe('Greeting from the fast path.');
  });

  it('reports a security-challenge page verbatim instead of a fake empty stream', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/inspiration') return Response.json({ sites: [] });
      return new Response(
        '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>challenge</body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateHostedAIResponse('Build a game', undefined, [], null, {
      stream: true,
      onDelta: () => {}
    })).rejects.toThrow(/security challenge page/i);
  });

  it('reports an empty body honestly instead of a fake empty stream', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/inspiration') return Response.json({ sites: [] });
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateHostedAIResponse('Build a game', undefined, [], null, {
      stream: true,
      onDelta: () => {}
    })).rejects.toThrow(/empty response/i);
  });

  it('diagnoses a 403 challenge page as a WAF interception instead of a generic HTTP failure', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/inspiration') return Response.json({ sites: [] });
      return new Response(
        '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>challenge</body></html>',
        { status: 403, headers: { 'Content-Type': 'text/html' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateHostedAIResponse('Build a game', undefined, [], null, {
      stream: true,
      onDelta: () => {}
    })).rejects.toThrow(/WAF bypass rule for \/api\//i);
    const aiCalls = fetchMock.mock.calls.filter(([url]) => url !== '/api/inspiration');
    expect(aiCalls).toHaveLength(2);
    expect(aiCalls[1][0]).toBe('https://chat.zayne-mayo.workers.dev/api/ai');
  });

  it('retries a Cloudflare challenge through the direct Worker hostname', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/inspiration') return Response.json({ sites: [] });
      if (url === '/api/ai') {
        return new Response(
          '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>challenge</body></html>',
          { status: 403, headers: { 'Content-Type': 'text/html', 'cf-mitigated': 'challenge' } }
        );
      }
      expect(url).toBe('https://chat.zayne-mayo.workers.dev/api/ai');
      return new Response(
        'data: {"type":"delta","text":"Playable game HTML"}\n\ndata: {"type":"done","final":true}\n\n',
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateHostedAIResponse('Build a game', undefined, [], null, {
      stream: true,
      onDelta: () => {}
    });

    expect(response).toBe('Playable game HTML');
    expect(fetchMock.mock.calls.filter(([url]) => url !== '/api/inspiration')).toHaveLength(2);
  });

  it('does not bypass the primary endpoint for ordinary 403 errors', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/inspiration') return Response.json({ sites: [] });
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateHostedAIResponse('Build a game', undefined, [], null, {
      stream: true,
      onDelta: () => {}
    })).rejects.toThrow(/HTTP 403/i);
    expect(fetchMock.mock.calls.filter(([url]) => url !== '/api/inspiration')).toHaveLength(1);
  });

  it('does not bypass an explicit Cloudflare block page', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/inspiration') return Response.json({ sites: [] });
      return new Response('<!DOCTYPE html><html><body>Access denied</body></html>', {
        status: 403,
        headers: { 'Content-Type': 'text/html', 'cf-mitigated': 'block' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateHostedAIResponse('Build a game', undefined, [], null, {
      stream: true,
      onDelta: () => {}
    })).rejects.toThrow(/HTTP 403/i);
    expect(fetchMock.mock.calls.filter(([url]) => url !== '/api/inspiration')).toHaveLength(1);
  });

  it('forwards harness phase and clear events and returns only the final artifact', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/inspiration') return Response.json({ sites: [] });
      return new Response(
        [
          'data: {"type":"meta"}',
          'data: {"type":"phase","phase":"planning","attempt":0,"total":5}',
          'data: {"type":"phase","phase":"building","attempt":0,"total":5}',
          'data: {"type":"delta","text":"BROKEN build"}',
          'data: {"type":"phase","phase":"verifying","attempt":0,"total":5}',
          'data: {"type":"phase","phase":"repairing","attempt":1,"total":5}',
          'data: {"type":"clear"}',
          'data: {"type":"delta","text":"FIXED build"}',
          'data: {"type":"phase","phase":"done","attempt":1,"total":5}',
          'data: {"type":"done","final":true}',
          'data: {"type":"diagnostics","diagnostics":{"harness":{"repairRounds":1}}}'
        ].join('\n\n'),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const phases = [];
    let cleared = 0;
    const response = await generateHostedAIResponse('Build a game', undefined, [], null, {
      stream: true,
      onDelta: () => {},
      onPhase: (event) => phases.push(event.phase),
      onClear: () => { cleared += 1; }
    });

    expect(response).toBe('FIXED build');
    expect(phases).toEqual(['planning', 'building', 'verifying', 'repairing', 'done']);
    expect(cleared).toBe(1);
  });

  it('fails immediately when the worker reports a build-in-progress error', async () => {
    let aiCalls = 0;
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/inspiration') return Response.json({ sites: [] });
      aiCalls += 1;
      return new Response(
        'data: {"type":"error","status":429,"retryable":true,"message":"A build for this request is already in progress."}\n\n',
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    // No built-in recovery: the worker's reason is surfaced verbatim on the
    // first attempt.
    await expect(generateHostedAIResponse('Build a game', undefined, [], null, {
      stream: true,
      onDelta: () => {}
    })).rejects.toThrow('A build for this request is already in progress.');
    expect(aiCalls).toBe(1);
  }, 10000);

  it('delivers the full streamed answer to the chat flow without hitting the local fallback', async () => {
    const fetchMock = vi.fn(async () => new Response(
      'data: {"type":"meta"}\n\ndata: {"type":"delta","text":"Red is the color of blood and apples."}\n\ndata: {"type":"done","final":true}\n\n',
      { status: 200 }
    ));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('What is red?', [], null, () => {});

    expect(response).toBe('Red is the color of blood and apples.');
    expect(response).not.toContain('unavailable');
    expect(response).not.toContain('Core idea');
  });

  it('answers who created Corez with clickable creator profiles and the why, without self-introducing or mentioning APIs', async () => {
    const response = await generateLocalAIResponse('Who created Corez?', new Error('Hosted AI request failed: 503'));
    expect(response).toContain('[Zayne Mundo](https://www.linkedin.com/in/zayne-mundo/)');
    expect(response).toContain('[Christian Vestil](https://www.linkedin.com/in/christian-jericson-belderol/)');
    expect(response).toContain('[Renz Cardona](https://www.linkedin.com/in/renz-cardona-5941051b9/)');
    expect(response).toMatch(/conversational AI creation platform/i);
    expect(response).not.toContain("I'm Corez");
    expect(response).not.toMatch(/api|API|model|provider/i);
  });

  it('never substitutes a canned game when the hosted AI is down', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'down' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('Build me a chess game', []);

    expect(response).toContain("I'd love to build that game for you");
    expect(response).not.toContain('```html');
    expect(response).not.toMatch(/COREZ (Chess|Retro Space|Wordle|Scrabble|FPS|Super Mario|Bot Enemy)/);
  });

  it('routes first-person shooter requests to the hosted AI, never a generic space game', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'down' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('build a first person shooter game', []);

    expect(response).toContain("I'd love to build that game for you");
    expect(response).not.toContain('Retro Space');
    expect(response).not.toContain('```html');
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
    // provider cannot recover in time. The client polls GET /api/task/<id>
    // for the exact eligibility time and re-issues the same request so the
    // schedule resumes — it is NOT a "reasoning only" failure.
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/task/rt-deadbeef') {
        return Response.json({ taskId: 'rt-deadbeef', status: 'retry-scheduled', retryAfterSeconds: 1 });
      }
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
    // Initial attempt + one status poll + one resume.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  }, 15000);

  it('reports an honest busy error when the provider is still recovering after retries', async () => {
    // Every /api/ai call AND every /api/task/<id> status poll reports the
    // same persistent retry-scheduled state; after three bounded wait cycles
    // the client gives up honestly instead of fabricating a reply.
    const fetchMock = vi.fn(async () => Response.json({
      taskId: 'rt-deadbeef',
      status: 'retry-scheduled',
      retryAfterSeconds: 1
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateHostedAIResponse('Tell me about black roses'))
      .rejects.toThrow(/temporarily busy/);
    // Initial attempt + three bounded cycles of (status poll + resume).
    expect(fetchMock).toHaveBeenCalledTimes(7);
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
