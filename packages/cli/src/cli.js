import { TerminalUI } from './ui/terminal.js';
import { handleStatusCommand } from './commands/status.js';
import { handleModelsCommand } from './commands/models.js';
import { handleAgentsCommand } from './commands/agents.js';
import { handlePlanCommand } from './commands/plan.js';
import { handleBuildCommand } from './commands/build.js';
import { handleFixCommand } from './commands/fix.js';
import { handleReviewCommand } from './commands/review.js';
import { handleSwarmCommand } from './commands/swarm.js';
import { handleChatCommand } from './commands/chat.js';
import { handleModelCommand } from './commands/model.js';
import { AgentRuntime } from '../../agent-core/index.js';

export function parseCliArgs(rawArgs = []) {
  const flags = {
    help: false,
    version: false,
    verbose: false,
    autoApprove: false,
    model: null
  };

  const positional = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--version' || arg === '-v') {
      flags.version = true;
    } else if (arg === '--verbose') {
      flags.verbose = true;
    } else if (arg === '--auto-approve' || arg === '-y' || arg === '--yolo') {
      flags.autoApprove = true;
    } else if (arg === '--model' || arg === '-m') {
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
        flags.model = rawArgs[++i];
      }
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

export function printHelp(ui) {
  ui.banner();
  console.log(`Usage:
  corez                           Start interactive coding REPL session (AGY style)
  corez "<task description>"       Run task prompt against current workspace
  corez chat                      Interactive coding agent REPL mode
  corez plan "<task>"             Analyse codebase & return architectural plan (read-only)
  corez build "<task>"            Autonomous implementation mode
  corez fix                       Find & resolve failing tests/build/lint errors
  corez review                    Review staged & unstaged Git diff
  corez swarm "<task>"            Run multi-agent DAG task decomposition
  corez models                    Show available/configured AI models
  corez model [model-id]          View active model or switch to a new model
  corez agents                    Show configured CoreZ agent roles
  corez status                    Show workspace, git branch, and model configuration status

Interactive Slash Commands (inside REPL):
  /model [model-id]               View or switch active AI model
  /plan <task>                    Build read-only architectural plan
  /build <task>                   Run autonomous implementation
  /fix                            Find and repair build/test/lint errors
  /review                         Audit Git diff for bugs and security risks
  /swarm <task>                   Run multi-agent swarm architecture
  /clear                          Clear terminal screen
  /help                           Print interactive help menu
  /exit, /quit                    Exit interactive session

Options:
  --auto-approve, -y, --yolo      Auto-approve execution without confirmation prompts
  --model <model-id>, -m <model>  Override active AI model for this invocation
  --help, -h                      Show this help message
  --version, -v                   Show CLI version
  --verbose                       Enable debug verbose logging
`);
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const { flags, positional } = parseCliArgs(argv);
  const ui = new TerminalUI({ verbose: flags.verbose });
  const execOptions = { ...options, modelOverride: flags.model, autoApprove: flags.autoApprove };

  if (flags.help) {
    printHelp(ui);
    return 0;
  }

  if (flags.version) {
    console.log('corez-code v0.1.0 (AGY-style AI coding engine)');
    return 0;
  }

  const firstArg = positional[0];

  // Command routing
  if (!firstArg || firstArg === 'chat') {
    await handleChatCommand(options, ui);
    return 0;
  }

  switch (firstArg.toLowerCase()) {
    case 'status':
      await handleStatusCommand(positional.slice(1), options, ui);
      return 0;

    case 'models':
      await handleModelsCommand(positional.slice(1), options, ui);
      return 0;

    case 'model':
    case '/model':
    case '/models':
      await handleModelCommand(positional.slice(1), options, ui);
      return 0;

    case 'agents':
      await handleAgentsCommand(positional.slice(1), options, ui);
      return 0;

    case 'plan':
      await handlePlanCommand(positional.slice(1).join(' '), options, ui);
      return 0;

    case 'build':
      await handleBuildCommand(positional.slice(1).join(' '), options, ui);
      return 0;

    case 'fix':
      await handleFixCommand(options, ui);
      return 0;

    case 'review':
      await handleReviewCommand(options, ui);
      return 0;

    case 'swarm':
      await handleSwarmCommand(positional.slice(1).join(' '), options, ui);
      return 0;

    default: {
      // Treat `corez "prompt"` as running a direct task prompt
      const prompt = positional.join(' ');
      ui.banner();
      ui.status('◐', `Executing task: "${prompt}"...`);

      const runtime = new AgentRuntime({ cwd: options.cwd || process.cwd() });
      try {
        const result = await runtime.runTask(prompt, {
          signal: options.signal,
          onStatus: (st) => {
            if (st.type === 'tool_start') {
              ui.status('●', `Tool: ${st.name}`);
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

        ui.success('CoreZ Task Execution Result:');
        console.log(`\n${result.response}\n`);
      } catch (err) {
        ui.error(err.message);
        return 1;
      }
      return 0;
    }
  }
}
