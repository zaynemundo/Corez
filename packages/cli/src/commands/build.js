import { AgentRuntime } from '../../../agent-core/index.js';

export async function handleBuildCommand(prompt, options = {}, ui) {
  if (!prompt || typeof prompt !== 'string') {
    ui.error('Build command requires a prompt or task description.\nExample: corez build "create an admin dashboard"');
    return false;
  }

  ui.banner();
  ui.status('◐', `Starting autonomous build for: "${prompt}"...`);

  const runtime = new AgentRuntime({
    cwd: options.cwd || process.cwd()
  });

  try {
    const result = await runtime.runTask(prompt, {
      signal: options.signal,
      autoApprove: true,
      onStatus: (st) => {
        if (st.type === 'tool_start') {
          ui.status('●', `Executing tool: ${st.name}`);
        } else if (st.type === 'tool_end') {
          ui.status('✓', `Completed tool: ${st.name}`);
        }
      }
    });

    ui.brief({
      task: prompt,
      model: runtime.config.model,
      stepsCount: result.stepsCount,
      inspectedFiles: result.inspectedFiles,
      modifiedFiles: result.modifiedFiles
    });

    ui.success('CoreZ Autonomous Build Complete:');
    console.log(`\n${result.response}\n`);
    return true;
  } catch (err) {
    ui.error(err.message);
    return false;
  }
}
