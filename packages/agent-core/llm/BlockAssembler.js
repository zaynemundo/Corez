// BlockAssembler — DSH dsh-llm/assembler parity
// Single canonical assembly algorithm: feeds StreamChunk, yields ContentBlock[]

export class BlockAssembler {
  constructor() {
    this.partials = new Map();
    this.order = [];
    this._usage = undefined;
    this._finish = undefined;
    this._replayState = undefined;
  }

  push(chunk) {
    switch (chunk.type) {
      case 'block-start': {
        if (!this.partials.has(chunk.index)) {
          this.order.push(chunk.index);
          this.partials.set(chunk.index, { blockType: chunk.blockType, text: '', toolCallArguments: '' });
        }
        return;
      }
      case 'text-delta':
      case 'reasoning-delta': {
        const partial = this.ensure(chunk.index, chunk.type === 'text-delta' ? 'text' : 'reasoning');
        if (partial.block) return;
        partial.text += chunk.text;
        return;
      }
      case 'tool-call-delta': {
        const partial = this.ensure(chunk.index, 'tool-call');
        if (partial.block) return;
        if (chunk.id) partial.toolCallId = chunk.id;
        if (chunk.name) partial.toolCallName = chunk.name;
        partial.toolCallArguments += chunk.argumentsDelta || '';
        return;
      }
      case 'block-end': {
        const partial = this.ensure(chunk.index, chunk.block.type);
        if (partial.block) return;
        partial.block = chunk.block;
        return;
      }
      case 'usage': {
        this._usage = chunk.usage;
        return;
      }
      case 'finish': {
        this._finish = chunk.reason;
        this._replayState = chunk.replayState;
        return;
      }
      default: return;
    }
  }

  ensure(index, blockType) {
    let partial = this.partials.get(index);
    if (!partial) {
      partial = { blockType, text: '', toolCallArguments: '' };
      this.partials.set(index, partial);
      this.order.push(index);
    }
    return partial;
  }

  assemble(partial, index) {
    if (partial.block) return partial.block;
    switch (partial.blockType) {
      case 'text': return { type: 'text', text: partial.text };
      case 'reasoning': return { type: 'reasoning', text: partial.text };
      case 'tool-call': return {
        type: 'tool-call',
        id: partial.toolCallId ?? `call-${index}`,
        name: partial.toolCallName ?? '',
        arguments: partial.toolCallArguments
      };
      default: throw new Error(`cannot assemble incomplete block of type "${partial.blockType}"`);
    }
  }

  mustGet(index) {
    const p = this.partials.get(index);
    if (!p) throw new Error(`BlockAssembler invariant: no partial for ${index}`);
    return p;
  }

  blocks() {
    const blocks = this.order.map((i) => this.assemble(this.mustGet(i), i));
    return this.finish.kind === 'max-tokens' ? blocks.filter((b) => b.type !== 'tool-call') : blocks;
  }

  get usage() { return this._usage; }
  get finish() { return this._finish ?? { kind: 'stop' }; }
  get replayState() { return this._replayState; }
}

// Helper to create an assistant message from blocks (DSH createMessage)
export function createAssistantMessage({ content, source } = {}) {
  const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content || '') }];
  return { role: 'assistant', content: blocks.map((b) => b.text || '').join('\n'), blocks, source };
}
