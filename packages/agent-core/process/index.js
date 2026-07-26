import { spawn } from 'node:child_process';
import { CorezError, ERROR_CODES } from '../contracts/errors.js';

const ENVIRONMENT_ALLOWLIST = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot',
  'ComSpec', 'PATHEXT', 'LANG', 'LC_ALL', 'TERM', 'CI'
]);
const SENSITIVE_ENVIRONMENT_KEY = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;
const TERMINATION_GRACE_MS = 100;
const FORCED_TERMINATION_SETTLEMENT_MS = 100;
const BUILT_COMMAND_ENVIRONMENTS = new WeakSet();

export function buildCommandEnv(source = process.env, additions = {}) {
  const environment = {};

  for (const key of ENVIRONMENT_ALLOWLIST) {
    const value = source?.[key];
    if (value !== undefined && value !== null) environment[key] = String(value);
  }

  for (const [key, value] of Object.entries(additions || {})) {
    if (SENSITIVE_ENVIRONMENT_KEY.test(key) || value === undefined || value === null) continue;
    environment[key] = String(value);
  }

  Object.freeze(environment);
  BUILT_COMMAND_ENVIRONMENTS.add(environment);
  return environment;
}

function appendBounded(buffer, chunk, maxOutputBytes) {
  const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const available = Math.max(0, maxOutputBytes - buffer.length);
  const appended = available === 0 ? Buffer.alloc(0) : value.subarray(0, available);
  return {
    buffer: appended.length === 0 ? buffer : Buffer.concat([buffer, appended]),
    truncated: value.length > available
  };
}

function commandError(code, message, details, cause) {
  return new CorezError(code, message, details, cause ? { cause } : undefined);
}

function invalidArgument(message, details, cause) {
  return commandError(ERROR_CODES.TOOL_ARGUMENT_INVALID, message, details, cause);
}

function validateRunProcessInput({ file, args, cwd, timeoutMs, maxOutputBytes }) {
  if (typeof file !== 'string' || file.trim() === '') {
    return invalidArgument('Command file must be a non-empty string.', { file });
  }
  if (!Array.isArray(args) || args.some(argument => typeof argument !== 'string')) {
    return invalidArgument('Command arguments must be an array of strings.', { file });
  }
  if (typeof cwd !== 'string' || cwd.trim() === '') {
    return invalidArgument('Command cwd must be a non-empty string.', { file, cwd });
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return invalidArgument('Command timeoutMs must be a finite positive number.', { file, timeoutMs });
  }
  if (!Number.isFinite(maxOutputBytes) || maxOutputBytes < 0) {
    return invalidArgument('Command maxOutputBytes must be a finite non-negative number.', {
      file,
      maxOutputBytes
    });
  }
  return null;
}

export function runProcess({
  file,
  args = [],
  cwd,
  env = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  signal
} = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(commandError(ERROR_CODES.COMMAND_CANCELLED, 'Command was cancelled.', { file }));
      return;
    }

    const invalidInput = validateRunProcessInput({ file, args, cwd, timeoutMs, maxOutputBytes });
    if (invalidInput) {
      reject(invalidInput);
      return;
    }

    const outputLimit = Math.floor(maxOutputBytes);
    const childEnv = BUILT_COMMAND_ENVIRONMENTS.has(env) ? env : buildCommandEnv(env);
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let truncated = false;
    let termination;
    let terminationCause;
    let settled = false;
    let child;
    let timeoutTimer;
    let forceKillTimer;
    let forcedSettlementTimer;

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (forcedSettlementTimer) clearTimeout(forcedSettlementTimer);
      signal?.removeEventListener('abort', onAbort);
      child?.stdout?.removeListener('data', onStdout);
      child?.stderr?.removeListener('data', onStderr);
      child?.removeListener('error', onError);
      child?.removeListener('close', onClose);
    };

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    const settleTerminal = () => {
      const timeout = termination === 'timeout';
      settle(reject, commandError(
        timeout ? ERROR_CODES.COMMAND_TIMEOUT : ERROR_CODES.COMMAND_CANCELLED,
        timeout ? 'Command timed out.' : 'Command was cancelled.',
        {
          file,
          ...(timeout ? { timeoutMs } : {}),
          ...(terminationCause ? { cause: terminationCause.message } : {})
        },
        terminationCause
      ));
    };

    const sendKill = killSignal => {
      try {
        if (child?.kill(killSignal) === false) {
          terminationCause ||= new Error(`Failed to send ${killSignal} to command process.`);
        }
      } catch (error) {
        terminationCause ||= error;
      }
    };

    const terminate = reason => {
      if (termination || settled) return;
      termination = reason;
      sendKill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        sendKill('SIGKILL');
        forcedSettlementTimer = setTimeout(settleTerminal, FORCED_TERMINATION_SETTLEMENT_MS);
      }, TERMINATION_GRACE_MS);
    };

    const onStdout = chunk => {
      const captured = appendBounded(stdout, chunk, outputLimit);
      stdout = captured.buffer;
      truncated ||= captured.truncated;
    };
    const onStderr = chunk => {
      const captured = appendBounded(stderr, chunk, outputLimit);
      stderr = captured.buffer;
      truncated ||= captured.truncated;
    };
    const onAbort = () => terminate('cancelled');
    const onError = error => {
      if (termination) {
        terminationCause ||= error;
        return;
      }
      settle(reject, invalidArgument('Unable to start command process.', {
        file,
        cwd,
        cause: error?.message
      }, error));
    };
    const onClose = (exitCode, exitSignal) => {
      if (termination) return settleTerminal();
      settle(resolve, {
        exitCode,
        signal: exitSignal,
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
        truncated
      });
    };

    try {
      child = spawn(file, args, {
        cwd,
        env: childEnv,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      settle(reject, invalidArgument('Unable to start command process.', {
        file,
        cwd,
        cause: error?.message
      }, error));
      return;
    }

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.on('error', onError);
    child.once('close', onClose);
    signal?.addEventListener('abort', onAbort, { once: true });
    timeoutTimer = setTimeout(() => terminate('timeout'), timeoutMs);
  });
}
