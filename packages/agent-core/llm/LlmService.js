/* eslint-disable no-empty, no-unused-vars */
// LlmService — DSH dsh-llm parity (Service Definition)
// Wraps ProviderChain with prepareCall / stream / adapter metadata,
// BlockAssembler integration, and reasoning/maxTokens/contextWindow handling.

import { BlockAssembler } from './BlockAssembler.js';

export class LlmService {
  constructor(options = {}) {
    this.providerChain = options.providerChain || null;
    // adapter registry: provider -> { config, retryPolicy, contextWindow, models }
    this.adapters = new Map();
    if (this.providerChain) {
      for (const a of this.providerChain.adapters || []) {
        this.adapters.set(a.id || a.provider || 'unknown', {
          provider: a.id || a.provider,
          model: a.defaultModel,
          contextWindow: a.contextWindow || 100000,
          retryPolicy: a.retryPolicy || null
        });
      }
    }
    // allow explicit registration
    if (options.adapters) {
      for (const [k, v] of Object.entries(options.adapters)) this.adapters.set(k, v);
    }
  }

  // DSH: ctx.llm.register(adapter)
  register(provider, info) {
    if (this.adapters.has(provider)) throw new Error(`Duplicate adapter for ${provider}`);
    this.adapters.set(provider, info);
    return () => this.adapters.delete(provider);
  }

  // DSH: listModels / resolveModelInfo
  listModels(provider) {
    if (provider) return this.adapters.get(provider)?.models || [];
    return Array.from(this.adapters.entries()).flatMap(([p, info]) => (info.models || []).map((m) => ({ provider: p, ...m })));
  }

  resolveModelInfo(provider, model) {
    const info = this.adapters.get(provider);
    if (!info) return null;
    const exact = (info.models || []).find((m) => m.id === model);
    if (exact) return { contextWindow: exact.contextWindow || info.contextWindow, maxTokens: exact.maxTokens || info.maxTokens };
    return { contextWindow: info.contextWindow, maxTokens: info.maxTokens };
  }

  providerRetryPolicy(provider) {
    return this.adapters.get(provider)?.retryPolicy || null;
  }

  // DSH: prepareCall — resolves config, returns stream() bound to adapter
  async prepareCall(proposedConfig, signal) {
    const provider = proposedConfig.provider;
    const model = proposedConfig.model;
    if (!provider || !model) throw Object.assign(new Error('Missing provider/model'), { code: 'NO_ADAPTER' });
    const adapterInfo = this.adapters.get(provider);
    // if no adapter, middleware may serve it, but we still need to throw for DSH parity when not found and not middleware
    // For CoreZ, we allow any provider via ProviderChain fallback
    const contextWindow = adapterInfo?.contextWindow || 1000000;
    const defaultMaxTokens = adapterInfo?.maxTokens || 256000;
    const adapterDefaults = {};
    // reasoning handling (DSH: thinking field)
    // we keep simple: if proposedConfig.reasoningEffort undefined, default high
    const reasoningEffort = proposedConfig.reasoningEffort || 'high';

    const resolvedConfig = {
      provider,
      model,
      reasoningEffort,
      maxTokens: proposedConfig.maxTokens || defaultMaxTokens,
      ...proposedConfig
    };

    const retryPolicy = adapterInfo?.retryPolicy || { mode: 'normal', backoff: { initialDelayMs: 500, maxDelayMs: 10000 } };

    // stream factory — returns async generator of StreamChunk
    const stream = async function* (request) {
      // request is GenerateOptions with messages
      if (signal?.aborted) throw Object.assign(new Error('Aborted'), { code: 'ABORTED' });
      // delegate to ProviderChain if available, otherwise simulate
      let result;
      if (this.providerChain) {
        result = await this.providerChain.generate({
          taskId: request.sessionId || null,
          model: request.model || model,
          messages: request.messages || [],
          tools: request.tools || [],
          signal
        });
      } else {
        result = { status: 'completed', content: 'mock response', toolCalls: [], provider, model };
      }

      if (result.status === 'cancelled') throw Object.assign(new Error('Aborted'), { code: 'ABORTED' });
      if (result.status === 'failed') throw Object.assign(new Error(result.error || 'LLM failed'), { code: result.code || 'UNKNOWN', status: result.httpStatus });

      // translate result to StreamChunk sequence for BlockAssembler
      // content -> text-delta + block-end
      if (result.content) {
        const text = String(result.content);
        // split into two chunks to simulate streaming
        const mid = Math.floor(text.length / 2);
        if (mid > 0) {
          yield { type: 'text-delta', index: 0, text: text.slice(0, mid) };
          yield { type: 'text-delta', index: 0, text: text.slice(mid) };
        } else {
          yield { type: 'text-delta', index: 0, text };
        }
      }
      // tool calls -> tool-call-delta
      if (Array.isArray(result.toolCalls) && result.toolCalls.length) {
        for (let i = 0; i < result.toolCalls.length; i++) {
          const tc = result.toolCalls[i];
          const idx = (result.content ? 1 : 0) + i;
          yield {
            type: 'tool-call-delta',
            index: idx,
            id: tc.id || tc.callId || `call-${i}`,
            name: tc.name || tc.function?.name || '',
            argumentsDelta: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || tc.args || {})
          };
          // also emit block-end for tool-call
          yield {
            type: 'block-end',
            index: idx,
            block: {
              type: 'tool-call',
              id: tc.id || tc.callId || `call-${i}`,
              name: tc.name || tc.function?.name || '',
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || tc.args || {})
            }
          };
        }
      }
      // usage
      if (result.usage) yield { type: 'usage', usage: result.usage };
      else yield { type: 'usage', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 } };
      // finish
      const finishKind = result.finishReason === 'max-tokens' ? 'max-tokens' : 'stop';
      yield { type: 'finish', reason: { kind: finishKind } };
    }.bind(this);

    return {
      config: resolvedConfig,
      adapterDefaults,
      context: { contextWindow, maxTokens: defaultMaxTokens },
      retryPolicy,
      stream
    };
  }

  // DSH: ctx.llm.stream(request) — direct streaming without prepareCall
  async *stream(request) {
    const prep = await this.prepareCall({ provider: request.provider, model: request.model, reasoningEffort: request.reasoningEffort, maxTokens: request.maxTokens }, request.signal);
    const gen = prep.stream(request);
    for await (const chunk of gen) yield chunk;
  }

  // helper for non-streaming callers (ProviderChain parity)
  async generate(opts) {
    if (this.providerChain) return this.providerChain.generate(opts);
    // fallback
    const prep = await this.prepareCall({ provider: opts.model?.includes(':') ? opts.model.split(':')[0] : 'opencode-go', model: opts.model || 'default' }, opts.signal);
    const chunks = [];
    for await (const c of prep.stream({ ...opts, provider: prep.config.provider, model: prep.config.model })) chunks.push(c);
    const assembler = new BlockAssembler();
    for (const ch of chunks) assembler.push(ch);
    const blocks = assembler.blocks();
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const toolCalls = blocks.filter((b) => b.type === 'tool-call');
    return { status: 'completed', content: text, toolCalls, provider: prep.config.provider, model: prep.config.model, usage: assembler.usage };
  }
}
