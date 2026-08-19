/* eslint-disable no-empty, no-unused-vars */
// SubprocessService — DSH dsh-subprocess capability seam parity
// Service Definition: ctx.subprocess.spawn(command, opts)
// Provider: local process-tree provider (spawnSync / spawn)
// Consumers: ctx.shell, ctx.terminals, LSP, etc. share one execution world.

import { spawnSync, spawn } from 'node:child_process';
import { resolveWorkspacePath } from '../runtime/pathResolver.js';

function commandTimeout() {
  const raw = Number(process.env.COREZ_COMMAND_TIMEOUT_MS || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export class SubprocessService {
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.cwd = options.cwd || process.cwd();
    this.sandbox = options.sandbox || null; // DSH: ctx.sandbox wraps argv before spawning
  }

  // DSH: subprocess local provider spawns with policy
  spawn(command, opts = {}) {
    const cwd = opts.cwd || this.cwd;
    const resolved = resolveWorkspacePath(cwd, '.');
    const execCwd = resolved.ok ? resolved.path : cwd;
    const timeout = opts.timeout ?? commandTimeout();

    // sandbox wraps argv before spawn (DSH: consumers wrap argv before spawning)
    let finalCommand = command;
    if (this.sandbox && typeof this.sandbox.wrap === 'function') {
      finalCommand = this.sandbox.wrap(command, { cwd: execCwd });
    }

    this._emit('subprocess/spawn', { command: finalCommand, cwd: execCwd });

    try {
      const result = spawnSync(finalCommand, { cwd: execCwd, encoding: 'utf8', timeout, shell: true });
      if (result.status !== 0) {
        return {
          command: finalCommand,
          stdout: result.stdout ? result.stdout.trim() : '',
          stderr: result.stderr ? result.stderr.trim() : '',
          error: result.error?.message || `exit ${result.status}`,
          exitCode: result.status ?? 1
        };
      }
      return { command: finalCommand, stdout: result.stdout.trim(), exitCode: 0 };
    } catch (err) {
      return { command: finalCommand, error: err.message, exitCode: 1 };
    }
  }

  // DSH: persistent spawn via pty (delegated to TerminalService)
  spawnPty(command, opts = {}) {
    // fallback to spawn for now; TerminalService handles persistent sessions
    return this.spawn(command, opts);
  }

  _emit(type, payload) {
    if (this.eventBus) {
      try { this.eventBus.emit({ type, ...payload }); } catch {}
    }
  }
}
