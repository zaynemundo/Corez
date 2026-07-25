import { createRequire } from 'module';
import { TerminalUI, styles } from './ui/terminal.js';
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

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const COMMAND_ALIASES = {
  p: 'plan',
  b: 'build',
  s: 'status',
  a: 'agents',
  f: 'fix',
  r: 'review',
  sw: 'swarm',
};

const COMMANDS_THAT_REQUIRE_PROMPT = new Set(['plan', 'build', 'swarm']);

export function parseCliArgs(rawArgs = []) {
  const flags = {
    help: false,
    version: false,
    verbose: false,
    autoApprove: false,
    model: null,
  };

  const positional = [];
  let ended = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (arg === '--') {
      ended = true;
      continue;
    }

    if (ended || !arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }

    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      let name, value;
      if (eqIdx !== -1) {
        name = arg.slice(2, eqIdx);
        value = arg.slice(eqIdx + 1);
      } else {
        name = arg.slice(2);
      }

      switch (name) {
        case 'help':
          flags.help = true;
          break;
        case 'version':
          flags.version = true;
          break;
        case 'verbose':
          flags.verbose = true;
          break;
        case 'no-verbose':
          flags.verbose = false;
          break;
        case 'auto-approve':
        case 'yolo':
          flags.autoApprove = true;
          break;
        case 'model':
          flags.model = value ?? (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-') ? rawArgs[++i] : null);
          break;
      }
    } else {
      for (let j = 1; j < arg.length; j++) {
        const ch = arg[j];
        switch (ch) {
          case 'h':
            flags.help = true;
            break;
          case 'v':
            flags.version = true;
            break;
          case 'y':
            flags.autoApprove = true;
            break;
          case 'm':
            flags.model = i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-') ? rawArgs[++i] : null;
            break;
        }
      }
    }
  }

  return { flags, positional };
}

export function printHelp(ui) {
  ui.banner();
  console.log(`${styles.bold}USAGE${styles.reset}`);
  console.log(`  ${styles.cyan}corez${styles.reset} ${styles.dim}<command>${styles.reset} ${styles.dim}[options]${styles.reset} ${styles.dim}[args]${styles.reset}`);
  console.log(`  ${styles.cyan}corez${styles.reset} ${styles.dim}[options]${styles.reset} ${styles.dim}"<task description>"${styles.reset}\n`);

  console.log(`${styles.bold}COMMANDS${styles.reset}`);

  console.log(`  ${styles.cyan}chat${styles.reset}                          Start interactive coding REPL session`);

  const cmd = (name, alias, desc) =>
    `  ${styles.cyan}${name}${alias ? styles.dim + ' (' + alias + ')' : ''}${styles.reset}  ${desc}`;

  console.log(cmd('plan <task>', 'p', 'Analyse codebase & return architectural plan (read-only)'));
  console.log(cmd('build <task>', 'b', 'Autonomous multi-file implementation mode'));
  console.log(cmd('fix', 'f', 'Find & resolve failing tests / build / lint errors'));
  console.log(cmd('review', 'r', 'Review staged & unstaged Git diff'));
  console.log(cmd('swarm <task>', 'sw', 'Multi-agent DAG task decomposition'));

  console.log(`\n  ${styles.dim}Information:${styles.reset}`);
  console.log(cmd('status', 's', 'Show workspace, git branch & config status'));
  console.log(cmd('models', null, 'Show available / configured AI models'));
  console.log(cmd('model [id]', null, 'View active model or switch to a new model'));
  console.log(cmd('agents', 'a', 'Show configured CoreZ agent roles'));

  console.log(`\n${styles.bold}INTERACTIVE SLASH COMMANDS${styles.reset} ${styles.dim}(inside REPL)${styles.reset}`);
  console.log(`  ${styles.dim}/model [id]     /plan <task>    /build <task>${styles.reset}`);
  console.log(`  ${styles.dim}/fix             /review          /swarm <task>${styles.reset}`);
  console.log(`  ${styles.dim}/clear           /help            /exit /quit${styles.reset}`);

  console.log(`\n${styles.bold}OPTIONS${styles.reset}`);
  const opt = (short, long, desc) =>
    `  ${styles.cyan}${short}${short && long ? ', ' : '    '}${styles.reset}${styles.cyan}${long}${styles.reset}  ${desc}`;

  console.log(opt('-h', '--help', 'Show this help message'));
  console.log(opt('-v', '--version', 'Show CLI version'));
  console.log(opt('-y', '--auto-approve, --yolo', 'Auto-approve execution without confirmation prompts'));
  console.log(opt('-m', '--model <id>', 'Override active AI model for this invocation'));
  console.log(opt('', '--verbose', 'Enable debug verbose logging'));
  console.log(opt('', '--no-verbose', 'Disable verbose logging'));

  console.log(`\n${styles.bold}EXAMPLES${styles.reset}`);
  console.log(`  ${styles.dim}corez plan "add Stripe subscriptions"${styles.reset}`);
  console.log(`  ${styles.dim}corez build "create admin dashboard"${styles.reset}`);
  console.log(`  ${styles.dim}corez -m deepseek-v4-flux "check for bugs"${styles.reset}`);
  console.log(`  ${styles.dim}corez fix${styles.reset}`);
  console.log(`  ${styles.dim}corez chat${styles.reset}`);
}

function normalizeCommand(name) {
  return COMMAND_ALIASES[name] || name;
}

function validatePrompt(command, prompt, ui) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    ui.error(`${command} requires a task description.\nExample: ${styles.cyan}corez ${command} "${command === 'swarm' ? 'build a browser game' : 'add Stripe subscriptions'}"${styles.reset}`);
    return false;
  }
  return true;
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
    console.log(`corez-code v${pkg.version} (AGY-style AI coding engine)`);
    return 0;
  }

  const firstArg = positional[0];
  const restArgs = positional.slice(1);

  if (!firstArg || firstArg === 'chat') {
    await handleChatCommand(options, ui);
    return 0;
  }

  const cmd = normalizeCommand(firstArg.toLowerCase());

  switch (cmd) {
    case 'status':
      await handleStatusCommand(restArgs, options, ui);
      return 0;

    case 'models':
      await handleModelsCommand(restArgs, options, ui);
      return 0;

    case 'model':
    case '/model':
    case '/models':
      await handleModelCommand(restArgs, options, ui);
      return 0;

    case 'agents':
      await handleAgentsCommand(restArgs, options, ui);
      return 0;

    case 'plan':
      if (!validatePrompt('plan', restArgs.join(' '), ui)) return 1;
      await handlePlanCommand(restArgs.join(' '), options, ui);
      return 0;

    case 'build':
      if (!validatePrompt('build', restArgs.join(' '), ui)) return 1;
      await handleBuildCommand(restArgs.join(' '), options, ui);
      return 0;

    case 'fix':
      await handleFixCommand(options, ui);
      return 0;

    case 'review':
      await handleReviewCommand(options, ui);
      return 0;

    case 'swarm':
      if (!validatePrompt('swarm', restArgs.join(' '), ui)) return 1;
      await handleSwarmCommand(restArgs.join(' '), options, ui);
      return 0;

    default: {
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
          },
        });

        ui.brief({
          task: prompt,
          model: runtime.config.model,
          stepsCount: result.stepsCount,
          inspectedFiles: result.inspectedFiles,
          modifiedFiles: result.modifiedFiles,
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
