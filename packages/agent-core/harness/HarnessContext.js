/* eslint-disable no-empty, no-unused-vars */
// HarnessContext: Cordis-inspired lightweight plugin context for CoreZ
//
// Provides the shared `ctx` surface that DSH calls `Context`:
// - ctx.tools       -> ToolRegistry (Service Definition/Provider/Consumer) 
// - ctx.sessions    -> SessionManager + per-session SessionLog registry
// - ctx.llm         -> LLM seam (ProviderChain adapters)
// - ctx.fs / ctx.shell / ctx.terminals / ctx.subagents / ctx.systemPrompt / ctx.approval
// - ctx.get(name)   -> optional service lookup (ctx.llm may be absent)
// - ctx.effect / ctx.on / ctx.waterfall / ctx.serial as effect-bound registrations
//
// Registrations are effects: every handler is disposed when its plugin unloads
// (dispose returned by effect/on). No privileged core: plugins mount beside each
// other via ctx.plugin().

import { EventBus } from './EventBus.js';
import { SessionLog } from './SessionLog.js';
import { SessionManager } from './SessionManager.js';

export class HarnessContext {
  constructor(options = {}) {
    this.eventBus = options.eventBus || new EventBus();
    this.sessionManager = options.sessionManager || new SessionManager();
    this.toolRegistry = options.toolRegistry || null;
    this.providerChain = options.providerChain || null;
    this.systemPrompt = options.systemPrompt || null;
    this.fsProvider = options.fsProvider || null;
    this.shellProvider = options.shellProvider || null;
    this.subagentProvider = options.subagentProvider || null;
    this.terminalProvider = options.terminalProvider || null;

    // per-session logs (durable, in-memory projection)
    this._sessionLogs = new Map();

    // service map for ctx.get
    this._services = new Map();
    if (this.toolRegistry) this._services.set('tools', this.toolRegistry);
    if (this.sessionManager) this._services.set('sessions', this.sessionManager);
    if (this.providerChain) this._services.set('llm', this.providerChain);
    if (this.systemPrompt) this._services.set('systemPrompt', this.systemPrompt);
    if (this.fsProvider) this._services.set('fs', this.fsProvider);
    if (this.shellProvider) this._services.set('shell', this.shellProvider);
    if (this.subagentProvider) this._services.set('subagents', this.subagentProvider);
    if (this.terminalProvider) this._services.set('terminals', this.terminalProvider);

    // capabilities dir for ctx.llm.listModels etc (future)
    this._capabilities = new Map();
  }

  // Cordis-style service accessors
  get tools() { return this._services.get('tools'); }
  get sessions() { return this._services.get('sessions'); }
  get llm() { return this._services.get('llm'); }
  get systemPromptSvc() { return this._services.get('systemPrompt'); }
  get fs() { return this._services.get('fs'); }
  get shell() { return this._services.get('shell'); }
  get subagents() { return this._services.get('subagents'); }

  get(name) {
    return this._services.get(name) ?? null;
  }

  registerService(name, service) {
    if (this._services.has(name)) throw new Error(`Service "${name}" already registered`);
    this._services.set(name, service);
    return () => this._services.delete(name);
  }

  // effect / event shims delegating to EventBus so plugins can do ctx.effect()
  effect(factory) {
    return this.eventBus.effect(() => factory(this));
  }

  on(eventType, handler) {
    return this.eventBus.on(eventType, handler);
  }

  waterfall(eventType, handler) {
    return this.eventBus.waterfall(eventType, handler);
  }

  serial(eventType, handler) {
    return this.eventBus.serial(eventType, handler);
  }

  parallel(eventType, handler) {
    return this.eventBus.parallel(eventType, handler);
  }

  // session log factory (per-task / per-session)
  getSessionLog(sessionId, opts = {}) {
    const key = String(sessionId || 'default');
    if (!this._sessionLogs.has(key)) {
      const log = new SessionLog({ sessionId: key, header: opts.header || {}, seed: opts.seed || [] });
      this._sessionLogs.set(key, log);
    }
    return this._sessionLogs.get(key);
  }

  createSessionLog(sessionId, opts = {}) {
    const key = String(sessionId || `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`);
    const log = new SessionLog({ sessionId: key, header: opts.header || {}, seed: opts.seed || [] });
    this._sessionLogs.set(key, log);
    return log;
  }

  // plugin mounting (simple): plugin is {name, inject?, apply(ctx, config)}
  plugin(pluginSpec, config = {}) {
    if (typeof pluginSpec === 'function') {
      const inject = pluginSpec.inject || [];
      for (const dep of inject) if (!this._services.has(dep)) throw new Error(`Plugin requires ${dep}`);
      const dispose = pluginSpec(this, config);
      if (typeof dispose === 'function') this._disposers.push(dispose);
      return dispose;
    }
    if (pluginSpec && typeof pluginSpec.apply === 'function') {
      const inject = pluginSpec.inject || [];
      for (const dep of inject) if (!this._services.has(dep)) throw new Error(`Plugin "${pluginSpec.name||'anonymous'}" requires ${dep}`);
      pluginSpec.apply(this, config);
      return () => {};
    }
    throw new Error('Unsupported plugin spec');
  }

  _disposers = [];

  dispose() {
    for (const d of this._disposers) try { d(); } catch {}
    this.eventBus.disposeAll();
  }
}
