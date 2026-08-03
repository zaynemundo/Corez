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
