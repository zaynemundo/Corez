# CoreZ Dynamic DAG & Swarm Mechanics Deep-Dive Analysis

**Author**: Explorer 2 (CoreZ Project Survey)  
**Date**: 2026-08-27  
**Scope**: Dynamic DAG mechanics, atomic multi-resource locking (`ResourceLockManager`), upstream dependency context propagation, verifier-driven retry loops, topological artifact merging, and swarm test suite evaluation.

---

## 1. Executive Summary

CoreZ implements an unlimited, dynamic Directed Acyclic Graph (DAG) orchestration engine designed for high-concurrency, multi-agent software and game development workflows. The system features:

1. **Atomic Multi-Resource Locking (`ResourceLockManager`)**: Implements strict all-or-nothing multi-resource acquisition with dry-run collision detection, automatic rollback on contention, and agent-scoped lock releasing to eliminate race conditions and deadlocks during parallel task execution.
2. **Upstream Dependency Context Propagation**: Downstream specialist agents receive strictly isolated, structured deliverables from completed upstream tasks (`dependencies` and `inputRefs`) via `SharedProjectState.validatedOutputs`, avoiding monolithic context window blowups.
3. **Verifier-Driven Self-Correction Retry Loops**: Empirical verification hooks (`verifier`) execute real test/lint/build checks against agent outputs. Failed verification injects structured diagnostic feedback and evidence into retry prompts up to `maxAttempts` before marking tasks `FAILED`.
4. **Topological Artifact Merging & Hierarchical Synthesis**: Outputs are deterministically ordered via DFS topological sort (`getTopologicalOrder()`), producing structured discrete artifact maps (`artifactMap`) and clean joined deliverables (`mergeOutputsInDagOrder`). For ultra-large workstreams (1,000+ tasks), `HierarchicalSynthesis` applies token-bounded chunking and durable multi-wave reduction.
5. **Test Suite Status**: All 8 swarm-specific test suites across `tests/` and `tests/cli/` (53 tests total) pass with 100% success (`exitCode === 0`).

---

## 2. Dynamic DAG Architecture & Task Lifecycle

The DAG execution engine is implemented in `src/services/gamePipeline/swarm/taskGraph.js` and exported via `packages/agent-core/swarm/index.js` and `src/orchestration/taskGraph.js`.

### 2.1 Agent Lifecycle States

The lifecycle state machine tracks granular agent progression:

```
[CREATED] ───► [WAITING_FOR_DEPENDENCIES] ───► [QUEUED] ───► [RUNNING]
                     ▲                                           │
                     │                                           ▼
                     └────────── [RETRYING] ◄──────────── [VALIDATING]
                                      │                          │
                                      ▼                          ▼
                                  [FAILED]                  [COMPLETED]
                                                                 │
                                                       [DECOMPOSED] (Subtask split)
```

- **`CREATED`**: Task registered in `TaskDependencyGraph`.
- **`WAITING_FOR_DEPENDENCIES`**: Blocked on incomplete upstream dependencies.
- **`QUEUED`**: All upstream dependencies are `COMPLETED` or `DECOMPOSED`; ready for resource lock acquisition.
- **`RUNNING`**: Locks acquired, active execution inside `AdaptiveConcurrencyQueue`.
- **`VALIDATING`**: Execution output received; running empirical `verifier` hook.
- **`RETRYING`**: Verification check or execution failed; attempt incremented (< `maxAttempts`), locks released, scheduled for re-execution.
- **`COMPLETED`**: Verification passed and output atomically committed to `SharedProjectState`.
- **`FAILED`**: Maximum retry attempts exhausted or non-retryable fatal error occurred.
- **`DECOMPOSED`**: Task replaced by dynamically spawned subtasks.

### 2.2 Ready Task Scheduling (`getReadyTasks()`)

`TaskDependencyGraph.getReadyTasks()` (`taskGraph.js:218-241`) evaluates dependency readiness across all non-terminal tasks:

```javascript
const dependenciesMet = task.dependencies.every(depId => {
  const depTask = this.tasks.get(depId);
  return depTask && (
    depTask.status === AGENT_LIFECYCLE_STATES.COMPLETED || 
    depTask.status === AGENT_LIFECYCLE_STATES.DECOMPOSED
  );
});
```

- **Deadlock-Free Decomposition**: Decomposed parent tasks (`DECOMPOSED`) count as satisfied dependencies, allowing downstream tasks or child tasks to proceed without deadlocking on the parent.
- **Partial Dependency Resolution**: Any independent branch can execute immediately without waiting for sibling branches.

### 2.3 Dynamic Runtime Decomposition & Task Injection

The engine supports dynamic modification of the graph during runtime:

1. **`handleDecomposition(parentTaskId, decompositionPayload, options)`** (`taskGraph.js:247-285`):
   - Sets parent task status to `DECOMPOSED`.
   - Spawns child subtasks inheriting parent dependencies or custom subtask dependencies.
   - When `rewireDownstream: true`, downstream tasks that previously depended on `parentTaskId` are automatically re-wired to depend on all newly created child tasks (`newSubTaskIds`).
2. **`injectDynamicTasks(newTasksList, { afterTaskId, beforeTaskIds })`** (`taskGraph.js:291-320`):
   - Dynamically splices specialist tasks (e.g., Security, Accessibility) into an existing DAG, establishing edges from `afterTaskId` and updating `beforeTaskIds` dependencies.

---

## 3. Atomic Multi-Resource Locking & Concurrency Control

### 3.1 `ResourceLockManager` Implementation Details

Located in `src/services/gamePipeline/swarm/taskGraph.js:19-110`:

```javascript
export class ResourceLockManager {
  constructor() {
    this.locks = new Map(); // resourceName -> { ownerAgentId, version, locked: boolean }
  }
  ...
}
```

#### Key Methods:

1. **`acquireLock(resourceName, agentId)`**:
   - If resource is locked by another agent (`existing.locked && existing.ownerAgentId !== agentId`), returns `{ success: false, currentOwner, version }`.
   - Otherwise, increments lock version counter and stores `{ resourceName, ownerAgentId: agentId, version, locked: true }`.
2. **`acquireLocks(resourceNames = [], agentId)`** (All-or-Nothing Multi-Resource Lock):
   - **Phase 1 (Dry-run Validation)**: Iterates over all `resourceNames`. If any single resource is locked by another agent, aborts immediately without mutating state:
     ```javascript
     for (const resName of resourceNames) {
       const existing = this.locks.get(resName);
       if (existing && existing.locked && existing.ownerAgentId !== agentId) {
         return {
           success: false,
           lockedResource: resName,
           currentOwner: existing.ownerAgentId,
           version: existing.version
         };
       }
     }
     ```
   - **Phase 2 (Atomic Acquisition)**: Iterates over `resourceNames` and acquires all locks in memory.
3. **`releaseLock(resourceName, agentId)` & `releaseLocks(resourceNames, agentId)`**:
   - Releases lock by setting `locked: false` only if caller matches `ownerAgentId`.
4. **`releaseAllLocksForAgent(agentId)`**:
   - Scans all entries in `this.locks` and sets `locked: false` for every resource owned by `agentId`.
   - Used in `finally` handlers, retry transitions, failure handlers, and decomposition handlers to prevent orphaned locks.
5. **`canAcquireAll(resourceNames = [], agentId)`**:
   - Read-only predicate checking if all requested resources are currently free or already held by `agentId`.

### 3.2 Deadlock Prevention Mechanisms

1. **All-or-Nothing Acquisition**: Eliminates circular hold-and-wait conditions by verifying the availability of the entire resource set before acquiring any single lock.
2. **Contention Backoff & Yielding**:
   - In `GenericSwarmOrchestrator` (`index.js:188-192`): If all ready tasks face resource contention (`acquirableTasks.length === 0`), the execution loop yields for 50ms to allow in-flight tasks to complete and release resources.
   - In `AgentSwarmOrchestrator` (`agentSwarmOrchestrator.js:223-225`): If lock acquisition fails, the agent sets `task.resourceWaitUntil = Date.now() + 250` and releases any partially acquired resources immediately.
3. **Guaranteed Lock Cleanliness**:
   - Every agent execution path (success, retry, verification rejection, uncaught exception, or decomposition) calls `releaseAllLocksForAgent(agentId)` or `releaseLocks()`.

### 3.3 Adaptive Concurrency Queue Integration

`AdaptiveConcurrencyQueue` (`src/services/gamePipeline/swarm/adaptiveQueue.js`) coordinates task execution throughput:
- **No Hardcoded Maximum Limits**: Unbounded FIFO queue processing.
- **Dynamic Throughput Scaling**: Scales concurrency up when average execution latency is < 2,000ms over 3 consecutive successes.
- **HTTP 429 & Rate-Limit Backoff**: Halves active concurrency and triggers exponential backoff with jitter (`500ms * multiplier + random jitter`) upon detecting rate limits.
- **Fault Isolation**: Uses `Promise.allSettled` semantics so failure in one branch does not cancel independent sibling executions.

---

## 4. Upstream Dependency Context Propagation

### 4.1 Upstream Deliverable Extraction

In `GenericSwarmOrchestrator` (`packages/agent-core/swarm/index.js:207-225`):

```javascript
// Gather upstream context from completed dependencies and inputRefs
const upstreamIds = Array.from(new Set([...(task.dependencies || []), ...(task.inputRefs || [])]));
const upstreamContexts = [];
for (const depId of upstreamIds) {
  const depTask = graph.tasks.get(depId);
  const output = graph.projectState.state.validatedOutputs[depId];
  if (depTask && output !== undefined) {
    upstreamContexts.push({
      taskId: depId,
      role: depTask.role,
      output
    });
  }
}
```

### 4.2 Structured Context Injection

`formatRoleUserPrompt` (`packages/agent-core/swarm/roles.js:157-184`) constructs structured, isolated prompts:

```markdown
### Assignment for frontend
Objective: Implement client UI components and responsive views
Overall User Goal: build a high performance REST API

### Upstream Context & Deliverables:
--- Context from [task-architect] (architect) ---
{
  "architecture": "Modular REST API layout",
  "components": ["RouteHandler", "ValidationMiddleware"]
}
```

### 4.3 Context Isolation Guarantees
- Agents do **NOT** receive monolithic conversation dumps or unformatted chat logs.
- Only validated outputs from explicit dependencies (`dependencies` and `inputRefs`) are injected.
- Prevents context window dilution and hallucination drift across large multi-agent DAGs.

---

## 5. Verifier-Driven Self-Correction Retry Loops

### 5.1 Verification Hook Interface

`GenericSwarmOrchestrator` accepts an optional empirical verifier:
```typescript
verifier?: (context: {
  task: TaskDefinition;
  output: any;
  projectState: SharedProjectState;
}) => Promise<{ ok: boolean; evidence?: string }>;
```

### 5.2 Self-Correction Retry Protocol

Implemented in `GenericSwarmOrchestrator.executeSwarmJob` (`packages/agent-core/swarm/index.js:259-298`):

1. **Execution**: The agent runs its task objective.
2. **Validation Stage**: Task status moves to `AGENT_LIFECYCLE_STATES.VALIDATING`.
3. **Verification Check**: The `verifier` runs empirical checks (unit tests, ESLint, typechecks, build commands).
4. **On Verification Failure (`ok === false`)**:
   - If `(task.attempt || 1) < (task.maxAttempts || 3)`:
     - Increments `task.attempt`.
     - Sets status to `AGENT_LIFECYCLE_STATES.RETRYING`.
     - Stores diagnostic context in `task.verificationEvidence = evidence`.
     - Releases all locks: `graph.resourceManager.releaseAllLocksForAgent(task.agentId)`.
     - Emits `agent_retrying` status event.
   - On subsequent execution, `formatRoleUserPrompt` injects:
     ```markdown
     ### Self-Correction Retry (Attempt 2/3):
     Verifier feedback: Assertion failed: expected 200 got 500
     Please analyze the failure above and fix the issue in your revised output.
     ```
   - If attempts reach `maxAttempts`:
     - Sets status to `AGENT_LIFECYCLE_STATES.FAILED`.
     - Records issue in `SharedProjectState.recordIssue()`.
     - Releases locks and halts dependent tasks.
5. **On Verification Success (`ok === true`)**:
   - Atomically commits output to `SharedProjectState` via `commitTaskOutput()`.
   - Sets status to `AGENT_LIFECYCLE_STATES.COMPLETED`.
   - Releases locks and resolves dependent ready tasks.

---

## 6. Topological Artifact Merging & Deterministic Ordering

### 6.1 DFS Topological Ordering

Topological ordering is computed in `TaskDependencyGraph.prototype.getTopologicalOrder()` (`taskGraph.js:325-346`) and `topologicalOrder(graph)` (`agentSwarmOrchestrator.js:21-38`):

```javascript
getTopologicalOrder() {
  const visited = new Set();
  const result = [];
  const visit = (taskId) => {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    const task = this.tasks.get(taskId);
    if (task) {
      for (const depId of task.dependencies) {
        visit(depId);
      }
      result.push(task);
    }
  };
  for (const taskId of this.tasks.keys()) {
    visit(taskId);
  }
  return result;
}
```

### 6.2 Artifact Merging Strategies

1. **Discrete Resource Artifact Map (`GenericSwarmOrchestrator`)**:
   - Traverses topological tasks and maps each owned resource to its validated output:
     ```javascript
     for (const t of topologicalTasks) {
       const out = graph.projectState.state.validatedOutputs[t.taskId];
       if (out !== undefined) {
         topologicalOutputs.push({ taskId: t.taskId, role: t.role, output: out });
         for (const res of t.ownedResources) {
           artifactMap[res] = out;
         }
       }
     }
     ```
2. **Deterministic String Merging (`mergeOutputsInDagOrder`)** (`agentSwarmOrchestrator.js:43-52`):
   - When no explicit integration task exists, combines completed string outputs in dependency order:
     ```javascript
     export function mergeOutputsInDagOrder(outputs, order, tasks) {
       const parts = [];
       for (const taskId of order) {
         const out = outputs[taskId];
         if (typeof out !== 'string') continue;
         const role = tasks.get(taskId)?.role || taskId;
         parts.push(`<!-- ${role} (${taskId}) -->\n${out}`);
       }
       return parts.length > 0 ? parts.join('\n\n') : null;
     }
     ```
   - Skips non-string outputs (e.g. JSON asset descriptors).
   - Failed task outputs are explicitly purged (`delete validatedOutputs[taskId]`) to prevent invalid code from contaminating the final build.

3. **Hierarchical Synthesis (`HierarchicalSynthesis`)** (`packages/agent-core/swarm/hierarchicalSynthesis.js`):
   - Designed for massive swarms (1,000+ workstreams).
   - Chunks specialist outputs by estimated token count (`chunkByTokens`, default 6,000 tokens) rather than fixed agent count.
   - Executes multi-wave reduction: specialist chunks $\to$ chunk summaries $\to$ final merged deliverable.
   - Stores full specialist outputs durably in `TaskStore`, allowing non-destructive retrieval of any specialist's raw output by `agentId` (`retrieve(agentId)`).
   - Persists wave progress (`synthesisState.completedWaves`), enabling restart without re-executing completed waves.

---

## 7. Swarm Test Suite Audit

### 7.1 Test Suite Inventory & Results

| Test File | Primary Focus | Tests | Status | Key Verifications |
| :--- | :--- | :---: | :---: | :--- |
| `tests/swarm-dynamic-dag.test.js` | Dynamic DAG, Locking, Retry Loops, Upstream Context | 9 | **PASS** | Role system prompts, `formatRoleUserPrompt` with retry/upstream context, atomic `acquireLocks` rollback on conflict, subtask rewiring on decomposition, dynamic task injection, topological order, end-to-end `GenericSwarmOrchestrator` execution, verifier self-correction retry, runtime decomposition. |
| `tests/swarm-task-graph.test.js` | Dynamic Task Graph & State Engine | 6 | **PASS** | 150 unlimited logical tasks, single resource locking/unlocking/contention, atomic `SharedProjectState` commit, recursive decomposition, partial dependency readiness, `DECOMPOSED` task non-deadlock resolution. |
| `tests/swarm-adaptive-queue.test.js` | Concurrency Queue & Backoff | 3 | **PASS** | Dynamic concurrency scaling without agent limits, HTTP 429 rate limit backoff (halving concurrency & backoff activation), `Promise.allSettled` error isolation. |
| `tests/swarm-orchestrator.test.js` | Game Swarm Orchestrator | 4 | **PASS** | OpenRouter routing (`muse-spark-1.2-contributor`), end-to-end game swarm execution, `mergeOutputsInDagOrder` when no integration task exists, verifier gating and output purging on failure. |
| `tests/swarm-large-synthesis.test.js` | 1,001-Workstream Synthesis | 4 | **PASS** | Token-based chunking, non-lossy 1,001 workstream hierarchical synthesis, full output retrieval by `agentId`, durable wave state resume without duplication, honest provider failure handling. |
| `tests/swarm-accessibility-performance.test.js` | Specialist Roles & Briefs | 5 | **PASS** | `ACCESSIBILITY` and `PERFORMANCE` roles, prompt keyword routing in `decideSwarmMode`, dynamic specialist brief resolution in `worker/swarm.js`, `buildSwarmContext` formatting, CLI `corez agents` output. |
| `tests/cli/generic-swarm.test.js` | CLI Swarm Orchestration & Router | 13 | **PASS** | `decideSwarmMode` (fast path vs full swarm vs length-based vs overrides), 6-task full DAG execution, 3-task fast DAG execution, provider error termination without hangs, loud failure on unconfigured router, verifier rejection gating, verifier passing evidence reporting. |
| `tests/harness-swarm.test.js` | Creation Harness Swarm Pre-Pass | 9 | **PASS** | Parallel specialist brief execution, injection into streamed build context, fallback on specialist failure, partial contribution retention, `AI_SWARM_ENABLED=false` disabling, game fast path bypass, resume from persisted contributions, `buildSwarmContext` single-file HTML preservation. |

**Total Swarm Tests**: **53 passed / 53 total (100% pass rate)**.  
**Total Test Execution Time**: ~7.5 seconds.  
**Full Repository Test Suite (`npm test`)**: **93 test files passed (93), 1,072 tests passed (1,072), 0 failures (exitCode === 0)** across the entire New-Corez codebase.

---

## 8. Comparative Analysis & Architectural Gaps

| Feature | `GenericSwarmOrchestrator` (`agent-core/swarm`) | `AgentSwarmOrchestrator` (`gamePipeline/swarm`) | `worker/swarm.js` (`creation harness`) |
| :--- | :--- | :--- | :--- |
| **Primary Domain** | General code, web apps, tools, CLI | Browser games, canvas engines | Cloudflare Worker website creation |
| **Model Routing** | `ModelProviderRouter` (`muse-spark-1.2-contributor`) | `OPENROUTER_SWARM_ROUTING` (`muse-spark-1.2-contributor`) | `providerChain` with non-stream timeout |
| **Resource Locking** | Atomic `canAcquireAll` + `acquireLocks` + `releaseAllLocksForAgent` | Manual loop over `acquireLock` with rollback + `resourceWaitUntil` | None (read-only parallel specialist pre-pass) |
| **Upstream Context** | Injects structured `upstreamContexts` via `formatRoleUserPrompt` | Minimal agent prompt (does not inject upstream outputs into agent prompts) | Merges specialist contributions into streamed build context |
| **Verifier Retries** | Implements self-correction retry loop up to `maxAttempts` with diagnostic feedback | Verifier check gates completion; fails task immediately without retry loop | Stream verification & repair pass in harness |
| **Artifact Merging** | `artifactMap` + `topologicalOutputs` | `mergeOutputsInDagOrder` in DFS post-order | `buildSwarmContext` single-file HTML wrapper |

### Identified Gaps & Recommendations

1. **Alignment of `AgentSwarmOrchestrator` with Self-Correction Retry Loop**:
   - *Observation*: `AgentSwarmOrchestrator` currently marks tasks `FAILED` immediately upon verifier rejection (`agentSwarmOrchestrator.js:163-169`), whereas `GenericSwarmOrchestrator` performs self-correction retries up to `maxAttempts` (`index.js:274-290`).
   - *Recommendation*: Harmonize `AgentSwarmOrchestrator` with `GenericSwarmOrchestrator`'s retry loop to allow game pipeline specialist agents to self-correct upon verification failure.
2. **Upstream Context Injection in `AgentSwarmOrchestrator`**:
   - *Observation*: `AgentSwarmOrchestrator.runSingleAgentTask` builds a minimal prompt (`agentPrompt`) but does not inject upstream dependency outputs from `graph.projectState.state.validatedOutputs`.
   - *Recommendation*: Inject upstream deliverables into `AgentSwarmOrchestrator` prompts similar to `GenericSwarmOrchestrator` so game specialists (e.g. physics engine or integration agent) directly access the art director's asset manifest and engine specifications.
3. **Formalizing Multi-Resource Deadlock Sort Order**:
   - *Observation*: While `ResourceLockManager.acquireLocks` performs an atomic dry-run before acquisition (which prevents deadlock during single-batch acquisitions), if tasks acquire locks progressively in different orders, lock sorting could provide additional mathematical deadlock safety.
   - *Recommendation*: Standardize lexicographical sorting of `resourceNames` prior to dry-run checking and acquisition across all callers.

---

## 9. Conclusion

The dynamic DAG mechanics, atomic multi-resource locking (`ResourceLockManager`), upstream dependency context propagation, verifier-driven retry loops, and topological artifact merging are fully implemented, robustly architected, and 100% verified across 53 automated unit and integration tests.
