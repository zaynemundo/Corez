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

export function parseCliArgs(rawArgs = []) {
  const flags = {
    help: false,
    version: false,
    verbose: false,
    autoApprove: false,
    model: null,
    agent: null,
    auto: false,
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
        case 'auto':
          flags.autoApprove = true;
          flags.auto = true;
          break;
        case 'agent':
          flags.agent = value ?? (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-') ? rawArgs[++i] : null);
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
            flags.auto = true;
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

function printCommands(title, commands) {
  console.log(`\n${styles.bold}${title}${styles.reset}`);
  for (const [name, alias, desc] of commands) {
    const aliasStr = alias ? styles.dim + ` (${alias})` : '';
    console.log(`  ${styles.cyan}${name}${aliasStr}${styles.reset}  ${desc}`);
  }
}

export function printHelp(ui) {
  ui.banner();

  console.log(`${styles.bold}USAGE${styles.reset}`);
  console.log(`  ${styles.cyan}corez${styles.reset} ${styles.dim}[command]${styles.reset} ${styles.dim}[options]${styles.reset} ${styles.dim}[args]${styles.reset}`);
  console.log(`  ${styles.cyan}corez${styles.reset} ${styles.dim}[options]${styles.reset} ${styles.dim}"<task>"${styles.reset}\n`);

  printCommands('DEVELOPMENT', [
    ['chat', null, 'Start interactive REPL session (default)'],
    ['run <message>', null, 'Run a task non-interactively'],
    ['plan <task>', 'p', 'Analyse codebase & return architectural plan'],
    ['build <task>', 'b', 'Autonomous multi-file implementation'],
    ['fix', 'f', 'Find & resolve failing tests / build / lint'],
    ['review', 'r', 'Audit Git diff for bugs and security risks'],
    ['swarm <task>', 'sw', 'Multi-agent DAG task decomposition'],
  ]);

  printCommands('INFORMATION', [
    ['status', 's', 'Show workspace, git branch & config'],
    ['models', null, 'List available / configured AI models'],
    ['model [id]', null, 'View active model or switch to another'],
    ['agents', 'a', 'List configured CoreZ agent roles'],
  ]);

  printCommands('SESSION', [
    ['session list', null, 'List active sessions'],
    ['session delete <id>', null, 'Delete a session'],
  ]);

  printCommands('UTILITIES', [
    ['completion', null, 'Generate shell completion script'],
    ['help [command]', null, 'Show help for a specific command'],
  ]);

  console.log(`\n${styles.bold}OPTIONS${styles.reset}`);
  const opts = [
    ['-h, --help', 'Show this help message'],
    ['-v, --version', 'Show CLI version'],
    ['-m, --model <id>', 'Override AI model (provider/model or name)'],
    ['--agent <name>', 'Use a specific agent configuration'],
    ['-y, --auto, --auto-approve', 'Auto-approve all execution prompts'],
    ['--verbose, --no-verbose', 'Enable / disable debug logging'],
  ];
  for (const [flag, desc] of opts) {
    const padded = flag.padEnd(28);
    console.log(`  ${styles.cyan}${padded}${styles.reset}  ${desc}`);
  }

  console.log(`\n${styles.bold}REPL SLASH COMMANDS${styles.reset} ${styles.dim}(inside interactive session)${styles.reset}`);
  console.log(`  ${styles.dim}/model [id]     /plan <task>    /build <task>${styles.reset}`);
  console.log(`  ${styles.dim}/fix             /review          /swarm <task>${styles.reset}`);
  console.log(`  ${styles.dim}/clear           /help            /exit /quit${styles.reset}`);

  console.log(`\n${styles.bold}EXAMPLES${styles.reset}`);
  console.log(`  ${styles.dim}corez plan "add Stripe subscriptions"${styles.reset}`);
  console.log(`  ${styles.dim}corez run "fix all lint errors" --auto${styles.reset}`);
  console.log(`  ${styles.dim}corez -m muse-spark-1.2-contributor check for bugs${styles.reset}`);
  console.log(`  ${styles.dim}corez build "create admin dashboard"${styles.reset}`);
  console.log(`  ${styles.dim}corez review${styles.reset}`);
  console.log(`  ${styles.dim}corez completion${styles.reset}`);
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

function handleRunCommand(prompt, options, ui, execOptions) {
  if (!validatePrompt('run', prompt, ui)) return Promise.resolve(1);
  return executeTask(prompt, options, ui, execOptions);
}

async function executeTask(prompt, options, ui, execOptions = {}) {
  ui.banner();
  ui.status('◐', `Executing task: "${prompt}"...`);

  const runtime = new AgentRuntime({
    cwd: options.cwd || process.cwd(),
  });
  const activeModel = execOptions.modelOverride || runtime.config.model;

  try {
    const result = await runtime.runTask(prompt, {
      signal: options.signal,
      model: execOptions.modelOverride || undefined,
      autoApprove: execOptions.autoApprove,
      onStatus: (st) => {
        if (st.type === 'tool_start') {
          ui.status('●', `Tool: ${st.name}`);
        }
      },
    });

    ui.brief({
      task: prompt,
      model: activeModel,
      stepsCount: result.stepsCount,
      inspectedFiles: result.inspectedFiles,
      modifiedFiles: result.modifiedFiles,
    });

    ui.success('CoreZ Task Execution Result:');
    console.log(`\n${result.response}\n`);
    return 0;
  } catch (err) {
    ui.error(err.message);
    return 1;
  }
}

function handleCompletionCommand(args, ui) {
  const shell = args[0] || process.env.SHELL?.split('/').pop() || 'bash';

  const bashScript = `_corez_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"

  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=($(compgen -W "chat run plan build fix review swarm status models model agents session completion help" -- "$cur"))
  elif [[ $COMP_CWORD -eq 2 ]] && [[ "\${COMP_WORDS[1]}" == "session" ]]; then
    COMPREPLY=($(compgen -W "list delete" -- "$cur"))
  elif [[ $COMP_CWORD -eq 2 ]] && [[ "\${COMP_WORDS[1]}" == "model" ]]; then
    COMPREPLY=($(compgen -W "$(corez models 2>/dev/null | grep '^-' | sed 's/^- //')" -- "$cur"))
  elif [[ $COMP_CWORD -ge 2 ]]; then
    COMPREPLY=($(compgen -W "--help --version --model --agent --auto --auto-approve --yolo --verbose" -- "$cur"))
  fi
}
complete -F _corez_completions corez corez-code`;

  const zshScript = `#compdef corez corez-code
_corez() {
  local -a commands
  commands=(
    'chat:Start interactive REPL session'
    'run:Run a task non-interactively'
    'plan:Analyse codebase and return architectural plan'
    'build:Autonomous multi-file implementation'
    'fix:Find and resolve failing tests/build/lint'
    'review:Audit Git diff for bugs and security risks'
    'swarm:Multi-agent DAG task decomposition'
    'status:Show workspace, git branch and config'
    'models:List available/configured AI models'
    'model:View active model or switch to another'
    'agents:List configured CoreZ agent roles'
    'session:Manage sessions'
    'completion:Generate shell completion script'
  )
  _describe 'command' commands
}
compdef _corez corez corez-code`;

  if (shell === 'zsh') {
    console.log(zshScript);
  } else {
    console.log(bashScript);
  }

  if (!args[0]) {
    const detected = process.env.SHELL?.split('/').pop() || 'bash';
    ui.note(`Detected shell: ${detected}. To install, add the output to your ~/.${detected}rc`);
  }
  return 0;
}

function handleSessionCommand(args, options, ui) {
  const sub = args[0];

  if (!sub || sub === 'list') {
    console.log(`\n${styles.bold}Active Sessions${styles.reset}`);
    console.log(`  ${styles.dim}No active sessions found.${styles.reset}`);
    console.log(`  Start one with: ${styles.cyan}corez chat${styles.reset} or ${styles.cyan}corez run "<task>"${styles.reset}\n`);
    return 0;
  }

  if (sub === 'delete') {
    const id = args[1];
    if (!id) {
      ui.error('Session ID required.\nExample: corez session delete <session-id>');
      return 1;
    }
    ui.note(`Session ${id} removed.`);
    return 0;
  }

  ui.error(`Unknown session subcommand: ${sub}\nUsage: corez session list | delete <id>`);
  return 1;
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const { flags, positional } = parseCliArgs(argv);
  const ui = new TerminalUI({ verbose: flags.verbose });
  const execOptions = {
    ...options,
    modelOverride: flags.model,
    autoApprove: flags.autoApprove,
  };

  if (flags.agent) {
    ui.note(`Agent profiles are not implemented yet; ignoring --agent "${flags.agent}".`);
  }

  if (flags.help) {
    printHelp(ui);
    return 0;
  }

  if (flags.version) {
    console.log(`corez-code v${pkg.version}`);
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
    case 'run':
      return handleRunCommand(restArgs.join(' '), options, ui, execOptions);

    case 'status': {
      const statusResult = await handleStatusCommand(restArgs, options, ui);
      return statusResult === false ? 1 : 0;
    }

    case 'models': {
      const modelsResult = await handleModelsCommand(restArgs, options, ui);
      return modelsResult === false ? 1 : 0;
    }

    case 'model':
    case '/model':
    case '/models': {
      const modelResult = await handleModelCommand(restArgs, options, ui);
      return modelResult?.success === false ? 1 : 0;
    }

    case 'agents': {
      const agentsResult = await handleAgentsCommand(restArgs, options, ui);
      return agentsResult === false ? 1 : 0;
    }

    case 'plan':
      if (!validatePrompt('plan', restArgs.join(' '), ui)) return 1;
      return (await handlePlanCommand(restArgs.join(' '), options, ui)) === false ? 1 : 0;

    case 'build':
      if (!validatePrompt('build', restArgs.join(' '), ui)) return 1;
      return (await handleBuildCommand(restArgs.join(' '), options, ui)) === false ? 1 : 0;

    case 'fix':
      return (await handleFixCommand(options, ui)) === false ? 1 : 0;

    case 'review':
      return (await handleReviewCommand(options, ui)) === false ? 1 : 0;

    case 'swarm':
      if (!validatePrompt('swarm', restArgs.join(' '), ui)) return 1;
      return (await handleSwarmCommand(restArgs.join(' '), options, ui)) === false ? 1 : 0;

    case 'session':
      return handleSessionCommand(restArgs, options, ui);

    case 'completion':
      return handleCompletionCommand(restArgs, ui);

    case 'help':
      printHelp(ui);
      return 0;

    default: {
      // Backward compat: corez "task" runs as direct prompt
      const prompt = positional.join(' ');
      return executeTask(prompt, options, ui, execOptions);
    }
  }
}
