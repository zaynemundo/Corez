# Handoff Report — CoreZ Swarm & Benchmarking Survey (Explorer 3)

**Author**: Explorer Survey 3  
**Working Directory**: `/workspaces/New-Corez/.agents/explorer_survey_3`  
**Date**: 2026-08-27  
**Recipient**: Project Orchestrator (`45712cd3-4f3c-446a-8969-c6aa5aeedcc0`)  
**Type**: Hard Handoff (Investigation Complete)

---

## 1. Observation

1. **Benchmark Suite and Evaluator**:
   - `benchmarks/benchmark-cases.js`: Contains 41+ single prompts across categories (`general`, `writing`, `coding`, `game`, `adversarial`), 4 multi-turn continuity scenarios (`snake-5-turn-continuity`, `pong-4-turn-continuity`, `landing-3-turn-continuity`, `timer-2-turn-continuity`), and 10 synthetic failure test cases (`failure-001` to `failure-010`).
   - `benchmarks/evaluator-core.js`: Implements strict 5-point grading with hard failure rejection gates (lines 23–104 of `tests/benchmark-evaluator.test.js` verify truncation, syntax errors, empty responses, framework switching, feature deletions, and broken game logic rejections). Lines 175–186 define the 7-aspect scoring weights:
     - `instructionAdherence`: 0.20
     - `functionalCorrectness`: 0.25
     - `conversationContinuity`: 0.15
     - `executionValidation`: 0.15
     - `completeness`: 0.10
     - `uxQuality`: 0.10
     - `efficiency`: 0.05
   - `scripts/evaluate-benchmark.mjs`: CLI benchmark evaluator supporting `--module`, `--url`, `--only`, `--limit`, `--scenarios`, `--all-scenarios`, `--out`.
   - `tests/benchmark-evaluator.test.js`: 17 tests all passing via Vitest.

2. **Swarm Concurrency & Locking Architecture**:
   - `src/services/gamePipeline/swarm/adaptiveQueue.js`: `AdaptiveConcurrencyQueue` dynamically scales concurrency between `minConcurrency` (1) and `ceiling()` based on average latency (<2000ms triggers scale up after 3 consecutive successes). On HTTP 429 rate limit, it cuts concurrency in half (`Math.floor(currentConcurrency / 2)`), doubles `backoffMultiplier` (up to 32x), applies randomized jitter, and pauses execution.
   - `src/services/gamePipeline/swarm/taskGraph.js`: `ResourceLockManager.acquireLocks()` implements all-or-nothing dry-run checks and atomic lock acquisition. On lock conflict, all acquired locks from that batch are immediately released and the task is deferred.
   - `packages/agent-core/swarm/hierarchicalSynthesis.js`: `HierarchicalSynthesis` implements token-based chunking (`chunkByTokens`, default 6,000 tokens) to scale to 1,001+ workstreams. It persists wave state (`synthesisState.wave`, `completedWaves`) in `TaskStore` to allow resumption after restart without duplicate execution.

3. **Swarm DAG Orchestrators & Creation Harness**:
   - `packages/agent-core/swarm/index.js` (`GenericSwarmOrchestrator`): Implements `decideSwarmMode` routing prompts to `FAST` (3 agents: explorer -> engineer -> reviewer) or `SWARM` (6 agents: explorer -> architect -> frontend/backend in parallel -> tester -> reviewer). Integrates `verifier` hook, self-correction retry loops, and topological output synthesis (`artifactMap`, `topologicalOutputs`).
   - `src/services/gamePipeline/swarm/agentSwarmOrchestrator.js` (`AgentSwarmOrchestrator`): Orchestrates game swarms using OpenRouter model routing (`muse-spark-1.2-contributor`, `sort: throughput`), asset worker delegation to FLUX, verifier gating, and deterministic DAG order merging (`mergeOutputsInDagOrder`).
   - `worker/swarm.js`: Creation harness pre-pass running parallel specialist briefs (`architect`, `art-director`, and dynamically `accessibility` / `performance`) before the streamed build. Preserves single-file HTML contract in `buildSwarmContext`.

4. **Existing Test Configuration & Scripts**:
   - `package.json` specifies:
     - `"test": "vitest run"`
     - `"test:swarm": "vitest run tests/swarm-task-graph.test.js tests/swarm-adaptive-queue.test.js tests/swarm-large-synthesis.test.js tests/swarm-orchestrator.test.js tests/design-systems.test.js"`
     - `"test:reliability": "vitest run tests/response-processor.test.js tests/project-state.test.js tests/benchmark-evaluator.test.js tests/chat-e2e.test.js tests/worker-speed.test.js"`
     - `"test:game": "vitest run tests/game-manifest.test.js tests/game-asset-storage.test.js tests/game-pipeline-state.test.js tests/game-iframe-bridge.test.js"`
     - `"test:cloudflare": "node tests/cloudflare-worker-contract.mjs ..."`
   - Execution command `npx vitest run tests/swarm-*.test.js tests/harness-swarm.test.js tests/cli/generic-swarm.test.js` executed 67 tests across 8 test suites with 100% pass rate (`exitCode === 0`).
   - Full repository test command `npm test` (`vitest run`) executed across 93 test files and 1,072 tests with 100% success (`exitCode === 0`).

---

## 2. Logic Chain

1. From **Observation 1**, CoreZ has an established, deterministic benchmark evaluation system (`benchmarks/benchmark-cases.js`, `benchmarks/evaluator-core.js`, `scripts/evaluate-benchmark.mjs`) that grades code adherence, continuity, syntax validity, and performance across 41+ single prompts and 4 multi-turn scenarios.
2. From **Observation 2**, multi-agent concurrency and zero race conditions are strictly enforced in software via `ResourceLockManager.acquireLocks` (atomic all-or-nothing acquisition) and `AdaptiveConcurrencyQueue` (latency-based scaling + HTTP 429 exponential backoff with jitter + `Promise.allSettled` failure isolation).
3. From **Observation 2 & 3**, topological merging is guaranteed across all orchestrators: `GenericSwarmOrchestrator` computes `getTopologicalOrder()` to assemble `artifactMap` and `topologicalOutputs`, while `AgentSwarmOrchestrator` uses `mergeOutputsInDagOrder()`.
4. From **Observation 3**, verification gates and retry loops are active: verifier rejections cause tasks to enter `AGENT_LIFECYCLE_STATES.RETRYING` up to `maxAttempts`, passing diagnostic evidence into the retry prompt (`retryContext`), and failing cleanly when max attempts are reached without fabricating success.
5. From **Observation 4**, the test runner is Vitest v3.2.7 with hermetic global `localStorage` setup in `tests/setup.js`. All 8 swarm test files pass deterministically. However, `npm run test:swarm` in `package.json` is missing 3 test files (`tests/swarm-dynamic-dag.test.js`, `tests/swarm-accessibility-performance.test.js`, `tests/harness-swarm.test.js`, and `tests/cli/generic-swarm.test.js`), which should be updated.

---

## 3. Caveats

- **Live Provider Credentials**: Running `scripts/evaluate-benchmark.mjs` in `LIVE PROVIDER` mode requires active OpenRouter / OpenCode API credentials (`OPENCODE_GO_API_KEY` in `.dev.vars` or environment). In the absence of keys or when passing `--no-key`, the benchmark evaluator operates in `INTEGRATION` / `UNIT` mode.
- **Single Model Lead**: In accordance with user rules in `AGENTS.md`, `muse-spark-1.2-contributor` operates as the primary lead executor for all code execution and task graph routing, while `flux-2-klein-4b` / FLUX Schnell handles visual asset generation.

---

## 4. Conclusion

The CoreZ Swarm architecture possesses mature, complete implementations of dynamic DAG orchestration, atomic resource locking, adaptive rate-limited concurrency queues, 1,001-workstream hierarchical synthesis, and strict benchmark evaluation.

All swarm test files pass with 100% success (`exitCode === 0`). The only required engineering adjustment is updating `package.json`'s `"test:swarm"` script definition to encompass all existing swarm test suites.

---

## 5. Verification Method

To independently verify all findings and test suites deterministically:

```bash
# 1. Run all Swarm unit and dynamic DAG test suites (67 tests across 8 files)
npx vitest run tests/swarm-*.test.js tests/harness-swarm.test.js tests/cli/generic-swarm.test.js

# 2. Run Reliability and Benchmark Evaluator test suites
npm run test:reliability

# 3. Run Benchmark Evaluator self-check unit tests
npx vitest run tests/benchmark-evaluator.test.js

# 4. Run Benchmark suite in hermetic integration mode
node scripts/evaluate-benchmark.mjs --module --no-key --limit 5

# 5. Run Cloudflare Worker contract checks
npm run test:cloudflare
```

Invalidation condition: If any swarm test suite fails (`exitCode !== 0`), if `ResourceLockManager.acquireLocks` allows concurrent locks on the same file, or if verifier rejection fails to trigger retry loops.
