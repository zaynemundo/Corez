import readline from 'node:readline';
import { AgentRuntime, ContextEngine, loadCorezConfig } from '../../../agent-core/index.js';

export async function handleChatCommand(options = {}, ui) {
  const cwd = options.cwd || process.cwd();
  const config = loadCorezConfig(cwd);
  const context = new ContextEngine(cwd);
  const projectInfo = context.inspectProject();

  ui.banner();
  ui.header({
    project: projectInfo.name,
    model: config.model,
    mode: config.mode,
    branch: projectInfo.gitBranch
  });

  console.log('Type your request below (or "exit" / "quit" to stop):\n');

  const runtime = new AgentRuntime({ cwd, config, contextEngine: context });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptUser = () => {
    rl.question('› ', async (input) => {
      const trimmed = input ? input.trim() : '';
      if (!trimmed) {
        promptUser();
        return;
      }

      if (['exit', 'quit', ':q'].includes(trimmed.toLowerCase())) {
        console.log('\nGoodbye!\n');
        rl.close();
        return;
      }

      ui.status('◐', `Processing request...`);

      try {
        const result = await runtime.runTask(trimmed, {
          onStatus: (st) => {
            if (st.type === 'tool_start') {
              ui.status('●', `Tool: ${st.name}`);
            }
          }
        });

        console.log(`\n${result.response}\n`);
      } catch (err) {
        ui.error(err.message);
      }

      promptUser();
    });
  };

  promptUser();
}
