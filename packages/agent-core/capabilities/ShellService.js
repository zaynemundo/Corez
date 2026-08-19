/* eslint-disable no-empty, no-unused-vars */
// ShellService — DSH dsh-shell / dsh-shell capability seam parity
// Service Definition: ctx.shell.exec(command, opts)
// Provider: local shell via ctx.subprocess (which spawns via child_process)
// Consumer: run_command tool, exec_persistent_command, etc.

import { spawnSync, execSync } from 'node:child_process';
import { resolveWorkspacePath } from '../runtime/pathResolver.js';

function commandTimeout() {
  const raw = Number(process.env.COREZ_COMMAND_TIMEOUT_MS || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export class ShellService {
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.cwd = options.cwd || process.cwd();
    this.subprocess = options.subprocess || null; // DSH: local shell spawns through ctx.subprocess
  }

  // DSH: ctx.shell.exec(spec, opts) where spec is { command, cwd, env }
  exec(spec, opts = {}) {
    const command = typeof spec === 'string' ? spec : spec.command;
    const cwd = spec.cwd || opts.cwd || this.cwd;
    const resolvedCwd = resolveWorkspacePath(cwd, '.');
    const execCwd = resolvedCwd.ok ? resolvedCwd.path : cwd;
    this._emit('shell/exec', { command, cwd: execCwd });

    // DSH: shell local provider spawns through ctx.subprocess; we do direct exec for parity
    if (this.subprocess && typeof this.subprocess.spawn === 'function') {
      // delegate via subprocess capability if available (unified execution world)
      return this.subprocess.spawn(command, { cwd: execCwd, timeout: commandTimeout() });
    }

    try {
      const stdout = execSync(command, { cwd: execCwd, encoding: 'utf8', timeout: commandTimeout() });
      return { command, stdout: stdout.trim(), exitCode: 0 };
    } catch (err) {
      return {
        command,
        stdout: err.stdout ? err.stdout.trim() : '',
        stderr: err.stderr ? err.stderr.trim() : '',
        error: err.message,
        exitCode: err.status || 1
      };
    }
  }

  // convenience for tool consumers
  runCommand(command, opts = {}) {
    return this.exec(command, opts);
  }

  _emit(type, payload) {
    if (this.eventBus) {
      try { this.eventBus.emit({ type, ...payload }); } catch {}
    }
  }
}
