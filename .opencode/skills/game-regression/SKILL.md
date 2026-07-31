# game-regression

**Role**: QA Lead & Tester  
**Version**: 1.0.0  
**Tags**: `qa`, `regression`, `test-suite`, `baseline`, `collateral`  
**Dependencies**: game-qa-plan, game-smoke-test  
**Token Estimate**: 250 tokens per regression pass

---

## 1. Regression Test Workflow

### Phase 1: Run Full Test Suite
```bash
npm run test:ci          # full suite with coverage
npm run test:e2e         # if e2e tests exist
npm run lint             # static analysis check
npm run typecheck        # TypeScript check
```

### Phase 2: Compare With Baseline
- Baseline is stored in `test-results/baseline/` as a JSON snapshot
- Compare output: `node scripts/compare-test-results.mjs`
- Show pass/fail diff between current run and baseline

```
Test Results Diff:
  Passed: 47 (unchanged)
  Failed: 2 (NEW — see below)
  Skipped: 1 (unchanged)
```

### Phase 3: Identify New Failures
- Filter for tests that passed in baseline but fail now:
  ```bash
  node scripts/identify-regressions.mjs --baseline test-results/baseline/latest.json --current test-results/current/latest.json
  ```
- For each new failure, capture:
  - Test ID and description
  - Error message and stack trace
  - File and line number
  - Whether failure is deterministic or flaky

### Phase 4: Isolate Regression Cause
- Check diff of changed files: `git diff --name-only HEAD~1`
- Cross-reference changed files with failing test paths
- If no obvious link, run `git bisect`:
  ```bash
  git bisect start
  git bisect bad HEAD
  git bisect good <commit-before-bug>
  npm run test:ci  # at each step
  ```

---

## 2. Test Suite Execution Commands

| Scope | Command | Expected Duration |
|-------|---------|-------------------|
| Full suite | `npm run test:ci` | ~2-5 min |
| Smoke only | `npm run test:smoke` | ~30s |
| Unit only | `npm run test:unit` | ~1 min |
| Specific file | `npm run test -- tests/game/player.test.ts` | ~10s |

---

## 3. Baseline Comparison Method

- Baseline snapshots stored at `test-results/baseline/YYYY-MM-DD--<commit-hash>.json`
- Latest baseline symlink: `test-results/baseline/latest.json`
- Compare with:
  ```bash
  node scripts/compare-results.mjs \
    --baseline test-results/baseline/latest.json \
    --current test-results/current/latest.json \
    --output test-results/diff.json
  ```
- Diff format: `{ added: [...], removed: [...], changed: [...], same: number }`

---

## 4. Collateral Damage Assessment

For each changed file, check all tests that depend on that module:

```bash
# Find tests importing a changed module
rg "from '\.\./src/game/physics'" tests/
rg "from '\.\./src/game/player'" tests/
```

If a core module changed (physics, player, state machine), flag ALL dependent suites for re-run regardless of baseline status.

---

## 5. Pass/Fail Reporting Format

```json
{
  "timestamp": "2026-07-30T12:00:00Z",
  "baseline": "2026-07-29--abc1234",
  "total": 48,
  "passed": 45,
  "failed": 2,
  "skipped": 1,
  "new_failures": [
    {
      "id": "COL-3",
      "description": "Player touches enemy loses life",
      "error": "Expected player.lives to be 2, got 3",
      "file": "tests/game/collision.test.ts:42"
    }
  ],
  "regression_verdict": "FAIL — do not release"
}
```

---

## 6. Quick Reversion Criteria

Revert the offending commit immediately if:
- Any CRITICAL test case fails (game crash, broken controls)
- 3+ IMPORTANT test cases fail in the same module
- >=20% of the total test suite fails
- Baseline comparison shows >5 new failures

Revert command:
```bash
git revert HEAD --no-edit
npm run test:ci    # verify revert passes
```

If failure is minor (<=2 MINOR, no IMPORTANT/CRITICAL), file a bug and proceed with known-issues list.
