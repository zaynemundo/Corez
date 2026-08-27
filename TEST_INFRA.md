# E2E Test Infra: CoreZ Swarm Dynamic Multi-Agent System

## Test Philosophy
- Opaque-box, requirement-driven verification of multi-agent swarm orchestration.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | R1.1 Dynamic DAG Complexity Routing | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 2 | R1.2 Specialist Role Catalog & Briefs | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 3 | R1.3 Creation Pipeline Wiring | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 4 | R2.1 Atomic Multi-Resource Locking | ORIGINAL_REQUEST §2 | 5 | 5 | ✓ |
| 5 | R2.2 Upstream Dependency Context Propagation | ORIGINAL_REQUEST §2 | 5 | 5 | ✓ |
| 6 | R2.3 Verifier-Driven Retry Loops | ORIGINAL_REQUEST §2 | 5 | 5 | ✓ |
| 7 | R2.4 Topological Artifact Merging | ORIGINAL_REQUEST §2 | 5 | 5 | ✓ |
| 8 | R3.1 Swarm Concurrency & Rate Limiting | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ |
| 9 | R3.2 Swarm Benchmark & Reliability Suite | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ |
| 10 | R4.1 100% Swarm Test Suite Pass Rate | ORIGINAL_REQUEST §4 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Vitest (`npx vitest run`) + Node test runner (`node scripts/evaluate-benchmark.mjs`)
- Test case locations: `tests/swarm-*.test.js`, `tests/harness-swarm.test.js`, `tests/cli/generic-swarm.test.js`, `tests/benchmark-evaluator.test.js`
- Test pass/fail semantics: `exitCode === 0`, 0 test failures, strict assertions on locks, retry attempts, context injection, and topological merge order.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full website generation with parallel specialist pre-pass (Architect, Art Director, Accessibility, Performance) | R1.1, R1.2, R1.3, R2.4 | High |
| 2 | Multi-agent code refactor with resource contention and atomic rollback | R2.1, R2.2, R3.1 | High |
| 3 | Verifier rejection with automatic self-correction retry and diagnostic feedback up to maxAttempts | R2.3, R2.2, R4.1 | High |
| 4 | 1,000+ workstream hierarchical synthesis with wave persistence and resumption | R2.4, R3.1, R3.2 | Very High |
| 5 | HTTP 429 adaptive backoff and concurrency scaling under load | R3.1, R3.2 | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature (50 tests minimum)
- Tier 2: ≥5 per feature boundary cases (50 tests minimum)
- Tier 3: Pairwise coverage across role routing, locking, retry loops, and synthesis
- Tier 4: ≥5 realistic multi-agent application scenarios
