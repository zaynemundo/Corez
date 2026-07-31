# game-implement

> Specialist programmer execution skill for building gameplay, AI behaviors, engine mechanics, and UI modules.

## Frontmatter

```yaml
version: 1.0.0
tags: [game-implement, programmer, tdd, execution, specialist]
dependencies: [game-task-plan, game-architecture]
token_estimate: 2400
```

## TDD Workflow: RED-GREEN-REFACTOR

Every implementation follows three strict phases. No skipping.

### RED — Write a Failing Test First

1. Read the task brief's acceptance criteria. Every criterion maps to at least one test.
2. Place tests in `src/__tests__/` or alongside the source file as `*.test.ts`.
3. Use vitest. Configure in `vitest.config.ts` at project root.
4. Write assertions that describe the desired behavior *before* writing implementation.

```typescript
import { describe, it, expect } from 'vitest';
import { Player } from '../entities/player';

describe('Player', () => {
  it('starts with 3 lives', () => {
    const player = new Player();
    expect(player.lives).toBe(3);
  });

  it('loses a life on hit when not invincible', () => {
    const player = new Player();
    player.takeHit();
    expect(player.lives).toBe(2);
  });
});
```

5. Run the test suite. Confirm it fails with the expected error (e.g., `Cannot find name 'Player'`).
6. Commit the RED state: `git commit -m "RED: add failing tests for Player"`

### GREEN — Minimum Code to Pass

1. Write the *minimum* production code to make the test pass. No extra features.
2. No optimization, no refactoring, no extra methods. Resist scope creep.
3. Run the test. It must pass.

```typescript
export class Player {
  lives = 3;
  invincible = false;

  takeHit(): void {
    if (!this.invincible) {
      this.lives -= 1;
    }
  }
}
```

4. Commit the GREEN state: `git commit -m "GREEN: implement Player with lives and takeHit"`

### REFACTOR — Clean Up Without Changing Behavior

1. Improve naming, extract duplication, simplify logic.
2. Tests must still pass after every change.
3. Run tests after each refactoring step.
4. Do NOT change public API signatures or behavior.
5. Commit the REFACTOR state: `git commit -m "REFACTOR: clean up Player implementation"`

## Test Framework Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom', // or 'node' for non-DOM code
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
});
```

Dependencies: `npm install -D vitest @vitest/coverage-v8`

Scripts in `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

## File Boundary Rules

| Rule | Description |
|------|-------------|
| Scope lock | Edit ONLY files listed in the task brief's `files` array. |
| No drive-bys | If you need to change a file not in the brief, STOP and escalate. |
| Import allowed | You may import from files outside the boundary but never modify them. |
| One file per test batch | Run tests only for the assigned module, not the full suite, during TDD cycle. |
| Full suite at end | Run full `npm test` before marking task complete. |

## Code Quality Checklist

- [ ] No TODO, FIXME, or debugger statements
- [ ] No `any` types (prefer `unknown` with type guards)
- [ ] Functions are < 20 lines (extract helpers)
- [ ] No magic numbers (use named constants)
- [ ] No `console.log` (use a proper logger or remove)
- [ ] Public methods have JSDoc if non-obvious
- [ ] No unused imports or variables
- [ ] All branches have coverage
- [ ] No `eslint-disable` without explicit justification comment
- [ ] Exports are explicit (no `export *` barrels)

## Verification Protocol

```bash
# Step 1: Run unit tests
npm test -- --run

# Step 2: Run linter
npm run lint

# Step 3: TypeScript check
npm run typecheck

# Step 4 (if applicable): Build
npm run build
```

All four must exit with code 0 before marking task COMPLETE.

If a script is missing from `package.json`, report it explicitly — do not assume it passes.

## Handling Ambiguity

When the task brief is unclear, follow this decision tree:

1. **Is the acceptance criteria measurable?** If no, stop and ask: "The acceptance criteria for [X] is not measurable. Can you define a specific assertion?"
2. **Is the expected behavior documented elsewhere?** Check game-spec.json and art-direction.json first.
3. **Two interpretations possible?** Pick the one that requires fewer lines of code and document the decision in a comment.
4. **Missing dependency?** If your module needs a type from another module that doesn't exist yet, create an interface stub (no implementation) and flag it.

## Common Traps

| Trap | Avoidance |
|------|-----------|
| Writing too much GREEN code | Strictly implement only what the test demands. If your test asserts `lives === 3`, do not add `score`, `name`, or `inventory`. |
| Refactoring before GREEN | Refactor phase exists for a reason. Never refactor while tests are failing. |
| Ignoring the full suite | A passing single-module test does not mean the full suite passes. Always run `npm test` at the end. |
| Editing shared types | Shared types in `src/game/types.ts` affect every module. Never edit them without explicit brief permission. |
| Silent test skips | `it.skip` or `describe.skip` are forbidden. If a test can't be written yet, escalate. |
| Over-mocking | Mock at the boundary (IO, network, rendering). Do not mock internal logic — that defeats TDD. |
| Forgetting coverage | Run `npm run test:coverage` and verify thresholds before committing. |
