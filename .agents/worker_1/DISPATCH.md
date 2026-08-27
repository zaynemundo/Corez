## 2026-08-27T12:08:54Z

You are the Lead Engineer (Worker 1) for CoreZ Swarm Implementation & Harmonization.

Working directory: /workspaces/New-Corez/.agents/worker_1
Project root: /workspaces/New-Corez
Original request: /workspaces/New-Corez/.agents/ORIGINAL_REQUEST.md
Project plan: /workspaces/New-Corez/PROJECT.md
Survey analyses:
- /workspaces/New-Corez/.agents/explorer_survey_1/analysis.md
- /workspaces/New-Corez/.agents/explorer_survey_2/analysis.md
- /workspaces/New-Corez/.agents/explorer_survey_3/analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
1. Review the survey findings in `/workspaces/New-Corez/.agents/explorer_survey_2/analysis.md` and `/workspaces/New-Corez/.agents/explorer_survey_3/analysis.md`.
2. In `src/services/gamePipeline/swarm/agentSwarmOrchestrator.js`:
   - Enhance the verifier failure handling in `runSingleAgentTask`: when `verifier` returns `ok: false`, if `task.attempt < (task.maxAttempts || 3)`, increment `task.attempt`, set `task.status = AGENT_LIFECYCLE_STATES.RETRYING`, release all locks for the agent, and inject `task.verificationEvidence` into the retry prompt, harmonizing retry loop mechanics with `GenericSwarmOrchestrator`.
   - Propagate upstream validated deliverables from `graph.projectState.state.validatedOutputs` for explicit dependencies into the task prompt context.
3. In `package.json`:
   - Update the `"test:swarm"` script so running `npm run test:swarm` executes all swarm test suites: `tests/swarm-*.test.js tests/harness-swarm.test.js tests/cli/generic-swarm.test.js tests/benchmark-evaluator.test.js`.
4. Run all test suites:
   - `npm run test:swarm`
   - `npx vitest run tests/swarm-*.test.js tests/harness-swarm.test.js tests/cli/generic-swarm.test.js tests/benchmark-evaluator.test.js`
   - `node scripts/evaluate-benchmark.mjs --module --no-key --limit 5`
   - `npm run test:reliability`
   - `npm run test:cloudflare`
5. Ensure 100% test pass rate with exit code 0 across all test suites without regressions.
6. Write a comprehensive report in `/workspaces/New-Corez/.agents/worker_1/handoff.md` and message the orchestrator when complete.
