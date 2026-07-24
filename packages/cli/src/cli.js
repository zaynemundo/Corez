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
import { AgentRuntime } from '../../agent-core/index.js';

export function parseCliArgs(rawArgs = []) {
  const flags = {
    help: false,
    version: false,
    verbose: false
  };

  const positional = [];

  for (const arg of rawArgs) {
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--version' || arg === '-v') {
      flags.version = true;
    } else if (arg === '--verbose') {
      flags.verbose = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

export function printHelp(ui) {
  ui.banner();
  console.log(`Usage:
  corez                           Start interactive coding session
  corez "<task description>"       Run task against current workspace
  corez chat                      Interactive coding agent mode
  corez plan "<task description>" Analyse codebase & return plan (read-only)
  corez build "<task description>" Autonomous implementation mode
  corez fix                       Find & resolve failing tests/build/lint errors
  corez review                    Review Git diff for bugs and security risks
  corez swarm "<task description>" Run multi-agent swarm architecture
  corez models                    Show available/configured AI models
  corez agents                    Show configured CoreZ agent roles
  corez status                    Show workspace and configuration status

Options:
  --help, -h                      Show this help message
  --version, -v                   Show CLI version
  --verbose                       Enable debug verbose logging
`);
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const { flags, positional } = parseCliArgs(argv);
  const ui = new TerminalUI({ verbose: flags.verbose });

  if (flags.help) {
    printHelp(ui);
    return 0;
  }

  if (flags.version) {
    console.log('corez-cli v0.1.0');
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

        ui.divider();
        ui.success('CoreZ Task Result:');
        console.log(`\n${result.response}\n`);
      } catch (err) {
        ui.error(err.message);
        return 1;
      }
      return 0;
    }
  }
}
