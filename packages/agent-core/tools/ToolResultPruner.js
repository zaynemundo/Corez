// ToolResultPruner: Model-free output trimming to protect LLM context windows.
// Intelligently condenses large tool results (grep outputs, long build logs, file listings)
// while retaining vital head, tail context, and preserving structured object contracts.

export class ToolResultPruner {
  constructor(options = {}) {
    this.maxChars = options.maxChars ?? 12_000;
    this.maxLines = options.maxLines ?? 300;
    this.headLines = options.headLines ?? 50;
    this.tailLines = options.tailLines ?? 30;
    this.spillManager = options.spillManager ?? null;
  }

  /**
   * Prunes a tool result if it exceeds character or line limits.
   * @param {string|object} result - Raw tool result (string or object)
   * @param {object} meta - Contextual metadata (toolName, args, taskId)
   * @returns {{ result: string|object, pruned: boolean, originalLength: number, finalLength: number, spillId?: string }}
   */
  prune(result, meta = {}) {
    if (result === null || result === undefined) {
      return { result, pruned: false, originalLength: 0, finalLength: 0 };
    }

    if (typeof result === 'string') {
      const originalLength = result.length;
      const lines = result.split('\n');
      const totalLines = lines.length;

      if (originalLength <= this.maxChars && totalLines <= this.maxLines) {
        return { result, pruned: false, originalLength, finalLength: originalLength };
      }

      let spillRef = null;
      if (this.spillManager) {
        const spill = this.spillManager.spillOutput(result, meta);
        spillRef = spill?.reference || null;
      }

      const safeHead = Math.min(this.headLines, Math.floor(lines.length / 2));
      const safeTail = Math.min(this.tailLines, Math.floor(lines.length / 2));
      const headSlice = lines.slice(0, safeHead);
      const tailSlice = lines.slice(lines.length - safeTail);
      const omittedLines = totalLines - (safeHead + safeTail);
      const omittedBytes = result.length - (headSlice.join('\n').length + tailSlice.join('\n').length);

      let marker = `\n... [Truncated ${omittedLines} lines (~${Math.round(omittedBytes / 1024)} KB) to protect context window. Total: ${totalLines} lines, ${originalLength} characters] ...\n`;
      if (spillRef) {
        marker += `... [${spillRef}] ...\n`;
      }

      const prunedText = [...headSlice, marker, ...tailSlice].join('\n');
      return {
        result: prunedText,
        pruned: true,
        originalLength,
        finalLength: prunedText.length,
        spillId: meta.spillId || undefined
      };
    }

    if (typeof result === 'object') {
      const containerObj = { ...result };
      let prunedAnyField = false;
      let totalOriginalLength = 0;
      let totalFinalLength = 0;

      // Check known text keys to prune individually without destroying the object structure
      for (const key of Object.keys(containerObj)) {
        const val = containerObj[key];
        if (typeof val === 'string' && (val.length > this.maxChars || val.split('\n').length > this.maxLines)) {
          const fieldPrune = this.prune(val, { ...meta, fieldName: key });
          containerObj[key] = fieldPrune.result;
          prunedAnyField = true;
          totalOriginalLength += fieldPrune.originalLength;
          totalFinalLength += fieldPrune.finalLength;
        }
      }

      if (prunedAnyField) {
        containerObj._pruned = true;
        return {
          result: containerObj,
          pruned: true,
          originalLength: totalOriginalLength,
          finalLength: totalFinalLength,
          spillId: meta.spillId || undefined
        };
      }

      // If no single string field was oversized, check whole JSON size
      const serialized = JSON.stringify(result);
      if (serialized.length > this.maxChars) {
        let spillRef = null;
        if (this.spillManager) {
          const spill = this.spillManager.spillOutput(serialized, meta);
          spillRef = spill?.reference || null;
        }
        containerObj._pruned = true;
        if (spillRef) containerObj._spillReference = spillRef;
        return {
          result: containerObj,
          pruned: true,
          originalLength: serialized.length,
          finalLength: serialized.length,
          spillId: meta.spillId || undefined
        };
      }

      return { result, pruned: false, originalLength: serialized.length, finalLength: serialized.length };
    }

    return { result, pruned: false, originalLength: 0, finalLength: 0 };
  }
}
