// Creation Harness — the agentic build loop that turns a creation prompt
// into a FUNCTIONAL artifact: plan -> build -> verify -> repair (adaptive,
// max 5) -> review -> done. State is persisted to the durable task store
// after every phase, so a disconnected build resumes from the exact phase
// when the client re-issues the identical request.
//
// All provider calls run through the same fallback chain as the direct
// route; the harness only changes HOW the work is sequenced.

import { runProviderChain, runStreamingChain } from './providerChain.js';
import { verifyCreation, verifySpecCoverage, buildRepairPrompt } from './creationVerifier.js';
import { estimateCostUsd } from './utils.js';
import {
  detectTruncation,
  stitchContinuationChunk,
  CONTINUATION_INSTRUCTION,
  ANTI_REPEAT_CONTINUATION_INSTRUCTION
} from './responseProcessor.js';

const MAX_REPAIR_ROUNDS = 5;

// Structural-incompleteness failure codes: an artifact carrying any of these
// is NOT a deliverable — it was cut off mid-block, its root document is
// missing, or its skeleton (canvas/loop/input) is broken. Policy failures
// (external-script, too-many-pages) do not truncate the artifact and are
// reported through diagnostics instead of failing the build.
export const HARD_FAILURE_CODES = new Set([
  'empty-output',
  'incomplete-html',
  'truncated-block',
  'unbalanced-braces',
  'missing-canvas',
  'missing-loop',
  'missing-input'
]);
const LEASE_MS = 5 * 60 * 1000;
// The build lease is refreshed on a timer while the harness runs, so a long
// generation (uncapped build stream, slow spec/review) never lets the lease
// expire mid-flight and admit a duplicate concurrent build.
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
// Total wall-clock budget for one harness run (env AI_HARNESS_TIMEOUT_MS
// overrides). Each provider call is separately deadline-guarded in the chain;
// this cap additionally guarantees the whole multi-phase build always ends
// with a terminal SSE event (error or done) well before Cloudflare's platform
// wall-clock limit could kill the request mid-stream and truncate it silently.
const DEFAULT_HARNESS_TIMEOUT_MS = 240_000;

const SPEC_INSTRUCTION =
  'Produce a concise build specification (max 250 words) for the request below: the purpose, the key screens or features, controls (for games), and confirmation that the deliverable is ONE self-contained HTML file. Do not write any code. Answer directly: do not include internal reasoning or thinking.';

// The planning call uses a COMPACT system prompt instead of the full
// identity/formatting prompt. The spec is a 250-word internal brief that
// needs none of the chat-facing guidance, and OpenCode Go's non-stream
// endpoint was observed hanging/timing out on long system prompts — a
// compact prompt makes planning both faster and reliable, and saves ~1600
// input tokens per build.
const SPEC_SYSTEM_PROMPT =
  'You are COREZ AI, an AI creation platform that builds websites, apps, and games. Answer directly with the requested output only.';

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
  // Unparseable verdict: never a silent approval. The artifact already
  // passed deterministic verification, so it is delivered, but the review is
  // recorded as inconclusive so diagnostics stay honest and no blind repair
  // is triggered on an unknown verdict.
  return { approved: false, feedback: '', inconclusive: true };
}

// Structural verification plus spec-coverage: the planning spec's distinctive
// feature words must mostly appear in the artifact, so a game that is
// structurally complete but silently missing requested features (score,
// levels, enemies) is repaired instead of shipped.
function verifyBuildState(spec, build, intentType) {
  const verification = verifyCreation(build, { intentType });
  const coverage = spec ? verifySpecCoverage(spec, build) : { passed: true, covered: 0, total: 0, ratio: 1, missing: [] };
  verification.specCoverage = coverage;
  if (!coverage.passed && coverage.missing.length > 0) {
    verification.passed = false;
    verification.failures.push({
      code: 'missing-spec-features',
      detail: `The artifact does not cover the requested features (${coverage.covered}/${coverage.total} present; missing: ${coverage.missing.slice(0, 8).join(', ')}).`
    });
  }
  return verification;
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
    sleep,
    complexity,
    heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS
  } = options;

  // Fast path: trivial/low-complexity requests (client-side classified and
  // re-validated here) skip the planning provider call and the review round
  // — the prompt itself serves as the spec, and structural + spec-coverage
  // verification still gate the artifact. Short prompts only, so a large
  // request can never sneak through the lighter path.
  const fastPath = ['trivial', 'low'].includes(String(complexity || '').toLowerCase())
    && String(prompt || '').length <= 400;

  const taskId = harnessTaskId(prompt, primaryIntent);
  const baseSystem = apiMessages.filter((m) => m.role === 'system');
  const userMessages = apiMessages.filter((m) => m.role !== 'system');
  const now = Date.now();

  const configuredTimeout = Number(env?.AI_HARNESS_TIMEOUT_MS);
  const totalTimeoutMs = options.totalTimeoutMs
    || (Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : DEFAULT_HARNESS_TIMEOUT_MS);
  const deadlineAt = now + totalTimeoutMs;
  // Throws a retryable 504 when the whole build has run past its budget, so
  // the client gets an explicit error event instead of a stream killed by the
  // platform wall-clock limit (which would read as "no streamed content").
  const ensureWithinDeadline = () => {
    if (Date.now() > deadlineAt) {
      const err = new Error(`This build took longer than ${Math.ceil(totalTimeoutMs / 1000)}s. The AI providers may be overloaded — please try again in a moment.`);
      err.status = 504;
      err.retryable = true;
      throw err;
    }
  };

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

  // Re-verify existing build with the current verifier rules if resuming
  if (state.build && state.verification && !state.verification.passed) {
    state.verification = verifyBuildState(state.spec, state.build, state.intentType);
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
    // Fast path: for trivial/low-complexity requests the user prompt itself
    // is the spec — no planning provider call, one less round-trip and the
    // largest single latency saving for simple builds.
    if (!state.spec) {
      ensureWithinDeadline();
      yield reportPhase('planning');
      if (fastPath) {
        state.spec = String(prompt || '').trim();
        await persist(store, taskId, state);
      } else {
      // Planning uses a compact system prompt (see SPEC_SYSTEM_PROMPT) and a
      // tighter non-stream deadline: the spec is a short internal brief, so a
      // hung provider should surface as a retryable 503 in ~20s instead of
      // burning the full 90s non-stream timeout. AI_SPEC_TIMEOUT_MS overrides;
      // an explicit AI_NONSTREAM_TIMEOUT_MS (e.g. in tests) is respected.
      const specMessages = [
        { role: 'system', content: SPEC_SYSTEM_PROMPT },
        { role: 'system', content: SPEC_INSTRUCTION },
        ...userMessages
      ];
      const explicitNonstreamMs = Number(env?.AI_NONSTREAM_TIMEOUT_MS);
      const specTimeoutMs = Number(env?.AI_SPEC_TIMEOUT_MS)
        || (explicitNonstreamMs > 0 ? explicitNonstreamMs : 20_000);
      const specResult = await runProviderChain(specMessages, {
        env: { ...env, AI_NONSTREAM_TIMEOUT_MS: String(specTimeoutMs) },
        signal,
        store: null,
        sleep,
        maxRequestRetryMs: specTimeoutMs
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
        // client can retry at the right time. A retry-scheduled result is
        // TRANSIENT — the retry schedule is persisted and the identical
        // request resumes it — so mark it retryable (503) and let the
        // client's harness auto-resume back off and re-issue the request
        // instead of treating it as a permanent failure.
        const isRetryScheduled = specResult?.status === 'retry-scheduled';
        const reason = isRetryScheduled
          ? `The AI providers are temporarily busy (recovery scheduled in ~${specResult.retryAfterSeconds}s).`
          : (specResult?.error || 'The AI returned no build specification for this request.');
        const err = new Error(reason);
        if (isRetryScheduled) {
          err.retryable = true;
          err.status = 503;
        }
        throw err;
      }
      state.spec = specResult.content;
      state.model = specResult.model || state.model;
      await persist(store, taskId, state);
      }
    }

    // 2/3/4. BUILD -> VERIFY -> REPAIR (adaptive, capped).
    const buildContext = {
      role: 'system',
      content: `Build specification:\n${state.spec}\n\nDeliver ONLY the complete, finished artifact as a single self-contained HTML document.`
    };
    let buildMessages = [...baseSystem, buildContext, ...userMessages];
    // Tracks whether this run streamed build content (build/continuation
    // deltas); a resumed run that skips the build phase re-emits the
    // persisted artifact before review.
    let buildStreamed = false;
    // The repair budget is CUMULATIVE across resumes: a task interrupted
    // after 3 rounds resumes with 2 left, never a fresh 5.
    let repairBudget = Math.max(0, MAX_REPAIR_ROUNDS - (state.repairCount || 0));
    while (state.build === null || (state.verification && !state.verification.passed && repairBudget > 0)) {
      ensureWithinDeadline();
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
      let buildFinishReason = null;
      // Delta coalescing: the provider emits tiny per-token deltas (3000+
      // events for a big build). Each event costs a JSON parse + stringify
      // + enqueue in the worker — the dominant CPU expense on the free
      // plan's 10ms invocation cap. Buffering and flushing chunkier deltas
      // keeps the client's stream live while cutting worker CPU hard.
      let deltaBuffer = '';
      let lastDeltaFlush = 0;
      try {
        for await (const event of runStreamingChain(buildMessages, { env, signal })) {
          if (event.type === 'delta') {
            collected += event.text;
            deltaBuffer += event.text;
            buildStreamed = true;
            const now = Date.now();
            if (deltaBuffer.length >= 2048 || now - lastDeltaFlush >= 80) {
              yield { type: 'delta', text: deltaBuffer };
              deltaBuffer = '';
              lastDeltaFlush = now;
            }
          } else if (event.type === 'meta') {
            provider = provider || event.provider || null;
            model = model || event.model || null;
          } else if (event.type === 'usage') {
            inputTokens = event.inputTokens ?? inputTokens;
            outputTokens = event.outputTokens ?? outputTokens;
          } else if (event.type === 'done') {
            provider = provider || event.provider || null;
            model = model || event.model || null;
            buildFinishReason = buildFinishReason || event.finishReason || null;
          } else if (event.type === 'error') {
            const err = new Error(event.message || 'Harness build stream failed.');
            err.status = event.status || 502;
            err.retryable = event.retryable === true;
            throw err;
          }
        }
        if (deltaBuffer) yield { type: 'delta', text: deltaBuffer };
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

      // Auto-continuation loop: if the generation was truncated mid-syntax
      // (token limit reached, unclosed script/tags, unclosed fences), stream
      // continuation chunks seamlessly until the artifact is complete.
      let continuationPass = 0;
      let antiRepeatTried = false;
      const MAX_CONTINUATION_PASSES = 10;
      while (continuationPass < MAX_CONTINUATION_PASSES && collected.trim()) {
        ensureWithinDeadline();
        // The provider's finish reason ('length') is evidence of truncation
        // only when the text does not end at a clean boundary. detectTruncation
        // already covers unclosed fences/tags/brackets, so a full verifyCreation
        // pass here is redundant — and each pass rescans the whole artifact
        // with ~20 regexes, a big CPU cost on the free plan's 10ms cap. Full
        // structural verification runs once after the loop.
        const truncation = detectTruncation(collected, { stopReason: buildFinishReason });
        if (!truncation.truncated) break;

        continuationPass += 1;
        yield { type: 'phase', phase: 'continuing', attempt: continuationPass, total: MAX_CONTINUATION_PASSES };

        // If the previous continuation repeated the beginning instead of
        // continuing, switch to an explicit anti-repetition instruction.
        const instruction = antiRepeatTried ? ANTI_REPEAT_CONTINUATION_INSTRUCTION : CONTINUATION_INSTRUCTION;
        const continuationMessages = [
          ...baseSystem,
          buildContext,
          ...userMessages,
          { role: 'assistant', content: collected },
          { role: 'user', content: instruction }
        ];

        let continuationChunk = '';
        try {
          for await (const event of runStreamingChain(continuationMessages, { env, signal })) {
            if (event.type === 'delta') {
              continuationChunk += event.text;
            } else if (event.type === 'usage' && event.outputTokens) {
              outputTokens = (outputTokens || 0) + event.outputTokens;
            } else if (event.type === 'done') {
              buildFinishReason = event.finishReason || buildFinishReason;
            }
          }
        } catch (contErr) {
          if (signal?.aborted) throw contErr;
          break;
        }

        if (!continuationChunk.trim()) break;
        const { stitched, deltaText } = stitchContinuationChunk(collected, continuationChunk);
        if (deltaText) {
          buildStreamed = true;
          yield { type: 'delta', text: deltaText };
        }
        if (stitched.length <= collected.length) {
          // The model restarted from the beginning instead of continuing:
          // give it ONE retry with the anti-repetition instruction before
          // giving up on this pass.
          if (!antiRepeatTried) {
            antiRepeatTried = true;
            continue;
          }
          break;
        }
        collected = stitched;
        state.build = collected;
        await persist(store, taskId, state);
      }

      state.build = collected;
      state.model = model || state.model;
      state.provider = provider || state.provider;
      state.lastBuildUsage = { inputTokens, outputTokens };
      // Persist the new build ONCE (mandatory for crash-resume). The
      // verification/review results are deterministic or re-runnable, so
      // skipping the intermediate full-state persists (each re-serializes
      // the whole artifact — a big CPU cost on the free plan's 10ms cap)
      // costs only a re-verify/re-review after a crash between phases.
      await persist(store, taskId, state);

      yield reportPhase('verifying');
      state.verification = verifyBuildState(state.spec, collected, state.intentType);
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

    // Resume without a rebuild: an interrupted run whose persisted build
    // already passed verification skips the build phase above — re-emit the
    // stored artifact so the resumed stream delivers the content instead of
    // a bare done event (which the client would read as "no streamed
    // content" and give up on).
    if (!buildStreamed && state.build && state.build.trim()) {
      yield { type: 'delta', text: state.build };
    }

    // 5. REVIEW — the model sanity-checks functionality. Explicit
    // NEEDS_FIX verdicts trigger targeted repair rounds (bounded); a
    // repaired build is reviewed again so a fix that missed defects is
    // caught instead of shipped. Unparseable or missing reviews are never
    // treated as approval and never trigger blind repairs. The fast path
    // (trivial/low complexity) skips the review round entirely: structural
    // + spec-coverage verification already gated the artifact.
    const MAX_REVIEW_CYCLES = 2;
    let reviewCycles = 0;
    if (fastPath) {
      // A skipped review is never claimed as approval (same rule as a
      // provider-outage skip): the artifact passed deterministic
      // verification, and the reason explains why the review did not run.
      state.review = {
        approved: false,
        feedback: '',
        skipped: true,
        inconclusive: false,
        reason: 'complexity-gate: review skipped for a trivial/low-complexity request'
      };
    }
    while (!fastPath && reviewCycles < MAX_REVIEW_CYCLES) {
      ensureWithinDeadline();
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
        sleep
      });
      if (signal?.aborted || reviewResult?.status === 'cancelled') {
        state.busy = false;
        state.status = 'interrupted';
        await persist(store, taskId, state);
        throw Object.assign(new Error('AI request cancelled.'), { status: 499 });
      }
      // A review that never answered (provider outage, retry-scheduled) is
      // recorded as SKIPPED — never as a silent approval: the artifact
      // already passed deterministic verification, but diagnostics must say
      // honestly that the model review did not run.
      state.review = reviewResult?.content
        ? parseReview(reviewResult.content)
        : {
            approved: false,
            feedback: '',
            skipped: true,
            inconclusive: true,
            reason: reviewResult?.status === 'retry-scheduled'
              ? `AI providers temporarily busy (recovery scheduled in ~${reviewResult.retryAfterSeconds}s)`
              : (reviewResult?.error || 'review provider returned no usable response')
          };
      // Inconclusive/skipped: deliver (already verified) with honest
      // diagnostics — never a blind repair on an unknown verdict.
      if (state.review.skipped || state.review.inconclusive) break;
      if (state.review.approved || state.repairCount >= MAX_REPAIR_ROUNDS) break;

      reviewCycles += 1;
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
        break;
      }
      state.build = collected;
      // Persist the repaired build once (resume needs the latest artifact);
      // the re-verification below is deterministic and persisted at the end.
      await persist(store, taskId, state);
      yield reportPhase('verifying');
      state.verification = verifyBuildState(state.spec, collected, state.intentType);
      // Loop continues: re-review the repaired build.
    }

    // Honest-failure gate: an artifact that is STILL structurally incomplete
    // (cut off mid-block, missing root document, broken game skeleton) after
    // every continuation and repair round is NEVER delivered as a successful
    // build — the client gets an explicit error instead of a clean "done"
    // over truncated content. Policy failures (external-script,
    // too-many-pages) do not truncate the artifact, keep the review path,
    // and surface through diagnostics.
    if (state.verification && !state.verification.passed) {
      const hardFailures = state.verification.failures.filter((f) => HARD_FAILURE_CODES.has(f.code));
      if (hardFailures.length > 0) {
        // A retry deserves a fresh budget: the previous rounds were spent on
        // the same incomplete artifact, so a retry should repair forward
        // from the persisted partial build instead of erroring instantly.
        state.repairCount = 0;
        const detail = hardFailures.map((f) => f.detail).join(' ');
        throw Object.assign(
          new Error(`The AI could not produce a complete artifact (${detail}). Please try again.`),
          { status: 502, retryable: true }
        );
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
          reviewInconclusive: Boolean(state.review?.inconclusive),
          model: state.model || null,
          usage: state.lastBuildUsage || null,
          estimatedCostUsd: estimateCostUsd(
            state.lastBuildUsage?.inputTokens,
            state.lastBuildUsage?.outputTokens,
            env
          )
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
