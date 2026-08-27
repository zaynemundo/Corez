# CoreZ Swarm Orchestration & Creation Routes Survey Analysis

## Executive Summary
This architectural survey evaluates the CoreZ Multi-Agent Swarm system across two primary execution tiers:
1. **Core / CLI Dynamic DAG Swarm Engine** (`packages/agent-core/swarm` and `src/services/gamePipeline/swarm`): An unlimited dynamic DAG execution engine featuring atomic multi-resource locking (`ResourceLockManager`), an adaptive concurrency queue (`AdaptiveConcurrencyQueue`), dynamic subtask decomposition & rewiring, upstream dependency context propagation, verifier-driven self-correction retry loops, and hierarchical token-based synthesis (`HierarchicalSynthesis`).
2. **Edge Worker Creation Harness Swarm Pre-Pass** (`worker/swarm.js`, `worker/harness.js`, `worker/index.js`): A lightweight, non-streaming parallel pre-pass for complex website and web application generation designed to run within Cloudflare Worker CPU/memory limits before single-file artifact streaming.

All 8 swarm test suites (53 tests across dynamic DAG, orchestrator, task graph, adaptive queue, hierarchical synthesis, accessibility/performance roles, harness pre-pass, and CLI swarm commands) pass with 100% success.

---

## 1. System Architecture & Module Catalog

### 1.1 Specialist Role Catalog & Prompt Registry
- **Location**: `packages/agent-core/swarm/roles.js`
- **Roles Defined (`SWARM_ROLES`)**:
  | Role Identifier | Role Title | Core Function | Default Owned Resources |
  |---|---|---|---|
  | `orchestrator` | Swarm Orchestrator | Graph coordination, contract enforcement, workflow routing | `context/orchestration.json` |
  | `explorer` | Workspace Explorer | Read-only codebase discovery, workspace file structure, dependency analysis | `context/workspace.json` |
  | `architect` | System Architect | Module interfaces, state flow, dynamic subtask decomposition specifications | `spec/architecture.json` |
  | `engineer` | Software Engineer | Production-grade implementation code | `src/` |
  | `frontend` | Frontend Engineer | Modern, responsive UI components, keyboard accessibility, micro-interactions | `src/components/` |
  | `backend` | Backend Engineer | Resilient API routes, data validation schemas, services | `src/services/` |
  | `database` | Database Engineer | Normalized schemas, migrations, indexing strategies | `src/db/` |
  | `auth` | Auth Specialist | Authentication, authorization, token validation, security rules | `src/auth/` |
  | `art-director` | Art Director | Visual palettes, typography scales, design system tokens | `src/styles/tokens.css` |
  | `accessibility` | Accessibility Specialist | WCAG 2.2 AA compliance, ARIA landmarks, focus management | `artifacts/a11y-audit.json` |
  | `performance` | Performance Engineer | Bundle optimization, critical rendering path, rendering latency | `artifacts/perf-audit.json` |
  | `debugger` | Diagnostic Specialist | Root cause analysis, stack trace inspection, test failure fixes | `artifacts/debug-report.json` |
  | `tester` | QA & Test Engineer | Automated unit, integration, and contract test suites | `tests/` |
  | `reviewer` | Code Reviewer | Security audits, architectural integrity, regression checks | `artifacts/review.json` |
  | `security` | Security Specialist | Sanitization, CSRF/XSS protection, rate limiting, secret isolation | `artifacts/security-audit.json` |
  | `integration` | Integration Specialist | Multi-module assembly, UI/endpoint wiring, cohesive bundling | `dist/` |

- **Prompt Builders**:
  - `getRoleDefinition(role)`: Returns role schema, title, system prompt, default resources.
  - `getRoleSystemPrompt(role)`: Generates strict role system prompt.
  - `formatRoleUserPrompt({ role, objective, userPrompt, upstreamContexts, retryContext })`: Formats structured specialist prompt injecting upstream outputs from predecessor tasks and retry diagnostic feedback (`attempt`, `maxAttempts`, `lastError`, `verificationEvidence`).

---

### 1.2 Dynamic DAG Execution Engine & Task Graph
- **Location**: `src/services/gamePipeline/swarm/taskGraph.js`
- **Key Components**:
  - **`ResourceLockManager`**:
    - Implements all-or-nothing atomic lock acquisition across multiple file/resource paths.
    - Dry-run validation prevents partial resource acquisition on contention.
    - Automatic lock versioning and agent ownership tracking.
    - Automatic lock release on task completion, failure, decomposition, or retry.
  - **`SharedProjectState`**:
    - Atomic project state commits (`commitTaskOutput`).
    - Validated output registry (`validatedOutputs[taskId]`).
    - Monotonically increasing `specVersion` and immutable event audit log.
    - Issue tracking for non-blocking and blocking failures.
  - **`TaskDependencyGraph`**:
    - Lifecycle states (`AGENT_LIFECYCLE_STATES`): `CREATED`, `QUEUED`, `WAITING_FOR_DEPENDENCIES`, `RUNNING`, `VALIDATING`, `COMPLETED`, `FAILED`, `DECOMPOSED`, `RETRYING`.
    - Partial dependency resolution via `getReadyTasks()`: ready when all dependencies are `COMPLETED` or `DECOMPOSED`.
    - Dynamic runtime subtask decomposition (`handleDecomposition`): Decomposes parent into child subtasks and automatically rewires downstream dependencies.
    - Dynamic task injection (`injectDynamicTasks`): Injects dynamic specialists into the graph with topological dependency ordering.
    - `getTopologicalOrder()`: Cycle-safe topological sort ensuring upstream dependencies precede dependents.

---

### 1.3 Dynamic Complexity Router & DAG Modes
- **Location**: `packages/agent-core/swarm/index.js`
- **Routing Heuristic (`decideSwarmMode`)**:
  - **Fast DAG (`SWARM_MODE.FAST`)**:
    - Triggered by: Short prompts (<100 tokens) without complex scope signals (e.g. typos, single component edits).
    - Task Graph (3 nodes): `task-explore` (`explorer`) → `task-engineer` (`engineer`) → `task-review` (`reviewer`).
  - **Full Specialist DAG (`SWARM_MODE.SWARM`)**:
    - Triggered by:
      1. Prompt length ≥ 100 estimated tokens.
      2. Scope signals matching regex `FULL_SWARM_SIGNALS`: `website`, `web app`, `game`, `api`, `backend`, `database`, `auth`, `server`, `refactor`, `deploy`, `websocket`, `design system`, `accessibility`, `wcag`, `a11y`, `performance`, `audit`.
      3. Explicit force flag (`{ mode: 'swarm' }`).
    - Task Graph (6 nodes): `task-explore` (`explorer`) → `task-architect` (`architect`) → `task-frontend` (`frontend`) & `task-backend` (`backend`) (parallel) → `task-test` (`tester`) → `task-review` (`reviewer`).

---

### 1.4 GenericSwarmOrchestrator Execution Lifecycle
- **Location**: `packages/agent-core/swarm/index.js`
- **Lifecycle Flow**:
  1. **Mode Decision**: Evaluates prompt complexity or explicit override.
  2. **Task Graph Initialization**: Loads initial DAG into `TaskDependencyGraph`.
  3. **Scheduling & Concurrency**:
     - Pulls ready tasks from `graph.getReadyTasks()`.
     - Checks resource availability via `canAcquireAll`.
     - Atomically locks resources via `acquireLocks`.
     - Dispatches execution through `AdaptiveConcurrencyQueue`.
  4. **Context Injection**:
     - Resolves outputs from upstream dependencies.
     - Injects retry diagnostics if task is retrying after a verifier rejection.
  5. **Specialist Execution**: Dispatches to `providerRouter.generate()`.
  6. **Dynamic Decomposition**: If specialist outputs `requires_decomposition` / `suggestedTasks`, graph creates subtasks, rewires downstream tasks, and marks parent `DECOMPOSED`.
  7. **Verification Gate**:
     - Invokes optional `verifier({ task, output, projectState })`.
     - If rejected: checks `attempt < maxAttempts`. If attempts remain, transitions to `RETRYING` with diagnostic feedback. If exhausted, marks `FAILED`.
  8. **Atomic Commit**: Calls `commitTaskOutput` and releases locks.
  9. **Topological Synthesis**: Returns `{ projectId, mode, completed, tasksCount, results, verification, failedTasks, incompleteTasks, artifactMap, topologicalOutputs }`.

---

### 1.5 Hierarchical Synthesis for Massive Swarms
- **Location**: `packages/agent-core/swarm/hierarchicalSynthesis.js`
- **Key Mechanics**:
  - Handles swarms with up to 1,000+ specialist workstreams without context truncation.
  - Chunks outputs based on estimated token limits (`chunkByTokens`, default 6,000 tokens) rather than fixed agent counts.
  - Durable persistence in `TaskStore`: full specialist outputs stored keyed by `agentId` for direct ID retrieval.
  - Resumable multi-wave aggregation: persisted `synthesisState` allows resuming interrupted synthesis waves without re-executing completed waves.

---

### 1.6 Edge Worker Creation Harness Swarm Pre-Pass
- **Location**: `worker/swarm.js`, `worker/harness.js`, `worker/index.js`
- **Pre-Pass Architecture**:
  - Activated during non-fast-path builds in `runCreationHarness` when `swarmWanted = !fastPath && swarmEnabledFor(env)`.
  - Fast path skips pre-pass for games (`intentType === 'game_creation'`) and low-complexity tasks.
  - `resolveSpecialistBriefs(promptText)` dynamically determines active specialist briefs:
    - Base: `architect` (max 200 words), `art-director` (max 175 words + archetype tokens).
    - Dynamic `accessibility` brief (max 150 words) added when accessibility/WCAG/ARIA keywords detected.
    - Dynamic `performance` brief (max 150 words) added when performance/speed/lighthouse keywords detected.
  - `runSwarmSpecialists`: Runs compact non-streaming provider requests in parallel via `Promise.allSettled` with `AI_SWARM_TIMEOUT_MS` deadline guard (default 25s).
  - Graceful degradation: Never gates the build; failed specialists are dropped, and plain spec context is used if all fail.
  - `buildSwarmContext`: Formats contributions cleanly into `## <role>` sections and appends single-file HTML document generation instructions.

---

## 2. Gap Analysis & Integration Matrix

| Capability Area | Core Agent Swarm (`packages/agent-core/swarm`) | Worker Creation Swarm (`worker/swarm.js`) | Integration & Wiring Status |
|---|---|---|---|
| **Execution Topology** | Full Dynamic DAG with dependencies, parallel forks, joins | Parallel Pre-Pass (fan-out / fan-in before single-file stream) | Complementary: Worker uses pre-pass for streaming latency, Core uses DAG for multi-file repositories. |
| **Role Catalog** | 16 standardized roles in `SWARM_ROLES` with structured `ROLE_DEFINITIONS` | 4 specialist briefs (`architect`, `art-director`, `accessibility`, `performance`) | Roles align with `SWARM_ROLES.ARCHITECT`, `ART_DIRECTOR`, `ACCESSIBILITY`, `PERFORMANCE`. |
| **Complexity Routing** | `decideSwarmMode` (Fast 3-node DAG vs Full 6-node DAG) | `fastPath` flag + `resolveSpecialistBriefs` dynamic keyword expansion | Both share keyword patterns (`wcag`, `a11y`, `performance`, `website`, etc.). |
| **Resource Locking** | `ResourceLockManager` all-or-nothing multi-resource atomic locks | Not applicable (in-memory pre-pass briefs do not modify filesystem) | Fully functional in agent-core DAG. |
| **Verification Gate** | `verifier` hook with retry loop (`attempt < maxAttempts`) + evidence | Harness verify phase (`runVerificationWithRepair`, `repairBudget` up to 5 rounds) | Fully verified in harness and swarm tests. |
| **Provider Interface** | `providerRouter.generate({ messages, signal })` | `runProviderChain(messages, { env, signal, sleep })` | Direct provider chain for Worker; ModelProviderRouter for CLI. |

---

## 3. Dynamic Specialist Node Spawning Mechanisms

### 3.1 Prompt Complexity Analysis
The CoreZ system analyzes prompt complexity at multiple layers:
1. **Token Volume Threshold**:
   - Prompts with ≥ 100 estimated tokens automatically route to `SWARM_MODE.SWARM`.
2. **Intent & Domain Scope Classification**:
   - Scope signals matching architectural terms (`website`, `web app`, `game`, `api`, `backend`, `database`, `auth`, `refactor`, `microservice`, `websocket`, etc.) route to `SWARM_MODE.SWARM`.
   - Domain signals for `accessibility` / `wcag` trigger the `ACCESSIBILITY` specialist node.
   - Domain signals for `performance` / `lighthouse` / `speed` trigger the `PERFORMANCE` specialist node.
3. **Runtime Agent Decomposition**:
   - An executing specialist (e.g. `architect` or `world-designer`) can emit a decomposition payload (`requires_decomposition` with `suggestedTasks`).
   - The DAG engine dynamically spawns the new child nodes, adds them to the graph, and rewires all downstream dependencies to depend on the new child nodes.

---

## 4. Verification Evidence & Test Results

The entire swarm test suite was executed against the codebase:
- **Command**: `npx vitest run tests/swarm-*.test.js tests/harness-swarm.test.js tests/cli/generic-swarm.test.js`
- **Result**: `8 passed (8 test files)`, `53 passed (53 tests)`, exit code `0`.
- **Breakdown**:
  1. `tests/harness-swarm.test.js` (9 tests): Validates creation harness pre-pass, parallel execution, failure fallback, partial success retention, `AI_SWARM_ENABLED=false` gating, and game fast-path bypass.
  2. `tests/swarm-large-synthesis.test.js` (4 tests): Validates 1,001-workstream hierarchical synthesis, token-based chunking, durable output retrieval by agent ID, wave state persistence, and honest failure reporting.
  3. `tests/swarm-adaptive-queue.test.js` (3 tests): Validates dynamic concurrency scaling, HTTP 429 backoff with exponential multiplier, and `Promise.allSettled` resilience.
  4. `tests/swarm-dynamic-dag.test.js` (9 tests): Validates role catalog, user prompt formatting with upstream context, all-or-nothing resource locking, subtask decomposition & downstream rewiring, dynamic task injection, topological ordering, end-to-end context propagation, verifier retry loops, and runtime decomposition.
  5. `tests/cli/generic-swarm.test.js` (13 tests): Validates fast DAG (3 agents) vs full DAG (6 agents) routing, provider failure handling, unconfigured provider errors, verifier hooks, and `decideSwarmMode` heuristics.
  6. `tests/swarm-task-graph.test.js` (6 tests): Validates 150+ agent scaling, lock contention prevention, atomic project state commits, recursive decomposition, partial dependency resolution, and decomposed parent release without deadlock.
  7. `tests/swarm-accessibility-performance.test.js` (5 tests): Validates role registration, prompt routing for a11y/perf, dynamic brief resolution, context formatting, and CLI role listing.
  8. `tests/swarm-orchestrator.test.js` (4 tests): Validates OpenRouter model routing, dynamic game swarm execution, DAG dependency-order merging, and verifier completion gating.

---

## 5. Recommendations for Engineering Implementation

1. **Maintain Shared Role Consistency**: Ensure any new swarm roles added to `SWARM_ROLES` in `packages/agent-core/swarm/roles.js` have corresponding brief descriptors in `worker/swarm.js` when applicable to creation builds.
2. **Provider Adapter for Multi-Environment Execution**: Provide a lightweight adapter bridging `runProviderChain` to `providerRouter` so `GenericSwarmOrchestrator` can be invoked in Cloudflare Worker environments if multi-agent repository workflows are deployed to the edge.
3. **Preserve Non-Gate Resiliency in Creation Pre-Pass**: Continue enforcing the contract that pre-pass specialist failures never block or gate single-file artifact streaming builds.
