import readline from 'node:readline';
import { AgentRuntime, ContextEngine, loadCorezConfig } from '../../../agent-core/index.js';
import { handleModelCommand } from './model.js';

export async function handleChatCommand(options = {}, ui) {
  const cwd = options.cwd || process.cwd();
  let config = loadCorezConfig(cwd);
  const context = new ContextEngine(cwd);
  const projectInfo = context.inspectProject();

  ui.banner();
  ui.header({
    project: projectInfo.name,
    model: config.model,
    mode: config.mode,
    branch: projectInfo.gitBranch
  });

  console.log('Type your request below (or "/model" to view/switch model, "exit" to quit):\n');

  let runtime = new AgentRuntime({ cwd, config, contextEngine: context });

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

      // Handle slash commands (/model, /plan, /build, /fix, /review, /swarm, /clear, /help, /exit)
      const lower = trimmed.toLowerCase();
      if (lower === '/clear' || lower === 'clear') {
        console.clear();
        ui.banner();
        promptUser();
        return;
      }

      if (lower === '/help' || lower === 'help') {
        console.log(`\nCOREZ CLI Interactive Slash Commands:
  /model [model-id]    View or switch active AI model
  /plan <task>         Analyze workspace & build architectural plan (read-only)
  /build <task>        Execute autonomous implementation
  /fix                 Find & repair failing tests/build/lint errors
  /review              Audit staged & unstaged Git diff
  /swarm <task>        Run multi-agent DAG task decomposition
  /clear               Clear terminal screen
  /exit, /quit         Exit interactive session\n`);
        promptUser();
        return;
      }

      if (trimmed.startsWith('/model') || trimmed.startsWith('/models')) {
        const modelArg = trimmed.replace(/^\/models?\s*/i, '').trim();
        await handleModelCommand(modelArg ? [modelArg] : [], { cwd }, ui);
        config = loadCorezConfig(cwd);
        runtime = new AgentRuntime({ cwd, config, contextEngine: context });
        promptUser();
        return;
      }

      if (trimmed.startsWith('/plan')) {
        const planTask = trimmed.replace(/^\/plan\s*/i, '').trim();
        if (!planTask) {
          console.log('\nUsage: /plan <task description>\n');
        } else {
          ui.status('◐', `Analyzing plan for: "${planTask}"...`);
          try {
            const planResult = await runtime.runTask(`[READ-ONLY PLAN MODE]: ${planTask}`, {
              onStatus: (st) => st.type === 'tool_start' && ui.status('●', `Tool: ${st.name}`)
            });
            console.log(`\n${planResult.response}\n`);
          } catch (err) {
            ui.error(err.message);
          }
        }
        promptUser();
        return;
      }

      if (trimmed.startsWith('/build')) {
        const buildTask = trimmed.replace(/^\/build\s*/i, '').trim();
        if (!buildTask) {
          console.log('\nUsage: /build <task description>\n');
        } else {
          ui.status('◐', `Building task: "${buildTask}"...`);
          try {
            const buildResult = await runtime.runTask(buildTask, {
              onStatus: (st) => st.type === 'tool_start' && ui.status('●', `Tool: ${st.name}`)
            });
            ui.brief({
              task: buildTask,
              model: runtime.config.model,
              stepsCount: buildResult.stepsCount,
              inspectedFiles: buildResult.inspectedFiles,
              modifiedFiles: buildResult.modifiedFiles
            });
            console.log(`\n${buildResult.response}\n`);
          } catch (err) {
            ui.error(err.message);
          }
        }
        promptUser();
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

        ui.brief({
          task: trimmed,
          model: runtime.config.model,
          stepsCount: result.stepsCount,
          inspectedFiles: result.inspectedFiles,
          modifiedFiles: result.modifiedFiles
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
