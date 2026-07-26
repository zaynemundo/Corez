import { CorezError, ERROR_CODES } from '../contracts/errors.js';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stableValue(value[key])])
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function toolCallFingerprint(call) {
  return `${call.name}:${stableStringify(call.arguments || {})}`;
}

export class DuplicateToolGuard {
  constructor(limit = 3) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError('Duplicate tool limit must be a positive integer.');
    }
    this.limit = limit;
    this.lastFingerprint = undefined;
    this.consecutiveCount = 0;
  }

  observe(call) {
    const fingerprint = toolCallFingerprint(call);
    if (fingerprint === this.lastFingerprint) {
      this.consecutiveCount += 1;
    } else {
      this.lastFingerprint = fingerprint;
      this.consecutiveCount = 1;
    }

    if (this.consecutiveCount >= this.limit) {
      throw new CorezError(
        ERROR_CODES.DUPLICATE_TOOL_LOOP,
        `Tool call repeated ${this.consecutiveCount} consecutive times.`,
        { fingerprint, consecutiveCount: this.consecutiveCount }
      );
    }
    return fingerprint;
  }

  reset() {
    this.lastFingerprint = undefined;
    this.consecutiveCount = 0;
  }
}
