import { describe, it, expect } from 'vitest';
import {
  isStreamVisibleForSession,
  isStreamActiveElsewhere,
} from '../src/utils/streamSession.js';

describe('Stream-to-session attribution', () => {
  it('shows the live stream only in its originating chat', () => {
    expect(
      isStreamVisibleForSession({
        isThinking: true,
        streamingSessionId: 'chat_A',
        activeSessionId: 'chat_A',
      }),
    ).toBe(true);
    // User switched to chat B mid-stream: chat B must not render A's stream.
    expect(
      isStreamVisibleForSession({
        isThinking: true,
        streamingSessionId: 'chat_A',
        activeSessionId: 'chat_B',
      }),
    ).toBe(false);
  });

  it('hides the stream bubble when nothing is streaming', () => {
    expect(
      isStreamVisibleForSession({
        isThinking: false,
        streamingSessionId: 'chat_A',
        activeSessionId: 'chat_A',
      }),
    ).toBe(false);
  });

  it('flags a stream running in a different chat for the banner', () => {
    expect(
      isStreamActiveElsewhere({
        isThinking: true,
        streamingSessionId: 'chat_A',
        activeSessionId: 'chat_B',
      }),
    ).toBe(true);
    expect(
      isStreamActiveElsewhere({
        isThinking: true,
        streamingSessionId: 'chat_A',
        activeSessionId: 'chat_A',
      }),
    ).toBe(false);
    expect(
      isStreamActiveElsewhere({
        isThinking: false,
        streamingSessionId: 'chat_A',
        activeSessionId: 'chat_B',
      }),
    ).toBe(false);
  });

  it('handles the home view (no active chat) without leaking the stream', () => {
    expect(
      isStreamVisibleForSession({
        isThinking: true,
        streamingSessionId: 'chat_A',
        activeSessionId: null,
      }),
    ).toBe(false);
    // On home the bubble stays hidden but the banner still offers a way back.
    expect(
      isStreamActiveElsewhere({
        isThinking: true,
        streamingSessionId: 'chat_A',
        activeSessionId: null,
      }),
    ).toBe(true);
  });
});
