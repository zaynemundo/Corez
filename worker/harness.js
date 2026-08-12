// Creation Harness — the agentic build loop that turns a creation prompt
// into a FUNCTIONAL artifact: plan -> build -> verify -> repair (adaptive,
// max 5) -> review -> done. State is persisted to the durable task store
// after every phase, so a disconnected build resumes from the exact phase
// when the client re-issues the identical request.
//
// All provider calls run through the same fallback chain as the direct
// route; the harness only changes HOW the work is sequenced.

import { runProviderChain, runStreamingChain } from './providerChain.js';
import { verifyCreation, buildRepairPrompt } from './creationVerifier.js';

const MAX_REPAIR_ROUNDS = 5;
const LEASE_MS = 5 * 60 * 1000;
// Reasoning models spend their OUTPUT budget on internal reasoning before
// answering: a tight cap is consumed by thinking alone and the content comes
// back empty (finish_reason "length", content ""). These caps give the model
// room to reason AND produce the actual deliverable on the FIRST attempt —
// no recovery retries exist to mask a capped-off answer.
const SPEC_MAX_TOKENS = 3000;
const REVIEW_MAX_TOKENS = 2400;

const SPEC_INSTRUCTION =
  'Produce a concise build specification (max 250 words) for the request below: the purpose, the key screens or features, controls (for games), and confirmation that the deliverable is ONE self-contained HTML file. Do not write any code. Answer directly: do not include internal reasoning or thinking.';

const REVIEW_INSTRUCTION =
  'You are the final reviewer of a finished artifact. Check it for FUNCTIONAL correctness only: does it run, are the core interactions wired up (buttons, controls, game loop, navigation), is any essential feature missing or visibly broken? Reply with ONLY a single line: either "APPROVED" or "NEEDS_FIX: <one sentence describing the functional defect>". Answer directly: do not include internal reasoning or thinking.';

export function harnessTaskId(prompt, primaryIntent) {
  const seed = `${primaryIntent}|${String(prompt || '').trim()}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return `harness-${hash.toString(16).padStart(8, '0')}`;
}

function isBusy(state, now) {
  return state?.busy === true && now - (state?.heartbeat || 0) < LEASE_MS;
}

function persist(store, taskId, state) {
  state.heartbeat = Date.now();
  state.updatedAt = Date.now();
  return store.save(taskId, state);
}

function parseReview(text) {
  const value = String(text || '').trim();
  if (/^APPROVED\b/i.test(value)) return { approved: true, feedback: '' };
  const match = value.match(/^NEEDS_FIX\s*:\s*(.+)$/i);
  if (match) return { approved: false, feedback: match[1].trim() };
  return { approved: true, feedback: '' };
}

/**
 * Agentic creation loop. Yields SSE events for the streaming response:
 * phase / delta / usage / diagnostics / done / error.
 */
export async function* runCreationHarness(options) {
  const {
    prompt,
    primaryIntent,
    intentType,
    apiMessages,
    env,
    signal,
    store
  } = options;

  const taskId = harnessTaskId(prompt, primaryIntent);
  const baseSystem = apiMessages.filter((m) => m.role === 'system');
  const userMessages = apiMessages.filter((m) => m.role !== 'system');
  const now = Date.now();

  const state = (await store.load(taskId)) || {
    taskId,
    prompt,
    primaryIntent,
    intentType,
    status: 'active',
    phase: 'planning',
    spec: null,
    build: null,
    verification: null,
    review: null,
    repairCount: 0,
    createdAt: now,
    updatedAt: now
  };

  const originalPrompt = prompt;

  // Terminal state: replay the finished artifact so a retry never rebuilds.
  if (state.status === 'done' && state.build?.trim()) {
    yield { type: 'phase', phase: 'done', attempt: state.repairCount, total: MAX_REPAIR_ROUNDS };
    yield { type: 'delta', text: state.build };
    yield { type: 'done', final: true, projectState: null };
    return;
  }

  // Lease: only one invocation may build a given request at a time. The
  // busy error is retryable and never touches the persisted state: the
  // CONCURRENT run owns the record, and a retry that lands after it
  // finishes resumes/replays instead of clobbering its progress.
  if (isBusy(state, now)) {
    const err = new Error('A build for this request is already in progress.');
    err.status = 429;
    err.retryable = true;
    throw err;
  }
  state.busy = true;
  // Whether THIS invocation acquired the lease: only the owner may release
  // it, so a busy error (or its finally) never frees another run's lease.
  let leaseOwned = true;

  const reportPhase = (phase) => {
    state.phase = phase;
    state.updatedAt = Date.now();
    return { type: 'phase', phase, attempt: state.repairCount, total: MAX_REPAIR_ROUNDS };
  };

  try {
    // 1. PLANNING — a compact spec (resumable, buffered, not streamed).
    if (!state.spec) {
      yield reportPhase('planning');
      const specMessages = [
        ...baseSystem,
        { role: 'system', content: SPEC_INSTRUCTION },
        ...userMessages
      ];
      const specResult = await runProviderChain(specMessages, {
        env,
        signal,
        store: null,
        maxTokens: SPEC_MAX_TOKENS
      });
      if (signal?.aborted || specResult?.status === 'cancelled') {
        state.busy = false;
        state.status = 'interrupted';
        await persist(store, taskId, state);
        throw Object.assign(new Error('AI request cancelled.'), { status: 499 });
      }
      if (!specResult?.content) {
        state.busy = false;
        state.status = 'failed';
        await persist(store, taskId, state);
        throw new Error('The AI returned no build specification for this request.');
      }
      state.spec = specResult.content;
      state.model = specResult.model || state.model;
      await persist(store, taskId, state);
    }

    // 2/3/4. BUILD -> VERIFY -> REPAIR (adaptive, capped).
    const buildContext = {
      role: 'system',
      content: `Build specification:\n${state.spec}\n\nDeliver ONLY the complete, finished artifact as a single self-contained HTML document.`
    };
    let buildMessages = [...baseSystem, buildContext, ...userMessages];
    let repairBudget = MAX_REPAIR_ROUNDS;
    while (state.build === null || (state.verification && !state.verification.passed && repairBudget > 0)) {
      const isRepair = state.build !== null;
      if (isRepair) {
        repairBudget -= 1;
        state.repairCount += 1;
        yield reportPhase('repairing');
        // The previous attempt is being replaced: tell the client to drop
        // its accumulated stream so the final content is always the latest
        // build, never broken-then-fixed concatenated.
        yield { type: 'clear' };
        const repairPrompt = buildRepairPrompt(
          originalPrompt,
          state.build,
          state.verification?.failures || [],
          state.repairCount,
          MAX_REPAIR_ROUNDS
        );
        buildMessages = [...baseSystem, buildContext, { role: 'user', content: repairPrompt }];
      } else {
        yield reportPhase('building');
      }

      let collected = '';
      let provider = null;
      let model = null;
      let inputTokens = null;
      let outputTokens = null;
      try {
        for await (const event of runStreamingChain(buildMessages, { env, signal, maxTokens: null })) {
          if (event.type === 'delta') {
            collected += event.text;
            yield { type: 'delta', text: event.text };
          } else if (event.type === 'meta') {
            provider = provider || event.provider || null;
            model = model || event.model || null;
          } else if (event.type === 'usage') {
            inputTokens = event.inputTokens ?? inputTokens;
            outputTokens = event.outputTokens ?? outputTokens;
          } else if (event.type === 'done') {
            provider = provider || event.provider || null;
            model = model || event.model || null;
          } else if (event.type === 'error') {
            const err = new Error(event.message || 'Harness build stream failed.');
            err.status = event.status || 502;
            err.retryable = event.retryable === true;
            throw err;
          }
        }
      } catch (err) {
        if (err?.status === 499 || signal?.aborted) {
          // Client disconnected mid-build: keep the previous good build (if
          // any) and mark interrupted so the next identical request resumes.
          state.busy = false;
          state.status = 'interrupted';
          if (isRepair && collected.trim()) state.build = collected;
          await persist(store, taskId, state);
          throw err;
        }
        if (isRepair && collected.trim()) state.build = collected;
        await persist(store, taskId, state);
        throw err;
      }

      state.build = collected;
      state.model = model || state.model;
      state.provider = provider || state.provider;
      state.lastBuildUsage = { inputTokens, outputTokens };
      await persist(store, taskId, state);

      yield reportPhase('verifying');
      state.verification = verifyCreation(collected, { intentType: state.intentType });
      await persist(store, taskId, state);
    }

    // An empty or whitespace-only build is a provider failure, never a
    // deliverable: fail loudly instead of streaming a done event with zero
    // deltas (which the client would misread as "no streamed content" and
    // retry into the same dead end).
    if (!state.build || !state.build.trim()) {
      state.busy = false;
      state.status = 'failed';
      await persist(store, taskId, state);
      throw new Error('The AI returned an empty build for this request. Please try again.');
    }

    // 5. REVIEW — the model sanity-checks functionality; one final repair
    // round if it flags a defect and the budget allows.
    yield reportPhase('reviewing');
    const reviewMessages = [
      ...baseSystem,
      { role: 'system', content: REVIEW_INSTRUCTION },
      { role: 'user', content: `Artifact to review:\n\n${state.build}` }
    ];
    const reviewResult = await runProviderChain(reviewMessages, {
      env,
      signal,
      store: null,
      maxTokens: REVIEW_MAX_TOKENS
    });
    if (signal?.aborted || reviewResult?.status === 'cancelled') {
      state.busy = false;
      state.status = 'interrupted';
      await persist(store, taskId, state);
      throw Object.assign(new Error('AI request cancelled.'), { status: 499 });
    }
    state.review = reviewResult?.content ? parseReview(reviewResult.content) : { approved: true, feedback: '' };

    if (!state.review.approved && state.repairCount < MAX_REPAIR_ROUNDS) {
      yield reportPhase('repairing');
      yield { type: 'clear' };
      const repairPrompt = buildRepairPrompt(
        originalPrompt,
        state.build,
        [{ code: 'review-failure', detail: state.review.feedback }],
        state.repairCount + 1,
        MAX_REPAIR_ROUNDS
      );
      const repairMessages = [...baseSystem, buildContext, { role: 'user', content: repairPrompt }];
      let collected = '';
      try {
        for await (const event of runStreamingChain(repairMessages, { env, signal, maxTokens: null })) {
          if (event.type === 'delta') {
            collected += event.text;
            yield { type: 'delta', text: event.text };
          }
        }
      } catch (err) {
        if (signal?.aborted) {
          state.busy = false;
          state.status = 'interrupted';
          await persist(store, taskId, state);
          throw err;
        }
        throw err;
      }
      state.repairCount += 1;
      if (collected.trim()) {
        state.build = collected;
        await persist(store, taskId, state);
        yield reportPhase('verifying');
        state.verification = verifyCreation(collected, { intentType: state.intentType });
        await persist(store, taskId, state);
      } else {
        // The repair stream produced nothing (transient provider hiccup):
        // keep the last good build and re-emit it as a delta so the
        // client's stream (cleared for the repair round) is refilled
        // instead of ending the response empty.
        yield { type: 'delta', text: state.build };
      }
    }

    // 6. DONE — persist the terminal state and close the stream.
    state.busy = false;
    state.status = 'done';
    await persist(store, taskId, state);

    yield reportPhase('done');
    yield { type: 'done', final: true, projectState: null };
    yield {
      type: 'diagnostics',
      diagnostics: {
        harness: {
          taskId,
          phases: ['planning', 'building', 'verifying', 'reviewing'],
          repairRounds: state.repairCount,
          verification: state.verification,
          approved: Boolean(state.review?.approved),
          model: state.model || null
        }
      }
    };
  } catch (err) {
    if (err?.status !== 499 && err?.status !== 429 && state.status !== 'interrupted') {
      state.busy = false;
      state.status = 'failed';
      await persist(store, taskId, state).catch(() => {});
    }
    throw err;
  } finally {
    // A cancelled streamed response (client Stop, tab close, or network
    // drop) terminates this generator at its current yield point — the
    // catch above never runs — so release the busy lease here or the same
    // request is locked out for the whole lease window. Normal completion
    // and the catch path already cleared the lease, and a busy error never
    // touches it (another run owns it).
    if (leaseOwned && state.busy === true && state.status === 'active') {
      state.busy = false;
      state.status = state.build && state.build.trim() ? 'interrupted' : 'failed';
      await persist(store, taskId, state).catch(() => {});
    }
  }
}
