/* eslint-disable no-empty, no-unused-vars */
// HarnessContext: Cordis-inspired plugin context for CoreZ
//
// Provides the shared `ctx` surface that DSH calls `Context`:
// - ctx.tools       -> ToolRegistry (Service Definition/Provider/Consumer)
// - ctx.sessions    -> SessionManager + per-session SessionLog registry
// - ctx.llm         -> LLM seam (ProviderChain adapters)
// - ctx.fs / ctx.shell / ctx.terminals / ctx.subagents / ctx.systemPrompt / ctx.approval
// - ctx.get(name)   -> optional service lookup (ctx.llm may be absent)
// - ctx.effect / ctx.on / ctx.waterfall / ctx.serial as effect-bound registrations
// - ctx.inject(deps, factory) -> defers until deps exist (Cordis topology)
// - ctx.extend({agent}) / ctx.fork() / ctx.isolate() -> scoped child contexts
// - ctx.plugin(spec, config) -> respects inject, tracks disposers
//
// Registrations are effects: every handler is disposed when its plugin unloads
// (dispose returned by effect/on). No privileged core: plugins mount beside each
// other via ctx.plugin(). Child scopes shadow parent services.

import { EventBus } from './EventBus.js';
import { SessionLog } from './SessionLog.js';
import { SessionManager } from './SessionManager.js';
import { LlmService } from '../llm/LlmService.js';

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
    this._parent = options._parent || null;
    this._scopeKey = options._scopeKey || null;
    this._scopeAgent = options._scopeAgent || null;

    // per-session logs (durable, in-memory projection)
    this._sessionLogs = options._sessionLogs || new Map();

    // service map for ctx.get — child shadows parent
    this._services = new Map();
    this._pendingInjects = [];
    if (!this._parent) {
      if (this.toolRegistry) this._services.set('tools', this.toolRegistry);
      if (this.sessionManager) this._services.set('sessions', this.sessionManager);
      if (this.providerChain) this._services.set('llm', this.providerChain);
      if (this.systemPrompt) this._services.set('systemPrompt', this.systemPrompt);
      if (this.fsProvider) this._services.set('fs', this.fsProvider);
      if (this.shellProvider) this._services.set('shell', this.shellProvider);
      if (this.subagentProvider) this._services.set('subagents', this.subagentProvider);
      if (this.terminalProvider) this._services.set('terminals', this.terminalProvider);
    } else {
      // child inherits parent services lazily via get()
    }

    this._capabilities = new Map();
    this._disposers = [];
    this._children = new Set();
  }

  // Cordis-style service accessors
  get tools() { return this.get('tools'); }
  get sessions() { return this.get('sessions'); }
  get llm() { return this.get('llm'); }
  get systemPromptSvc() { return this.get('systemPrompt'); }
  get fs() { return this.get('fs'); }
  get shell() { return this.get('shell'); }
  get subagents() { return this.get('subagents'); }

  get(name) {
    if (this._services.has(name)) return this._services.get(name);
    if (this._parent) return this._parent.get(name);
    return null;
  }

  // ctx.get is strict for optional services; property proxy is topology-sensitive
  // (mirrors DSH docs: use ctx.get for optional, ctx.<key> for declared inject)
  has(name) {
    return this.get(name) !== null;
  }

  registerService(name, service) {
    if (this._services.has(name)) throw new Error(`Service "${name}" already registered on this context`);
    this._services.set(name, service);
    // wake pending injects that waited for this service
    this._flushPendingInjects();
    // bubble to parent pending if child registered? parent doesn't need
    return () => {
      this._services.delete(name);
    };
  }

  _flushPendingInjects() {
    const still = [];
    for (const entry of this._pendingInjects) {
      const ready = entry.deps.every((d) => this.get(d) !== null);
      if (ready) {
        try {
          const dispose = entry.factory(this);
          if (typeof dispose === 'function') this._disposers.push(dispose);
        } catch (_e) {}
      } else still.push(entry);
    }
    this._pendingInjects = still;
    // also flush children
    for (const child of this._children) child._flushPendingInjects();
  }

  // ctx.inject(deps, factory) — DSH: plugin waits until deps exist
  // Also supports plugin.inject static field via ctx.plugin handling.
  inject(deps, factory) {
    if (typeof deps === 'string') deps = [deps];
    // overload: inject(factory) where factory.inject defines deps
    if (typeof factory === 'undefined' && typeof deps === 'function') {
      factory = deps;
      deps = factory.inject || [];
    }
    // simple array form: inject(['tools'], ctx => { ... })
    if (Array.isArray(deps) && typeof factory === 'function') {
      const ready = deps.every((d) => this.get(d) !== null);
      if (ready) {
        const dispose = factory(this);
        if (typeof dispose === 'function') {
          this._disposers.push(dispose);
          return dispose;
        }
        return () => {};
      }
      // defer
      const entry = { deps, factory };
      this._pendingInjects.push(entry);
      return () => {
        const idx = this._pendingInjects.indexOf(entry);
        if (idx !== -1) this._pendingInjects.splice(idx, 1);
      };
    }
    throw new Error('ctx.inject requires (deps, factory) or factory with .inject');
  }

  // effect / event shims delegating to EventBus so plugins can do ctx.effect()
  effect(factory) {
    const disposer = this.eventBus.effect(() => factory(this));
    this._disposers.push(disposer);
    return disposer;
  }

  on(eventType, handler) {
    const off = this.eventBus.on(eventType, handler);
    this._disposers.push(off);
    return off;
  }

  waterfall(eventType, handler) {
    const off = this.eventBus.waterfall(eventType, handler);
    this._disposers.push(off);
    return off;
  }

  serial(eventType, handler) {
    const off = this.eventBus.serial(eventType, handler);
    this._disposers.push(off);
    return off;
  }

  parallel(eventType, handler) {
    const off = this.eventBus.parallel(eventType, handler);
    this._disposers.push(off);
    return off;
  }

  // ctx.extend({agent, ...}) — create child that shadows parent, shares bus
  extend(extra = {}) {
    const child = new HarnessContext({
      eventBus: this.eventBus,
      sessionManager: this.sessionManager,
      toolRegistry: this.toolRegistry,
      providerChain: this.providerChain,
      _parent: this,
      _scopeKey: extra.agent ? `agent:${extra.agent.id || extra.agent.sessionId || 'anon'}` : null,
      _scopeAgent: extra.agent || null,
      _sessionLogs: this._sessionLogs
    });
    // copy extra services
    for (const [k, v] of Object.entries(extra)) {
      if (k === 'agent') continue;
      child._services.set(k, v);
    }
    this._children.add(child);
    return child;
  }

  // fork() creates isolated child with its own service map but same bus
  fork() {
    return this.extend({});
  }

  // isolate realm for per-session agent preset (DSH: service row needs isolate)
  isolate(agent) {
    return this.extend({ agent });
  }

  // withInitiator: run fn with agent as initiator (for ctx.agents.withInitiator parity)
  withInitiator(agent, fn) {
    const child = this.isolate(agent);
    try {
      return fn(child);
    } finally {
      // keep child for potential scoped registrations; caller disposes
    }
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

  // plugin mounting: respects inject, tracks disposers
  plugin(pluginSpec, config = {}) {
    // function plugin with optional inject + Config
    if (typeof pluginSpec === 'function') {
      const inject = pluginSpec.inject || [];
      const needs = Array.isArray(inject) ? inject : [];
      const missing = needs.filter((d) => this.get(d) === null);
      if (missing.length) {
        // defer until deps ready (Cordis wait)
        return this.inject(needs, (ctx) => pluginSpec(ctx, config));
      }
      const dispose = pluginSpec(this, config);
      if (typeof dispose === 'function') {
        this._disposers.push(dispose);
        return dispose;
      }
      return () => {};
    }
    // object plugin {name, inject, apply(ctx, config)}
    if (pluginSpec && typeof pluginSpec.apply === 'function') {
      const inject = pluginSpec.inject || [];
      const needs = Array.isArray(inject) ? inject : [];
      const missing = needs.filter((d) => this.get(d) === null);
      if (missing.length) {
        return this.inject(needs, (ctx) => pluginSpec.apply(ctx, config));
      }
      const maybeDispose = pluginSpec.apply(this, config);
      if (typeof maybeDispose === 'function') {
        this._disposers.push(maybeDispose);
        return maybeDispose;
      }
      return () => {};
    }
    throw new Error('Unsupported plugin spec');
  }

  dispose() {
    for (const d of [...this._disposers]) {
      try { d(); } catch {}
    }
    this._disposers = [];
    for (const child of [...this._children]) {
      try { child.dispose(); } catch {}
    }
    this._children.clear();
    this.eventBus.disposeAll();
  }
}
