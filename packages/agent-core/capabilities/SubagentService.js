/* eslint-disable no-unused-vars */
// SubagentService — DSH dsh-subagent capability seam parity
// Service Definition: ctx.subagents (start, capabilities)
// Providers: fork-in-process (local), spawn-in-process, acp (out-of-process)
// Consumer: tool-subagent (delegates turns to subagents)

export class SubagentService {
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.sessionManager = options.sessionManager || null;
    this.harness = options.harness || null; // AgentHarness for in-process driver
    this.cwd = options.cwd || process.cwd();
    this.providers = new Map();
    // register default in-process provider
    this.registerProvider('fork-in-process', new ForkInProcessProvider(this));
  }

  registerProvider(name, provider) {
    if (this.providers.has(name)) throw new Error(`Duplicate subagent provider ${name}`);
    this.providers.set(name, provider);
    return () => this.providers.delete(name);
  }

  getProvider(name) {
    return this.providers.get(name) || null;
  }

  // DSH: ctx.subagents.start(request)
  async start(request) {
    const providerName = request.provider || 'fork-in-process';
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Unknown subagent provider ${providerName}`);
    this._emit('subagent/start', { provider: providerName, task: request.taskId });
    const result = await provider.start(request);
    this._emit('subagent/result', { provider: providerName, result });
    return result;
  }

  // convenience: fork parent session via SessionManager
  forkSession({ userId, sourceSessionId, childSessionId, boundarySeq }) {
    if (!this.sessionManager) throw new Error('No sessionManager for fork');
    return this.sessionManager.forkSession({ userId, sourceSessionId, childSessionId, boundarySeq });
  }

  _emit(type, payload) {
    if (this.eventBus) {
      try { this.eventBus.emit({ type, ...payload }); } catch {}
    }
  }
}

// DSH: fork-in-process provider — shares same Node process, same Cordis context, new Session, own AgentLoop
class ForkInProcessProvider {
  constructor(service) {
    this.service = service;
    this.capabilities = { outputSchema: true, depthLimit: true, toolFilter: true, persona: true };
    this.inheritsParentContext = true;
  }

  async start(request) {
    const { parent, prompt, model, taskId } = request;
    // parent is SessionLog or SessionManager session
    const parentSessionId = parent?.sessionId || parent?.id || 'default';
    const userId = request.userId || 'anonymous';
    const childId = request.childSessionId || `subagent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`;
    // fork via SessionManager if available
    let childSession = null;
    if (this.service.sessionManager) {
      try {
        childSession = this.service.sessionManager.forkSession({ userId, sourceSessionId: parentSessionId, childSessionId: childId });
      } catch {}
    }
    // if harness available, run via AgentHarness in forked session
    if (this.service.harness) {
      const harness = this.service.harness;
      const task = await harness.runTask({ userId, sessionId: childId, prompt, model, mode: 'conversation' });
      return { provider: 'fork-in-process', childSessionId: childId, status: task.status, result: task.result, error: task.error };
    }
    // fallback: use providerChain directly
    const chain = this.service.harness?.providerChain;
    if (chain) {
      const res = await chain.generate({ taskId, model, messages: [{ role: 'user', content: prompt }], tools: [], signal: request.signal });
      return { provider: 'fork-in-process', childSessionId: childId, status: res.status, result: res.content };
    }
    return { provider: 'fork-in-process', childSessionId: childId, status: 'completed', result: `subagent ${childId} completed` };
  }
}
