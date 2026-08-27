# Swarm Orchestration & Creation Routes Survey Handoff

## 1. Observation

### Codebase Implementations & Locations
- **Dynamic Swarm Orchestrator & Fast vs Full DAG Routing**:
  - `packages/agent-core/swarm/index.js` (lines 44–127): `decideSwarmMode(prompt, options)` switches between `SWARM_MODE.FAST` (3 nodes: `explorer` → `engineer` → `reviewer`) and `SWARM_MODE.SWARM` (6 nodes: `explorer` → `architect` → `frontend` / `backend` → `tester` → `reviewer`). Prompts ≥ 100 estimated tokens or matching `FULL_SWARM_SIGNALS` take the full DAG.
  - `packages/agent-core/swarm/index.js` (lines 131–423): `GenericSwarmOrchestrator.executeSwarmJob` coordinates task scheduling, all-or-nothing resource locking, upstream context aggregation, runtime decomposition (`handleDecomposition`), verifier self-correction retries (`verifier`), atomic output commits, and topological artifact generation.
- **Specialist Role Catalog & Prompt Registry**:
  - `packages/agent-core/swarm/roles.js` (lines 6–138): 16 standard roles (`SWARM_ROLES`), including `ORCHESTRATOR`, `EXPLORER`, `ARCHITECT`, `ENGINEER`, `FRONTEND`, `BACKEND`, `DATABASE`, `AUTH`, `ART_DIRECTOR`, `ACCESSIBILITY`, `PERFORMANCE`, `DEBUGGER`, `TESTER`, `REVIEWER`, `SECURITY`, `INTEGRATION` with `ROLE_DEFINITIONS` system prompts and default owned resources.
  - `packages/agent-core/swarm/roles.js` (lines 157–184): `formatRoleUserPrompt` injects upstream context blocks from predecessor tasks and retry diagnostic feedback.
- **Task Graph & All-or-Nothing Resource Locking**:
  - `src/services/gamePipeline/swarm/taskGraph.js` (lines 19–110): `ResourceLockManager` implements `acquireLocks` with dry-run check and atomic acquisition, rolling back partial locks on contention.
  - `src/services/gamePipeline/swarm/taskGraph.js` (lines 181–361): `TaskDependencyGraph` manages task lifecycle states (`AGENT_LIFECYCLE_STATES`), dynamic decomposition rewiring (`handleDecomposition`), dynamic task injection (`injectDynamicTasks`), and topological sort (`getTopologicalOrder`).
- **Adaptive Concurrency & Backpressure**:
  - `src/services/gamePipeline/swarm/adaptiveQueue.js` (lines 7–144): `AdaptiveConcurrencyQueue` scales concurrency based on latency metrics and halves concurrency with exponential backoff on HTTP 429 rate limit responses.
- **Hierarchical Synthesis**:
  - `packages/agent-core/swarm/hierarchicalSynthesis.js` (lines 12–175): `HierarchicalSynthesis` chunks workstream outputs by token thresholds (`chunkByTokens`, 6k max) and persists wave state in `TaskStore` to support 1,000+ workstreams without truncation or duplicate execution.
- **Worker Creation Harness & Swarm Pre-Pass**:
  - `worker/swarm.js` (lines 24–62): `SWARM_SPECIALIST_BRIEFS` (`architect`, `art-director`) and `EXTENDED_SPECIALIST_BRIEFS` (`accessibility`, `performance`) dynamically resolved via `resolveSpecialistBriefs`.
  - `worker/swarm.js` (lines 86–156): `runSwarmSpecialists` runs parallel non-streaming provider calls with `AI_SWARM_TIMEOUT_MS` deadline guard and graceful failure fallback.
  - `worker/harness.js` (lines 353–387): `runCreationHarness` executes swarm pre-pass when `!fastPath && swarmEnabledFor(env)`, injecting contributions into `buildContext` via `buildSwarmContext`.
  - `worker/entry.js` (lines 204–221): Routes incoming `/api/ai` creation requests with `body.harness === true` directly to the harness.

### Test Execution Observations
- Ran: `npx vitest run tests/swarm-*.test.js tests/harness-swarm.test.js tests/cli/generic-swarm.test.js`
- Result: 8 test files passed, 53 tests passed, exit code 0.
- All dynamic DAG mechanics (locking, upstream context, decomposition, verifier retries, synthesis, concurrency scaling) execute deterministically.

---

## 2. Logic Chain

1. **Prompt Routing Logic**:
   - `decideSwarmMode` accurately identifies complexity via token counts (≥ 100 tokens) and scope regex (`FULL_SWARM_SIGNALS`), ensuring trivial edits execute via fast 3-node DAG while comprehensive projects spawn the 6-node specialist DAG.
   - In worker builds, `resolveSpecialistBriefs` dynamically attaches `accessibility` and `performance` specialist briefs when domain keywords are detected in the request.
2. **Resource Integrity & Deadlock Prevention**:
   - `ResourceLockManager.acquireLocks` performs a dry run check before acquiring any lock. If any resource is locked by another agent, the entire batch fails and zero locks are retained, preventing partial acquisition deadlocks during parallel task execution.
3. **Upstream Context & Self-Correction**:
   - Upstream deliverables from completed dependency tasks are automatically collected from `projectState.validatedOutputs` and formatted into markdown sections in `formatRoleUserPrompt`.
   - When a verifier rejects an output, `GenericSwarmOrchestrator` increments `task.attempt` and injects `verificationEvidence` and `lastError` into the retry prompt up to `maxAttempts`.
4. **Resilience & Non-Gating Swarm Execution**:
   - In the Worker creation harness, `runSwarmSpecialists` uses `Promise.allSettled`. If any or all specialists fail or timeout, the creation build proceeds using the base spec context, preventing specialist failures from disrupting artifact delivery.

---

## 3. Caveats

- **Worker Runtime Constraints**: Full multi-file repository DAG execution with local filesystem access is designed for CLI/agent environments, whereas the Edge Worker creation harness is optimized for single-file web creation streaming within Cloudflare Worker CPU limits.
- **Provider Routing in Tests**: Vitest test suites utilize mock routers and deterministic test fixtures (`mockExecution: true` or mock provider functions) to validate state machine and DAG behavior without incurring live provider API token expenses.

---

## 4. Conclusion

The CoreZ Swarm architecture provides a complete, robust, and empirically verified multi-agent execution framework:
1. `GenericSwarmOrchestrator` and `TaskDependencyGraph` handle dynamic DAG scheduling, atomic multi-resource locking, runtime subtask decomposition, and verifier-driven retry loops.
2. The 16-role `SWARM_ROLES` catalog provides specialized instructions and clear resource ownership.
3. `worker/swarm.js` and `worker/harness.js` provide a non-blocking parallel pre-pass that enriches creation builds while strictly preserving single-file artifact streaming contracts and edge worker performance bounds.
4. All 53 unit and integration tests across 8 test suites pass cleanly with exit code 0.

---

## 5. Verification Method

To independently verify all findings and test suites:
```bash
# Run all swarm unit, integration, and harness test suites
npx vitest run tests/swarm-*.test.js tests/harness-swarm.test.js tests/cli/generic-swarm.test.js

# Inspect architecture and role definitions
cat packages/agent-core/swarm/roles.js
cat packages/agent-core/swarm/index.js
cat src/services/gamePipeline/swarm/taskGraph.js
cat worker/swarm.js
cat worker/harness.js
```
