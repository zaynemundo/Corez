---
name: software-engineering
description: General software engineering skill covering architecture, implementation, refactoring, code review, debugging, testing, performance optimization, and contract verification across TypeScript, React, Python, Node.js, and SQL.
---

# Software Engineering Skill

Use this skill whenever designing, engineering, refactoring, debugging, or reviewing full-stack applications, scripts, APIs, or database systems.

---

## 1. Core Engineering Workflow

1. **Investigate Before Editing**: Use code search (Grep tool), file reading (Read tool with offset/limit windows), and directory listing (Glob / Read on directories) to inspect authoritative schemas, imports, and caller signatures before writing code. Never guess function arguments or property names.
2. **Modular Architecture**: Write single-responsibility functions and decoupled components. Avoid monolithic 1000-line files; extract reusable helpers into distinct modules.
3. **Preserve API Contracts**: When modifying a function signature, search for and update every invocation site across the codebase.
4. **Typed & Validated Inputs**: Use TypeScript interfaces, JSDoc types, or runtime schema validation (Zod, TypeBox) for all public functions and API endpoints.

---

## 2. Refactoring & Code Quality

- **DRY (Don't Repeat Yourself)**: Audit code for duplicate logic before creating custom helpers from scratch.
- **SOLID Principles**:
  - **S**: Single Responsibility Principle (one component/function = one task).
  - **O**: Open/Closed Principle (extend behavior via props/composition without mutating core logic).
  - **L**: Liskov Substitution Principle (subtype implementations maintain parent contracts).
  - **I**: Interface Segregation Principle (keep prop types and interfaces minimal and client-specific).
  - **D**: Dependency Inversion Principle (depend on abstractions/interfaces, not concrete implementations).

---

## 3. Systematic Debugging Protocol

1. **Inspect Logs & Stack Traces**: NEVER form a diagnostic hypothesis for a runtime failure or build error without reading the full, un-truncated error log.
2. **Reproduce & Trace Root Cause**: Identify why the underlying contract broke instead of wrapping calls in silent `try/catch` blocks or returning dummy fallbacks.
3. **Justify Edits**: Every code or configuration edit during debugging MUST be justified by an explicit traceback or verified root cause.

---

## 4. Empirical Verification & Git Completion

- **Mandatory Verification**: Run all applicable unit tests, contract scripts, linter commands, and production builds before declaring a task finished.
- **Repository commands** (this repo):
  ```bash
  npm test                # full vitest suite (850+ tests)
  npm run lint            # eslint static analysis
  npm run build           # production build (vite)
  npm run test:cloudflare # worker + contract suites (node/bash scripts)
  ```
- **Git Completion**: Commit verified work on local `main`, rebase onto `origin/main`, and push without merge commits (use the `git-superpowers` skill).
