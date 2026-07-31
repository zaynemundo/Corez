import { AgentRuntime } from '../../../agent-core/index.js';

export async function handleReviewCommand(options = {}, ui) {
  ui.banner();
  ui.status('◐', 'Inspecting Git diff for code review...');

  const runtime = new AgentRuntime({
    cwd: options.cwd || process.cwd()
  });

  const reviewPrompt = `REVIEW CURRENT GIT CHANGES:
1. Run git_status and git_diff to view staged and unstaged changes.
2. Inspect modified files for correctness regressions, security risks, missing tests, or maintainability issues.
3. Provide a structured review report:
   - Summary of Changes
   - Potential Bug / Regression Risks
   - Security Audit
   - Code Quality & Maintainability Rating`;

  try {
    const result = await runtime.runTask(reviewPrompt, {
      signal: options.signal,
      onStatus: (st) => {
        if (st.type === 'tool_start') {
          ui.status('●', `Inspecting git: ${st.name}`);
        }
      }
    });

    ui.divider();
    ui.success('CoreZ Code Review Report:');
    console.log(`\n${result.response}\n`);
    return true;
  } catch (err) {
    ui.error(err.message);
    return false;
  }
}
