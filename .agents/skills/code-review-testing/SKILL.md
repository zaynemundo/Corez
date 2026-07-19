---
name: code-review-testing
description: Specialized skill for thorough code review paired with automated testing and empirical runtime verification.
---

# Code Review & Testing Skill

Use this skill whenever analyzing, auditing, reviewing code, or fixing bugs. Code review MUST always go hand-in-hand with testing.

## Core Principles

1. **Review & Test Pairing**:
   - Every code review must be accompanied by relevant unit or contract tests.
   - Never accept code changes or claim a bug is fixed without running verification commands (e.g. build scripts, contract tests).

2. **Code Quality Checklist**:
   - **Correctness & Contract Compliance**: Verify logic matches API contracts and input requirements.
   - **Edge Cases & Error Handling**: Test boundary inputs (null, undefined, empty strings, rapid triggers, timeouts).
   - **Performance**: Audit loop complexity, memory leaks, unhandled event listeners, and wasteful re-renders.
   - **Security**: Inspect for secret exposure, unescaped user input, injection vulnerabilities, and safe error messages.

3. **No Superficial Fixes**:
   - Never swallowing exceptions, masking symptoms, or returning dummy fallbacks without fixing the root cause.
