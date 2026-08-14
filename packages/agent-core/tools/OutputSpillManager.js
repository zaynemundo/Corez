// OutputSpillManager: Persists bulky tool execution outputs to storage/files
// so full un-truncated outputs can be retrieved or paged without filling the model context.

import fs from 'node:fs';
import path from 'node:path';

export class OutputSpillManager {
  constructor(options = {}) {
    this.spillDir = options.spillDir || path.resolve(process.cwd(), '.corez', 'spills');
    this.memoryStore = options.inMemory === true ? new Map() : null;
    this.maxMemoryItems = options.maxMemoryItems || 100;
  }

  ensureSpillDir() {
    if (!this.memoryStore && !fs.existsSync(this.spillDir)) {
      fs.mkdirSync(this.spillDir, { recursive: true });
    }
  }

  generateSpillId(prefix = 'spill') {
    const timestamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${timestamp}_${rand}`;
  }

  /**
   * Spills full output text to disk or memory.
   * @param {string} content
   * @param {object} meta
   * @returns {{ spillId: string, filePath?: string, sizeBytes: number, reference: string }}
   */
  spillOutput(content, meta = {}) {
    const spillId = meta.spillId || this.generateSpillId(meta.toolName || 'tool');
    const sizeBytes = Buffer.byteLength(content, 'utf8');

    if (this.memoryStore) {
      if (this.memoryStore.size >= this.maxMemoryItems) {
        const oldestKey = this.memoryStore.keys().next().value;
        this.memoryStore.delete(oldestKey);
      }
      this.memoryStore.set(spillId, { content, meta, sizeBytes, createdAt: Date.now() });
      return {
        spillId,
        sizeBytes,
        reference: `Full un-truncated output saved in spill buffer "${spillId}" (${Math.round(sizeBytes / 1024)} KB)`
      };
    }

    this.ensureSpillDir();
    const filePath = path.join(this.spillDir, `${spillId}.log`);
    fs.writeFileSync(filePath, content, 'utf8');

    return {
      spillId,
      filePath,
      sizeBytes,
      reference: `Full un-truncated output spilled to ${filePath} (${Math.round(sizeBytes / 1024)} KB)`
    };
  }

  /**
   * Retrieves spilled output.
   * @param {string} spillId
   * @returns {string|null}
   */
  getSpill(spillId) {
    if (this.memoryStore) {
      return this.memoryStore.get(spillId)?.content || null;
    }
    const filePath = path.join(this.spillDir, `${spillId}.log`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
    return null;
  }

  /**
   * Reads a slice/page of a spilled output.
   * @param {string} spillId
   * @param {number} startLine 1-based start line
   * @param {number} lineCount Number of lines to read
   * @returns {{ slice: string, totalLines: number, startLine: number, endLine: number }}
   */
  readSlice(spillId, startLine = 1, lineCount = 100) {
    const full = this.getSpill(spillId);
    if (full === null) {
      return { slice: '', totalLines: 0, startLine, endLine: startLine };
    }
    const lines = full.split('\n');
    const totalLines = lines.length;
    const startIndex = Math.max(0, startLine - 1);
    const endIndex = Math.min(totalLines, startIndex + lineCount);
    const slice = lines.slice(startIndex, endIndex).join('\n');

    return {
      slice,
      totalLines,
      startLine: startIndex + 1,
      endLine: endIndex
    };
  }
}
