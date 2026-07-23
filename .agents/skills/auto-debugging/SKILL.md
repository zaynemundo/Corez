---
name: auto-debugging
description: Guidance for self-directed debugging, stack trace interpretation, log analysis, writing reproduction scripts, and validating fixes without user interaction.
---

# Auto-Debugging Skill

Use this skill whenever investigating build errors, test failures, unhandled exceptions, runtime crashes, or unexpected system behavior.

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
- Search for the failure snippet or inspect task log files (`view_file` on log URI).
- Extract error message, stack trace, line number, and active function arguments.

### Step 2: Code Inspection & Signature Audit
- View target file around the error line (`view_file`).
- Check import definitions, variable types, non-null guarantees (`object?.property`), and async promise completions.

### Step 3: Minimal Fix Application
- Make surgical, targeted edits to fix the root cause.
- Maintain existing API signatures so caller sites don't break.

### Step 4: Verification
- Execute `npm run build`, `npm test`, or custom test scripts to confirm resolution.
