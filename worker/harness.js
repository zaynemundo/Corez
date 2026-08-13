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
// The build lease is refreshed on a timer while the harness runs, so a long
// generation (uncapped build stream, slow spec/review) never lets the lease
// expire mid-flight and admit a duplicate concurrent build.
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

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
    store,
    heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS
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

  // Atomic lease acquisition: persist busy + a unique owner token BEFORE any
  // work, then re-load and verify the record still shows OUR token. If
  // another invocation wrote its own token in between, it won the race and
  // this run backs off without touching the record. This shrinks the
  // read-then-write window (previously the whole planning phase) to a single
  // store round-trip, so two concurrent identical requests no longer both
  // plan and build (double provider spend, last-writer-wins clobbering).
  const leaseOwner = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  state.busy = true;
  state.leaseOwner = leaseOwner;
  await persist(store, taskId, state);
  const recheck = await store.load(taskId);
  if (!recheck || recheck.leaseOwner !== leaseOwner) {
    const err = new Error('A build for this request is already in progress.');
    err.status = 429;
    err.retryable = true;
    throw err;
  }
  let leaseOwned = true;

  // Lease heartbeat: refresh the record on a timer for as long as this
  // invocation owns the lease, so a generation running longer than LEASE_MS
  // stays protected from duplicate concurrent builds. Cleared in finally.
  let heartbeatTimer = null;
  if (heartbeatIntervalMs > 0) {
    heartbeatTimer = setInterval(() => {
      if (leaseOwned && state.busy === true) {
        state.heartbeat = Date.now();
        store.save(taskId, state).catch(() => {});
      }
    }, heartbeatIntervalMs);
  }

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
        // A provider outage during planning is a provider failure, never a
        // silent "the AI produced no spec": surface the real reason so the
        // client can retry at the right time.
        const reason = specResult?.status === 'retry-scheduled'
          ? `The AI providers are temporarily busy (recovery scheduled in ~${specResult.retryAfterSeconds}s).`
          : (specResult?.error || 'The AI returned no build specification for this request.');
        throw new Error(reason);
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
    // The repair budget is CUMULATIVE across resumes: a task interrupted
    // after 3 rounds resumes with 2 left, never a fresh 5.
    let repairBudget = Math.max(0, MAX_REPAIR_ROUNDS - (state.repairCount || 0));
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
        for await (const event of runStreamingChain(buildMessages, { env, signal })) {
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
      });
    if (signal?.aborted || reviewResult?.status === 'cancelled') {
      state.busy = false;
      state.status = 'interrupted';
      await persist(store, taskId, state);
      throw Object.assign(new Error('AI request cancelled.'), { status: 499 });
    }
    // A review that never answered (provider outage, retry-scheduled) is
    // recorded as SKIPPED — never as a silent approval: the artifact already
    // passed deterministic verification, but diagnostics must say honestly
    // that the model review did not run.
    state.review = reviewResult?.content
      ? parseReview(reviewResult.content)
      : {
          approved: true,
          feedback: '',
          skipped: true,
          reason: reviewResult?.status === 'retry-scheduled'
            ? `AI providers temporarily busy (recovery scheduled in ~${reviewResult.retryAfterSeconds}s)`
            : (reviewResult?.error || 'review provider returned no usable response')
        };

    if (!state.review.approved && state.repairCount < MAX_REPAIR_ROUNDS) {
      state.repairCount += 1;
      yield reportPhase('repairing');
      yield { type: 'clear' };
      const repairPrompt = buildRepairPrompt(
        originalPrompt,
        state.build,
        [{ code: 'review-failure', detail: state.review.feedback }],
        state.repairCount,
        MAX_REPAIR_ROUNDS
      );
      const repairMessages = [...baseSystem, buildContext, { role: 'user', content: repairPrompt }];
      let collected = '';
      let repairStreamFailed = false;
      try {
        for await (const event of runStreamingChain(repairMessages, { env, signal })) {
          if (event.type === 'delta') {
            collected += event.text;
            yield { type: 'delta', text: event.text };
          } else if (event.type === 'error') {
            repairStreamFailed = true;
          }
        }
      } catch (err) {
        if (signal?.aborted) {
          state.busy = false;
          state.status = 'interrupted';
          await persist(store, taskId, state);
          throw err;
        }
        repairStreamFailed = true;
      }
      if (repairStreamFailed || !collected.trim()) {
        // The repair round could not produce a complete artifact (transient
        // provider hiccup): keep the last good build. Drop any partial
        // deltas the failed round streamed, then re-emit the good build so
        // the client's stream ends with the real artifact — never empty,
        // never partial-garbage concatenated with the full build.
        if (collected.trim()) yield { type: 'clear' };
        yield { type: 'delta', text: state.build };
      } else {
        state.build = collected;
        await persist(store, taskId, state);
        yield reportPhase('verifying');
        state.verification = verifyCreation(collected, { intentType: state.intentType });
        await persist(store, taskId, state);
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
          reviewSkipped: Boolean(state.review?.skipped),
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
    if (heartbeatTimer) clearInterval(heartbeatTimer);
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
