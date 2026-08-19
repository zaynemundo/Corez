/* eslint-disable no-empty, no-unused-vars */
// AgentLoop: ReAct turn/step driver inspired by @deepseek-ai/dsh-agent-loop
//
// Implements DSH Agent interface over SessionLog and the HarnessContext seams.
// One loop per sessionId — inbox with next-turn / next-step queues, waterfall
// agent/pre-step and agent/request, streaming assistant/chunk, and tool
// execution through the ToolRegistry pipeline.

import { SessionLog } from './SessionLog.js';
import { BlockAssembler } from '../llm/BlockAssembler.js';

export class Inbox {
  constructor(sessionLog, { onSpliced } = {}) {
    this.sessionLog = sessionLog;
    this.nextTurn = [];
    this.nextStep = [];
    this.onSpliced = onSpliced || (() => {});
  }

  // Cordis-style splice observable for agent/inbox/spliced
  splice(target, start, deleteCount, inserted = []) {
    const queue = target === 'next-turn' ? this.nextTurn : this.nextStep;
    const before = queue.slice();
    const removed = queue.splice(start, deleteCount, ...inserted);
    if (inserted.length || removed.length) {
      try {
        this.onSpliced({ target, start, removedCount: removed.length, inserted: inserted.slice() });
      } catch {}
      // durable inbox mutation event (for replay parity, not model-visible)
      try {
        this.sessionLog.append('agent/inbox/spliced', { target, start, removedCount: removed.length, inserted: inserted.slice() }, { ignorable: true });
      } catch {}
    }
    return removed;
  }

  get hasPending() {
    return this.nextTurn.length > 0 || this.nextStep.length > 0;
  }

  get nextStepMessages() {
    return this.nextStep;
  }

  clear() {
    const hadTurn = this.nextTurn.length;
    const hadStep = this.nextStep.length;
    this.nextTurn.length = 0;
    this.nextStep.length = 0;
    if (hadTurn || hadStep) {
      try { this.onSpliced({ target: 'next-turn', start: 0, removedCount: hadTurn, inserted: [], outcome: 'canceled' }); } catch {}
      try { this.onSpliced({ target: 'next-step', start: 0, removedCount: hadStep, inserted: [], outcome: 'canceled' }); } catch {}
    }
  }

  hasPendingFor(target) {
    return target === 'next-turn' ? this.nextTurn.length > 0 : this.nextStep.length > 0;
  }

  claim(target, turn) {
    // target = 'next-turn' -> claimed = one queued + any next-step context that owes next step? DSH: claim next-step input plus one queued
    // simplified: claim one from nextTurn plus all nextStep
    if (target === 'next-turn') {
      const claimed = [];
      if (this.nextTurn.length > 0) claimed.push(this.nextTurn.shift());
      // next-step items that arrived before turn start also join first step if turn is new?
      // DSH: claimed = next-step + nextTurn[0] . We'll keep simple: first next-turn then next-step
      // But most callers expect claim('next-turn') to drain one next-turn; claim('next-step') to drain next-step
    }
    if (target === 'next-turn') {
      const one = this.nextTurn.shift();
      const stepOwings = this.nextStep.splice(0, this.nextStep.length);
      const claimed = [];
      if (one) claimed.push(one);
      claimed.push(...stepOwings);
      return claimed;
    } else {
      const claimed = this.nextStep.splice(0, this.nextStep.length);
      // also include up to one next-turn if tool-loop forces continuation? DSH: next-turn waits until turn end unless injected. We keep separation.
      return claimed;
    }
  }

  // alternate claim that matches DSH: next-step input plus one queued
  claimCombined(turn) {
    const stepPart = this.nextStep.splice(0, this.nextStep.length);
    const queuedPart = this.nextTurn.length ? [this.nextTurn.shift()] : [];
    return [...stepPart, ...queuedPart];
  }
}

function normalizeUserMessage(input) {
  if (!input) throw new Error('UserMessage is required');
  if (typeof input === 'string') return { role: 'user', content: input };
  if (input.role === 'user' && typeof input.content === 'string') return input;
  return { role: 'user', content: String(input.content ?? JSON.stringify(input)) };
}

export class AgentLoop {
  constructor(options = {}) {
    if (!options.sessionLog) throw new Error('AgentLoop requires sessionLog');
    if (!options.eventBus) throw new Error('AgentLoop requires eventBus');
    if (!options.providerChain) throw new Error('AgentLoop requires providerChain');
    this.sessionLog = options.sessionLog;
    this.eventBus = options.eventBus;
    this.providerChain = options.providerChain;
    this.toolRegistry = options.toolRegistry || null;
    this.systemPromptProvider = options.systemPromptProvider || null;
    this.id = options.sessionId || this.sessionLog.sessionId;
    this.session = this.sessionLog; // alias for DSH parity
    this.options = {
      provider: options.provider || '',
      model: options.model || 'muse-spark-1.2-contributor',
      maxTokens: options.maxTokens
    };
    this.inbox = new Inbox(this.sessionLog, {
      onSpliced: (ev) => this.eventBus.emit({ type: 'agent/inbox/spliced', taskId: this.id, ...ev })
    });
    this._phase = { kind: 'idle', lastTurn: this.sessionLog.lastTurn() };
    this._abort = null;
    this._wakeRequested = false;
    this._activityDone = Promise.resolve();
    this._requestHeaderLogged = false;
    this._toolOutputs = [];
  }

  get status() {
    return this._phase.kind === 'idle' ? 'idle' : 'running';
  }

  // -- Inbox API matching DSH Agent -----------------

  send(message, target = 'next-turn', wakeup = true) {
    const msg = normalizeUserMessage(message);
    const wakingAfterAbort = wakeup && this._phase.kind !== 'idle' && this._abort?.signal.aborted;
    const resolvedTarget = wakingAfterAbort ? 'next-turn' : target;
    this.inbox.splice(resolvedTarget, resolvedTarget === 'next-turn' ? this.inbox.nextTurn.length : this.inbox.nextStep.length, 0, [msg]);
    if (wakeup) this.wakeDriver(wakingAfterAbort);
  }

  followup(input) { this.send(input, 'next-turn', true); }
  steer(input) { this.send(input, 'next-step', true); }
  inject(input) { this.send(input, 'next-step', false); }

  cancel(cause = { kind: 'user' }, opts = {}) {
    if (!opts.keepInbox) {
      this.inbox.clear();
      if (this._phase.kind !== 'idle') this._wakeRequested = false;
    }
    if (this._phase.kind !== 'idle' && this._abort) this._abort.abort(cause);
    this.eventBus.emit({ type: 'agent/cancelled', taskId: this.id, cause, turn: this._phase.turn || 0 });
  }

  async runMaintenance(job) {
    if (this._phase.kind !== 'idle') throw new Error(`agent "${this.id}" already has active work`);
    const done = Promise.withResolvers();
    this._phase = { kind: 'maintenance', abort: new AbortController(), lastTurn: this._phase.lastTurn, wakeRequested: false };
    this._activityDone = done.promise;
    this.eventBus.emit({ type: 'agent/status', taskId: this.id, status: 'idle' });
    try {
      return await job(this._phase.abort.signal);
    } finally {
      this._phase = { kind: 'idle', lastTurn: this._phase.lastTurn };
      if (this._phase.wakeRequested && this.inbox.hasPending) this.wakeDriver();
      done.resolve();
    }
  }

  wakeDriver(wakeAfterAbort = false) {
    if (this._phase.kind !== 'idle') {
      const reason = this._abort?.signal.reason;
      if (reason?.kind !== 'disposed' && (this._phase.kind === 'maintenance' || wakeAfterAbort)) {
        this._wakeRequested = true;
      }
      return;
    }
    const driver = Promise.withResolvers();
    this._activityDone = driver.promise;
    this._abort = new AbortController();
    this._phase = { kind: 'running', abort: this._abort, turn: this._phase.lastTurn, step: 0, wakeRequested: false };
    this.eventBus.emit({ type: 'agent/status', taskId: this.id, status: 'running' });
    this.kick().then(driver.resolve, driver.reject);
  }

  async whenIdle() {
    let act;
    do { await (act = this._activityDone); } while (act !== this._activityDone);
  }

  throwError(error) {
    const turn = this._phase.turn ?? this._phase.lastTurn ?? 0;
    const step = this._phase.step ?? 0;
    this.eventBus.emit({ type: 'agent/error', taskId: this.id, turn, step, error: String(error?.message || error) });
    throw error;
  }

  async kick() {
    try {
      // loop until no more work
      while (await this.turn()) {}
    } catch (_e) {
      // reported; contained
    } finally {
      if (this._phase.kind === 'running') {
        const { turn, wakeRequested } = this._phase;
        this._phase = { kind: 'idle', lastTurn: turn };
        this._abort = null;
        this.eventBus.emit({ type: 'agent/status', taskId: this.id, status: 'idle' });
        if (wakeRequested && this.inbox.hasPending) this.wakeDriver();
      }
    }
  }

  async preStep(target, pos) {
    if (this._phase.kind !== 'running') throw new Error(`agent "${this.id}": pre-step outside running phase`);
    const signal = this._phase.abort.signal;
    const claimed = target === 'next-turn'
      ? this.inbox.claimCombined(pos.turn)
      : this.inbox.claim('next-step', pos.turn);
    // assemble prompt sections (system prompt + tools)
    let assembly = { system: '', tools: [] };
    if (this.systemPromptProvider?.assemble) {
      try { assembly = await this.systemPromptProvider.assemble({ agent: this, signal, turn: pos.turn, step: pos.step }); } catch {}
    } else if (this.systemPromptProvider?.getSections) {
      try { assembly = this.systemPromptProvider.getSections(); } catch {}
    }
    signal.throwIfAborted();
    const decision = await this.eventBus.dispatchWaterfall('agent/pre-step', { messages: claimed, ...pos, signal }, () => Promise.resolve({ kind: 'enter', messages: claimed }));
    signal.throwIfAborted();
    if (decision?.kind === 'reject') return { kind: 'reject' };
    return { kind: 'enter', messages: decision?.messages ?? claimed, assembly };
  }

  async turn() {
    if (this._phase.kind !== 'running') this.throwError(new Error(`agent "${this.id}": turn without driver reservation`));
    const phase = this._phase;
    const { signal } = phase.abort;
    signal.throwIfAborted();
    const turn = phase.turn + 1;
    try { this.sessionLog.append('turn/start', { turn }); } catch (e) { this.throwError(e); }
    this.eventBus.emit({ type: 'turn/start', taskId: this.id, turn });
    phase.turn = turn;
    let turnEnds = null;
    let target = 'next-turn';
    try {
      while (true) {
        signal.throwIfAborted();
        const step = phase.step + 1;
        const decision = await this.preStep(target, { turn, step });
        if (decision.kind === 'reject') { turnEnds = { kind: 'blocked' }; return false; }
        if (turnEnds && decision.messages.length === 0) break;
        if (phase.step === 0 && decision.messages.length === 0) { turnEnds = { kind: 'completed' }; return false; }
        signal.throwIfAborted();
        this.sessionLog.append('step/start', { turn, step });
        this.eventBus.emit({ type: 'step/start', taskId: this.id, turn, step });
        phase.step = step;
        try {
          for (const m of decision.messages) {
            this.sessionLog.append('user/message', m, { surfaceOp: 'append' });
            this.eventBus.emit({ type: 'user/message', taskId: this.id, message: m });
          }
          const stepEnd = await this.step(decision.assembly);
          if (turnEnds === null || turnEnds.kind !== 'max-tokens') turnEnds = stepEnd;
        } finally {
          this.sessionLog.append('step/end', { turn, step });
          this.eventBus.emit({ type: 'step/end', taskId: this.id, turn, step });
        }
        signal.throwIfAborted();
        if (turnEnds && this.inbox.nextStep.length === 0) {
          await this.eventBus.dispatchSerial('agent/turn-stopping', { turn, signal });
          signal.throwIfAborted();
        }
        if (turnEnds && this.inbox.nextStep.length === 0) break;
        target = 'next-step';
      }
    } catch (error) {
      if (signal.aborted) {
        turnEnds = { kind: 'aborted', reason: signal.reason };
        throw error;
      }
      turnEnds = { kind: 'error', error: { message: String(error?.message || error), code: error?.code || 'UNKNOWN' } };
      this.throwError(error);
    } finally {
      try { this.sessionLog.append('turn/end', { turn, reason: turnEnds || { kind: 'completed' } }); this.eventBus.emit({ type: 'turn/end', taskId: this.id, turn, reason: turnEnds || { kind: 'completed' } }); } catch (e) { this.throwError(e); }
    }
    if (!this.inbox.hasPending) return false;
    phase.abort = new AbortController();
    this._abort = phase.abort;
    phase.wakeRequested = false;
    phase.step = 0;
    return true;
  }

  async step(assembly) {
    if (this._phase.kind !== 'running') throw new Error(`agent "${this.id}": step outside running phase`);
    const { turn, step, abort: { signal } } = this._phase;
    signal.throwIfAborted();
    const system = assembly?.system || '';
    const tools = assembly?.tools || this.toolRegistry?.getToolSchemas() || [];

    // Build request + waterflow agent/request
    const boundaryMessages = this.sessionLog.deriveMessages();
    const header = { config: { provider: this.options.provider, model: this.options.model }, ...(system ? { system } : {}), ...(tools.length ? { tools } : {}) };
    // agent/request waterfall may replace config
    let requestConfig = { ...header.config };
    try {
      const decided = await this.eventBus.dispatchWaterfall('agent/request', { turn, step, signal, config: requestConfig, system, tools }, () => Promise.resolve(requestConfig));
      if (decided && typeof decided === 'object') requestConfig = decided;
    } catch {}
    signal.throwIfAborted();
    if (!requestConfig.provider || !requestConfig.model) {
      // fallback to providerChain default
      requestConfig.provider = requestConfig.provider || this.options.provider;
      requestConfig.model = requestConfig.model || this.options.model;
    }
    // log request header when changed
    const lastHeader = this.sessionLog.requestHeader();
    const headerToLog = { config: requestConfig, ...(system ? { system } : {}), ...(tools.length ? { tools } : {}) };
    const headerChanged = !lastHeader || JSON.stringify(lastHeader) !== JSON.stringify(headerToLog);
    if (!this._requestHeaderLogged) {
      this.sessionLog.append('request/header', { header: headerToLog, reason: lastHeader ? 'resume' : 'initial' });
      this._requestHeaderLogged = true;
    } else if (headerChanged) {
      this.sessionLog.append('request/header', { header: headerToLog, reason: 'change' });
    }
    const requestContext = { provider: requestConfig.provider, model: requestConfig.model };
    const prevContext = this.sessionLog.requestContext();
    if (!prevContext || prevContext.provider !== requestContext.provider || prevContext.model !== requestContext.model) {
      this.sessionLog.append('request/context', requestContext);
    }

    // LLM streaming: our providerChain is non-streaming but we emulate chunk seqs for log fidelity
    const genMessages = [...boundaryMessages];
    // if the loop derived messages already include the just-appended user messages, they are there; else inject assembly?
    const fullMessages = genMessages.length ? genMessages : [{ role: 'user', content: 'continue' }];

    // allow llm/stream waterfall to wrap generation
    const doGenerate = async () => {
      const res = await this.providerChain.generate({ taskId: this.id, model: requestConfig.model, messages: fullMessages, tools, signal });
      return res;
    };
    let result;
    try {
      result = await this.eventBus.dispatchWaterfall('llm/stream', { turn, step, request: { provider: requestConfig.provider, model: requestConfig.model, messages: fullMessages }, signal }, doGenerate);
      if (result && result.status === undefined && result.content !== undefined) {
        // waterfall returned raw content
        result = { status: 'completed', content: result.content, toolCalls: result.toolCalls || [] };
      }
    } catch (e) {
      signal.throwIfAborted();
      throw e;
    }

    if (result?.status === 'cancelled' || signal.aborted) throw new DOMException('aborted', 'AbortError');

    // handle retry-scheduled as failure for this step (caller may schedule task retry)
    if (result?.status === 'retry-scheduled' || result?.status === 'retry_scheduled') {
      throw new Error(result.error || `Provider ${result.provider} retry pending`);
    }
    if (result?.status === 'failed') {
      // surface as llm error
      const err = new Error(result.error || 'LLM failed');
      err.code = 'LLM_FAILED';
      throw err;
    }

    const content = result?.content ?? '';
    const toolCalls = result?.toolCalls ?? result?.tool_calls ?? [];

    // emit assistant chunks (one chunk for now; real streaming would push many)
    const chunkSeqs = [];
    if (content) {
      const chunk = { type: 'text', text: content };
      const ev = this.sessionLog.append('assistant/chunk', { turn, step, chunk });
      chunkSeqs.push(ev.seq);
      this.eventBus.emit({ type: 'assistant/chunk', taskId: this.id, turn, step, chunk });
    }

    // assemble assistant message
    const assistantMessage = {
      role: 'assistant',
      content: content || '',
      ...(toolCalls.length ? { tool_calls: toolCalls.map((c) => ({ id: c.id || c.callId || `call_${Math.random().toString(36).slice(2, 6)}`, type: 'function', function: { name: c.name || c.function?.name, arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments || c.args || {}) } })) } : {})
    };
    // also handle tool-call blocks for newer spec
    const isMaxTokens = content.length > 120000;
    this.sessionLog.append('assistant/message', { turn, step, message: assistantMessage }, { surfaceOp: 'append', sourceEventSeqs: chunkSeqs });
    this.eventBus.emit({ type: 'assistant/message', taskId: this.id, turn, step, message: assistantMessage });

    if (isMaxTokens) return { kind: 'max-tokens' };
    if (!toolCalls.length) return { kind: 'completed' };

    // tool execution via registry pipeline
    const calls = toolCalls.map((c) => ({
      callId: c.id || c.callId || `call_${Math.random().toString(36).slice(2,6)}`,
      name: c.name || c.function?.name,
      arguments: typeof c.arguments === 'string' ? c.arguments : typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.arguments || c.args || {})
    }));

    // log tool/call events
    for (const c of calls) {
      this.sessionLog.append('tool/call', { turn, step, callId: c.callId, name: c.name, arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments) });
      this.eventBus.emit({ type: 'tool/call', taskId: this.id, turn, step, callId: c.callId, name: c.name });
    }

    // execute via registry
    let toolResults = [];
    if (this.toolRegistry) {
      for (const c of calls) {
        if (signal.aborted) break;
        let args = c.arguments;
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
        const res = await this.toolRegistry.executeTool(c.name, args, { taskId: this.id, signal, agent: this });
        // normalize tool result message
        const toolContent = res?.content !== undefined ? res.content : JSON.stringify(res);
        const isError = Boolean(res?.error && !res?.success);
        const toolMessage = { role: 'tool', tool_call_id: c.callId, content: typeof toolContent === 'string' ? toolContent : JSON.stringify(toolContent) };
        this.sessionLog.append('tool/result', { turn, step, message: toolMessage, ...(isError ? { error: { name: 'ToolError', code: 'TOOL_FAILED' } } : {}), ...(res?.meta ? { meta: res.meta } : {}) }, { surfaceOp: 'append' });
        this.eventBus.emit({ type: 'tool/result', taskId: this.id, turn, step, callId: c.callId, result: res });
        toolResults.push(res);
        // deferred contexts (tool used exec.deferContext) - push to next-step
        if (res && Array.isArray(res.additionalContexts)) {
          for (const ctx of res.additionalContexts) this.inject(ctx);
        }
      }
    }

    // if any tool asked for continuation, another step will be claimed
    // DSH: return null to continue loop inside turn when tool owes another request
    const shouldContinue = toolResults.length > 0;
    return shouldContinue ? null : { kind: 'completed' };
  }
}
