import { describe, it, expect } from 'vitest';
import {
  MAX_RESUME_THINKING_CHARS,
  buildResumeThinkingMessage,
  normalizeResumeThinking,
} from '../worker/resumeThinking.js';

describe('resume thinking context', () => {
  it('bounds and normalizes optional client context', () => {
    expect(normalizeResumeThinking(null)).toBe('');
    expect(normalizeResumeThinking('   ')).toBe('');
    const long = 'x'.repeat(MAX_RESUME_THINKING_CHARS + 10);
    expect(normalizeResumeThinking(long)).toHaveLength(
      MAX_RESUME_THINKING_CHARS,
    );
  });

  it('wraps prior reasoning as an internal continuation note', () => {
    const message = buildResumeThinkingMessage('Analyzed the scene graph.');
    expect(message).toContain('[Continuation checkpoint');
    expect(message).toContain('Analyzed the scene graph.');
    expect(message).not.toContain('undefined');
  });

  it('does not emit an empty system message', () => {
    expect(buildResumeThinkingMessage('')).toBe('');
  });
});
