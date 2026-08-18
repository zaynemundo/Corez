import { describe, it, expect, vi, afterEach } from 'vitest';
import { runCreationHarness, harnessTaskId } from '../worker/harness.js';
import { createTaskStateStore } from '../worker/utils.js';

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

const BROKEN_ARTIFACT = '<html><body><p>nothing here</p></body></html>';

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
  { role: 'system', content: 'You are COREZ AI, a game-building engine.' },
  { role: 'user', content: 'build a first person shooter game' }
];

function harnessOptions(store, overrides = {}) {
  return {
    prompt: 'build a first person shooter game',
    primaryIntent: 'game_creation',
    intentType: 'game_creation',
    apiMessages: BASE_MESSAGES,
    env: ENV,
    signal: null,
    store: store || createTaskStateStore({}),
    ...overrides
  };
}

// Website creation keeps the full pipeline (planning + review), so
// review-round tests exercise it through a website intent.
const websiteOptions = {
  prompt: 'build a portfolio website',
  primaryIntent: 'website_creation',
  intentType: 'website_creation'
};

async function drain(iterable, events) {
  for await (const event of iterable) events.push(event);
}

// Streaming chain mock: build streams GOOD, review-repair streams deltas then
// optionally fails mid-stream, repairs from verification failures stream GOOD.
function streamMock({ repairError = null, repairPartial = null } = {}) {
  runStreamingChain.mockImplementation(async function* (messages) {
    const serialized = JSON.stringify(messages || []);
    if (serialized.includes('[review-failure]')) {
      if (repairPartial) yield { type: 'delta', text: repairPartial };
      if (repairError) throw repairError;
      if (!repairPartial) {
        // No content produced (done-without-deltas).
        yield { type: 'done', finishReason: 'stop' };
        return;
      }
      yield { type: 'delta', text: GOOD_ARTIFACT };
      yield { type: 'done', finishReason: 'stop' };
      return;
    }
    const chunks = serialized.includes('did not pass functional verification')
      ? [GOOD_ARTIFACT]
      : [GOOD_ARTIFACT];
    for (const text of chunks) yield { type: 'delta', text };
    yield { type: 'done', finishReason: 'stop' };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('runCreationHarness resilience', () => {
  it('H1: persists an owner-tagged lease before planning and 429s a concurrent run without clobbering it', async () => {
    streamMock();
    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify(JSON.parse(init.body).messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = createTaskStateStore({});
    const taskId = harnessTaskId('build a first person shooter game', 'game_creation');

    // Run A acquires the lease and is held mid-build: the spec call is
    // resolved, then the (mocked) build stream suspends on a gate.
    let releaseBuild;
    const buildGate = new Promise((resolve) => { releaseBuild = resolve; });
    runStreamingChain.mockImplementationOnce(async function* () {
      await buildGate;
      yield { type: 'delta', text: GOOD_ARTIFACT };
      yield { type: 'done', finishReason: 'stop' };
    });

    const eventsA = [];
    const iterableA = runCreationHarness(harnessOptions(store));
    const pumpA = (async () => { await drain(iterableA, eventsA); })().catch(() => {});

    // Wait until run A has persisted its lease (spec phase completes).
    await vi.waitFor(async () => {
      const record = await store.load(taskId);
      expect(record?.busy).toBe(true);
      expect(typeof record?.leaseOwner).toBe('string');
    });

    // Run B: identical request while A holds a fresh lease.
    const eventsB = [];
    let thrownB = null;
    try {
      await drain(runCreationHarness(harnessOptions(store)), eventsB);
    } catch (err) {
      thrownB = err;
    }
    expect(thrownB?.status).toBe(429);
    expect(thrownB?.retryable).toBe(true);

    // B must NOT have touched A's lease record.
    const afterB = await store.load(taskId);
    expect(afterB.busy).toBe(true);

    // A completes normally once the gate opens.
    releaseBuild();
    await pumpA;
    expect(eventsA.some((e) => e.type === 'done')).toBe(true);
    const done = await store.load(taskId);
    expect(done.status).toBe('done');
    expect(done.busy).toBe(false);
  });

  it('H1: a stale or foreign lease (expired heartbeat) is reacquired, not stuck', async () => {
    streamMock();
    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify(JSON.parse(init.body).messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = createTaskStateStore({});
    const taskId = harnessTaskId('build a first person shooter game', 'game_creation');
    // A crashed run left a busy flag with an EXPIRED heartbeat and a foreign
    // owner token: the next invocation must take over, not throw 429.
    await store.save(taskId, {
      taskId,
      status: 'active',
      busy: true,
      heartbeat: Date.now() - 6 * 60 * 1000,
      leaseOwner: 'dead-run-token',
      phase: 'building',
      spec: null,
      build: null,
      updatedAt: Date.now() - 6 * 60 * 1000
    });

    const events = [];
    await drain(runCreationHarness(harnessOptions(store)), events);
    expect(events.some((e) => e.type === 'done')).toBe(true);
    const done = await store.load(taskId);
    expect(done.status).toBe('done');
    expect(done.busy).toBe(false);
  });

  it('H1.5: a mid-build checkpoint lets an interrupted long build resume via verify->repair instead of restarting', async () => {
    streamMock();
    const store = createTaskStateStore({});
    const taskId = harnessTaskId('build a first person shooter game', 'game_creation');

    // Run A: the build stream emits a partial artifact, the checkpoint
    // persists it, then the stream dies (provider/network drop mid-build).
    runStreamingChain.mockImplementationOnce(async function* () {
      yield { type: 'delta', text: BROKEN_ARTIFACT };
      const err = new Error('build stream dropped');
      err.status = 502;
      throw err;
    });

    const eventsA = [];
    let thrownA = null;
    try {
      await drain(runCreationHarness({ ...harnessOptions(store), checkpointIntervalMs: 1 }), eventsA);
    } catch (err) {
      thrownA = err;
    }
    expect(thrownA?.status).toBe(502);
    // The incremental checkpoint must have persisted the partial artifact
    // BEFORE the stream died — this is what makes long builds resumable.
    const checkpointed = await store.load(taskId);
    expect(checkpointed.build).toBe(BROKEN_ARTIFACT);
    expect(checkpointed.status).toBe('failed');

    // Run B: an identical request resumes from the checkpoint. The partial
    // build has no verification record yet, so it is re-verified, fails, and
    // is repaired FORWARD — never shipped unverified, never rebuilt from
    // zero.
    const eventsB = [];
    await drain(runCreationHarness(harnessOptions(store)), eventsB);
    const phasesB = eventsB.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phasesB).toContain('repairing');
    expect(phasesB).toContain('verifying');
    expect(collectDeltas(eventsB)).toBe(GOOD_ARTIFACT);
    expect(eventsB.some((e) => e.type === 'done')).toBe(true);
    const final = await store.load(taskId);
    expect(final.status).toBe('done');
    expect(final.busy).toBe(false);
    expect(final.build).toBe(GOOD_ARTIFACT);
  });

  it('H1.6: the build phase streams with mimo-v2.5 by default and honors OPENCODE_BUILD_MODEL', async () => {
    const buildCalls = [];
    runStreamingChain.mockImplementation(async function* (messages, options) {
      buildCalls.push({ serialized: JSON.stringify(messages || []), options });
      yield { type: 'delta', text: GOOD_ARTIFACT };
      yield { type: 'done', finishReason: 'stop' };
    });

    const isBuildCall = (c) => c.serialized.includes('Deliver ONLY the complete, finished artifact');

    // Default build model: mimo-v2.5 (planning/review keep the general model).
    const storeDefault = createTaskStateStore({});
    await drain(runCreationHarness(harnessOptions(storeDefault)), []);
    const defaultBuild = buildCalls.find(isBuildCall);
    expect(defaultBuild?.options.model).toBe('mimo-v2.5');

    // Explicit per-deployment override wins.
    buildCalls.length = 0;
    const storeOverride = createTaskStateStore({});
    await drain(runCreationHarness(harnessOptions(storeOverride, {
      env: { ...ENV, OPENCODE_BUILD_MODEL: 'deepseek-v4-pro' }
    })), []);
    const overrideBuild = buildCalls.find(isBuildCall);
    expect(overrideBuild?.options.model).toBe('deepseek-v4-pro');
  });

  it('H2: the lease heartbeat is refreshed while a long build streams', async () => {
    streamMock();
    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify(JSON.parse(init.body).messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = createTaskStateStore({});
    const taskId = harnessTaskId('build a first person shooter game', 'game_creation');

    // A build stream that emits nothing for a while — exactly the long
    // generation case where the lease would otherwise expire.
    let releaseBuild;
    const buildGate = new Promise((resolve) => { releaseBuild = resolve; });
    runStreamingChain.mockImplementationOnce(async function* () {
      await buildGate;
      yield { type: 'delta', text: GOOD_ARTIFACT };
      yield { type: 'done', finishReason: 'stop' };
    });

    const iterable = runCreationHarness({ ...harnessOptions(store), heartbeatIntervalMs: 15 });
    const pump = (async () => {
      for await (const _event of iterable) { /* consume */ }
    })().catch(() => {});

    await vi.waitFor(async () => {
      const record = await store.load(taskId);
      expect(record?.busy).toBe(true);
    });
    const heartbeatAtStart = (await store.load(taskId)).heartbeat;

    // Let the stream sit for ~60ms with a 15ms heartbeat interval.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const heartbeatMidBuild = (await store.load(taskId)).heartbeat;
    expect(heartbeatMidBuild).toBeGreaterThan(heartbeatAtStart);

    releaseBuild();
    await pump;
    const done = await store.load(taskId);
    expect(done.status).toBe('done');
    expect(done.busy).toBe(false);
  });

  it('H3: a failed review-repair round keeps the last good build and finishes', async () => {
    // Review flags a defect; the repair stream throws mid-way after a
    // partial delta. The harness must refill the cleared stream with the
    // last good build and end with done — never with an error.
    streamMock({ repairError: new Error('provider hiccup'), repairPartial: '<html><body>partial' });
    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify(JSON.parse(init.body).messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('NEEDS_FIX: the button does nothing');
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = [];
    await drain(runCreationHarness(harnessOptions(undefined, websiteOptions)), events);

    // The client's accumulated stream is the good artifact: partial repair
    // output is dropped via a clear before the refill.
    const deltas = collectDeltas(events);
    expect(deltas).toBe(GOOD_ARTIFACT);
    expect(events.some((e) => e.type === 'done')).toBe(true);
    const repairing = events.filter((e) => e.type === 'phase' && e.phase === 'repairing');
    expect(repairing.length).toBe(1);
  });

  it('H3: an error-event-only review repair (no throw) also keeps the good build', async () => {
    streamMock();
    runStreamingChain.mockImplementation(async function* (messages) {
      const serialized = JSON.stringify(messages || []);
      if (serialized.includes('[review-failure]')) {
        yield { type: 'error', message: 'all providers failed', status: 502 };
        return;
      }
      yield { type: 'delta', text: GOOD_ARTIFACT };
      yield { type: 'done', finishReason: 'stop' };
    });
    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify(JSON.parse(init.body).messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('NEEDS_FIX: the button does nothing');
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = [];
    await drain(runCreationHarness(harnessOptions(undefined, websiteOptions)), events);
    expect(collectDeltas(events)).toBe(GOOD_ARTIFACT);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('M1: a review that never answers is recorded as skipped, not silently approved', async () => {
    streamMock();
    // Review provider is permanently down (401): runProviderChain returns
    // { status: 'failed', error } with no content.
    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify(JSON.parse(init.body).messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return new Response('no', { status: 401 });
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = [];
    await drain(runCreationHarness(harnessOptions(undefined, websiteOptions)), events);

    expect(events.some((e) => e.type === 'done')).toBe(true);
    const diagnostics = events.find((e) => e.type === 'diagnostics')?.diagnostics;
    expect(diagnostics?.harness?.reviewSkipped).toBe(true);
    // Re-run with a shared store to inspect the persisted review record.
    const shared = createTaskStateStore({});
    const events2 = [];
    await drain(runCreationHarness(harnessOptions(shared, websiteOptions)), events2);
    const record = await shared.load(harnessTaskId('build a portfolio website', 'website_creation'));
    expect(record.review.skipped).toBe(true);
    // A skipped review is never claimed as approval: diagnostics stay honest.
    expect(record.review.approved).toBe(false);
  });

  it('M2: a spec provider outage surfaces the real provider failure', async () => {
    streamMock();
    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify(JSON.parse(init.body).messages || []);
      if (messages.includes('Produce a concise build specification')) return new Response('no', { status: 401 });
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = [];
    let thrown = null;
    try {
      await drain(runCreationHarness(harnessOptions(undefined, websiteOptions)), events);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeTruthy();
    expect(thrown.message).toMatch(/401|unauthorized/i);
    expect(thrown.message).not.toMatch(/returned no build specification/);
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('M3: the repair budget is cumulative across resumes (no fresh 5 after resume)', async () => {
    streamMock();
    // Verification keeps failing: repairs would run up to the budget.
    runStreamingChain.mockImplementation(async function* () {
      yield { type: 'delta', text: BROKEN_ARTIFACT };
      yield { type: 'done', finishReason: 'stop' };
    });
    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify(JSON.parse(init.body).messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = createTaskStateStore({});
    const taskId = harnessTaskId('build a first person shooter game', 'game_creation');
    // A previously-interrupted task with 3 repair rounds already spent.
    await store.save(taskId, {
      taskId,
      status: 'active',
      busy: false,
      phase: 'building',
      intentType: 'game_creation',
      spec: 'spec',
      build: BROKEN_ARTIFACT,
      verification: { passed: false, failures: [{ code: 'missing-canvas', detail: 'no canvas' }] },
      review: null,
      repairCount: 3,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    const events = [];
    let thrown = null;
    try {
      await drain(runCreationHarness(harnessOptions(store)), events);
    } catch (err) {
      thrown = err;
    }

    const repairing = events.filter((e) => e.type === 'phase' && e.phase === 'repairing');
    expect(repairing).toHaveLength(2);
    expect(repairing.map((e) => e.attempt)).toEqual([4, 5]);
    // Budget exhausted with the artifact still structurally incomplete: the
    // harness fails honestly instead of best-effort-delivering the broken
    // build as a successful done.
    expect(thrown).toBeTruthy();
    expect(thrown.message).toMatch(/could not produce a complete artifact/);
    expect(events.some((e) => e.type === 'done')).toBe(false);
    // A retry gets a fresh budget so it can repair forward.
    const persisted = await store.load(taskId);
    expect(persisted.status).toBe('failed');
    expect(persisted.repairCount).toBe(0);
  });

  it('H6: auto-continues a truncated build stream until the HTML and script blocks are fully closed', async () => {
    const part1 = `<!DOCTYPE html><html><body><canvas id="c"></canvas><script>let x = 0;\nfunction gameLoop() { update(); render(); }\nconst srd = (my *`;
    const part2 = `Math.sin(angle));\nfunction update(){}\nfunction render(){}\ndocument.addEventListener('keydown', function(){});\ncanvas.addEventListener('mousemove', function(){});\nrequestAnimationFrame(gameLoop);\n</script></body></html>`;

    runStreamingChain.mockImplementation(async function* (messages) {
      const serialized = JSON.stringify(messages || []);
      if (serialized.includes('[CONTINUATION]')) {
        yield { type: 'delta', text: part2 };
        yield { type: 'done', finishReason: 'stop' };
        return;
      }
      yield { type: 'delta', text: part1 };
      yield { type: 'done', finishReason: 'length' };
    });

    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify(JSON.parse(init.body).messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = [];
    await drain(runCreationHarness(harnessOptions()), events);

    // The continuing phase event must be emitted
    const continuing = events.filter((e) => e.type === 'phase' && e.phase === 'continuing');
    expect(continuing.length).toBeGreaterThan(0);

    // The full artifact must contain the stitched completion
    const finalBuild = collectDeltas(events);
    expect(finalBuild).toContain('const srd = (my *Math.sin(angle));');
    expect(finalBuild).toContain('</html>');
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('H7: retries with an anti-repetition instruction when a continuation repeats the beginning instead of continuing', async () => {
    // Short truncated build (< 200 chars) so a full identical repeat
    // produces no growth and triggers the anti-repeat path.
    const part1 = '<html><body><canvas id="c"></canvas><script>const srd = (my *';
    const part2 = `Math.sin(angle));\nfunction update(){}\nfunction render(){}\ndocument.addEventListener('keydown', function(){});\ncanvas.addEventListener('mousemove', function(){});\nrequestAnimationFrame(gameLoop);\n</script></body></html>`;

    let continuationCalls = 0;
    runStreamingChain.mockImplementation(async function* (messages) {
      const serialized = JSON.stringify(messages || []);
      if (serialized.includes('[CONTINUATION]')) {
        continuationCalls += 1;
        if (serialized.includes('APPEND ONLY')) {
          // Second attempt with the anti-repetition instruction: the model
          // finally continues instead of repeating.
          yield { type: 'delta', text: part2 };
          yield { type: 'done', finishReason: 'stop' };
          return;
        }
        // First attempt: the model restarts from the beginning (repeat).
        yield { type: 'delta', text: part1 };
        yield { type: 'done', finishReason: 'length' };
        return;
      }
      yield { type: 'delta', text: part1 };
      yield { type: 'done', finishReason: 'length' };
    });

    const fetchMock = vi.fn(async (_url, init) => {
      const messages = JSON.stringify(JSON.parse(init.body).messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion('spec');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      return jsonCompletion('');
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = [];
    await drain(runCreationHarness(harnessOptions()), events);

    // Two continuation passes: the plain continuation (repeated) and the
    // anti-repetition retry that completed the artifact.
    expect(continuationCalls).toBe(2);
    const continuing = events.filter((e) => e.type === 'phase' && e.phase === 'continuing');
    expect(continuing.length).toBe(2);

    const finalBuild = collectDeltas(events);
    expect(finalBuild).toContain('const srd = (my *Math.sin(angle));');
    expect(finalBuild).toContain('</html>');
    expect(finalBuild).not.toContain('const srd = (my *const srd = (my *');
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });
});
