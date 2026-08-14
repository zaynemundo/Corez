// RepeatToolGuard: Advisory and enforcement guard against repetitive identical tool calls.
// Prevents runaway loops, saves model tokens, and ensures task progress.

/**
 * Deep key-sort of a JSON value so argument objects differing only in key order
 * canonicalize to the exact same string representation.
 */
export function canonicalizeJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(item => canonicalizeJson(item)).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalizeJson(value[k])}`);
  return '{' + pairs.join(',') + '}';
}

export class RepeatToolGuard {
  constructor(options = {}) {
    this.thresholds = options.thresholds || [3, 5, 8];
    this.gentleThreshold = this.thresholds[0] ?? 3;
    this.diagnosticThreshold = this.thresholds[1] ?? 5;
    this.hardBrakeThreshold = this.thresholds[2] ?? 8;
    this.argumentsPreviewChars = options.argumentsPreviewChars || 400;
    this.excludedTools = new Set(options.exclude || []);
    this.includedTools = options.include && options.include.length > 0 ? new Set(options.include) : null;

    // Per-session or per-agent execution tracking: { lastTool, lastCanonicalArgs, count }
    this.chains = new Map();
  }

  /**
   * Reset tracking state for a given session/task.
   */
  reset(scopeId = 'default') {
    this.chains.delete(scopeId);
  }

  /**
   * Evaluates a tool call before or after execution.
   * @param {string} toolName
   * @param {object} args
   * @param {string} scopeId
   * @returns {{ status: 'ok' | 'advisory' | 'diagnostic' | 'blocked', count: number, message?: string, error?: string }}
   */
  evaluate(toolName, args = {}, scopeId = 'default') {
    if (this.excludedTools.has(toolName)) {
      return { status: 'ok', count: 0 };
    }
    if (this.includedTools && !this.includedTools.has(toolName)) {
      return { status: 'ok', count: 0 };
    }

    const canonicalArgs = canonicalizeJson(args);
    const chain = this.chains.get(scopeId) || { lastTool: null, lastCanonicalArgs: null, count: 0 };

    if (chain.lastTool === toolName && chain.lastCanonicalArgs === canonicalArgs) {
      chain.count += 1;
    } else {
      chain.lastTool = toolName;
      chain.lastCanonicalArgs = canonicalArgs;
      chain.count = 1;
    }

    this.chains.set(scopeId, chain);

    // Hard brake threshold: block execution
    if (chain.count >= this.hardBrakeThreshold) {
      const errorMsg = `Loop guard blocked execution: tool "${toolName}" was called ${chain.count} consecutive times with identical arguments without making progress.`;
      return {
        status: 'blocked',
        count: chain.count,
        error: errorMsg
      };
    }

    // Diagnostic threshold: detailed diagnostic message
    if (chain.count >= this.diagnosticThreshold) {
      const preview = canonicalArgs.length > this.argumentsPreviewChars
        ? canonicalArgs.slice(0, this.argumentsPreviewChars) + '... [truncated]'
        : canonicalArgs;

      const message = `Repeated tool call detected:
- tool: ${toolName}
- consecutive_calls: ${chain.count}
- arguments: ${preview}
The repeated calls are not making progress. Do not call this tool with these exact arguments again. Inspect the latest result and choose a different action, different arguments, or finish the task.`;

      return {
        status: 'diagnostic',
        count: chain.count,
        message
      };
    }

    // Gentle threshold: advisory reminder
    if (chain.count >= this.gentleThreshold) {
      const message = `You are repeating the exact same "${toolName}" call with identical arguments (called ${chain.count} times). Carefully analyze the previous result before calling again: if the task is not complete, try a different approach or different arguments.`;
      return {
        status: 'advisory',
        count: chain.count,
        message
      };
    }

    return { status: 'ok', count: chain.count };
  }
}
