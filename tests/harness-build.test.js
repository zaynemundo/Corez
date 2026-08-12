import { describe, it, expect, vi, afterEach } from 'vitest';
import { runCreationHarness, harnessTaskId } from '../worker/harness.js';
import { createTaskStateStore } from '../worker/utils.js';

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

const BROKEN_ARTIFACT = '<html><body><p>nothing here</p></body></html>';

function sseDelta(chunks) {
  let body = '';
  for (const piece of chunks) {
    body += `data: ${JSON.stringify({ choices: [{ delta: { content: piece }, finish_reason: null }] })}\n\n`;
  }
  body += `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } })}\n\n`;
  body += 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function jsonCompletion(content) {
  return Response.json({ choices: [{ message: { content } }] }, { status: 200 });
}

function buildMockProvider({ spec = 'A single-canvas game with a loop.', review = 'APPROVED' } = {}) {
  let buildCalls = 0;
  let specCalls = 0;
  let repairCalls = 0;
  let reviewCalls = 0;

  const fetchMock = vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    const messages = JSON.stringify(body.messages || []);
    const isStreaming = body.stream === true;

    if (messages.includes('Produce a concise build specification')) {
      specCalls += 1;
      return jsonCompletion(spec);
    }
    if (messages.includes('final reviewer of a finished artifact')) {
      reviewCalls += 1;
      return jsonCompletion(review);
    }
    if (messages.includes('did not pass functional verification')) {
      repairCalls += 1;
      return isStreaming ? sseDelta([GOOD_ARTIFACT]) : jsonCompletion(GOOD_ARTIFACT);
    }
    // Build phase.
    buildCalls += 1;
    if (isStreaming) {
      return sseDelta([BROKEN_ARTIFACT]);
    }
    return jsonCompletion(BROKEN_ARTIFACT);
  });

  return {
    fetchMock,
    counts: { get buildCalls() { return buildCalls; }, get specCalls() { return specCalls; }, get repairCalls() { return repairCalls; }, get reviewCalls() { return reviewCalls; } }
  };
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
  { role: 'system', content: 'You are COREZ AI, a game-building engine.' },
  { role: 'user', content: 'build a first person shooter game' }
];

async function runHarness(options = {}) {
  const events = [];
  const store = options.store || createTaskStateStore({});
  const iterable = runCreationHarness({
    prompt: 'build a first person shooter game',
    primaryIntent: 'game_creation',
    intentType: 'game_creation',
    apiMessages: BASE_MESSAGES,
    env: ENV,
    signal: null,
    store,
    ...options
  });
  for await (const event of iterable) events.push(event);
  return { events, store };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runCreationHarness', () => {
  it('repairs a broken build until verification passes', async () => {
    const { fetchMock, counts } = buildMockProvider();
    vi.stubGlobal('fetch', fetchMock);

    const { events } = await runHarness();

    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phases).toEqual(['planning', 'building', 'verifying', 'repairing', 'verifying', 'reviewing', 'done']);
    expect(counts.specCalls).toBe(1);
    expect(counts.buildCalls).toBe(1);
    expect(counts.repairCalls).toBe(1);

    const deltas = collectDeltas(events);
    expect(deltas).toBe(GOOD_ARTIFACT);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('skips repairs when the first build passes (adaptive)', async () => {
    const goodProvider = buildMockProvider();
    goodProvider.fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const messages = JSON.stringify(body.messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      return body.stream === true ? sseDelta([GOOD_ARTIFACT]) : jsonCompletion(GOOD_ARTIFACT);
    });
    vi.stubGlobal('fetch', goodProvider.fetchMock);

    const { events } = await runHarness();

    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phases).toEqual(['planning', 'building', 'verifying', 'reviewing', 'done']);
    expect(phases).not.toContain('repairing');
  });

  it('caps repairs at 5 rounds and still completes', async () => {
    const stubbornProvider = buildMockProvider();
    stubbornProvider.fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const messages = JSON.stringify(body.messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      const broken = BROKEN_ARTIFACT;
      return body.stream === true ? sseDelta([broken]) : jsonCompletion(broken);
    });
    vi.stubGlobal('fetch', stubbornProvider.fetchMock);

    const { events } = await runHarness();

    const repairing = events.filter((e) => e.type === 'phase' && e.phase === 'repairing');
    expect(repairing).toHaveLength(5);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('resumes from persisted state on an identical request', async () => {
    const { fetchMock, counts } = buildMockProvider();
    vi.stubGlobal('fetch', fetchMock);
    const store = createTaskStateStore({});

    // First run: builds broken artifact, verifies, repairs, completes.
    await runHarness({ store });
    expect(counts.buildCalls).toBe(1);

    // Second identical request against the SAME store: the terminal state
    // replays the artifact without any provider call.
    const second = await runHarness({ store });
    const secondDeltas = collectDeltas(second.events);
    expect(secondDeltas).toBe(GOOD_ARTIFACT);
    expect(counts.buildCalls).toBe(1);
    expect(counts.specCalls).toBe(1);
    expect(counts.repairCalls).toBe(1);
  });

  it('rejects concurrent builds with a retryable error', async () => {
    const goodProvider = buildMockProvider();
    vi.stubGlobal('fetch', goodProvider.fetchMock);
    const store = createTaskStateStore({});
    const taskId = harnessTaskId('build a first person shooter game', 'game_creation');
    // Simulate an in-flight build: fresh heartbeat, busy flag.
    await store.save(taskId, {
      taskId,
      status: 'active',
      busy: true,
      heartbeat: Date.now(),
      phase: 'building',
      spec: null,
      build: null,
      updatedAt: Date.now()
    });

    const events = [];
    let thrown = null;
    try {
      for await (const event of runCreationHarness({
        prompt: 'build a first person shooter game',
        primaryIntent: 'game_creation',
        intentType: 'game_creation',
        apiMessages: BASE_MESSAGES,
        env: ENV,
        signal: null,
        store
      })) {
        events.push(event);
      }
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeTruthy();
    expect(thrown.status).toBe(429);
    expect(thrown.retryable).toBe(true);
  });

  it('fails loudly instead of finishing when the build is whitespace-only', async () => {
    const store = createTaskStateStore({});
    const taskId = harnessTaskId('build a first person shooter game', 'game_creation');
    // Persisted pre-fix state: status active with a whitespace build and no
    // verification record. The harness must not stream a contentless done.
    await store.save(taskId, {
      taskId,
      status: 'active',
      busy: false,
      phase: 'building',
      spec: 'spec',
      build: '   \n  ',
      verification: null,
      review: null,
      repairCount: 0,
      updatedAt: Date.now()
    });

    const events = [];
    let thrown = null;
    try {
      for await (const event of runCreationHarness({
        prompt: 'build a first person shooter game',
        primaryIntent: 'game_creation',
        intentType: 'game_creation',
        apiMessages: BASE_MESSAGES,
        env: ENV,
        signal: null,
        store
      })) {
        events.push(event);
      }
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeTruthy();
    expect(thrown.message).toMatch(/empty build/i);
    expect(events.some((e) => e.type === 'done')).toBe(false);
    expect(events.some((e) => e.type === 'delta')).toBe(false);
    const persisted = await store.load(taskId);
    expect(persisted.status).toBe('failed');
  });

  it('reports an honest provider failure when the build stream is whitespace-only', async () => {
    const provider = buildMockProvider();
    provider.fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const messages = JSON.stringify(body.messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      return body.stream === true ? sseDelta(['\n', '   ']) : jsonCompletion('   ');
    });
    vi.stubGlobal('fetch', provider.fetchMock);

    const events = [];
    let thrown = null;
    try {
      for await (const event of runCreationHarness({
        prompt: 'build a first person shooter game',
        primaryIntent: 'game_creation',
        intentType: 'game_creation',
        apiMessages: BASE_MESSAGES,
        env: ENV,
        signal: null,
        store: createTaskStateStore({})
      })) {
        events.push(event);
      }
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeTruthy();
    expect(thrown.message).toMatch(/empty|stream/i);
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });
});
