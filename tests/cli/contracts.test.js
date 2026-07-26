import { describe, expect, it } from 'vitest';
import {
  CorezError,
  ERROR_CODES,
  createEvent,
  exitCodeForError,
  getCommandPolicy,
  isCorezEvent
} from '../../packages/agent-core/index.js';

describe('CoreZ runtime contracts', () => {
  it('maps stable failures to nonzero process codes', () => {
    const error = new CorezError(ERROR_CODES.AUTH_MISSING, 'missing key');
    expect(error.code).toBe('AUTH_MISSING');
    expect(exitCodeForError(error)).toBe(10);
  });

  it('creates timestamped structured events', () => {
    const event = createEvent('assistant.delta', { text: 'hello' });
    expect(event).toMatchObject({ type: 'assistant.delta', data: { text: 'hello' } });
    expect(new Date(event.timestamp).toString()).not.toBe('Invalid Date');
    expect(isCorezEvent(event)).toBe(true);
  });

  it('makes plan and review read-only while build requires verification', () => {
    expect(getCommandPolicy('plan')).toMatchObject({ readOnly: true, requireVerification: false });
    expect(getCommandPolicy('review')).toMatchObject({ readOnly: true });
    expect(getCommandPolicy('build')).toMatchObject({ readOnly: false, requireVerification: true });
    expect(() => getCommandPolicy('missing')).toThrow('Unknown command policy');
  });
});
