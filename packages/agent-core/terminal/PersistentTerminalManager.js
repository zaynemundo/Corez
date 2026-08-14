// PersistentTerminalManager: Stateful terminal session management for CoreZ AI.
// Inspired by DeepSeek Harness dsh-terminal / tool-bash-persistent.
// Preserves environment variables, working directories, and long-running sub-shells across tool calls.

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PERMISSION_CATEGORIES } from '../permissions/index.js';

export class PersistentTerminalSession extends EventEmitter {
  constructor(id, options = {}) {
    super();
    this.id = id;
    this.cwd = options.cwd || process.cwd();
    this.env = { ...process.env, ...options.env };
    this.shell = options.shell || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
    this.process = null;
    this.alive = false;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.currentExecution = null;
    this.initProcess();
  }

  initProcess() {
    this.process = spawn(this.shell, [], {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.alive = true;

    this.process.stdout.on('data', (data) => {
      const text = data.toString('utf8');
      this.stdoutBuffer += text;
      this.emit('stdout', text);
      this.#checkCommandCompletion();
    });

    this.process.stderr.on('data', (data) => {
      const text = data.toString('utf8');
      this.stderrBuffer += text;
      this.emit('stderr', text);
    });

    this.process.on('exit', (code) => {
      this.alive = false;
      this.emit('exit', code);
      if (this.currentExecution) {
        this.currentExecution.reject(new Error(`Terminal process exited unexpectedly with code ${code}`));
      }
    });

    this.process.on('error', (err) => {
      this.emit('error', err);
      if (this.currentExecution) {
        this.currentExecution.reject(err);
      }
    });
  }

  async runCommand(command, options = {}) {
    if (!this.alive || !this.process) {
      this.initProcess();
    }

    if (this.currentExecution) {
      throw new Error(`Terminal "${this.id}" is currently busy executing another command.`);
    }

    const timeoutMs = options.timeoutMs || 60_000;
    const marker = `__COREZ_END_${Date.now()}_${Math.random().toString(36).slice(2, 8)}__`;

    return new Promise((resolve, reject) => {
      let timer = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.currentExecution = null;
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          cleanup();
          reject(new Error(`Command timed out after ${timeoutMs}ms: "${command}"`));
        }, timeoutMs);
      }

      this.currentExecution = {
        marker,
        resolve: (val) => {
          cleanup();
          resolve(val);
        },
        reject: (err) => {
          cleanup();
          reject(err);
        }
      };

      this.stdoutBuffer = '';
      this.stderrBuffer = '';

      // Send command followed by echo marker with exit code
      if (process.platform === 'win32') {
        this.process.stdin.write(`${command}\r\nWrite-Output "${marker}:$LASTEXITCODE"\r\n`);
      } else {
        this.process.stdin.write(`${command}\necho "${marker}:$?"\n`);
      }
    });
  }

  #checkCommandCompletion() {
    if (!this.currentExecution) return;

    const { marker, resolve } = this.currentExecution;
    const markerIdx = this.stdoutBuffer.indexOf(marker);

    if (markerIdx !== -1) {
      const outputBeforeMarker = this.stdoutBuffer.slice(0, markerIdx).trim();
      const markerTail = this.stdoutBuffer.slice(markerIdx + marker.length);
      const exitCodeMatch = markerTail.match(/^:(-?\d+)/);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;
      const stderr = this.stderrBuffer.trim();

      this.stdoutBuffer = '';
      this.stderrBuffer = '';

      resolve({
        stdout: outputBeforeMarker,
        stderr,
        exitCode,
        success: exitCode === 0
      });
    }
  }

  kill() {
    if (this.process && this.alive) {
      try {
        this.process.kill();
      } catch {
        // ignore
      }
    }
    this.alive = false;
  }
}

export class PersistentTerminalManager {
  constructor(options = {}) {
    this.defaultCwd = options.cwd || process.cwd();
    this.terminals = new Map();
  }

  getOrCreateTerminal(id = 'default', options = {}) {
    if (!this.terminals.has(id)) {
      const term = new PersistentTerminalSession(id, {
        cwd: options.cwd || this.defaultCwd,
        env: options.env,
        shell: options.shell
      });
      this.terminals.set(id, term);
    }
    return this.terminals.get(id);
  }

  async runCommand(id = 'default', command, options = {}) {
    const term = this.getOrCreateTerminal(id, options);
    const result = await term.runCommand(command, options);
    return {
      terminalId: id,
      ...result
    };
  }

  listTerminals() {
    return Array.from(this.terminals.entries()).map(([id, term]) => ({
      id,
      cwd: term.cwd,
      alive: term.alive
    }));
  }

  killTerminal(id) {
    const term = this.terminals.get(id);
    if (term) {
      term.kill();
      this.terminals.delete(id);
    }
  }

  disposeAll() {
    for (const term of this.terminals.values()) {
      term.kill();
    }
    this.terminals.clear();
  }
}

/**
 * Creates the `exec_persistent_command` tool for CoreZ ToolRegistry.
 */
export function createPersistentCommandTool(terminalManager) {
  return {
    name: 'exec_persistent_command',
    category: PERMISSION_CATEGORIES.EXECUTE,
    description: 'Execute a command in a persistent stateful terminal session, preserving environment variables and working directory state.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        terminalId: { type: 'string', description: 'Optional persistent terminal identifier (default: "default")' },
        timeoutMs: { type: 'number', description: 'Optional timeout in milliseconds (default: 60000)' }
      },
      required: ['command']
    },
    execute: async ({ command, terminalId = 'default', timeoutMs = 60_000 }) => {
      try {
        const result = await terminalManager.runCommand(terminalId, command, { timeoutMs });
        return {
          success: result.exitCode === 0,
          ...result
        };
      } catch (err) {
        return {
          success: false,
          error: err.message || 'Persistent command execution failed.'
        };
      }
    }
  };
}
