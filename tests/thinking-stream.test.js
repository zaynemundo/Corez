// Visible reasoning contract.
//
// A first-party chat app streams the model's thinking so the user watches
// progress instead of a spinner. CoreZ does the same — but the reasoning must
// never name the infrastructure behind it, and it must never contaminate the
// answer. These tests cover both halves: the redacting buffer in isolation and
// the real /api/ai streaming path end to end.
import { describe, it, expect, vi, afterEach } from 'vitest';
import swarmWorker from '../worker/entry.js';
import {
  THINKING_GUARD_CHARS,
  createThinkingStream,
  scrubThinkingText,
} from '../worker/thinkingStream.js';
import { withVisibleReasoning } from '../worker/modelRouter.js';

const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/responses';

function reasoningDelta(text) {
  return { type: 'response.reasoning_summary_text.delta', delta: text };
}

function contentDelta(text) {
  return { type: 'response.output_text.delta', delta: text };
}

function sseResponse(chunks) {
  const body = `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')}data: [DONE]\n\n`;
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function parseSseEvents(text) {
  return [...text.matchAll(/data: (\{.*?\})\n\n/g)].map((m) => JSON.parse(m[1]));
}

function post(body, env = {}) {
  return swarmWorker.fetch(
    new Request('https://corez.test/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { OPENCODE_GO_API_KEY: 'sk-test', ...env },
  );
}

function thinkingOf(events) {
  return events.filter((e) => e.type === 'thinking').map((e) => e.text).join('');
}

function answerOf(events) {
  return events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('thinking redaction', () => {
  it('never emits the provider behind the model', () => {
    expect(scrubThinkingText('I run on Muse Spark 1.3 Contributor.')).not.toMatch(/muse|spark/i);
    expect(scrubThinkingText('I run on DeepSeek V4.1 Flash.')).not.toMatch(/deepseek/i);
    expect(scrubThinkingText('Routed through OpenCode Go.')).not.toMatch(/opencode/i);
    expect(scrubThinkingText('Served via OpenRouter.')).not.toMatch(/openrouter/i);
  });

  it('leaves unrelated model names alone (a user question about them is not a leak)', () => {
    expect(scrubThinkingText('The user asked about GPT-4 and Claude.')).toContain('GPT-4');
    expect(scrubThinkingText('The user asked about GPT-4 and Claude.')).toContain('Claude');
  });

  it('redacts a provider name split across two deltas', () => {
    const stream = createThinkingStream();
    let out = stream.push('The engine here is deep');
    out += stream.push('seek based, obviously. ');
    out += stream.flush();
    expect(out).not.toMatch(/deepseek/i);
    expect(out).toContain('Corez');
  });

  it('redacts the two-word model name split across two deltas', () => {
    const stream = createThinkingStream();
    // The first push is long enough to cross the guard, so the trailing word
    // would normally be emitted before "spark" arrives.
    let out = stream.push('The stack serving me is definitely Muse ');
    out += stream.push('Spark 1.3 Contributor, obviously. ');
    out += stream.flush();
    expect(out).not.toMatch(/muse|spark/i);
    expect(out).toContain('Corez');
  });

  it('holds text back until a word is complete, so a name cannot be half-emitted', () => {
    const stream = createThinkingStream();
    // A single short push is buffered, not leaked early.
    const first = stream.push('short');
    expect(first.length).toBeLessThanOrEqual(THINKING_GUARD_CHARS);
    expect(first).not.toContain('short');
    const rest = stream.push(' words follow here ') + stream.flush();
    expect(`${first}${rest}`).toContain('short words follow here');
  });

  it('drains an unbroken token instead of buffering it forever', () => {
    const stream = createThinkingStream();
    const long = 'x'.repeat(THINKING_GUARD_CHARS + 2000);
    const out = stream.push(long) + stream.flush();
    expect(out).toBe(long);
  });
});

describe('withVisibleReasoning', () => {
  it('asks the provider to return reasoning for user-facing streams', () => {
    expect(withVisibleReasoning({ effort: 'high', exclude: true })).toEqual({
      effort: 'high',
      exclude: false,
    });
  });

  it('passes an absent config through untouched', () => {
    expect(withVisibleReasoning(null)).toBeNull();
  });
});

describe('/api/ai streaming thinking', () => {
  it('streams reasoning as thinking events without contaminating the answer', async () => {
    let payload = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        expect(url).toBe(OPENCODE_URL);
        payload = JSON.parse(init.body);
        return sseResponse([
          reasoningDelta('I should explain the resolver chain first. '),
          contentDelta('DNS resolves'),
          contentDelta(' in steps.'),
        ]);
      }),
    );

    const response = await post({
      prompt: 'Explain how DNS resolves a hostname.',
      intent: { type: 'explanation', summary: 'Explain DNS resolution.' },
      stream: true,
    });

    expect(response.status).toBe(200);
    const events = parseSseEvents(await response.text());

    expect(thinkingOf(events)).toContain('resolver chain');
    expect(answerOf(events)).toBe('DNS resolves in steps.');
    // The reasoning must never be mixed into the reply.
    expect(answerOf(events)).not.toContain('resolver chain');
    // The provider is asked to return the reasoning, not to drop it.
    expect(payload.reasoning?.exclude).toBe(false);
  });

  it('never leaks the provider stack through the thinking stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          reasoningDelta('I am Muse Spark 1.3 Contributor served by OpenCode Go and OpenRouter. '),
          contentDelta('Here is the answer.'),
        ]),
      ),
    );

    const response = await post({
      prompt: 'Explain how DNS resolves a hostname.',
      intent: { type: 'explanation', summary: 'Explain DNS resolution.' },
      stream: true,
    });

    const events = parseSseEvents(await response.text());
    const thinking = thinkingOf(events);
    expect(thinking.length).toBeGreaterThan(0);
    expect(thinking).not.toMatch(/muse|spark/i);
    expect(thinking).not.toMatch(/deepseek/i);
    expect(thinking).not.toMatch(/opencode/i);
    expect(thinking).not.toMatch(/openrouter/i);
  });
});
