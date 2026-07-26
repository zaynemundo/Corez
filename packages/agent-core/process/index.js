import { spawn } from 'node:child_process';
import { CorezError, ERROR_CODES } from '../contracts/errors.js';

const ENVIRONMENT_ALLOWLIST = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot',
  'ComSpec', 'PATHEXT', 'LANG', 'LC_ALL', 'TERM', 'CI'
]);
const SENSITIVE_ENVIRONMENT_KEY = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;

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

function commandError(code, message, details) {
  return new CorezError(code, message, details);
}

export function runProcess({
  file,
  args = [],
  cwd,
  env = buildCommandEnv(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  signal
} = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(commandError(ERROR_CODES.COMMAND_CANCELLED, 'Command was cancelled.', { file }));
      return;
    }

    const outputLimit = Number.isFinite(maxOutputBytes)
      ? Math.max(0, Math.floor(maxOutputBytes))
      : DEFAULT_MAX_OUTPUT_BYTES;
    const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : null;
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let truncated = false;
    let termination;
    let settled = false;
    let child;
    let timer;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
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

    const terminate = reason => {
      if (termination || settled) return;
      termination = reason;
      child?.kill();
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
    const onError = error => settle(reject, error);
    const onClose = (exitCode, exitSignal) => {
      if (termination === 'timeout') {
        settle(reject, commandError(ERROR_CODES.COMMAND_TIMEOUT, 'Command timed out.', { file, timeoutMs }));
        return;
      }
      if (termination === 'cancelled') {
        settle(reject, commandError(ERROR_CODES.COMMAND_CANCELLED, 'Command was cancelled.', { file }));
        return;
      }
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
        env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      settle(reject, error);
      return;
    }

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('error', onError);
    child.once('close', onClose);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (timeout) timer = setTimeout(() => terminate('timeout'), timeout);
  });
}
