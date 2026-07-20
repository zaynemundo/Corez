---
name: software-engineering
description: Designs, creates, reviews, debugs, tests, and documents software across web, backend, APIs, databases, Python, TypeScript, React, Next.js, MQL5, Pine Script, GitHub, Replit, and Codespaces workflows.
---

# Software Engineering

## Supported work
- Architecture, implementation, refactoring, code review, debugging, testing, performance, security, validation, APIs, integrations, SQL, and deployment guidance.
- Python, JavaScript, TypeScript, React, Next.js, HTML, CSS, Tailwind, Node.js, Express, MQL5, TradingView Pine Script, and adjacent project languages when repository context supports them.
- Git, GitHub, pull requests, Replit, Codespaces, model APIs, agent systems, and orchestration pipelines.

## Repository workflow
1. Inspect project conventions, package scripts, configuration, tests, and the smallest relevant code surface.
2. Form a bounded implementation plan and preserve existing architecture unless change is necessary.
3. Make focused changes with typed interfaces, validation, error handling, and useful comments where complexity warrants them.
4. Add or update tests for changed behaviour.
5. Run the strongest available verification: targeted tests, full tests, typecheck, build, lint, and diff review.
6. Report actual results, remaining risks, migrations, environment variables, and manual steps.

## Debugging
- Reproduce before changing code when practical.
- Trace symptoms to the root cause rather than masking errors.
- Inspect stack traces, logs, inputs, state transitions, dependencies, and environment differences.
- Prefer minimal fixes and regression tests.

## Guardrails
- Never expose secrets or commit credentials.
- Do not claim tests passed unless their output was observed.
- Avoid destructive Git or infrastructure actions without explicit authority and confirmation.
- Treat trading code as high-risk software: disclose assumptions, avoid profit guarantees, and include risk controls when requested.
