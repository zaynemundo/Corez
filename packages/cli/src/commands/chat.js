import readline from 'node:readline';
import { AgentRuntime, ContextEngine, PermissionManager, loadCorezConfig } from '../../../agent-core/index.js';
import { handleModelCommand } from './model.js';

export const SLASH_COMMANDS = Object.freeze([
  { cmd: '/model', desc: 'View or switch active AI model' },
  { cmd: '/plan', desc: 'Analyse codebase & build architectural plan (read-only)' },
  { cmd: '/build', desc: 'Execute autonomous implementation' },
  { cmd: '/fix', desc: 'Find & repair failing tests/build/lint errors' },
  { cmd: '/review', desc: 'Audit staged & unstaged Git diff' },
  { cmd: '/swarm', desc: 'Run multi-agent DAG task decomposition' },
  { cmd: '/clear', desc: 'Clear terminal screen' },
  { cmd: '/help', desc: 'Print interactive help menu' },
  { cmd: '/exit', desc: 'Exit interactive session' }
]);

function slashCompleter(line) {
  if (line.startsWith('/')) {
    const matches = SLASH_COMMANDS.filter(c => c.cmd.startsWith(line.toLowerCase()));
    return [matches.length ? matches.map(c => c.cmd) : SLASH_COMMANDS.map(c => c.cmd), line];
  }
  return [[], line];
}

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

  console.log('Type your request below (type "/" for command suggestions, or "exit" to quit):\n');

  let runtime = new AgentRuntime({ cwd, config, contextEngine: context });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: slashCompleter
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

      // Display slash command suggestion list when user types just "/"
      if (trimmed === '/') {
        console.log('\n  Available Slash Commands:');
        SLASH_COMMANDS.forEach(c => {
          console.log(`  \x1b[36m${c.cmd.padEnd(12)}\x1b[0m ${c.desc}`);
        });
        console.log();
        promptUser();
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
            const readOnlyPermissions = new PermissionManager({
              read: true,
              workspaceWrite: false,
              shell: false,
              network: false,
              dangerous: false
            });
            const planRuntime = new AgentRuntime({
              cwd,
              contextEngine: context,
              permissionManager: readOnlyPermissions
            });
            const planResult = await planRuntime.runTask(`[READ-ONLY PLAN MODE]: ${planTask}`, {
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
