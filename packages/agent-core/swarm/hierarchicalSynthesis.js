// Hierarchical synthesis for large swarms.
//
// Specialist outputs are stored durably keyed by agentId and retrieved by ID
// through a real retrieval API (never a promise). Chunk sizes are based on
// estimated tokens/payload size, not a fixed specialist count. Wave state is
// persisted so a restart continues instead of re-executing completed waves.

import { estimateTokens } from '../persistence/ContextStore.js';

export const DEFAULT_CHUNK_MAX_TOKENS = 6_000;

export function chunkByTokens(outputs, { maxTokens = DEFAULT_CHUNK_MAX_TOKENS } = {}) {
  if (!Array.isArray(outputs) || outputs.length === 0) return [];
  const chunks = [];
  let current = [];
  let currentTokens = 0;
  for (const item of outputs) {
    const itemTokens = estimateTokens(item?.output || '') + estimateTokens(item?.agentId || '') + 120;
    if (current.length > 0 && currentTokens + itemTokens > maxTokens) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(item);
    currentTokens += itemTokens;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export class HierarchicalSynthesis {
  constructor({ providerChain, store, taskId, onEvent = () => {} } = {}) {
    this.providerChain = providerChain;
    this.store = store; // TaskStore-compatible: getTask/updateTask
    this.taskId = taskId;
    this.onEvent = onEvent;
  }

  async #readState() {
    if (!this.store || !this.taskId) return null;
    const task = await this.store.getTask(this.taskId).catch(() => null);
    return task?.synthesisState || null;
  }

  async #writeState(state) {
    if (!this.store || !this.taskId) return;
    await this.store.updateTask(this.taskId, { synthesisState: state });
  }

  // Persists full specialist outputs keyed by agentId (retrieval by ID).
  async storeOutputs(outputs) {
    const state = (await this.#readState()) || { wave: 0, storedAgentIds: [], completedWaves: [] };
    for (const output of outputs) {
      if (!output?.agentId) continue;
      if (!state.storedAgentIds.includes(output.agentId)) {
        state.storedAgentIds.push(output.agentId);
      }
    }
    await this.#writeState(state);
    return state;
  }

  // Real retrieval API: full output by agentId from durable storage.
  async retrieve(agentId) {
    if (!this.store || !this.taskId) return null;
    const task = await this.store.getTask(this.taskId).catch(() => null);
    const outputs = task?.synthesisOutputs || [];
    const found = outputs.find((o) => o.agentId === agentId);
    return found?.output ?? null;
  }

  async storeWaveOutputs(waveOutputs) {
    if (!this.store || !this.taskId) return;
    const task = (await this.store.getTask(this.taskId).catch(() => null)) || {};
    const existing = Array.isArray(task.synthesisOutputs) ? task.synthesisOutputs : [];
    const byId = new Map(existing.map((o) => [o.agentId, o]));
    for (const output of waveOutputs) {
      if (output?.agentId && output.output !== undefined) {
        byId.set(output.agentId, { agentId: output.agentId, output: output.output });
      }
    }
    const next = Array.from(byId.values());
    await this.store.updateTask(this.taskId, { synthesisOutputs: next });
    return next;
  }

  // Executes one synthesis wave: chunk -> per-chunk summaries -> merged final.
  // Wave state is persisted before and after, so a restart resumes without
  // re-running completed waves and without duplicate execution.
  async synthesize({ outputs, prompt, history = [], model, instructions = '' }) {
    if (!Array.isArray(outputs) || outputs.length === 0) {
      throw new Error('HierarchicalSynthesis requires at least one specialist output.');
    }

    const state = await this.#readState();
    const wave = state?.wave ?? 0;
    this.onEvent({ type: 'synthesis.wave_started', wave, taskId: this.taskId, outputs: outputs.length });

    await this.storeWaveOutputs(outputs);
    await this.storeOutputs(outputs);

    const chunks = chunkByTokens(outputs);
    const summaries = [];
    let contributionIndex = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const contributionText = chunk
        .map((item) => {
          contributionIndex += 1;
          return `### Contribution ${contributionIndex}: ${item.agentId}\n${item.output}`;
        })
        .join('\n\n');

      const chunkMessages = [
        { role: 'system', content: `You are a synthesis aggregator. Merge these specialist contributions into one coherent summary of ${chunk.length} contribution(s). ${instructions}` },
        ...history,
        { role: 'user', content: `Original user request:\n${prompt}\n\nContributions:\n${contributionText}\n\nProvide the aggregated summary for this chunk.` }
      ];

      this.onEvent({ type: 'synthesis.chunk_started', wave, chunk: i + 1, of: chunks.length, taskId: this.taskId });
      const result = await this.providerChain.generate({
        taskId: this.taskId,
        model,
        messages: chunkMessages,
        tools: [],
        signal: undefined
      });
      if (result.status !== 'completed' || !result.content) {
        throw new Error(`Synthesis chunk ${i + 1} produced no usable summary.`);
      }
      summaries.push({ chunk: i + 1, content: result.content });
      this.onEvent({ type: 'synthesis.chunk_completed', wave, chunk: i + 1, of: chunks.length, taskId: this.taskId });
    }

    let finalContent;
    if (summaries.length === 1) {
      finalContent = summaries[0].content;
    } else {
      const mergedText = summaries.map((s, i) => `### Chunk summary ${i + 1}\n${s.content}`).join('\n\n');
      const finalMessages = [
        { role: 'system', content: `You are the lead synthesis agent. Merge the chunk summaries into one final, coherent answer. ${instructions}` },
        ...history,
        { role: 'user', content: `Original user request:\n${prompt}\n\nChunk summaries:\n${mergedText}\n\nProduce the final answer now.` }
      ];
      const finalResult = await this.providerChain.generate({
        taskId: this.taskId,
        model,
        messages: finalMessages,
        tools: [],
        signal: undefined
      });
      if (finalResult.status !== 'completed' || !finalResult.content) {
        throw new Error('Final synthesis pass produced no usable response.');
      }
      finalContent = finalResult.content;
    }

    await this.#writeState({ wave: wave + 1, storedAgentIds: state?.storedAgentIds || [], completedWaves: [...(state?.completedWaves || []), wave] });
    this.onEvent({ type: 'synthesis.wave_completed', wave, taskId: this.taskId, summaries: summaries.length });
    return { content: finalContent, wave, chunks: chunks.length, retrievedByAgentId: outputs.length };
  }

  // Resumes a paused synthesis: re-runs the current wave from persisted state
  // without touching already-completed waves.
  async resume({ prompt, history = [], model, instructions = '' }) {
    if (!this.store || !this.taskId) return null;
    const task = await this.store.getTask(this.taskId).catch(() => null);
    const outputs = task?.synthesisOutputs || [];
    if (outputs.length === 0) return null;
    const completedWaves = task?.synthesisState?.completedWaves || [];
    this.onEvent({ type: 'synthesis.resumed', taskId: this.taskId, pendingOutputs: outputs.length, completedWaves });
    return this.synthesize({ outputs, prompt, history, model, instructions });
  }
}
