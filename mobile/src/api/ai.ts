/**
 * `/api/ai` turn transport.
 *
 * The request body mirrors the web client (`src/services/aiService.js`). The
 * server tolerates a missing intent block and normalises it, which lets the
 * first mobile milestone stream before the shared prompt-intelligence package
 * is wired in; Phase 1 sends the full block for feature parity.
 */
import { ApiError, rawRequest } from "./client";
import {
  consumeSse,
  type SseHandlers,
  type SseResult,
} from "./sse";

export interface ChatHistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: unknown[];
}

export interface ChatTurnInput {
  prompt: string;
  messages?: ChatHistoryMessage[];
  intent?: Record<string, unknown>;
  fineIntent?: Record<string, unknown>;
  contract?: Record<string, unknown>;
  skills?: unknown[];
  executionPlan?: string | null;
  complexity?: string | number;
  mode?: string;
  project?: unknown;
  /** Creation harness (plan → build → verify → repair → review) for @website/@game. */
  harness?: boolean;
}

export interface ChatTurnResult extends SseResult {
  /** Set when the server accepted the turn but scheduled it for later. */
  retryScheduled?: { taskId: string; retryAfterSeconds: number | null };
}

interface RetryScheduledBody {
  taskId?: string;
  status?: string;
  retryAfterSeconds?: number;
}

async function readError(response: Response): Promise<ApiError> {
  let message = `Corez answered ${response.status}.`;
  let code: string | null = null;
  let retryAfter: number | null = null;
  try {
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.error === "string" && body.error) message = body.error;
    if (typeof body.code === "string") code = body.code;
    const seconds = Number(body.retryAfterSeconds);
    if (Number.isFinite(seconds) && seconds > 0) retryAfter = seconds;
  } catch {
    // Keep the status-based message.
  }
  const headerRetry = Number(response.headers.get("Retry-After"));
  if (retryAfter === null && Number.isFinite(headerRetry) && headerRetry > 0) {
    retryAfter = headerRetry;
  }
  return new ApiError(message, response.status, code, retryAfter);
}

/**
 * Run one streamed turn. Resolves when the stream ends; the caller decides
 * whether the result is complete (`sawDone`) or was cut off.
 */
export async function streamChatTurn(
  input: ChatTurnInput,
  handlers: SseHandlers = {},
  signal?: AbortSignal,
): Promise<ChatTurnResult> {
  const response = await rawRequest("/api/ai", {
    method: "POST",
    body: { ...input, stream: true },
    signal,
    // A generation may legitimately run for minutes; Stop aborts it.
    timeoutMs: 0,
    suppressUnauthorizedEvent: false,
  });

  if (!response.ok) throw await readError(response);

  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("text/event-stream")) {
    // The provider could not recover within one window; the worker persisted a
    // retry schedule and answered 200 JSON. Surface it honestly instead of
    // parsing it as an empty stream.
    const text = await response.text();
    let data: RetryScheduledBody | null = null;
    try {
      data = JSON.parse(text) as RetryScheduledBody;
    } catch {
      data = null;
    }
    if (data?.status === "retry-scheduled" && data.taskId) {
      const seconds = Number(data.retryAfterSeconds);
      return {
        text: "",
        thinking: "",
        doneEvent: null,
        errorEvent: null,
        sawDone: false,
        retryScheduled: {
          taskId: data.taskId,
          retryAfterSeconds: Number.isFinite(seconds) ? seconds : null,
        },
      };
    }
    // A non-streaming answer is still a valid turn result.
    const answer =
      (data && typeof (data as { content?: unknown }).content === "string"
        ? ((data as { content: string }).content as string)
        : text) || "";
    handlers.onDelta?.(answer);
    handlers.onDone?.({ type: "done" });
    return {
      text: answer,
      thinking: "",
      doneEvent: { type: "done" },
      errorEvent: null,
      sawDone: true,
    };
  }

  return consumeSse(response, handlers);
}
