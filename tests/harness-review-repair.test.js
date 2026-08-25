import { describe, it, expect, vi, afterEach } from 'vitest';
import { runCreationHarness } from '../worker/harness.js';
import { createTaskStateStore } from '../worker/utils.js';

// runStreamingChain is mocked at module level so a review-repair round can
// be simulated as a done-without-deltas stream (the refill path lives inside
// the harness, after the provider-chain emptiness recovery has run).
vi.mock('../worker/providerChain.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runStreamingChain: vi.fn()
  };
});

import { runStreamingChain } from '../worker/providerChain.js';

const GOOD_ARTIFACT = `<!DOCTYPE html>
<html lang="en"><head><title>G</title></head>
<body><canvas id="c"></canvas>
<script>
function gameLoop(){ update(); render(); }
function update(){}
function render(){}
document.addEventListener('keydown', function(){});
canvas.addEventListener('mousemove', function(){});
requestAnimationFrame(gameLoop);
</script></body></html>`;

// Structurally broken for ANY intent: an unclosed <script> block trips the
// truncation guard even without game-specific (canvas/loop/input) checks.
const BROKEN_ARTIFACT = '<html><body><script>const x = 1;</body></html>';

function jsonCompletion(content) {
  return Response.json({ choices: [{ message: { content } }] }, { status: 200 });
}

function collectDeltas(events) {
  const parts = [];
  for (const event of events) {
    if (event.type === 'clear') parts.length = 0;
    if (event.type === 'delta') parts.push(event.text);
  }
  return parts.join('');
}

const ENV = { OPENCODE_GO_API_KEY: 'sk-test' };
const BASE_MESSAGES = [
  { role: 'system', content: 'You are COREZ AI, a website-building engine.' },
  { role: 'user', content: 'build a portfolio website' }
];

async function runHarness() {
  const events = [];
  const iterable = runCreationHarness({
    prompt: 'build a portfolio website',
    primaryIntent: 'website_creation',
    intentType: 'website_creation',
    apiMessages: BASE_MESSAGES,
    env: ENV,
    signal: null,
    store: createTaskStateStore({})
  });
  for await (const event of iterable) events.push(event);
  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('runCreationHarness review-repair refill', () => {
  it('re-emits the last good build when a review repair stream produces no content', async () => {
    runStreamingChain.mockImplementation(async function* (messages) {
      const serialized = JSON.stringify(messages || []);
      if (serialized.includes('[review-failure]')) {
        // Review repair: a stream that ends without any delta.
        yield { type: 'done', finishReason: 'stop' };
        return;
      }
      const chunks = serialized.includes('did not pass functional verification')
        ? [GOOD_ARTIFACT]
        : [BROKEN_ARTIFACT];
      for (const text of chunks) yield { type: 'delta', text };
      yield { type: 'done', finishReason: 'stop' };
    });

    // Spec + review go through the real runProviderChain (global fetch).
    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify((JSON.parse(init.body).input || JSON.parse(init.body).messages) || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('NEEDS_FIX: the button does nothing');
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = await runHarness();

    // The cleared stream is refilled with the last good build: the client
    // never receives a contentless done.
    const deltas = collectDeltas(events);
    expect(deltas).toBe(GOOD_ARTIFACT);
    const clears = events.filter((e) => e.type === 'clear');
    expect(clears.length).toBe(2);
    expect(events.some((e) => e.type === 'done')).toBe(true);
    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phases).toContain('repairing');
  });

  it('re-reviews a repaired build and ships it only after an explicit approval', async () => {
    let reviewCalls = 0;
    runStreamingChain.mockImplementation(async function* (messages) {
      const serialized = JSON.stringify(messages || []);
      if (serialized.includes('[review-failure]')) {
        // Review-driven repair produces a good artifact.
        yield { type: 'delta', text: GOOD_ARTIFACT };
        yield { type: 'done', finishReason: 'stop' };
        return;
      }
      const chunks = serialized.includes('did not pass functional verification')
        ? [GOOD_ARTIFACT]
        : [BROKEN_ARTIFACT];
      for (const text of chunks) yield { type: 'delta', text };
      yield { type: 'done', finishReason: 'stop' };
    });

    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify((JSON.parse(init.body).input || JSON.parse(init.body).messages) || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) {
        reviewCalls += 1;
        return jsonCompletion(reviewCalls === 1 ? 'NEEDS_FIX: the score does not update' : 'APPROVED');
      }
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = await runHarness();

    // The repaired build was reviewed again and only shipped after the
    // second review explicitly approved it.
    expect(reviewCalls).toBe(2);
    expect(collectDeltas(events)).toBe(GOOD_ARTIFACT);
    expect(events.some((e) => e.type === 'done')).toBe(true);
    const reviewing = events.filter((e) => e.type === 'phase' && e.phase === 'reviewing');
    expect(reviewing.length).toBe(2);
  });

  it('an unparseable review verdict is inconclusive: delivered but never claimed as approved', async () => {
    runStreamingChain.mockImplementation(async function* (messages) {
      const serialized = JSON.stringify(messages || []);
      const chunks = serialized.includes('did not pass functional verification')
        ? [GOOD_ARTIFACT]
        : [BROKEN_ARTIFACT];
      for (const text of chunks) yield { type: 'delta', text };
      yield { type: 'done', finishReason: 'stop' };
    });
    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify((JSON.parse(init.body).input || JSON.parse(init.body).messages) || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('looks fine to me'); // not APPROVED / NEEDS_FIX
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = await runHarness();

    expect(collectDeltas(events)).toBe(GOOD_ARTIFACT);
    expect(events.some((e) => e.type === 'done')).toBe(true);
    // No blind repair was triggered by the unparseable verdict.
    const repairing = events.filter((e) => e.type === 'phase' && e.phase === 'repairing');
    expect(repairing.length).toBe(1); // only the structural repair round
    const diagnostics = events.find((e) => e.type === 'diagnostics')?.diagnostics;
    expect(diagnostics?.harness?.reviewInconclusive).toBe(true);
    expect(diagnostics?.harness?.approved).toBe(false);
  });
});
