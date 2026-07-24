import { AgentRuntime } from '../../../agent-core/index.js';

export async function handleFixCommand(options = {}, ui) {
  ui.banner();
  ui.status('◐', 'Inspecting workspace for failing tests, lint, or build errors...');

  const runtime = new AgentRuntime({
    cwd: options.cwd || process.cwd()
  });

  const fixPrompt = `INSPECT AND FIX FAILING TESTS / BUILD / LINT ERRORS:
1. Run run_tests, run_lint, and run_build to gather error diagnostics.
2. Read the failing test log or stack trace.
3. Identify the exact root cause and fix the broken implementation files.
4. Re-run tests to verify the fix works cleanly.`;

  try {
    const result = await runtime.runTask(fixPrompt, {
      signal: options.signal,
      autoApprove: true,
      onStatus: (st) => {
        if (st.type === 'tool_start') {
          ui.status('●', `Running diagnostic tool: ${st.name}`);
        }
      }
    });

    ui.divider();
    ui.success('CoreZ Fix Task Complete:');
    console.log(`\n${result.response}\n`);
  } catch (err) {
    ui.error(err.message);
  }
}
