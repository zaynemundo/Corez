# CoreZ Skills Engine v2 Design

**Date:** 2026-07-28

## Goal

Turn CoreZ skills from prompt metadata into a versioned, executable, measurable and safely improvable capability system while preserving the existing Prompt Intelligence, agent runtime, sandbox, permissions, provider fallbacks and public COREZ AI identity.

## Selected approach

CoreZ will use **Approach 3: Adaptive Skills Engine**.

The engine combines:

1. executable global skills;
2. validated project-specific skill variants;
3. skill composition into bounded workflows;
4. evidence-based performance measurement;
5. guarded candidate generation;
6. synthetic evaluation, historical replay and regression testing;
7. shadow and canary rollout;
8. tiered promotion approval;
9. monitoring, quarantine and rollback.

The system optimises a balanced score with correctness weighted highest. Security, sandbox, permission, verification and intent-contract failures remain hard gates and cannot be offset by speed or cost improvements.

## Architecture

```text
USER
  ↓
Prompt Intelligence
  ↓
Execution Envelope
  ↓
Skill Resolver v2
  ├─ Global stable skills
  └─ Validated project variants
  ↓
Skill Composer
  ↓
Executable Workflow Graph
  ↓
Bounded Task DAG
  ↓
Adaptive Agent Execution
  ↓
Integration
  ↓
TDD / Review / Repair
  ↓
Verification Gate
  ↓
Result
  ↓
Performance Recording
  ↓
Improvement Engine
  ↓
Candidate → Benchmarks → Replay → Regression → Shadow → Canary
  ↓
Promote / Reject / Quarantine / Rollback
```

## Canonical skill contract

A v2 skill is an immutable versioned object with:

- identity: `id`, `name`, `version`, `scope`, `projectId`;
- governance: `riskLevel`, lifecycle state and lineage;
- routing: triggers, compatible intents, dependencies and incompatibilities;
- capabilities: required tools/capabilities and execution budgets;
- execution: workflow states, transitions, entry state and terminal states;
- validation: input/output schemas and success criteria;
- evidence: verification requirements and evaluation suite;
- optimisation: metrics and performance history references.

Production versions are never mutated. Behaviour changes create a new semantic version.

## Workflow execution

Skills are executed as state machines rather than appended instruction text. Runtime state records the current state, completed states, transition evidence and failures. Legal transitions are defined by the skill workflow. The model cannot claim a phase occurred without the runtime recording the required evidence.

Example debugging workflow:

```text
REPRODUCE
→ INSPECT
→ HYPOTHESISE
→ TEST_HYPOTHESIS
→ ROOT_CAUSE_CONFIRMED
→ TEST_RED
→ PATCH
→ TEST_GREEN
→ REVIEW
→ VERIFY
→ COMPLETE
```

Example simple-edit workflow:

```text
IMPLEMENT
→ VERIFY_FOCUSED
→ COMPLETE
```

## Skill resolution and composition

The resolver chooses the smallest sufficient set using:

- intent, goal, domain and complexity;
- explicit, inferred and forbidden requirements;
- project context and available capabilities;
- risk level and execution budget;
- global/project skill reputation and confidence.

The composer merges dependencies and compatible workflow fragments into one executable graph. It rejects dependency cycles, incompatible skills, unavailable hard requirements and budget overflow.

## Global and project variants

Global skills are stable defaults. Project variants may override a global skill only for their project after validation. Resolution order is:

```text
validated project variant
→ global stable skill
→ generic fallback
```

Project variants never mutate global definitions. Global promotion always requires manual approval. Low-risk project variants may auto-promote after all gates pass; high-risk and critical variants require stronger evidence and approval.

## Evaluation and guarded improvement

Candidate skill versions are isolated from production. Every candidate records its parent, hypothesis and expected improvement.

Evaluation order:

```text
Synthetic benchmark
→ Historical replay in a safe environment
→ Regression suite
→ Shadow execution
→ Canary rollout
→ Promotion decision
```

Balanced score:

- 40% correctness;
- 20% verification success;
- 15% output quality;
- 10% reliability;
- 7% latency;
- 5% token/API efficiency;
- 3% tool efficiency.

Hard-gate failures include security regression, sandbox escape, permission bypass, secret exposure, failed mandatory regressions, fabricated verification, intent-contract violation and critical functionality regression.

## Lifecycle and governance

Supported lifecycle states:

```text
DRAFT
CANDIDATE
BENCHMARKING
SHADOW
CANARY
AWAITING_APPROVAL
PRODUCTION
SUPERSEDED
QUARANTINED
ROLLED_BACK
REJECTED
```

Lifecycle transitions are explicit and auditable. The self-improvement subsystem cannot alter sandbox rules, permission policy, promotion governance, hard gates or global production state without manual approval.

## Execution budgets

Every composed workflow is bounded by:

- maximum steps;
- maximum agents and tasks;
- maximum decomposition depth;
- maximum provider and tool calls;
- maximum retries and repair loops;
- deadline and token budget.

Complexity controls default budgets. Trivial tasks use a direct path; larger tasks receive proportionally larger but finite budgets.

## Persistence and observability

Storage remains provider-independent and records versioned skill definitions, project variants, evaluation runs, performance summaries, promotion history and rollback history. Telemetry excludes secrets and sensitive raw data.

Core execution telemetry includes workflow ID, skill versions, states completed, agents created/completed/failed, tool/provider calls, fallback count, verification evidence, repair loops, latency and final score.

## Delivery strategy

The engine will be delivered in testable milestones:

1. Skill v2 contract, immutable semantic versions and workflow state machine.
2. Resolver v2, project/global selection and skill composition.
3. Generic task DAG, resource ownership and adaptive execution.
4. Executable Superpowers, TDD, review, repair and verification gates.
5. Performance records and project variants.
6. Evaluator, balanced scoring and hard gates.
7. Candidate generation, benchmarks and historical replay.
8. Shadow and canary execution.
9. Promotion governance, quarantine and rollback.
10. Reputation and adaptive execution profiles.

## Backwards compatibility

Existing `src/skills` definitions and resolver remain operational during migration. The v2 foundation is introduced behind new exports and adapters. Consumers move incrementally; the legacy path is removed only after equivalent tests and behaviour exist.

Existing cancellation, workspace sandbox, permissions, approvals, provider fallback, sessions and public identity behaviour must remain unchanged.

## Milestone 1 acceptance criteria

Milestone 1 is complete when:

- SkillDefinition validation rejects malformed definitions;
- semantic versions are validated and immutable;
- production skill objects are deeply frozen;
- workflow definitions reject missing states and illegal transitions;
- a workflow instance records legal state progress and transition evidence;
- terminal completion cannot occur through an undefined transition;
- focused tests and the existing regression suite pass.
