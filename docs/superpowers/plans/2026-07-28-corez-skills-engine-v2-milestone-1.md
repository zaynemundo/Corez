# CoreZ Skills Engine v2 Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the environment-neutral Skills Engine v2 foundation: validated immutable skill definitions, semantic version identity, workflow contracts, legal state transitions and a version-aware registry.

**Architecture:** Add a new `packages/agent-core/skills-v2/` module without replacing the existing `src/skills` path. The foundation exposes strict constructors and runtime contracts that browser, worker and CLI consumers can adopt incrementally. Behaviour is test-driven and contains no provider calls, file-system access or UI concerns.

**Tech Stack:** Node.js 22 ESM, plain JavaScript, Vitest 3, existing `packages/agent-core` public exports.

## Global Constraints

- Preserve the existing `src/skills` registry and resolver during Milestone 1.
- Do not add a runtime dependency for schema validation; use focused explicit validation functions.
- Skill versions use strict semantic version strings: `MAJOR.MINOR.PATCH` with optional prerelease/build metadata.
- Registered SkillDefinition objects are deeply frozen.
- Production behaviour is immutable; behavioural changes require a new version.
- Workflow transitions are explicit and illegal transitions throw stable CoreZ errors.
- No model/provider calls, storage backend, candidate generation, shadow mode or canary mode are introduced in this milestone.
- Preserve existing AbortSignal, sandbox, permissions, approvals, sessions and provider behaviour.
- Every task follows RED → GREEN → REFACTOR.
- Final verification requires `npm run test:cli`, `npm test`, `npm run lint` and `npm run build` to exit `0`.
- The repository currently has no typecheck script; report that absence rather than inventing one.

---

## File structure

### New Skills Engine v2 foundation

- `packages/agent-core/skills-v2/constants.js`
  - Canonical scope, risk and lifecycle values.
- `packages/agent-core/skills-v2/version.js`
  - Semantic-version validation, parsing and ordering.
- `packages/agent-core/skills-v2/freeze.js`
  - Cycle-safe deep freezing for production definitions.
- `packages/agent-core/skills-v2/schema.js`
  - SkillDefinition validation and immutable construction.
- `packages/agent-core/skills-v2/workflow.js`
  - Workflow definition validation and runtime state transitions.
- `packages/agent-core/skills-v2/registry.js`
  - Version-aware registration and retrieval.
- `packages/agent-core/skills-v2/index.js`
  - Public exports for the module.
- `packages/agent-core/skills-v2/README.md`
  - Contract examples and migration boundary.

### Existing export surface

- Modify `packages/agent-core/index.js`
  - Re-export Skills Engine v2 without changing existing exports.

### Tests

- `tests/skills-v2/version.test.js`
- `tests/skills-v2/skill-definition.test.js`
- `tests/skills-v2/workflow-runtime.test.js`
- `tests/skills-v2/registry.test.js`

---

### Task 1: Canonical constants and semantic version identity

**Files:**
- Create: `packages/agent-core/skills-v2/constants.js`
- Create: `packages/agent-core/skills-v2/version.js`
- Create: `tests/skills-v2/version.test.js`

**Interfaces:**
- Produces: `SKILL_SCOPES`, `SKILL_RISK_LEVELS`, `SKILL_LIFECYCLE_STATES`.
- Produces: `isValidSkillVersion(value): boolean`.
- Produces: `parseSkillVersion(value): Readonly<{ raw, major, minor, patch, prerelease, build }>`.
- Produces: `compareSkillVersions(left, right): -1 | 0 | 1`.
- Produces: `skillVersionKey(id, version): string`.

- [ ] **Step 1: Write the failing semantic-version tests**

```js
// tests/skills-v2/version.test.js
import { describe, expect, it } from 'vitest';
import {
  compareSkillVersions,
  isValidSkillVersion,
  parseSkillVersion,
  skillVersionKey
} from '../../packages/agent-core/skills-v2/index.js';

describe('Skills Engine v2 semantic versions', () => {
  it('accepts stable and prerelease semantic versions', () => {
    expect(isValidSkillVersion('2.0.0')).toBe(true);
    expect(isValidSkillVersion('2.1.0-candidate.3')).toBe(true);
    expect(isValidSkillVersion('1.4.2+build.9')).toBe(true);
  });

  it('rejects incomplete, prefixed and malformed versions', () => {
    expect(isValidSkillVersion('2')).toBe(false);
    expect(isValidSkillVersion('2.0')).toBe(false);
    expect(isValidSkillVersion('v2.0.0')).toBe(false);
    expect(isValidSkillVersion('02.0.0')).toBe(false);
    expect(isValidSkillVersion('')).toBe(false);
  });

  it('parses immutable numeric and metadata fields', () => {
    const parsed = parseSkillVersion('3.4.5-beta.2+sha.abc');
    expect(parsed).toEqual({
      raw: '3.4.5-beta.2+sha.abc',
      major: 3,
      minor: 4,
      patch: 5,
      prerelease: ['beta', '2'],
      build: ['sha', 'abc']
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.prerelease)).toBe(true);
  });

  it('orders stable and prerelease versions according to SemVer precedence', () => {
    expect(compareSkillVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareSkillVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareSkillVersions('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1);
    expect(compareSkillVersions('1.0.0-rc.1', '1.0.0')).toBe(-1);
    expect(compareSkillVersions('1.0.0+one', '1.0.0+two')).toBe(0);
  });

  it('creates a stable registry key', () => {
    expect(skillVersionKey('systematic-debugging', '2.0.0'))
      .toBe('systematic-debugging@2.0.0');
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npx vitest run tests/skills-v2/version.test.js
```

Expected: FAIL because `packages/agent-core/skills-v2/index.js` and the version helpers do not exist.

- [ ] **Step 3: Implement the canonical constants**

```js
// packages/agent-core/skills-v2/constants.js
export const SKILL_SCOPES = Object.freeze({
  GLOBAL: 'global',
  PROJECT: 'project'
});

export const SKILL_RISK_LEVELS = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

export const SKILL_LIFECYCLE_STATES = Object.freeze({
  DRAFT: 'DRAFT',
  CANDIDATE: 'CANDIDATE',
  BENCHMARKING: 'BENCHMARKING',
  SHADOW: 'SHADOW',
  CANARY: 'CANARY',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  PRODUCTION: 'PRODUCTION',
  SUPERSEDED: 'SUPERSEDED',
  QUARANTINED: 'QUARANTINED',
  ROLLED_BACK: 'ROLLED_BACK',
  REJECTED: 'REJECTED'
});
```

- [ ] **Step 4: Implement strict semantic-version helpers**

Use this validation expression in `version.js`:

```js
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
```

`parseSkillVersion()` must throw `TypeError('Invalid skill version: <value>')` for invalid input and return a frozen object whose metadata arrays are frozen.

`compareSkillVersions()` must ignore build metadata and implement SemVer prerelease precedence: stable is greater than prerelease; numeric identifiers compare numerically; numeric identifiers have lower precedence than non-numeric identifiers.

`skillVersionKey()` must reject blank/non-string IDs and return `${id}@${parseSkillVersion(version).raw}`.

- [ ] **Step 5: Add the temporary module barrel**

```js
// packages/agent-core/skills-v2/index.js
export * from './constants.js';
export * from './version.js';
```

- [ ] **Step 6: Run the focused test to verify GREEN**

Run:

```bash
npx vitest run tests/skills-v2/version.test.js
```

Expected: PASS, 5 tests.

- [ ] **Step 7: Commit Task 1**

```bash
git add packages/agent-core/skills-v2/constants.js packages/agent-core/skills-v2/version.js packages/agent-core/skills-v2/index.js tests/skills-v2/version.test.js
git commit -m "feat(skills): add versioned skill identity"
```

---

### Task 2: Immutable SkillDefinition validation

**Files:**
- Create: `packages/agent-core/skills-v2/freeze.js`
- Create: `packages/agent-core/skills-v2/schema.js`
- Modify: `packages/agent-core/skills-v2/index.js`
- Create: `tests/skills-v2/skill-definition.test.js`

**Interfaces:**
- Consumes: constants and version helpers from Task 1.
- Produces: `deepFreeze(value): value`.
- Produces: `validateSkillDefinition(input): Readonly<{ valid, errors }>`.
- Produces: `createSkillDefinition(input): Readonly<SkillDefinition>`.

Use this valid fixture in the tests:

```js
const validDebuggingSkill = {
  id: 'systematic-debugging',
  name: 'Systematic Debugging',
  version: '2.0.0',
  scope: 'global',
  projectId: null,
  riskLevel: 'low',
  lifecycle: 'DRAFT',
  description: 'Evidence-driven debugging workflow.',
  triggers: ['bug', 'failure'],
  compatibleIntents: ['bug_fix'],
  dependencies: [],
  incompatibleSkills: [],
  requiredCapabilities: ['read_workspace', 'run_tests'],
  workflow: {
    entryState: 'REPRODUCE',
    terminalStates: ['COMPLETE'],
    states: {
      REPRODUCE: { requiredEvidence: ['reproduction'] },
      INSPECT: { requiredEvidence: [] },
      COMPLETE: { requiredEvidence: ['verification'] }
    },
    transitions: [
      { from: 'REPRODUCE', to: 'INSPECT' },
      { from: 'INSPECT', to: 'COMPLETE' }
    ]
  },
  tools: ['read_file', 'run_tests'],
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  successCriteria: ['verification recorded'],
  verificationRequirements: ['tests'],
  evaluationSuite: ['debugging-baseline'],
  budgets: {
    maxSteps: 20,
    maxAgents: 1,
    maxTasks: 8,
    maxDepth: 2,
    maxProviderCalls: 20,
    maxToolCalls: 40,
    maxRetries: 2,
    maxRepairLoops: 2,
    deadlineMs: 120000,
    tokenBudget: 50000
  },
  lineage: {
    parentVersion: null,
    candidateOf: null
  }
};
```

- [ ] **Step 1: Write failing SkillDefinition tests**

```js
// tests/skills-v2/skill-definition.test.js
import { describe, expect, it } from 'vitest';
import {
  createSkillDefinition,
  validateSkillDefinition
} from '../../packages/agent-core/skills-v2/index.js';

// Include validDebuggingSkill exactly as defined in the plan.

describe('SkillDefinition v2', () => {
  it('constructs a deeply frozen valid definition', () => {
    const skill = createSkillDefinition(validDebuggingSkill);
    expect(skill.id).toBe('systematic-debugging');
    expect(skill.version).toBe('2.0.0');
    expect(Object.isFrozen(skill)).toBe(true);
    expect(Object.isFrozen(skill.workflow)).toBe(true);
    expect(Object.isFrozen(skill.workflow.states.REPRODUCE)).toBe(true);
    expect(Object.isFrozen(skill.budgets)).toBe(true);
  });

  it('does not retain mutable references from caller input', () => {
    const input = structuredClone(validDebuggingSkill);
    const skill = createSkillDefinition(input);
    input.triggers.push('changed-after-registration');
    input.workflow.states.REPRODUCE.requiredEvidence.push('changed');
    expect(skill.triggers).toEqual(['bug', 'failure']);
    expect(skill.workflow.states.REPRODUCE.requiredEvidence).toEqual(['reproduction']);
  });

  it('rejects project scope without a projectId', () => {
    const result = validateSkillDefinition({
      ...validDebuggingSkill,
      scope: 'project',
      projectId: null
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('projectId is required for project-scoped skills');
  });

  it('rejects unknown risk and lifecycle values', () => {
    expect(validateSkillDefinition({ ...validDebuggingSkill, riskLevel: 'extreme' }).valid)
      .toBe(false);
    expect(validateSkillDefinition({ ...validDebuggingSkill, lifecycle: 'LIVE' }).valid)
      .toBe(false);
  });

  it('rejects invalid budgets and malformed workflow references', () => {
    const input = structuredClone(validDebuggingSkill);
    input.budgets.maxSteps = 0;
    input.workflow.transitions.push({ from: 'MISSING', to: 'COMPLETE' });
    const result = validateSkillDefinition(input);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('budgets.maxSteps must be a positive integer');
    expect(result.errors).toContain('workflow transition references unknown state: MISSING');
  });

  it('throws one aggregated error from createSkillDefinition', () => {
    expect(() => createSkillDefinition({ id: '' }))
      .toThrow(/Invalid SkillDefinition:/);
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npx vitest run tests/skills-v2/skill-definition.test.js
```

Expected: FAIL because constructors and validation do not exist.

- [ ] **Step 3: Implement cycle-safe cloning and deep freezing**

`deepFreeze()` must recursively freeze arrays and plain objects and use a `WeakSet` so cyclic references do not recurse forever.

`createSkillDefinition()` must use `structuredClone(input)` before validation/freezing so the caller cannot mutate registered behaviour through retained references.

- [ ] **Step 4: Implement focused SkillDefinition validation**

Validation rules:

- `id`: lowercase kebab-case matching `/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/`.
- `name` and `description`: non-empty strings.
- `version`: valid semantic version.
- `scope`: one of `global`, `project`.
- `projectId`: required non-empty string only when scope is `project`; must be `null` for global.
- `riskLevel`: one of the canonical risk values.
- `lifecycle`: one of the canonical lifecycle states.
- routing/tool fields: arrays of non-empty strings with duplicate entries rejected.
- workflow: object with a known entry state, at least one terminal state, known state references and no duplicate transitions.
- every budget field in the fixture: positive integer.
- lineage parent/candidate values: `null` or valid semantic versions.

Return all discovered errors in deterministic field order. Freeze the validation result and errors array.

- [ ] **Step 5: Re-export the new contracts**

```js
// packages/agent-core/skills-v2/index.js
export * from './constants.js';
export * from './version.js';
export * from './freeze.js';
export * from './schema.js';
```

- [ ] **Step 6: Run Task 1 and Task 2 tests**

Run:

```bash
npx vitest run tests/skills-v2/version.test.js tests/skills-v2/skill-definition.test.js
```

Expected: PASS, 11 tests.

- [ ] **Step 7: Commit Task 2**

```bash
git add packages/agent-core/skills-v2/freeze.js packages/agent-core/skills-v2/schema.js packages/agent-core/skills-v2/index.js tests/skills-v2/skill-definition.test.js
git commit -m "feat(skills): validate immutable skill definitions"
```

---

### Task 3: Executable workflow transition runtime

**Files:**
- Create: `packages/agent-core/skills-v2/workflow.js`
- Modify: `packages/agent-core/skills-v2/index.js`
- Create: `tests/skills-v2/workflow-runtime.test.js`

**Interfaces:**
- Consumes: an immutable SkillDefinition from Task 2.
- Produces: `createSkillWorkflowRun(skill, options?): SkillWorkflowRun`.
- Produces class `SkillWorkflowRun` with:
  - `snapshot(): Readonly<WorkflowSnapshot>`;
  - `canTransition(to): boolean`;
  - `recordEvidence(key, value): WorkflowSnapshot`;
  - `transition(to, metadata?): WorkflowSnapshot`;
  - `isTerminal(): boolean`.

A snapshot has this exact shape:

```js
{
  runId,
  skillId,
  skillVersion,
  state,
  completedStates,
  evidence,
  transitions,
  startedAt,
  updatedAt,
  terminal
}
```

- [ ] **Step 1: Write failing workflow runtime tests**

```js
// tests/skills-v2/workflow-runtime.test.js
import { describe, expect, it } from 'vitest';
import {
  createSkillDefinition,
  createSkillWorkflowRun
} from '../../packages/agent-core/skills-v2/index.js';

function skillFixture() {
  return createSkillDefinition({
    id: 'simple-edit',
    name: 'Simple Edit',
    version: '1.0.0',
    scope: 'global',
    projectId: null,
    riskLevel: 'low',
    lifecycle: 'DRAFT',
    description: 'Implement and verify a focused edit.',
    triggers: ['edit'],
    compatibleIntents: ['simple_edit'],
    dependencies: [],
    incompatibleSkills: [],
    requiredCapabilities: ['write_workspace'],
    workflow: {
      entryState: 'IMPLEMENT',
      terminalStates: ['COMPLETE'],
      states: {
        IMPLEMENT: { requiredEvidence: [] },
        VERIFY: { requiredEvidence: ['change'] },
        COMPLETE: { requiredEvidence: ['verification'] }
      },
      transitions: [
        { from: 'IMPLEMENT', to: 'VERIFY' },
        { from: 'VERIFY', to: 'COMPLETE' }
      ]
    },
    tools: ['edit_file', 'run_tests'],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    successCriteria: ['focused verification passes'],
    verificationRequirements: ['focused-test'],
    evaluationSuite: ['simple-edit-baseline'],
    budgets: {
      maxSteps: 8,
      maxAgents: 1,
      maxTasks: 3,
      maxDepth: 1,
      maxProviderCalls: 8,
      maxToolCalls: 12,
      maxRetries: 1,
      maxRepairLoops: 1,
      deadlineMs: 60000,
      tokenBudget: 12000
    },
    lineage: { parentVersion: null, candidateOf: null }
  });
}

describe('SkillWorkflowRun', () => {
  it('starts in the workflow entry state', () => {
    const run = createSkillWorkflowRun(skillFixture(), {
      runId: 'run-1',
      now: () => new Date('2026-07-28T00:00:00.000Z')
    });
    expect(run.snapshot()).toMatchObject({
      runId: 'run-1',
      skillId: 'simple-edit',
      skillVersion: '1.0.0',
      state: 'IMPLEMENT',
      completedStates: [],
      terminal: false
    });
  });

  it('rejects a transition that is not defined', () => {
    const run = createSkillWorkflowRun(skillFixture());
    expect(() => run.transition('COMPLETE'))
      .toThrow('Illegal skill workflow transition: IMPLEMENT -> COMPLETE');
  });

  it('requires destination-state evidence before transition', () => {
    const run = createSkillWorkflowRun(skillFixture());
    expect(() => run.transition('VERIFY'))
      .toThrow('Missing workflow evidence for VERIFY: change');
    run.recordEvidence('change', { file: 'src/App.jsx' });
    expect(run.transition('VERIFY').state).toBe('VERIFY');
  });

  it('records transition evidence and completes only through the legal path', () => {
    const run = createSkillWorkflowRun(skillFixture(), { runId: 'run-2' });
    run.recordEvidence('change', { file: 'src/App.jsx' });
    run.transition('VERIFY', { reason: 'edit applied' });
    run.recordEvidence('verification', { command: 'npm test', exitCode: 0 });
    const completed = run.transition('COMPLETE');
    expect(completed.terminal).toBe(true);
    expect(completed.completedStates).toEqual(['IMPLEMENT', 'VERIFY']);
    expect(completed.transitions).toHaveLength(2);
    expect(run.isTerminal()).toBe(true);
  });

  it('does not allow evidence or transitions after terminal completion', () => {
    const run = createSkillWorkflowRun(skillFixture());
    run.recordEvidence('change', true);
    run.transition('VERIFY');
    run.recordEvidence('verification', true);
    run.transition('COMPLETE');
    expect(() => run.recordEvidence('late', true)).toThrow('Skill workflow is already terminal.');
    expect(() => run.transition('VERIFY')).toThrow('Skill workflow is already terminal.');
  });

  it('returns immutable snapshots that cannot mutate runtime state', () => {
    const run = createSkillWorkflowRun(skillFixture());
    const snapshot = run.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.transitions)).toBe(true);
    expect(() => snapshot.completedStates.push('COMPLETE')).toThrow();
    expect(run.snapshot().completedStates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npx vitest run tests/skills-v2/workflow-runtime.test.js
```

Expected: FAIL because the workflow runtime does not exist.

- [ ] **Step 3: Implement transition indexing and runtime state**

In `workflow.js`:

- Build an internal `Map<from, Set<to>>` from the frozen workflow definition.
- Generate `runId` as `skillrun_<timestamp>_<counter>` only when not injected.
- Store internal mutable state in private class fields or closure-local variables.
- `recordEvidence()` rejects blank keys and `undefined` values.
- `transition(to)` checks terminal state, legal edge and destination state's `requiredEvidence`.
- Successful transition appends an immutable record:

```js
{
  from,
  to,
  at,
  metadata
}
```

- The previous state is appended once to `completedStates`.
- Terminal is true when current state is listed in `terminalStates`.
- `snapshot()` returns a fresh structured clone passed through `deepFreeze()`.

- [ ] **Step 4: Re-export the workflow runtime**

```js
export * from './workflow.js';
```

- [ ] **Step 5: Run all focused Skills Engine tests**

Run:

```bash
npx vitest run tests/skills-v2
```

Expected: PASS, 17 tests.

- [ ] **Step 6: Commit Task 3**

```bash
git add packages/agent-core/skills-v2/workflow.js packages/agent-core/skills-v2/index.js tests/skills-v2/workflow-runtime.test.js
git commit -m "feat(skills): enforce executable workflow transitions"
```

---

### Task 4: Version-aware registry and public exports

**Files:**
- Create: `packages/agent-core/skills-v2/registry.js`
- Create: `packages/agent-core/skills-v2/README.md`
- Modify: `packages/agent-core/skills-v2/index.js`
- Modify: `packages/agent-core/index.js`
- Create: `tests/skills-v2/registry.test.js`

**Interfaces:**
- Consumes: `createSkillDefinition`, `compareSkillVersions`, `skillVersionKey`.
- Produces class `SkillRegistryV2`:
  - `register(definition): SkillDefinition`;
  - `get(id, version): SkillDefinition | null`;
  - `getLatest(id, options?): SkillDefinition | null`;
  - `listVersions(id): readonly SkillDefinition[]`;
  - `has(id, version): boolean`.
- Produces: `createSkillRegistryV2(initialDefinitions?): SkillRegistryV2`.

- [ ] **Step 1: Write failing registry tests**

```js
// tests/skills-v2/registry.test.js
import { describe, expect, it } from 'vitest';
import {
  createSkillRegistryV2
} from '../../packages/agent-core/index.js';

function definition(version, lifecycle = 'DRAFT') {
  return {
    id: 'systematic-debugging',
    name: 'Systematic Debugging',
    version,
    scope: 'global',
    projectId: null,
    riskLevel: 'low',
    lifecycle,
    description: 'Evidence-driven debugging.',
    triggers: ['bug'],
    compatibleIntents: ['bug_fix'],
    dependencies: [],
    incompatibleSkills: [],
    requiredCapabilities: ['read_workspace'],
    workflow: {
      entryState: 'INSPECT',
      terminalStates: ['COMPLETE'],
      states: {
        INSPECT: { requiredEvidence: [] },
        COMPLETE: { requiredEvidence: ['verification'] }
      },
      transitions: [{ from: 'INSPECT', to: 'COMPLETE' }]
    },
    tools: ['read_file'],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    successCriteria: ['verification recorded'],
    verificationRequirements: ['tests'],
    evaluationSuite: ['debugging-baseline'],
    budgets: {
      maxSteps: 20,
      maxAgents: 1,
      maxTasks: 8,
      maxDepth: 2,
      maxProviderCalls: 20,
      maxToolCalls: 40,
      maxRetries: 2,
      maxRepairLoops: 2,
      deadlineMs: 120000,
      tokenBudget: 50000
    },
    lineage: { parentVersion: null, candidateOf: null }
  };
}

describe('SkillRegistryV2', () => {
  it('registers and retrieves an immutable version', () => {
    const registry = createSkillRegistryV2();
    const registered = registry.register(definition('2.0.0'));
    expect(registry.get('systematic-debugging', '2.0.0')).toBe(registered);
    expect(Object.isFrozen(registered)).toBe(true);
  });

  it('rejects duplicate id and version registration', () => {
    const registry = createSkillRegistryV2([definition('2.0.0')]);
    expect(() => registry.register(definition('2.0.0')))
      .toThrow('Skill version already registered: systematic-debugging@2.0.0');
  });

  it('lists versions newest first using semantic precedence', () => {
    const registry = createSkillRegistryV2([
      definition('1.0.0'),
      definition('2.0.0-beta.1'),
      definition('1.5.0'),
      definition('2.0.0')
    ]);
    expect(registry.listVersions('systematic-debugging').map(skill => skill.version))
      .toEqual(['2.0.0', '2.0.0-beta.1', '1.5.0', '1.0.0']);
  });

  it('can select the latest production version without returning candidates', () => {
    const registry = createSkillRegistryV2([
      definition('2.0.0', 'PRODUCTION'),
      definition('2.1.0-candidate.1', 'CANDIDATE')
    ]);
    expect(registry.getLatest('systematic-debugging', { lifecycle: 'PRODUCTION' })?.version)
      .toBe('2.0.0');
  });

  it('does not expose internal mutable collections', () => {
    const registry = createSkillRegistryV2([definition('2.0.0')]);
    const versions = registry.listVersions('systematic-debugging');
    expect(Object.isFrozen(versions)).toBe(true);
    expect(() => versions.push(definition('3.0.0'))).toThrow();
    expect(registry.listVersions('systematic-debugging')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the registry test to verify RED**

Run:

```bash
npx vitest run tests/skills-v2/registry.test.js
```

Expected: FAIL because the registry and root exports do not exist.

- [ ] **Step 3: Implement the version-aware registry**

Implementation requirements:

- Constructor accepts an iterable of raw definitions and registers each through `createSkillDefinition()`.
- Store versions internally by `skillVersionKey()`.
- Store a second `Map<id, SkillDefinition[]>` with newest-first order after each registration.
- `getLatest(id, { lifecycle } = {})` filters by exact lifecycle when provided.
- All list results are fresh frozen arrays.
- Registry internals must not be exported.
- Duplicate registration throws exactly:

```text
Skill version already registered: <id>@<version>
```

- [ ] **Step 4: Export Skills Engine v2 from agent-core**

Append to `packages/agent-core/index.js`:

```js
export * from './skills-v2/index.js';
```

Do not remove or rename any existing export.

- [ ] **Step 5: Document the migration boundary**

`packages/agent-core/skills-v2/README.md` must include:

- a complete valid SkillDefinition example;
- workflow run example using `recordEvidence()` and `transition()`;
- registry example with two versions;
- statement that `src/skills` remains the active legacy resolver until Milestone 2;
- statement that no self-promotion behaviour exists in Milestone 1.

- [ ] **Step 6: Run the complete focused suite**

Run:

```bash
npx vitest run tests/skills-v2
```

Expected: PASS, 22 tests.

- [ ] **Step 7: Run agent-core/CLI regression tests**

Run:

```bash
npm run test:cli
```

Expected: PASS with no changed CLI behaviour.

- [ ] **Step 8: Commit Task 4**

```bash
git add packages/agent-core/skills-v2/registry.js packages/agent-core/skills-v2/README.md packages/agent-core/skills-v2/index.js packages/agent-core/index.js tests/skills-v2/registry.test.js
git commit -m "feat(skills): add version-aware skill registry"
```

---

### Task 5: Milestone verification and evidence record

**Files:**
- Modify only if required by verified failures from the commands below.
- Do not weaken tests, lint rules or build settings to force success.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: final verification evidence for the branch.

- [ ] **Step 1: Run the focused Skills Engine suite**

```bash
npx vitest run tests/skills-v2
```

Expected: exit `0`, 22 passing tests.

- [ ] **Step 2: Run CLI tests**

```bash
npm run test:cli
```

Expected: exit `0`.

- [ ] **Step 3: Run the complete test suite**

```bash
npm test
```

Expected: exit `0`.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: exit `0`.

- [ ] **Step 5: Run the production build**

```bash
npm run build
```

Expected: exit `0` and a valid Vite build in `dist/`.

- [ ] **Step 6: Confirm no typecheck command exists**

```bash
node -e "const p=require('./package.json'); console.log(p.scripts?.typecheck || 'NOT_AVAILABLE')"
```

Expected: `NOT_AVAILABLE`. Report this accurately; do not treat it as PASS.

- [ ] **Step 7: Inspect the branch diff**

```bash
git status --short
git diff main...HEAD --stat
git diff main...HEAD -- packages/agent-core/skills-v2 packages/agent-core/index.js tests/skills-v2
```

Expected: only the intended Skills Engine v2 foundation, tests and documentation.

- [ ] **Step 8: Record completion evidence in the final response**

Report:

- exact files created/modified;
- test commands and exit codes;
- passing test counts where available;
- build/lint results;
- the absent typecheck script;
- any remaining Milestone 2 dependencies.

Do not claim Milestone 1 complete if any required command has not been executed successfully.

---

## Self-review

### Spec coverage

This plan covers Milestone 1 acceptance criteria from the approved design:

- canonical SkillDefinition validation: Task 2;
- semantic version identity: Task 1;
- immutable production definitions: Task 2;
- workflow definition and legal transitions: Tasks 2–3;
- transition evidence and terminal enforcement: Task 3;
- version-aware registration and public exports: Task 4;
- regression and build verification: Task 5.

Candidate generation, performance scoring, project variant resolution, task DAG composition, shadow/canary and promotion governance are intentionally deferred to later milestones.

### Placeholder scan

No implementation step depends on `TBD`, `TODO`, unspecified validation, or an undefined interface.

### Type and naming consistency

The plan consistently uses:

- `SkillDefinition`;
- `SkillWorkflowRun`;
- `SkillRegistryV2`;
- `createSkillDefinition()`;
- `createSkillWorkflowRun()`;
- `createSkillRegistryV2()`;
- `SKILL_LIFECYCLE_STATES`;
- strict semantic version strings.
