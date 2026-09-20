// Contract test for the streaming connection: a long build must not look dead
// to the network while the provider is thinking.
//
//   - SSE responses carry the headers that stop buffering and re-compression
//   - an idle stream is kept alive with SSE comments, which the client's parser
//     ignores (it only reads `data:` lines)
//   - the keepalive stops when the stream ends
//
// COREZ_HEARTBEAT_MS compresses the interval the same way retry sleeps are
// compressed in the other worker tests.

import assert from 'node:assert/strict';
import entryWorker from '../worker/entry.js';

const BASE = 'https://corez.test';

function sseStream() {
  // A provider that says nothing for a while, then answers: exactly the shape
  // of a long reasoning pause.
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes('opencode.ai') || target.includes('openrouter.ai')) {
      await new Promise((resolve) => setTimeout(resolve, 260));
      const body = [
        'data: {"choices":[{"delta":{"content":"hello"}}]}',
        'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":10,"completion_tokens":2}}',
        'data: [DONE]',
        '',
      ].join('\n\n');
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    return original(url, init);
  };
  return () => {
    globalThis.fetch = original;
  };
}

async function readStreamText(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

async function run() {
  const env = {
    OPENCODE_GO_API_KEY: 'test-key',
    COREZ_HEARTBEAT_MS: '40',
  };

  const restore = sseStream();
  try {
    const response = await entryWorker.fetch(
      new Request(`${BASE}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.5.0.1' },
        body: JSON.stringify({ prompt: 'say hello', stream: true }),
      }),
      env,
    );

    assert.equal(response.status, 200);
    const cacheControl = String(response.headers.get('cache-control') || '');
    assert.match(cacheControl, /no-cache/, 'streams must not be cached');
    assert.match(
      cacheControl,
      /no-transform/,
      'intermediaries must not re-compress or rewrite the stream',
    );
    assert.equal(response.headers.get('x-accel-buffering'), 'no', 'no proxy buffering');
    assert.match(String(response.headers.get('content-type')), /text\/event-stream/);

    const text = await readStreamText(response);
    // The provider stalled for 260ms with a 40ms heartbeat: several comments
    // must have gone out before the answer.
    const heartbeats = text.split(': keepalive').length - 1;
    assert.ok(
      heartbeats >= 2,
      `expected keepalive comments during the provider pause, saw ${heartbeats}`,
    );
    assert.match(text, /data: /, 'the real events still arrive');
    assert.match(
      text,
      /"type":"done"/,
      'the stream ends with the worker\'s own done event, not a truncated one',
    );

    // Comments are not events: a client that only reads `data:` lines sees the
    // answer and nothing else, so the UI can never render a keepalive.
    const dataLines = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    assert.ok(dataLines.length >= 2, 'the answer and its usage arrived');
    for (const line of dataLines) {
      assert.doesNotThrow(() => JSON.parse(line), 'every data line is the JSON the client expects');
    }
    for (const line of text.split('\n')) {
      if (line.startsWith(': keepalive')) continue;
      if (!line.trim()) continue;
      assert.ok(
        line.startsWith('data: '),
        `only data lines and keepalive comments may travel, saw: ${line.slice(0, 60)}`,
      );
    }
  } finally {
    restore();
  }

  console.log('Streaming connection contract checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
