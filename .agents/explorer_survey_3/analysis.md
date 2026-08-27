# CoreZ Swarm & Benchmarking Architecture Survey Report

**Agent**: Explorer Survey 3  
**Working Directory**: `/workspaces/New-Corez/.agents/explorer_survey_3`  
**Date**: 2026-08-27  
**Scope**: Swarm benchmark suites, performance/reliability benchmarking, test configuration, test runners, existing swarm test files, verification/acceptance criteria, and deterministic execution.

---

## 1. Executive Summary

A comprehensive investigation of the CoreZ repository was conducted focusing on multi-agent swarm orchestration, reliability/concurrency mechanisms, benchmark evaluation suites, test configurations, and verification criteria.

Key Findings:
1. **Swarm Benchmark Suite & Evaluation Core**: CoreZ contains a dedicated, highly structured benchmarking system in `benchmarks/benchmark-cases.js` and `benchmarks/evaluator-core.js`, driven by `scripts/evaluate-benchmark.mjs` and verified by `tests/benchmark-evaluator.test.js`. It includes 41+ single prompts, 4 multi-turn continuity scenarios (e.g. 5-turn snake game delta evolution), and 10 synthetic failure test cases testing strict hard-failure triggers and 7-aspect weighted scoring.
2. **Reliability & Zero-Race Concurrency**: Swarm concurrency and task management are handled through three core components:
   - `AdaptiveConcurrencyQueue` (`src/services/gamePipeline/swarm/adaptiveQueue.js`): Dynamic scaling based on OpenRouter response latency, exponential backoff with jitter on HTTP 429 rate limits, and `Promise.allSettled` failure isolation.
   - `ResourceLockManager` (`src/services/gamePipeline/swarm/taskGraph.js`): All-or-nothing multi-resource atomic lock acquisition with automated rollback on contention and resource version increments.
   - `SharedProjectState` (`src/services/gamePipeline/swarm/taskGraph.js`): Monotonic `specVersion` tracking, atomic commits to `validatedOutputs`, and blocking/non-blocking issue logs.
   - `HierarchicalSynthesis` (`packages/agent-core/swarm/hierarchicalSynthesis.js`): Proven capability to handle 1,001+ workstreams using token-estimated chunking (`chunkByTokens`), durable wave state persistence, and restart resumption without duplicate execution.
3. **Swarm Test Inventory & Test Runners**:
   - Primary test runner is **Vitest v3.2.7** configured via `vite.config.js` with a custom `localStorage` memory shim in `tests/setup.js` ensuring hermetic execution under Node >= 22.
   - 8 primary swarm test files exist across `tests/` and `tests/cli/`: `tests/swarm-dynamic-dag.test.js`, `tests/swarm-task-graph.test.js`, `tests/swarm-adaptive-queue.test.js`, `tests/swarm-large-synthesis.test.js`, `tests/swarm-orchestrator.test.js`, `tests/swarm-accessibility-performance.test.js`, `tests/harness-swarm.test.js`, and `tests/cli/generic-swarm.test.js`.
4. **Key Gap**: The npm script `"test:swarm"` in root `package.json` only references 5 test files (`tests/swarm-task-graph.test.js`, `tests/swarm-adaptive-queue.test.js`, `tests/swarm-large-synthesis.test.js`, `tests/swarm-orchestrator.test.js`, `tests/design-systems.test.js`), omitting newly added suites `tests/swarm-dynamic-dag.test.js`, `tests/swarm-accessibility-performance.test.js`, `tests/harness-swarm.test.js`, and `tests/cli/generic-swarm.test.js`.

---

## 2. Swarm Benchmark Suites & Performance/Reliability Architecture

### 2.1 Benchmark Case Library (`benchmarks/benchmark-cases.js`)

The benchmark library defines generic, unspecialized evaluation prompts categorized into:
- **General** (`general-001` to `general-008`): Technical concepts, operational checklists, database comparisons.
- **Writing** (`writing-001` to `writing-007`): Copywriting, professional tone adaptations, email drafts, summaries.
- **Coding** (`coding-001` to `coding-009`): Functions, bug diagnosis, async/await, React counter, debounce, CSS centering.
- **Games** (`game-001` to `game-010`): Snake, 2D platformer, Pong, memory match, space shooter, breakout, tic-tac-toe.
- **Adversarial** (`adversarial-001` to `adversarial-006`): Strict formatting constraints (no code, exact haiku length limits, forbidden terms like "cache").

#### Multi-Turn Continuity Scenarios:
1. `snake-5-turn-continuity`: Initial build -> gradual speedup -> colour change -> mobile touch controls -> selective rollback.
2. `pong-4-turn-continuity`: Initial build -> paddle speed change -> ball colour change -> sound effect integration.
3. `landing-3-turn-continuity`: Bakery landing page -> contact form addition -> heading text edit.
4. `timer-2-turn-continuity`: Pomodoro timer -> default session length modification.

#### Evaluator Self-Check Failure Table:
Synthetic outputs (`failure-001` to `failure-010`) designed to trigger hard rejections:
- `failure-001`: Truncated explanation text
- `failure-002`: Unclosed/open code fence
- `failure-003`: Syntactically invalid JavaScript
- `failure-004`: Core requirement ignored
- `failure-005`: Empty provider response
- `failure-006`: Unprompted framework replacement during multi-turn follow-up
- `failure-007`: Unprompted deletion of existing functionality
- `failure-008`: Fabricated claims regarding previous implementation state
- `failure-009`: Missing requested deliverable (e.g. conversational reply when code was requested)
- `failure-010`: Broken game logic despite visually attractive UI

### 2.2 Strict Scoring & Hard-Failure Detection (`benchmarks/evaluator-core.js`)

The evaluator uses a 5-point grading scale gated by hard-failure detection. If any hard failure is flagged, the output fails (`passed: false`) regardless of numeric score.

#### Weighted Aspect Scoring Model:
| Aspect | Weight | Focus |
|---|---|---|
| `instructionAdherence` | 20% (0.20) | Fulfills required keywords, constraints, adversarial boundaries |
| `functionalCorrectness`| 25% (0.25) | Syntax validity, runnable logic, loop/canvas/state correctness |
| `conversationContinuity`| 15% (0.15) | Framework preservation, non-destructive delta updates |
| `executionValidation`  | 15% (0.15) | Verified deliverables matching requested intent |
| `completeness`         | 10% (0.10) | Length thresholds, lack of placeholder/TODO code |
| `uxQuality`            | 10% (0.10) | Semantic structure, accessibility tokens, styling depth |
| `efficiency`           | 5%  (0.05) | Conciseness, lack of conversational fluff |

### 2.3 Benchmark CLI Runner (`scripts/evaluate-benchmark.mjs`)

Supports multiple execution targets and test taxonomies:
- **`UNIT`**: Deterministic evaluator self-checks over synthetic failure cases.
- **`INTEGRATION`**: Direct module-level worker execution (`worker/entry.js`) with mocked provider responses (`--no-key`).
- **`LIVE PROVIDER`**: Module-level worker execution using real OpenRouter / OpenCode credentials from `.dev.vars` or environment variables.
- **`E2E`**: Full HTTP-level API execution against running endpoints (`--url <baseUrl>`).

Outputs detailed JSON and Markdown reports to `benchmark-results/benchmark-<timestamp>.{json,md}` with per-case latency, TTFT, token usage, and aspect breakdowns.

---

## 3. Swarm Concurrency, Locking & State Management

### 3.1 Adaptive Concurrency Queue (`src/services/gamePipeline/swarm/adaptiveQueue.js`)

```
               ┌───────────────────────────────┐
               │    AdaptiveConcurrencyQueue   │
               └───────────────┬───────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   Success Path (<2000ms latency)        Failure / HTTP 429 Path
  - Consecutive successes >= 3           - Rate limit hit: Concurrency /= 2
  - Concurrency += 1 up to ceiling       - Exponential backoff with jitter
  - Sliding latency window (20 items)    - Promise.allSettled isolation
```

- **Dynamic Ceiling**: Operator-defined ceiling or adaptive bounds (min 1, adaptive 8–100).
- **Rate-Limit Resilience**: On HTTP 429, concurrency is halved (`Math.floor(concurrency / 2)`), backoff multiplier doubles (capped at 32x), and a randomized jitter (`(500 * multiplier) + random(300)ms`) is applied before resuming queue processing.
- **Failure Isolation**: Tasks execute under `Promise.allSettled` semantics; a failed agent never aborts parallel sibling agents.

### 3.2 Resource Lock Manager (`src/services/gamePipeline/swarm/taskGraph.js`)

- **Atomic All-or-Nothing Acquisition**:
  `acquireLocks(resourceNames, agentId)` performs a dry-run check on all requested resource paths before claiming locks. If even one resource is locked by another agent, the entire call fails and leaves zero locks held by the requester.
- **Collision Prevention**: Prevents concurrent writes across files (`src/components/`, `spec/architecture.json`, `engine/core.js`).
- **Version Tracking**: Each resource retains an incrementing `version` integer, preventing stale overwrite anomalies.
- **Auto Release**: `releaseAllLocksForAgent(agentId)` ensures clean rollback on task completion, failure, or retry.

### 3.3 Dynamic Task Graph & Topological Merging (`src/services/gamePipeline/swarm/taskGraph.js`)

- **Agent Lifecycle States**: `CREATED` -> `QUEUED` -> `WAITING_FOR_DEPENDENCIES` -> `RUNNING` -> `VALIDATING` -> `COMPLETED` / `FAILED` / `RETRYING` / `DECOMPOSED`.
- **Topological Ordering**: `getTopologicalOrder()` uses depth-first graph traversal ensuring upstream dependencies strictly precede downstream dependents in result aggregation.
- **Runtime Task Decomposition**: `handleDecomposition(parentTaskId, payload, options)` transitions the parent task to `DECOMPOSED` (satisfied) and spawns subtasks inheriting parent dependencies, optionally rewiring downstream dependent tasks to the new subtasks.
- **Specialist Task Injection**: `injectDynamicTasks(newTasks, { afterTaskId, beforeTaskIds })` allows dynamic insertion of specialist nodes (e.g. `security`, `accessibility`, `performance`) between DAG stages.

### 3.4 Hierarchical Synthesis (`packages/agent-core/swarm/hierarchicalSynthesis.js`)

- **Large-Scale Workstream Support**: Handles 1,001+ workstreams without memory exhaustion or context truncation.
- **Token-Estimated Chunking**: `chunkByTokens(outputs, { maxTokens })` groups outputs based on estimated token weight rather than arbitrary agent counts.
- **Durable State & Resumption**: Persists `synthesisOutputs` and `synthesisState` (current wave, completed waves, stored agent IDs). Restarting or resuming synthesis continues from the pending wave without re-executing previously completed waves.
- **Direct Output Retrieval**: Provides `retrieve(agentId)` to fetch exact raw specialist output without losing fidelity to summaries.

---

## 4. Test Configuration & Existing Test Catalog

### 4.1 Test Runner & Environment Setup

- **Runner**: Vitest v3.2.7 configured via `vite.config.js`.
- **Global Setup (`tests/setup.js`)**:
  Provides an in-memory `createMemoryStorage()` Map implementation bound to `globalThis.localStorage`. This prevents Node >= 22's experimental undefined `localStorage` accessor from crashing jsdom window operations during session persistence tests.

### 4.2 NPM Scripts Catalog (`package.json`)

| Script | Command | Purpose |
|---|---|---|
| `npm test` | `vitest run` | Runs all 93 unit and integration test suites |
| `npm run test:swarm` | `vitest run tests/swarm-task-graph.test.js ...` | Runs swarm-specific unit test suites |
| `npm run test:cli` | `vitest run tests/cli` | Runs CLI command and agent loop tests |
| `npm run test:reliability` | `vitest run tests/response-processor.test.js ...` | Reliability, response processing, and speed tests |
| `npm run test:game` | `vitest run tests/game-manifest.test.js ...` | Game pipeline and iframe bridge tests |
| `npm run test:cloudflare` | Shell and Node contract scripts | Cloudflare Workers bindings and AI contracts |
| `npm run benchmark` | `node scripts/evaluate-benchmark.mjs --module` | Runs benchmark suite in module mode |
| `npm run benchmark:live` | `node scripts/evaluate-benchmark.mjs --module --all-scenarios` | Runs all benchmark cases and multi-turn scenarios |
| `npm run benchmark:e2e` | `node scripts/evaluate-benchmark.mjs --url` | Runs benchmark suite against HTTP endpoint |
| `npm run lint` | `eslint .` | Linting across entire codebase |

### 4.3 Swarm Test Suites Catalog

| Test File | Test Count | Key Features Verified |
|---|---|---|
| `tests/swarm-dynamic-dag.test.js` | 9 | Role catalog definitions, prompt formatting with upstream/retry context, atomic lock rollback, dynamic DAG decomposition, downstream rewiring, dynamic specialist injection, topological DAG ordering, GenericSwarmOrchestrator e2e execution, verifier self-correction retry loop |
| `tests/swarm-task-graph.test.js` | 6 | Unlimited dynamic agents (150+), resource lock management, atomic commits to SharedProjectState, recursive task decomposition, partial dependency resolution, decomposed subtask immediate release |
| `tests/swarm-adaptive-queue.test.js` | 3 | Adaptive concurrency scaling, HTTP 429 rate-limit backoff, Promise.allSettled failure isolation |
| `tests/swarm-large-synthesis.test.js` | 4 | 1,001-workstream hierarchical synthesis, token-based chunking, durable wave state persistence and restart without duplication, honest failure reporting |
| `tests/swarm-orchestrator.test.js` | 4 | OpenRouter routing parameters (`muse-spark-1.2-contributor`, `sort: throughput`), dynamic multi-swarm game creation, dependency-order output merging (`mergeOutputsInDagOrder`), verifier hook completion gating |
| `tests/swarm-accessibility-performance.test.js` | 5 | Accessibility & Performance roles in `SWARM_ROLES`, prompt keyword routing to `SWARM_MODE.SWARM`, dynamic specialist brief resolution, `buildSwarmContext` formatting, `corez agents` CLI command |
| `tests/harness-swarm.test.js` | 9 | Creation harness pre-pass parallel execution, fallback on specialist failure, partial contribution survival, `AI_SWARM_ENABLED=false` flag, game fast-path bypass, resume from persisted state |
| `tests/cli/generic-swarm.test.js` | 13 | Fast DAG (3 agents) vs Full DAG (6 agents) routing, error handling without hangs, honest failure on missing providerRouter, forced mode overrides, verifier gate integration, `decideSwarmMode` heuristic classification |

---

## 5. Verification & Acceptance Criteria Requirements

### 5.1 Verification Gate Mandate (AGENTS.md & ORIGINAL_REQUEST.md)
1. **Empirical Execution Only**: No deliverable is marked `COMPLETE` without empirical test execution evidence (`exitCode === 0`). Agent text claims are strictly non-evidence.
2. **Verifier Hook Integration**:
   - `GenericSwarmOrchestrator({ verifier })` and `AgentSwarmOrchestrator({ verifier })` execute a real verification function: `async ({ task, output, projectState }) => ({ ok: boolean, evidence?: string })`.
   - If `ok: false`, the orchestrator marks the task as `RETRYING` up to `maxAttempts` (default 3), recording diagnostic evidence in `task.verificationEvidence` and passing it to the retry prompt.
   - If attempts are exhausted, the task is marked `FAILED` and recorded in `projectState.issues`.
3. **Collision-Free Concurrency**:
   - Concurrency queue with all-or-nothing locking (`ResourceLockManager.acquireLocks`) prevents parallel write collisions without deadlocking.
4. **Topological Merging**:
   - Completed deliverables must be assembled strictly in topological dependency order (e.g. `artifactMap` and `topologicalOutputs` in `GenericSwarmOrchestrator`, `mergeOutputsInDagOrder` in `AgentSwarmOrchestrator`).

---

## 6. Gaps Identified & Actionable Recommendations

### Gap 1: Incomplete `npm run test:swarm` Script Definition
- **Observation**: `package.json` line 28 defines `"test:swarm": "vitest run tests/swarm-task-graph.test.js tests/swarm-adaptive-queue.test.js tests/swarm-large-synthesis.test.js tests/swarm-orchestrator.test.js tests/design-systems.test.js"`.
- **Impact**: It omits `tests/swarm-dynamic-dag.test.js`, `tests/swarm-accessibility-performance.test.js`, `tests/harness-swarm.test.js`, and `tests/cli/generic-swarm.test.js`.
- **Recommendation**: Update `package.json` `"test:swarm"` to:
  `"test:swarm": "vitest run tests/swarm-*.test.js tests/harness-swarm.test.js tests/cli/generic-swarm.test.js tests/design-systems.test.js"`

### Gap 2: Unified Benchmark CI Command
- **Observation**: Benchmarks can be evaluated via `scripts/evaluate-benchmark.mjs --module`, but CI workflows currently emphasize contract tests and vitest.
- **Recommendation**: Ensure `npm run benchmark` is included as a regression benchmark check in standard verification workflows.

---

## 7. Deterministic Test Execution Guide

To deterministically run and verify all swarm, benchmark, and reliability suites:

```bash
# 1. Run all Swarm unit and dynamic DAG test suites
npx vitest run tests/swarm-*.test.js tests/harness-swarm.test.js tests/cli/generic-swarm.test.js

# 2. Run Reliability, Benchmark Evaluator, and Response Processor suites
npm run test:reliability

# 3. Run Benchmark Suite in hermetic integration mode
node scripts/evaluate-benchmark.mjs --module --no-key --limit 5

# 4. Run Benchmark Evaluator self-check tests
npx vitest run tests/benchmark-evaluator.test.js

# 5. Run Cloudflare contract verification suite
npm run test:cloudflare

# 6. Run full repository test suite
npm test
```
