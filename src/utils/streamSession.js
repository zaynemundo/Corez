/**
 * Stream-to-session attribution helpers.
 * AI response streams are single-flight but the user may switch chats
 * mid-stream. Every stream is tagged with its originating session id so the
 * live output (and canvas auto-open) only ever surfaces in that chat.
 */

export function isStreamVisibleForSession({
  isThinking,
  streamingSessionId,
  activeSessionId,
} = {}) {
  if (!isThinking) return false;
  // Unknown origin (legacy path): preserve old behavior and show it.
  if (streamingSessionId == null) return true;
  return streamingSessionId === activeSessionId;
}

export function isStreamActiveElsewhere({
  isThinking,
  streamingSessionId,
  activeSessionId,
} = {}) {
  return Boolean(
    isThinking && streamingSessionId && streamingSessionId !== activeSessionId,
  );
}
