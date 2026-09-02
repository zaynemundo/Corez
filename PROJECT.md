# Project: CoreZ Dynamic Multi-Agent Swarm Orchestration & Verification

## Architecture
CoreZ provides a multi-agent swarm orchestration framework spanning both CLI/agent-core workflows and Edge Worker creation pipelines.

```
                  ┌─────────────────────────────────────┐
                  │          User Creation Prompt       │
                  └──────────────────┬──────────────────┘
                                     │
                             decideSwarmMode()
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
        [ SWARM_MODE.FAST ]                    [ SWARM_MODE.SWARM ]
         (3-node fast DAG)                    (6-node specialist DAG)
     Explorer -> Engineer -> Reviewer    Explorer -> Architect -> Frontend/Backend
                                                   -> Tester -> Reviewer
                 │                                       │
                 └───────────────────┬───────────────────┘
                                     │
                     GenericSwarmOrchestrator Execution
     ┌─────────────────────────────────────────────────────────────────┐
     │ 1. ResourceLockManager: All-or-Nothing Atomic Lock Acquisition  │
     │ 2. Upstream Context Injection: Discrete markdown deliverables   │
      │ 3. Agent Execution: Primary Lead (Muse Spark 1.3) & FLUX Art    │
     │ 4. Verifier Gate & Self-Correction Retry (up to maxAttempts)    │
     │ 5. Atomic Output Commit & Lock Release                          │
     │ 6. Topological DFS Traversal: Discrete & Merged Artifacts       │
     └─────────────────────────────────────────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1.1 Dynamic DAG Complexity Routing | `decideSwarmMode` routes prompts to Fast (3 nodes) or Full Specialist DAG (6 nodes) based on token length (≥100) and regex keywords. | M1 | ORIGINAL_REQUEST §1 |
| 2 | R1.2 Specialist Role Catalog & Briefs | 16 standard `SWARM_ROLES` in `packages/agent-core/swarm/roles.js` and specialist briefs in `worker/swarm.js` (`architect`, `art-director`, `accessibility`, `performance`). | M1 | ORIGINAL_REQUEST §1 |
| 3 | R1.3 Creation Pipeline Wiring | `worker/harness.js` and `worker/swarm.js` execute parallel specialist pre-pass without blocking single-file artifact streaming contracts. | M1 | ORIGINAL_REQUEST §1 |
| 4 | R2.1 Atomic Multi-Resource Locking | `ResourceLockManager.acquireLocks` performs 2-phase dry-run validation and atomic acquisition, rolling back all locks on conflict to eliminate deadlocks. | M2 | ORIGINAL_REQUEST §2 |
| 5 | R2.2 Upstream Dependency Context Propagation | Upstream validated deliverables extracted from `projectState.validatedOutputs` and formatted into isolated prompt blocks without monolithic dumps. | M2 | ORIGINAL_REQUEST §2 |
| 6 | R2.3 Verifier-Driven Retry Loops | Verifier execution gates outputs; rejections trigger `AGENT_LIFECYCLE_STATES.RETRYING` with diagnostic feedback up to `maxAttempts`. | M2 | ORIGINAL_REQUEST §2 |
| 7 | R2.4 Topological Artifact Merging | DFS post-order traversal merges deliverables deterministically (`artifactMap`, `mergeOutputsInDagOrder`, `HierarchicalSynthesis` token-chunked waves). | M2 | ORIGINAL_REQUEST §2 |
| 8 | R3.1 Swarm Concurrency & Rate Limiting | `AdaptiveConcurrencyQueue` dynamically scales concurrency based on latency and halves concurrency with exponential backoff on HTTP 429. | M3 | ORIGINAL_REQUEST §3 |
| 9 | R3.2 Swarm Benchmark & Reliability Suite | Benchmark cases in `benchmarks/`, 7-aspect weighted evaluator with hard failure gates in `scripts/evaluate-benchmark.mjs`, and full Vitest suite. | M3 | ORIGINAL_REQUEST §3 |
| 10 | R4.1 100% Swarm Test Suite Pass Rate | All unit and integration test suites in `tests/swarm-*.test.js`, `tests/harness-swarm.test.js`, `tests/cli/generic-swarm.test.js` pass with `exitCode === 0`. | M4 | ORIGINAL_REQUEST §4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Pipeline & Harness Integration | Harmonize role catalogs, dynamic DAG routing, and creation harness specialist pre-pass. | none | IN_PROGRESS |
| M2 | Dynamic DAG Mechanics & Retry Hardening | Verify atomic resource locking, upstream context isolation, verifier self-correction retry parity in orchestrators, and topological artifact merging. | M1 | PLANNED |
| M3 | Concurrency, Benchmarks & Script Harmonization | Update `package.json` test scripts, run benchmark evaluator validation, and ensure rate-limited concurrency queues scale deterministically. | M2 | PLANNED |
| M4 | Comprehensive E2E Swarm Verification & Audit | Execute all unit, integration, benchmark, and contract test suites, run challenger verification and forensic integrity audit. | M3 | PLANNED |

## Interface Contracts
### `GenericSwarmOrchestrator` ↔ `TaskDependencyGraph`
- `acquireLocks(resourceNames, agentId) -> { success: boolean, lockedResource?: string, currentOwner?: string }`
- `releaseAllLocksForAgent(agentId) -> void`
- `getReadyTasks() -> Task[]`
- `handleDecomposition(taskId, subtasks) -> void`
- `getTopologicalOrder() -> string[]`

### `GenericSwarmOrchestrator` ↔ `Verifier`
- `verifier({ task, output, projectState }) -> Promise<{ ok: boolean, evidence?: string, fixes?: string[] }>`
- If `ok: false`, orchestrator enters retry loop if `attempt < maxAttempts`, injecting `verificationEvidence` into next prompt.

### `worker/harness.js` ↔ `worker/swarm.js`
- `runSwarmSpecialists(prompt, env) -> Promise<{ specialistOutputs: Record<string, string>, executionTimeMs: number }>`
- `buildSwarmContext(specialistOutputs) -> string`

## Code Layout
- `packages/agent-core/swarm/index.js`: `GenericSwarmOrchestrator`, `decideSwarmMode`, `SWARM_MODE`
- `packages/agent-core/swarm/roles.js`: `SWARM_ROLES`, `ROLE_DEFINITIONS`, `formatRoleUserPrompt`
- `packages/agent-core/swarm/hierarchicalSynthesis.js`: `HierarchicalSynthesis` (token-chunked wave synthesis)
- `src/services/gamePipeline/swarm/taskGraph.js`: `ResourceLockManager`, `TaskDependencyGraph`
- `src/services/gamePipeline/swarm/agentSwarmOrchestrator.js`: `AgentSwarmOrchestrator`, `mergeOutputsInDagOrder`
- `src/services/gamePipeline/swarm/adaptiveQueue.js`: `AdaptiveConcurrencyQueue`
- `worker/swarm.js`: Creation harness swarm pre-pass & specialist briefs
- `worker/harness.js`: Streamed build creation harness
- `tests/swarm-*.test.js`: Swarm test suites
- `tests/harness-swarm.test.js`: Creation harness swarm tests
- `tests/cli/generic-swarm.test.js`: CLI generic swarm orchestrator tests
- `benchmarks/`: Benchmark cases and evaluation core
