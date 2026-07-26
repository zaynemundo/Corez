import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider } from '../../packages/agent-core/index.js';

function sseResponse(lines, status = 200) {
  return new Response(lines.join('\n'), {
    status,
    headers: { 'content-type': 'text/event-stream' }
  });
}

describe('OpenAI-compatible streaming', () => {
  it('assembles text and fragmented tool arguments', async () => {
    const fetchImpl = vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"Hi "}}]}', '',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"read_file","arguments":"{\\"file"}}]}}]}', '',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Path\\":\\"README.md\\"}"}}]},"finish_reason":"tool_calls"}]}', '',
      'data: [DONE]', ''
    ]));
    const provider = new OpenAICompatibleProvider({
      apiKey: 'key',
      endpoint: 'https://provider.invalid/v1/chat/completions',
      fetchImpl
    });

    const events = [];
    for await (const event of provider.stream({
      model: 'provider/model',
      messages: [{ role: 'user', content: 'inspect' }],
      tools: [{ type: 'function', function: { name: 'read_file', description: 'Read', parameters: { type: 'object' } } }]
    })) events.push(event);

    expect(events).toContainEqual(expect.objectContaining({
      type: 'assistant.delta',
      data: { text: 'Hi ' }
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool.requested',
      data: { id: 'c1', name: 'read_file', arguments: { filePath: 'README.md' } }
    }));
  });

  it('normalizes HTTP failures', async () => {
    const provider = new OpenAICompatibleProvider({
      apiKey: 'key',
      endpoint: 'https://provider.invalid',
      fetchImpl: async () => new Response('rate limited', { status: 429 })
    });
    await expect(async () => {
      for await (const _event of provider.stream({ model: 'x', messages: [], tools: [] })) {
        void _event;
      }
    }).rejects.toMatchObject({ code: 'PROVIDER_HTTP_ERROR', details: { status: 429 } });
  });

  it('normalizes a stalled response body as a provider timeout', async () => {
    const fetchImpl = async (_url, { signal }) => new Response(new ReadableStream({
      start(controller) {
        signal.addEventListener('abort', () => {
          controller.error(new DOMException('Body read aborted.', 'AbortError'));
        }, { once: true });
      }
    }), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    });
    const provider = new OpenAICompatibleProvider({
      apiKey: 'key',
      endpoint: 'https://provider.invalid',
      fetchImpl,
      timeoutMs: 10
    });

    await expect(async () => {
      for await (const _event of provider.stream({ model: 'x', messages: [], tools: [] })) {
        void _event;
      }
    }).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', details: { timeoutMs: 10 } });
  });
});
