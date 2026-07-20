---
name: auto-debugging
description: Guidance for self-directed debugging, interpretation of stack traces, log analysis, writing reproduction scripts, and validating fixes without user interaction.
---

# Autonomous Debugging & Self-Correction

This skill provides a systematic approach for diagnosing and fixing bugs autonomously when executing tasks in auto mode. When tests fail or compiling errors arise, use this checklist to resolve them.

## 1. Diagnostics & Information Gathering
- **Interpret error output**: Read the error message, stack trace, and context lines carefully. Identify the exact line of code that triggered the exception.
- **Locate the root cause**: Distinguish between syntax errors, runtime exceptions (e.g., `TypeError`, `ENOENT`), and logical assertion failures.
- **Analyze logs**: Look for server log files or run commands with verbose flags (`npm test -- --verbose`, `DEBUG=*`) to capture hidden trace details.

## 2. Isolated Reproduction
- **Write scratch scripts**: Create a minimal reproduction script in the `<appDataDir>/brain/<conversation-id>/scratch/` directory to isolate the bug from the rest of the application.
- **Verify reproduction**: Run the scratch script and confirm that it reproduces the exact error or behavior observed.
- **Inspect environment state**: Verify environment variables, file permissions, and installed package versions that might impact the reproduction.

## 3. Systematic Fix Application
- **Minimize diff footprint**: Draft a clean, focused fix that directly addresses the root cause without introducing unrelated changes or over-engineering.
- **Ensure compatibility**: Respect existing codebase design patterns, coding style, type signatures, and docstring guidelines.
- **Iterative application**: If the fix is complex, apply it in parts and run test commands at each step to ensure no new errors are introduced.

## 4. Verification & Regression Testing
- **Verify the fix**: Run the project's tests or your reproduction script to confirm the bug is resolved.
- **Perform regression checks**: Run the full test suite to make sure the fix did not break other parts of the application.
- **Cleanup**: Delete the reproduction script (or ensure it is located in the ignored `scratch/` directory) and verify the git status is clean except for the target files.
