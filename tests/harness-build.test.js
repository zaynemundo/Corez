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
    const messages = JSON.stringify(body.input || body.messages || []);
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
    // Games take the simple path: no planning provider call, no review round.
    expect(phases).toEqual(['planning', 'building', 'verifying', 'repairing', 'verifying', 'done']);
    expect(counts.specCalls).toBe(0);
    expect(counts.reviewCalls).toBe(0);
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
      const messages = JSON.stringify(body.input || body.messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      return body.stream === true ? sseDelta([GOOD_ARTIFACT]) : jsonCompletion(GOOD_ARTIFACT);
    });
    vi.stubGlobal('fetch', goodProvider.fetchMock);

    const { events } = await runHarness();

    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    // Game fast path: one build pass, no review round.
    expect(phases).toEqual(['planning', 'building', 'verifying', 'done']);
    expect(phases).not.toContain('repairing');
  });

  it('fails honestly when the artifact is still incomplete after 5 repair rounds', async () => {
    const stubbornProvider = buildMockProvider();
    stubbornProvider.fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const messages = JSON.stringify(body.input || body.messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      const broken = BROKEN_ARTIFACT;
      return body.stream === true ? sseDelta([broken]) : jsonCompletion(broken);
    });
    vi.stubGlobal('fetch', stubbornProvider.fetchMock);

    const store = createTaskStateStore({});
    const taskId = harnessTaskId('build a first person shooter game', 'game_creation');
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

    const repairing = events.filter((e) => e.type === 'phase' && e.phase === 'repairing');
    expect(repairing).toHaveLength(5);
    // A structurally incomplete artifact is NEVER delivered as a successful
    // done — the client gets an explicit, retryable error instead.
    expect(thrown).toBeTruthy();
    expect(thrown.message).toMatch(/could not produce a complete artifact/);
    expect(thrown.status).toBe(502);
    expect(thrown.retryable).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(false);
    // A retry gets a fresh repair budget so it repairs forward from the
    // persisted partial build instead of erroring instantly.
    const persisted = await store.load(taskId);
    expect(persisted.status).toBe('failed');
    expect(persisted.repairCount).toBe(0);
  });

  it('repairs a structurally complete build that misses requested spec features', async () => {
    // The artifact passes structural verification but covers none of the
    // spec's distinctive features — the spec-coverage gate must flag it and
    // the repair round must add the missing features. Website intents keep
    // the full pipeline (the planning spec drives the coverage gate); games
    // always take the simple path and are never word-gated against the prompt.
    const COVERED_ARTIFACT = GOOD_ARTIFACT.replace(
      '<script>',
      '<script>\nconst score = 0; const levels = 3; const enemy = {};'
    );
    const provider = buildMockProvider();
    let repairCalls = 0;
    let buildCalls = 0;
    provider.fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const messages = JSON.stringify(body.input || body.messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('A game with a score, three levels, and an enemy.');
      if (messages.includes('Analyze the build specification below') || messages.includes('Produce a concise visual direction brief')) return jsonCompletion('Brief');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      if (messages.includes('did not pass functional verification')) {
        repairCalls += 1;
        return body.stream === true ? sseDelta([COVERED_ARTIFACT]) : jsonCompletion(COVERED_ARTIFACT);
      }
      buildCalls += 1;
      return body.stream === true ? sseDelta([GOOD_ARTIFACT]) : jsonCompletion(GOOD_ARTIFACT);
    });
    vi.stubGlobal('fetch', provider.fetchMock);

    const { events } = await runHarness({
      primaryIntent: 'website_creation',
      intentType: 'website_creation'
    });
    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phases).toContain('repairing');
    expect(phases).toContain('done');
    // The repair round was triggered by the coverage failure, not a rebuild.
    expect(repairCalls).toBe(1);
    expect(buildCalls).toBe(1);
    const deltas = collectDeltas(events);
    expect(deltas).toBe(COVERED_ARTIFACT);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('skips planning and review on the low-complexity fast path', async () => {
    const provider = buildMockProvider();
    // Build directly with the GOOD artifact (no repair needed).
    provider.fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const messages = JSON.stringify(body.input || body.messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      return body.stream === true ? sseDelta([GOOD_ARTIFACT]) : jsonCompletion(GOOD_ARTIFACT);
    });
    vi.stubGlobal('fetch', provider.fetchMock);

    const { events } = await runHarness({
      prompt: 'build a simple canvas game',
      complexity: 'low'
    });

    // No planning provider call (the prompt is the spec) and no review
    // round — the fast path streams straight to build + verify + done.
    expect(provider.counts.specCalls).toBe(0);
    expect(provider.counts.reviewCalls).toBe(0);
    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phases).toEqual(['planning', 'building', 'verifying', 'done']);
    expect(collectDeltas(events)).toBe(GOOD_ARTIFACT);
    const diagnostics = events.find((e) => e.type === 'diagnostics')?.diagnostics;
    expect(diagnostics?.harness?.reviewSkipped).toBe(true);
    // The review skip is never claimed as approval.
    expect(diagnostics?.harness?.approved).toBe(false);
    // Cost meter rides in the harness diagnostics.
    expect(diagnostics?.harness?.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('keeps planning and review for medium-complexity website requests', async () => {
    const provider = buildMockProvider();
    vi.stubGlobal('fetch', provider.fetchMock);

    const { events } = await runHarness({
      prompt: 'build a simple canvas game',
      primaryIntent: 'website_creation',
      intentType: 'website_creation',
      complexity: 'medium'
    });

    expect(provider.counts.specCalls).toBe(1);
    expect(provider.counts.reviewCalls).toBe(1);
    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phases).toContain('reviewing');
  });

  it('games always take the simple path even for long, high-complexity prompts', async () => {
    const provider = buildMockProvider();
    vi.stubGlobal('fetch', provider.fetchMock);

    const longGamePrompt = 'build me an epic space shooter game with five levels, boss fights, power-ups, a shop between levels, and a persistent high-score leaderboard stored in local storage, with polished sound effects and particle explosions'.repeat(3);
    expect(longGamePrompt.length).toBeGreaterThan(400);

    const { events } = await runHarness({
      prompt: longGamePrompt,
      complexity: 'high'
    });

    // No planning call and no review round regardless of complexity/length.
    expect(provider.counts.specCalls).toBe(0);
    expect(provider.counts.reviewCalls).toBe(0);
    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phases).not.toContain('reviewing');
    expect(phases).toContain('building');
    expect(phases).toContain('verifying');
    expect(collectDeltas(events)).toBe(GOOD_ARTIFACT);
    const diagnostics = events.find((e) => e.type === 'diagnostics')?.diagnostics;
    expect(diagnostics?.harness?.reviewSkipped).toBe(true);
    expect(diagnostics?.harness?.approved).toBe(false);
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
    expect(counts.specCalls).toBe(0);
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
    // The busy run owns the lease: the record must remain untouched so the
    // concurrent build can finish and the next retry replays it.
    const persisted = await store.load(taskId);
    expect(persisted.busy).toBe(true);
    expect(persisted.status).toBe('active');
  });

  it('releases the busy lease when the build is cancelled mid-stream', async () => {
    const provider = buildMockProvider();
    vi.stubGlobal('fetch', provider.fetchMock);
    const store = createTaskStateStore({});
    const taskId = harnessTaskId('build a first person shooter game', 'game_creation');

    const iterable = runCreationHarness({
      prompt: 'build a first person shooter game',
      primaryIntent: 'game_creation',
      intentType: 'game_creation',
      apiMessages: BASE_MESSAGES,
      env: ENV,
      signal: null,
      store
    });

    // Run until the first event (planning), then cancel the generator the
    // same way a cancelled streamed response does (iterator.return()).
    const first = await iterable.next();
    expect(first.done).toBe(false);
    expect(first.value.type).toBe('phase');
    await iterable.return();

    // The lease must be released and the task resumable, not locked out
    // for the whole lease window.
    const persisted = await store.load(taskId);
    expect(persisted.busy).toBe(false);
    expect(persisted.status).toBe('failed');

    // An identical request now proceeds and completes instead of throwing
    // a busy error.
    const { events } = await runHarness({ store });
    const deltas = collectDeltas(events);
    expect(deltas).toBe(GOOD_ARTIFACT);
    expect(events.some((e) => e.type === 'done')).toBe(true);
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
      const messages = JSON.stringify(body.input || body.messages || []);
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

  it('surfaces a provider retry-schedule during planning as a retryable 503', async () => {
    // The spec provider never answers: the chain persists a retry schedule
    // and the harness must fail RETRYABLE so the client's harness
    // auto-resume re-issues the identical request instead of giving up.
    // Website intents keep the planning round (games skip it entirely).
    const hungFetch = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }));
    vi.stubGlobal('fetch', hungFetch);

    const events = [];
    let thrown = null;
    try {
      for await (const event of runCreationHarness({
        prompt: 'build a portfolio website',
        primaryIntent: 'website_creation',
        intentType: 'website_creation',
        apiMessages: BASE_MESSAGES,
        env: {
          OPENCODE_GO_API_KEY: 'sk-test',
          __COREZ_RETRY_SLEEP_MS: '0',
          AI_NONSTREAM_TIMEOUT_MS: '50',
          AI_TTFT_TIMEOUT_MS: '50'
        },
        sleep: () => Promise.resolve(),
        signal: null,
        store: createTaskStateStore({})
      })) {
        events.push(event);
      }
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeTruthy();
    expect(thrown.message).toMatch(/temporarily busy|recovery scheduled/i);
    expect(thrown.retryable).toBe(true);
    expect(thrown.status).toBe(503);
    expect(events.some((e) => e.type === 'done')).toBe(false);
  }, 15000);
});
