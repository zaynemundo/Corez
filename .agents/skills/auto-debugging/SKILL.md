---
name: auto-debugging
description: Use when a build or test fails, an unhandled exception or runtime crash appears, or behavior is unexpected and you must trace the root cause and verify a fix. Not for new feature work - use `software-engineering` instead.
---

# Auto-Debugging Skill

Use this skill whenever investigating build errors, test failures, unhandled exceptions, runtime crashes, or unexpected system behavior.

## When to use

- Build errors, test failures, unhandled exceptions, or runtime crashes.
- Unexpected system behavior that needs a reproduction before a fix.
- Interpreting full, untruncated stack traces and log files.
- Writing an isolated reproduction script or running a targeted test.
- Confirming a fix with `npm test`, `npm run lint`, and `npm run build` (plus `npm run test:cloudflare` when applicable).

## When not to use

- Reviewing a diff for regressions and missing tests - use `code-review-testing` instead.
- Building or refactoring a feature that is not currently failing - use `software-engineering` instead.
- Launching the app to verify endpoints at runtime - use `verify` instead.
- Sourcing env values, keys, or deployment configuration - use `ask-env-values` instead.

---

## 1. Golden Rules of Auto-Debugging

1. **Inspect Logs First**: Never form a diagnostic hypothesis without inspecting the full, untruncated error traceback or log file.
2. **No Superficial Patches**: Never fix a failure by masking symptoms, swallowing exceptions, returning dummy default values, or deleting broken assertions.
3. **Trace Root Causes**: Follow data flow upstream from the point of failure to the origin of corrupted state or invalid props.
4. **Empirical Verification**: Always execute validation scripts (builds, linters, tests) to confirm the fix works cleanly.

---

## 2. Debugging Workflow

```
  ┌─────────────────────────────────────────────────────────┐
  │  1. EXTRACT: Fetch exact log file & stack trace         │
  │  2. ISOLATE: Identify failing module, line, & props     │
  │  3. REPRODUCE: Run targeted test or isolated script     │
  │  4. FIX: Apply root-cause code edit with typed guards   │
  │  5. VERIFY: Re-run tests & build commands               │
  └─────────────────────────────────────────────────────────┘
```

### Step 1: Log Extraction & Analysis
- Search for the failure snippet or inspect task log files (use the Grep tool to locate the failing assertion or error string, and the Read tool on the log path).
- Extract error message, stack trace, line number, and active function arguments.

### Step 2: Code Inspection & Signature Audit
- Read the target file around the error line (use the Read tool with an offset/limit window; never dump a whole 4000-line file).
- Check import definitions, variable types, non-null guarantees (`object?.property`), and async promise completions.
- Trace every invocation site of a changed function with the Grep tool before editing.

### Step 3: Minimal Fix Application
- Make surgical, targeted edits to fix the root cause.
- Maintain existing API signatures so caller sites don't break.

### Step 4: Verification
- Execute `npm test`, `npm run lint`, and `npm run build` (plus any applicable contract scripts, e.g. `npm run test:cloudflare`) and confirm every command exits 0 before declaring the fix done.

---

## Related skills

- `software-engineering` - broader implementation workflow this skill unblocks.
- `code-review-testing` - regression and contract coverage after the fix.
- `verify` - launches the app for end-to-end runtime confirmation.
