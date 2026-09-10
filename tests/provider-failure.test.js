import { describe, it, expect } from 'vitest';
import {
  PERMANENT_STATUSES,
  classifyFailureStatus,
  classifyProviderFailure,
} from '../packages/agent-core/providers/failure.js';

describe('provider failure classification', () => {
  it('classifies permanent and transient statuses consistently', () => {
    for (const status of [...PERMANENT_STATUSES]) {
      expect(classifyFailureStatus(status)).toBe('permanent');
    }
    for (const status of [408, 409, 429, 500, 502, 503, 504, null, undefined, 0]) {
      expect(classifyFailureStatus(status)).toBe('transient');
    }
  });

  it('treats context-length and moderation errors as permanent', () => {
    expect(
      classifyProviderFailure(new Error('maximum context length exceeded')).kind,
    ).toBe('permanent');
    expect(
      classifyProviderFailure(new Error('This content violates our content policy'))
        .kind,
    ).toBe('permanent');
  });

  it('classifies rate limits as transient and preserves Retry-After', () => {
    const error = new Error('rate limited');
    error.status = 429;
    error.retryAfter = 3;
    const classified = classifyProviderFailure(error);
    expect(classified.kind).toBe('transient');
    expect(classified.retryAfterMs).toBe(3000);
  });

  it('defaults unknown failures to transient', () => {
    expect(classifyProviderFailure(new Error('socket exploded')).kind).toBe(
      'transient',
    );
    expect(classifyProviderFailure(undefined).kind).toBe('transient');
  });
});
