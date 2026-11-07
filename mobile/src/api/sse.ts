/**
 * Server-Sent Events reader for `/api/ai`.
 *
 * The Worker emits `data: {json}` lines carrying the same event types the web
 * client consumes (see src/services/ai/hostedTransport.js): `delta` for answer
 * text, `thinking` for live reasoning, `clear`, `phase` for harness progress,
 * `done` and `error`. React Native has no EventSource, so the stream is read
 * from `response.body` (expo/fetch provides a WinterCG ReadableStream).
 */

export type SseStreamEvent =
  | { type: "delta"; text: string }
  | { type: "thinking"; text: string }
  | { type: "clear"; [key: string]: unknown }
  | { type: "phase"; phase: string; [key: string]: unknown }
  | { type: "done"; [key: string]: unknown }
  | { type: "error"; message?: string; retryable?: boolean; [key: string]: unknown };

export interface SseHandlers {
  onDelta?: (text: string) => void;
  onThinking?: (text: string) => void;
  onClear?: (event: SseStreamEvent) => void;
  onPhase?: (event: { phase: string; [key: string]: unknown }) => void;
  onDone?: (event: SseStreamEvent) => void;
  onError?: (event: { message?: string; retryable?: boolean }) => void;
}

export interface SseResult {
  text: string;
  thinking: string;
  doneEvent: SseStreamEvent | null;
  errorEvent: { message?: string; retryable?: boolean } | null;
  sawDone: boolean;
}

function parseEventLine(line: string): SseStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice("data:".length).trim();
  if (!payload || payload === "[DONE]") return null;
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed.type === "string") {
      return parsed as SseStreamEvent;
    }
  } catch {
    // A truncated final line is not an event; the error event that follows (or
    // the missing done event) tells the caller the stream was incomplete.
  }
  return null;
}

/**
 * Consume one SSE response. Returns the accumulated answer/thinking text plus
 * the terminal event so the caller can tell success from an incomplete stream.
 */
export async function consumeSse(
  response: Response,
  handlers: SseHandlers = {},
): Promise<SseResult> {
  const result: SseResult = {
    text: "",
    thinking: "",
    doneEvent: null,
    errorEvent: null,
    sawDone: false,
  };

  if (!response.body) {
    throw new Error("The server did not stream a response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleLine = (line: string): boolean => {
    const event = parseEventLine(line);
    if (!event) return true;
    switch (event.type) {
      case "delta":
        if (typeof event.text === "string") {
          result.text += event.text;
          handlers.onDelta?.(event.text);
        }
        return true;
      case "thinking":
        if (typeof event.text === "string") {
          result.thinking += event.text;
          handlers.onThinking?.(event.text);
        }
        return true;
      case "clear":
        handlers.onClear?.(event);
        return true;
      case "phase":
        if (typeof event.phase === "string") handlers.onPhase?.(event);
        return true;
      case "done":
        result.doneEvent = event;
        result.sawDone = true;
        handlers.onDone?.(event);
        return true;
      case "error":
        result.errorEvent = {
          message: typeof event.message === "string" ? event.message : undefined,
          retryable: event.retryable === true,
        };
        handlers.onError?.(result.errorEvent);
        // The worker ends the stream after an error event.
        return true;
      default:
        return true;
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      // Keep the last (possibly partial) line for the next chunk.
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    }
    if (buffer.trim()) handleLine(buffer);
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The stream may already be closed; cancel is best-effort.
    }
  }

  return result;
}
