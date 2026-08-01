import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildSwarmAgentSpecs, runSwarmMultiWave, continueSwarmTask } from '../worker/swarm-index.js';
import { createTaskStateStore } from '../worker/utils.js';

const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/chat/completions';

// Each line is one independent requirement sentence (>= 12 chars, no inner
// punctuation) so extractRequirementWorkstreams yields exactly `count`
// requirement workstreams.
function buildRequirementPrompt(count) {
  return Array.from({ length: count }, (_, i) => `Implement independent feature ${i + 1} now`).join('\n');
}

function requirementId(requirementNumber) {
  return `app-requirement-${requirementNumber}-implement-independent-feature-${requirementNumber}-now`;
}

function fakeBucket(map) {
  return {
    async put(key, value) {
      map.set(key, String(value));
    },
    async get(key) {
      const value = map.get(key);
      return value === undefined ? null : { async text() { return value; } };
    },
    async delete(key) {
      map.delete(key);
    }
  };
}

// Deterministic fake AI provider. Wave and domain summaries echo the
// agentIds they were asked to cover, so the captured final synthesis payload
// proves the hierarchy carried every requirement id.
function makeFetch(records) {
  return async (url, init) => {
    expect(url).toBe(OPENCODE_URL);
    const payload = JSON.parse(init.body);
    records.push(payload);
    const system = payload.messages?.[0]?.content || '';
    const user = payload.messages?.at(-1)?.content || '';
    let content;
    if (system.includes("You are COREZ AI's lead synthesis agent.")) {
      content = 'FINAL ANSWER: synthesis completed all workstreams delivered.';
    } else if (system.includes('wave summary') || system.includes('domain summary')) {
      const ids = [...new Set(
        [...user.matchAll(/\bapp-(?:core|requirement)-\d+-[A-Za-z0-9-]+/g)].map((match) => match[0])
      )];
      content = `summary covering: ${ids.join(', ')}`;
    } else {
      content = `specialist output ${records.length}`;
    }
    return Response.json({ choices: [{ message: { content } }] });
  };
}

describe('Multi-wave swarm execution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('executes 1001 requirement workstreams across many persisted waves without discarding any', { timeout: 120_000 }, async () => {
    const requirementCount = 1001;
    const prompt = buildRequirementPrompt(requirementCount);
    const specs = buildSwarmAgentSpecs('app', prompt);
    const total = specs.length;
    expect(total).toBe(4 + requirementCount);
    expect(new Set(specs.map((spec) => spec.agentId)).size).toBe(total);

    const records = [];
    vi.stubGlobal('fetch', makeFetch(records));

    const bucketMap = new Map();
    const store = createTaskStateStore({ ASSET_BUCKET: fakeBucket(bucketMap) });
    const taskId = 'swarm-multiwave-1001';

    const result = await runSwarmMultiWave({
      taskId,
      prompt,
      intentType: 'app',
      history: [],
      specs,
      apiKey: 'sk-multiwave-test',
      env: {},
      store,
      options: { drain: true, waveBudget: 10 }
    });

    expect(result.completed).toBe(true);
    const state = result.state;
    expect(state.status).toBe('completed');

    // No workstream is discarded: every spec reached a terminal state.
    expect(state.completed.length).toBe(total);
    expect(state.queue.length).toBe(0);
    expect(state.failed.length).toBe(0);
    expect(new Set(state.completed.map((entry) => entry.spec.agentId)).size).toBe(total);
    expect(state.waveCount).toBeGreaterThanOrEqual(Math.ceil(total / 10));

    // The swarm really executed many waves and specific far-apart
    // workstreams (1, 900, 901, 1001) all executed.
    const completedIds = new Set(state.completed.map((entry) => entry.spec.agentId));
    expect(completedIds.has(requirementId(1))).toBe(true);
    expect(completedIds.has(requirementId(900))).toBe(true);
    expect(completedIds.has(requirementId(901))).toBe(true);
    expect(completedIds.has(requirementId(1001))).toBe(true);

    // Every full specialist output remains retrievable by ID.
    expect(Object.keys(state.outputById).length).toBe(total);
    for (const spec of specs) {
      expect(state.outputById[spec.agentId]).toBeTruthy();
    }

    // Hierarchical synthesis was used: the captured final synthesis prompt
    // received per-domain summaries that carried EVERY requirement id, the
    // raw specialist outputs were not dumped, and the coverage marker is
    // present.
    const synthesisPayload = records.find((payload) => payload.messages?.[0]?.content.includes("You are COREZ AI's lead synthesis agent."));
    expect(synthesisPayload).toBeTruthy();
    const synthesisUser = synthesisPayload.messages.at(-1).content;
    expect(synthesisUser).toContain('Domain summary');
    expect(synthesisUser).toContain('Hierarchy coverage: 1005 specialist outputs');
    expect(synthesisUser).not.toContain('### Contribution');
    expect(synthesisUser).toContain(requirementId(1));
    expect(synthesisUser).toContain(requirementId(900));
    expect(synthesisUser).toContain(requirementId(901));
    expect(synthesisUser).toContain(requirementId(1001));
    expect(records.some((payload) => payload.messages?.[0]?.content.includes('wave summary'))).toBe(true);
    expect(records.some((payload) => payload.messages?.[0]?.content.includes('domain summary'))).toBe(true);

    // The final content mentions completion.
    expect(result.content).toContain('completed all workstreams');

    // Durable state: a NEW store over the SAME bucket resumes the completed
    // task instantly (no re-run of completed agentIds, no new provider calls).
    const callsBeforeResume = records.length;
    const store2 = createTaskStateStore({ ASSET_BUCKET: fakeBucket(bucketMap) });
    const resumed = await continueSwarmTask({
      taskId,
      env: { OPENCODE_GO_API_KEY: 'sk-multiwave-test' },
      store: store2,
      options: { waveBudget: 10 }
    });
    expect(resumed.completed).toBe(true);
    expect(resumed.state.completed.length).toBe(total);
    expect(resumed.state.queue.length).toBe(0);
    expect(records.length).toBe(callsBeforeResume);

    // Duplicate continuation: idempotent, no duplicated work.
    const again = await continueSwarmTask({
      taskId,
      env: { OPENCODE_GO_API_KEY: 'sk-multiwave-test' },
      store: store2,
      options: { waveBudget: 10 }
    });
    expect(again.completed).toBe(true);
    expect(again.state.completed.length).toBe(total);
    expect(records.length).toBe(callsBeforeResume);
  });

  it('resumes a mid-flight task across continueSwarmTask calls without restarting or re-running work', { timeout: 60_000 }, async () => {
    const prompt = buildRequirementPrompt(25);
    const specs = buildSwarmAgentSpecs('app', prompt);
    const total = specs.length;
    expect(total).toBe(29);

    const records = [];
    vi.stubGlobal('fetch', makeFetch(records));

    const bucketMap = new Map();
    const store = createTaskStateStore({ ASSET_BUCKET: fakeBucket(bucketMap) });
    const taskId = 'swarm-multiwave-resume';

    const first = await runSwarmMultiWave({
      taskId,
      prompt,
      intentType: 'app',
      history: [],
      specs,
      apiKey: 'sk-multiwave-test',
      env: {},
      store,
      options: { waveBudget: 10 }
    });
    expect(first.completed).toBe(false);
    expect(first.state.queue.length).toBeLessThan(total);

    let previous = first.state;
    let guard = 0;
    while (previous.queue.length > 0 && guard < 20) {
      const next = await continueSwarmTask({
        taskId,
        env: { OPENCODE_GO_API_KEY: 'sk-multiwave-test' },
        store,
        options: { waveBudget: 10 }
      });
      // Continuation resumes rather than restarts: the queue only shrinks and
      // completed work only grows, never duplicates.
      expect(next.state.queue.length).toBeLessThan(previous.queue.length);
      expect(next.state.completed.length).toBeGreaterThan(previous.completed.length);
      expect(new Set(next.state.completed.map((entry) => entry.spec.agentId)).size)
        .toBe(next.state.completed.length);
      expect(next.state.completed.length + next.state.queue.length).toBe(total);
      previous = next.state;
      guard += 1;
    }
    expect(previous.status).toBe('completed');
    expect(previous.queue.length).toBe(0);
    expect(previous.completed.length).toBe(total);
  });

  it('collapses the summary hierarchy to a single synthesis call for small swarms', async () => {
    const prompt = 'Implement independent feature one now';
    const specs = buildSwarmAgentSpecs('app', prompt);
    expect(specs.length).toBe(5);

    const records = [];
    vi.stubGlobal('fetch', makeFetch(records));

    const store = createTaskStateStore({});
    const result = await runSwarmMultiWave({
      taskId: 'swarm-collapse-test',
      prompt,
      intentType: 'app',
      history: [],
      specs,
      apiKey: 'sk-multiwave-test',
      env: {},
      store,
      options: { drain: true, waveBudget: 10 }
    });
    expect(result.completed).toBe(true);
    expect(result.state.completed.length).toBe(5);

    // Exactly one synthesis call, no wave/domain summary calls, and the
    // single collapsed summary carries the raw contributions.
    const synthesisPayload = records.find((payload) => payload.messages?.[0]?.content.includes("You are COREZ AI's lead synthesis agent."));
    expect(synthesisPayload).toBeTruthy();
    expect(records.filter((payload) => payload.messages?.[0]?.content.includes('wave summary'))).toHaveLength(0);
    expect(records.filter((payload) => payload.messages?.[0]?.content.includes('domain summary'))).toHaveLength(0);
    expect(records.length).toBe(specs.length + 1);
    expect(synthesisPayload.messages.at(-1).content).toContain('### Domain summary 1: all');
    expect(synthesisPayload.messages.at(-1).content).toContain('### Contribution 1');
  });

  it('marks the task blocked only when no spec can ever complete', async () => {
    const prompt = 'Implement independent feature one now';
    const specs = buildSwarmAgentSpecs('app', prompt);
    expect(specs.length).toBe(5);

    // Permanent 401: never retried, and with zero completed outputs the task
    // dead-locks and must be marked 'blocked' with evidence.
    vi.stubGlobal('fetch', async (url) => {
      expect(url).toBe(OPENCODE_URL);
      return new Response('unauthorized', { status: 401 });
    });

    const store = createTaskStateStore({});
    const result = await runSwarmMultiWave({
      taskId: 'swarm-blocked-test',
      prompt,
      intentType: 'app',
      history: [],
      specs,
      apiKey: 'sk-multiwave-test',
      env: {},
      store,
      options: { drain: true, waveBudget: 10 }
    });
    expect(result.completed).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.state.status).toBe('blocked');
    expect(result.state.completed.length).toBe(0);
    expect(result.state.queue.length).toBe(0);
    expect(result.state.failed.length).toBe(5);
    expect(result.state.blockedReason).toMatch(/No specialist can ever complete/);

    // A later continuation reports the persisted blocked state instead of
    // running new waves.
    const persisted = await store.load('swarm-blocked-test');
    expect(persisted.status).toBe('blocked');
  });

  it('persists cancellation during a continuation without synthesising', async () => {
    const prompt = buildRequirementPrompt(12);
    const specs = buildSwarmAgentSpecs('app', prompt);
    expect(specs.length).toBe(16);

    const records = [];
    vi.stubGlobal('fetch', makeFetch(records));

    const bucketMap = new Map();
    const store = createTaskStateStore({ ASSET_BUCKET: fakeBucket(bucketMap) });
    const taskId = 'swarm-cancel-test';

    const first = await runSwarmMultiWave({
      taskId,
      prompt,
      intentType: 'app',
      history: [],
      specs,
      apiKey: 'sk-multiwave-test',
      env: {},
      store,
      options: { waveBudget: 5 }
    });
    expect(first.completed).toBe(false);
    const callsBefore = records.length;

    const controller = new AbortController();
    controller.abort();
    const cancelled = await continueSwarmTask({
      taskId,
      env: { OPENCODE_GO_API_KEY: 'sk-multiwave-test' },
      signal: controller.signal,
      store,
      options: { waveBudget: 5 }
    });
    expect(cancelled.completed).toBe(false);
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.state.status).toBe('cancelled');
    // Completed results and the remaining queue are preserved.
    expect(cancelled.state.completed.length).toBe(first.state.completed.length);
    expect(cancelled.state.queue.length).toBe(first.state.queue.length);
    expect(cancelled.state.finalContent).toBe(null);
    // No synthesis and no new waves ran.
    expect(records.length).toBe(callsBefore);

    const persisted = await store.load(taskId);
    expect(persisted.status).toBe('cancelled');
    expect(persisted.completed.length).toBe(first.state.completed.length);
    expect(persisted.queue.length).toBe(first.state.queue.length);
  });
});
