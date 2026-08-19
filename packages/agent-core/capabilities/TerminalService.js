/* eslint-disable no-empty, no-unused-vars */
// TerminalService — DSH dsh-terminal capability seam parity
// Service Definition: ctx.terminals (persistent terminal sessions)
// Provider: PersistentTerminalManager (already exists) wrapped as dsh-terminal provider
// Consumer: dsh-tool-terminal (exec_persistent_command)

import { PersistentTerminalManager } from '../terminal/PersistentTerminalManager.js';

export class TerminalService {
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.manager = options.manager || new PersistentTerminalManager();
    this.cwd = options.cwd || process.cwd();
  }

  // DSH: ctx.terminals.create(sessionId, opts)
  create(sessionId, opts = {}) {
    // PersistentTerminalManager is per-task, we delegate
    this._emit('terminal/create', { sessionId });
    return { sessionId, manager: this.manager };
  }

  exec(sessionId, command, opts = {}) {
    this._emit('terminal/exec', { sessionId, command });
    // delegate to manager's tool (exec_persistent_command uses manager directly)
    // For now, call runCommand via manager's internal
    return this.manager; // DSH: provider returns handle; tool consumes it
  }

  getManager() {
    return this.manager;
  }

  _emit(type, payload) {
    if (this.eventBus) {
      try { this.eventBus.emit({ type, ...payload }); } catch {}
    }
  }
}
