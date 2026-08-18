import { describe, it, expect, vi, afterEach } from 'vitest';
import { runCreationHarness, harnessTaskId } from '../worker/harness.js';
import { createTaskStateStore } from '../worker/utils.js';
import { buildSwarmContext, envFlagEnabled, swarmEnabledFor } from '../worker/swarm.js';

const WEBSITE_ARTIFACT = `<!DOCTYPE html>
<html lang="en"><head><title>Landing Page</title></head>
<body><main><h1>Hero section</h1><section>Pricing table</section><form>Contact form</form></main></body></html>`;

const SPEC = 'A landing page with a hero section, pricing table, and a contact form.';

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

function permanentFailure() {
  // 401 is classified permanent by the provider chain: no retries, no backoff.
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

function buildSwarmMockProvider() {
  const calls = { spec: 0, architect: 0, art: 0, build: 0, review: 0 };
  const buildMessages = [];
  const fetchMock = vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    const messages = JSON.stringify(body.messages || []);
    const isStreaming = body.stream === true;

    if (messages.includes('Produce a concise build specification')) {
      calls.spec += 1;
      return jsonCompletion(SPEC);
    }
    if (messages.includes('concise implementation brief')) {
      calls.architect += 1;
      return jsonCompletion('ARCH: hero section, pricing table, contact form, single page, vanilla JS.');
    }
    if (messages.includes('visual direction brief')) {
      calls.art += 1;
      return jsonCompletion('ART: palette #0f172a/#38bdf8, Inter, soft shadows.');
    }
    if (messages.includes('final reviewer of a finished artifact')) {
      calls.review += 1;
      return jsonCompletion('APPROVED');
    }
    // The streamed build phase.
    calls.build += 1;
    buildMessages.push(body.messages || []);
    return isStreaming ? sseDelta([WEBSITE_ARTIFACT]) : jsonCompletion(WEBSITE_ARTIFACT);
  });
  return { fetchMock, calls, buildMessages };
}

const ENV = { OPENCODE_GO_API_KEY: 'sk-test' };

async function runWebsiteHarness({ env = ENV, store, fetchMock, ...opts } = {}) {
  const events = [];
  const effectiveStore = store || createTaskStateStore({});
  if (fetchMock) vi.stubGlobal('fetch', fetchMock);
  const iterable = runCreationHarness({
    prompt: 'build a landing page website with hero, pricing, and contact form',
    primaryIntent: 'website_creation',
    intentType: 'website_creation',
    apiMessages: [
      { role: 'system', content: 'You are COREZ AI, a website builder.' },
      { role: 'user', content: 'build a landing page website with hero, pricing, and contact form' }
    ],
    env,
    signal: null,
    store: effectiveStore,
    complexity: 'medium',
    ...opts
  });
  for await (const event of iterable) events.push(event);
  return { events, store: effectiveStore };
}

function phaseList(events) {
  return events.filter((e) => e.type === 'phase').map((e) => e.phase);
}

function harnessDiagnostics(events) {
  return events.find((e) => e.type === 'diagnostics')?.diagnostics?.harness || null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('creation harness swarm pre-pass', () => {
  it('runs specialist briefs and injects their contributions into the build context', async () => {
    const { fetchMock, calls, buildMessages } = buildSwarmMockProvider();

    const { events } = await runWebsiteHarness({ fetchMock });

    // Planning + swarm pre-pass + one build + verify + review + done.
    expect(phaseList(events)).toEqual(['planning', 'swarm-planning', 'building', 'verifying', 'reviewing', 'done']);
    expect(calls.architect).toBe(1);
    expect(calls.art).toBe(1);

    // Both contributions reached the streamed build's context.
    const buildText = JSON.stringify(buildMessages[0]);
    expect(buildText).toContain('## architect');
    expect(buildText).toContain('ARCH: hero section, pricing table, contact form, single page, vanilla JS.');
    expect(buildText).toContain('## art-director');
    expect(buildText).toContain('ART: palette #0f172a/#38bdf8, Inter, soft shadows.');

    expect(events.some((e) => e.type === 'done')).toBe(true);
    const diag = harnessDiagnostics(events);
    expect(diag.swarm.enabled).toBe(true);
    expect(diag.swarm.specialists).toEqual(['architect', 'art-director']);
    expect(diag.phases).toContain('swarm-planning');
  });

  it('runs the specialist calls concurrently (parallel, not sequential)', async () => {
    const { fetchMock } = buildSwarmMockProvider();
    let inFlight = 0;
    let maxInFlight = 0;
    fetchMock.mockImplementation(async (_url, init) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const body = JSON.parse(init.body);
      const messages = JSON.stringify(body.messages || []);
      let response;
      if (messages.includes('concise implementation brief')) {
        await new Promise((r) => setTimeout(r, 60));
        response = jsonCompletion('ARCH: brief');
      } else if (messages.includes('visual direction brief')) {
        await new Promise((r) => setTimeout(r, 60));
        response = jsonCompletion('ART: brief');
      } else if (messages.includes('Produce a concise build specification')) {
        response = jsonCompletion(SPEC);
      } else if (messages.includes('final reviewer of a finished artifact')) {
        response = jsonCompletion('APPROVED');
      } else {
        response = body.stream === true ? sseDelta([WEBSITE_ARTIFACT]) : jsonCompletion(WEBSITE_ARTIFACT);
      }
      inFlight -= 1;
      return response;
    });

    const { events } = await runWebsiteHarness({ fetchMock });
    expect(events.some((e) => e.type === 'done')).toBe(true);
    // Both specialists were in flight at the same time.
    expect(maxInFlight).toBeGreaterThanOrEqual(2);
  });

  it('falls back to the plain build context when every specialist fails', async () => {
    const { fetchMock, buildMessages } = buildSwarmMockProvider();
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const messages = JSON.stringify(body.messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion(SPEC);
      if (messages.includes('concise implementation brief')) return permanentFailure();
      if (messages.includes('visual direction brief')) return permanentFailure();
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      if (body.stream === true) {
        buildMessages.push(body.messages || []);
        return sseDelta([WEBSITE_ARTIFACT]);
      }
      return jsonCompletion(WEBSITE_ARTIFACT);
    });

    const { events } = await runWebsiteHarness({ fetchMock });

    // The swarm never gates the build: failed specialists fall back silently.
    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(JSON.stringify(buildMessages[0])).not.toContain('## architect');
    const diag = harnessDiagnostics(events);
    expect(diag.swarm.enabled).toBe(false);
    expect(diag.swarm.reason).toBeTruthy();
  });

  it('keeps the contributions of the specialists that did answer', async () => {
    const { fetchMock, buildMessages } = buildSwarmMockProvider();
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const messages = JSON.stringify(body.messages || []);
      if (messages.includes('Produce a concise build specification')) return jsonCompletion(SPEC);
      if (messages.includes('concise implementation brief')) return permanentFailure();
      if (messages.includes('visual direction brief')) return jsonCompletion('ART: survived');
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      if (body.stream === true) {
        buildMessages.push(body.messages || []);
        return sseDelta([WEBSITE_ARTIFACT]);
      }
      return jsonCompletion(WEBSITE_ARTIFACT);
    });

    const { events } = await runWebsiteHarness({ fetchMock });
    expect(events.some((e) => e.type === 'done')).toBe(true);
    const buildText = JSON.stringify(buildMessages[0]);
    expect(buildText).not.toContain('## architect');
    expect(buildText).toContain('## art-director');
    expect(buildText).toContain('ART: survived');
  });

  it('respects AI_SWARM_ENABLED=false', async () => {
    const { fetchMock, calls, buildMessages } = buildSwarmMockProvider();

    const { events } = await runWebsiteHarness({ fetchMock, env: { ...ENV, AI_SWARM_ENABLED: 'false' } });

    expect(calls.architect).toBe(0);
    expect(calls.art).toBe(0);
    expect(phaseList(events)).not.toContain('swarm-planning');
    expect(JSON.stringify(buildMessages[0])).not.toContain('## architect');
    expect(harnessDiagnostics(events).swarm.enabled).toBe(false);
  });

  it('skips the swarm for the game fast path', async () => {
    const GAME_ARTIFACT = `<!DOCTYPE html>
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
    const { fetchMock, calls } = buildSwarmMockProvider();
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const messages = JSON.stringify(body.messages || []);
      if (messages.includes('concise implementation brief')) return permanentFailure();
      if (messages.includes('visual direction brief')) return permanentFailure();
      if (messages.includes('Produce a concise build specification')) return jsonCompletion(SPEC);
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      return body.stream === true ? sseDelta([GAME_ARTIFACT]) : jsonCompletion(GAME_ARTIFACT);
    });
    const events = [];
    vi.stubGlobal('fetch', fetchMock);
    const iterable = runCreationHarness({
      prompt: 'build a space shooter game',
      primaryIntent: 'game_creation',
      intentType: 'game_creation',
      apiMessages: [
        { role: 'system', content: 'You are COREZ AI, a game-building engine.' },
        { role: 'user', content: 'build a space shooter game' }
      ],
      env: ENV,
      signal: null,
      store: createTaskStateStore({})
    });
    for await (const event of iterable) events.push(event);

    expect(calls.architect).toBe(0);
    expect(calls.art).toBe(0);
    expect(phaseList(events)).not.toContain('swarm-planning');
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('resumes from persisted swarm contributions without re-running specialists', async () => {
    const { fetchMock, calls, buildMessages } = buildSwarmMockProvider();
    // If resume is correct, the specialist calls are never issued — make them
    // fail hard so a re-run would be visible.
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const messages = JSON.stringify(body.messages || []);
      if (messages.includes('concise implementation brief')) return permanentFailure();
      if (messages.includes('visual direction brief')) return permanentFailure();
      if (messages.includes('Produce a concise build specification')) return jsonCompletion(SPEC);
      if (messages.includes('final reviewer of a finished artifact')) return jsonCompletion('APPROVED');
      if (body.stream === true) {
        buildMessages.push(body.messages || []);
        return sseDelta([WEBSITE_ARTIFACT]);
      }
      return jsonCompletion(WEBSITE_ARTIFACT);
    });

    const store = createTaskStateStore({});
    const prompt = 'build a landing page website with hero, pricing, and contact form';
    const taskId = harnessTaskId(prompt, 'website_creation');
    await store.save(taskId, {
      taskId,
      prompt,
      primaryIntent: 'website_creation',
      intentType: 'website_creation',
      status: 'active',
      phase: 'planning',
      spec: SPEC,
      build: null,
      verification: null,
      review: null,
      repairCount: 0,
      swarm: {
        enabled: true,
        contributions: [
          { role: 'architect', content: 'ARCH-RESUMED' },
          { role: 'art-director', content: 'ART-RESUMED' }
        ],
        elapsedMs: 100
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    const { events } = await runWebsiteHarness({ fetchMock, store });

    expect(calls.architect).toBe(0);
    expect(calls.art).toBe(0);
    expect(phaseList(events)).not.toContain('swarm-planning');
    const buildText = JSON.stringify(buildMessages[0]);
    expect(buildText).toContain('ARCH-RESUMED');
    expect(buildText).toContain('ART-RESUMED');
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });
});

describe('swarm helpers', () => {
  it('buildSwarmContext preserves the single-file contract', () => {
    const context = buildSwarmContext(SPEC, [
      { role: 'architect', content: 'A' },
      { role: 'art-director', content: 'B' }
    ]);
    expect(context).toContain('Build specification:');
    expect(context).toContain('## architect\nA');
    expect(context).toContain('## art-director\nB');
    expect(context).toContain('Deliver ONLY the complete, finished artifact as a single self-contained HTML document.');
    // Empty contributions degrade to the plain spec context.
    const plain = buildSwarmContext(SPEC, []);
    expect(plain).not.toContain('## ');
  });

  it('envFlagEnabled and swarmEnabledFor honor explicit opt-out', () => {
    expect(swarmEnabledFor({})).toBe(true);
    expect(swarmEnabledFor({ AI_SWARM_ENABLED: 'false' })).toBe(false);
    expect(swarmEnabledFor({ AI_SWARM_ENABLED: '0' })).toBe(false);
    expect(swarmEnabledFor({ AI_SWARM_ENABLED: 'no' })).toBe(false);
    expect(swarmEnabledFor({ AI_SWARM_ENABLED: 'true' })).toBe(true);
    expect(envFlagEnabled({ X: 'false' }, 'X')).toBe(false);
  });
});
