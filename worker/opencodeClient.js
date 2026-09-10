// OpenCode Go / Zen chat client.
//
// One client for the gateway's chat-completions API (plus the retired
// /responses API when an endpoint override explicitly selects it): request
// shaping, deadline guards, SSE streaming, usage mapping, and empty-response
// detection. Failure classification, retries and scheduling live in
// providerChain.js; this module never retries on its own and never sends
// output-token caps.

import { safeErrorDetail } from "./utils.js";
import {
  OPENCODE_SESSION_HEADER,
  newOpencodeSessionId,
  resolveOpencodeSessionId,
} from "../packages/agent-core/providers/session.js";

export {
  OPENCODE_SESSION_HEADER,
  newOpencodeSessionId,
  resolveOpencodeSessionId,
};

export const OPENCODE_DEFAULT_ENDPOINT =
  "https://opencode.ai/zen/go/v1/chat/completions";

// Timeout guards for upstream provider calls. A provider that hangs before
// its first token (or stalls mid-stream, or never answers a non-stream call)
// previously made the worker wait until Cloudflare killed the request at the
// platform wall-clock limit — truncating the SSE stream before any delta or
// error event reached the client, which then reported "Hosted AI returned no
// streamed content." for a failure it could not see. The guards fail the
// provider loudly instead: the failure is classified transient (504), the
// chain retries or falls back, and the client always receives an explicit
// SSE error event with the real reason.
export const DEFAULT_TTFT_TIMEOUT_MS = 120_000; // first byte / first token
export const DEFAULT_IDLE_TIMEOUT_MS = 60_000; // silence mid-stream
export const DEFAULT_NONSTREAM_TIMEOUT_MS = 90_000; // non-streaming call total

// Endpoint shape is explicit (`api: 'chat' | 'responses'`), set from
// OPENCODE_API_MODE by buildProviderChain. The URL is sniffed only as a
// documented fallback for legacy OPENCODE_ENDPOINT values that point at the
// retired /responses API; new configuration should set the mode explicitly.
export function resolveApiMode({ endpoint, api } = {}) {
  if (api === "chat" || api === "responses") return api;
  if (
    typeof endpoint === "string" &&
    /\/responses(?:$|[?#/])/i.test(endpoint.trim())
  ) {
    return "responses";
  }
  return "chat";
}

function extractContentText(content) {
  if (typeof content === "string") return content;
  // Multimodal responses can wrap text in content parts: [{ type, text }]
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && typeof part.text === "string"
          ? part.text
          : "",
      )
      .join("");
  }
  return "";
}

function toResponsesInput(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  // Responses API accepts the same message array but under the `input` key.
  // Preserve role/content structure; normalize content to string when needed.
  return messages.map((m) => {
    if (!m || typeof m !== "object") return m;
    const role = m.role || "user";
    if (Array.isArray(m.content)) return { role, content: m.content };
    if (typeof m.content === "string") return { role, content: m.content };
    return { role, content: extractContentText(m.content) };
  });
}

// Map a provider usage object (chat and responses shapes) to the chain's
// inputTokens/outputTokens contract. Absent usage maps to null; zeroed usage
// stays an object so callers can distinguish "reported zero" from "silent".
function mapUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  return {
    inputTokens: Number(usage.input_tokens ?? usage.prompt_tokens) || 0,
    outputTokens: Number(usage.output_tokens ?? usage.completion_tokens) || 0,
  };
}

// Reasoning models can emit their internal thought inline wrapped in
// <think>/<thinking> blocks. Strip those sections so thinking text is never
// presented as the answer. An unclosed block (output truncated mid-thought)
// is reasoning too: everything from the marker onward is dropped, since any
// real answer would only ever follow a closed block.
function stripThinkingBlocks(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<(?:think|thinking)\b[^>]*>[\s\S]*$/gi, "")
    .trim();
}

// The real answer of a chat message is its content field. reasoning_content
// is internal model thought: it is a retry signal, never the answer (surfacing
// it previously handed users raw <think> dumps instead of the requested code).
function answerText(message) {
  if (!message || typeof message !== "object") return "";
  return stripThinkingBlocks(extractContentText(message.content));
}

function hasReasoning(message) {
  if (!message || typeof message !== "object") return false;
  const reasoning = extractContentText(message.reasoning_content);
  if (reasoning.trim()) return true;
  return /<(?:think|thinking)\b/i.test(extractContentText(message.content));
}

function reasoningDeltaOf(delta) {
  return extractContentText(delta?.reasoning_content || delta?.reasoning);
}

function extractResponsesContent(data) {
  if (!data || typeof data !== "object")
    return { content: "", reasoning: false, usage: null, stopReason: null };
  const output = Array.isArray(data.output) ? data.output : [];
  const messageItem = output.find(
    (item) => item && item.type === "message" && item.role === "assistant",
  );
  let content = "";
  if (messageItem && Array.isArray(messageItem.content)) {
    const textPart = messageItem.content.find(
      (c) => c && c.type === "output_text" && typeof c.text === "string",
    );
    if (textPart) content = textPart.text;
  }
  content = stripThinkingBlocks(content);
  const hasReasoningFlag = output.some(
    (item) => item && item.type === "reasoning",
  );
  const mapped = mapUsage(data.usage || (data.response && data.response.usage));
  const usage = mapped && (mapped.inputTokens || mapped.outputTokens) ? mapped : null;
  const stopReason =
    data.status || (data.response && data.response.status) || null;
  return { content, reasoning: hasReasoningFlag, usage, stopReason };
}

// The single chat-completions result shape: used by the chat path and by the
// legacy choices fallbacks when an endpoint is explicitly in responses mode.
function chatCompletionResult(
  data,
  label,
  model,
  { usageFallback = null, stopReasonFallback = null } = {},
) {
  const choice = data?.choices?.[0];
  const message = choice?.message;
  return {
    content: answerText(message),
    reasoning: hasReasoning(message),
    model: `${label}:${model}`,
    usage: mapUsage(data?.usage) ?? usageFallback,
    stopReason: choice?.finish_reason || stopReasonFallback,
  };
}

// Parse an SSE data line from a streaming OpenAI-compatible endpoint.
function parseSseData(line) {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return { done: true };
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Streaming chat completion. Returns an async iterable of
 * { text, usage, finishReason, ttftMs } — text deltas as they arrive plus a
 * final chunk carrying usage/finish_reason when the provider sends them.
 * Provider fallback is NOT handled here: runProviderChain/runStreamingChain
 * own the chain.
 */
export async function* streamChatEndpoint({
  endpoint,
  api,
  key,
  model,
  label,
  messages,
  signal,
  extraHeaders = {},
  bodyExtra = {},
  onTtft,
  ttftTimeoutMs = DEFAULT_TTFT_TIMEOUT_MS,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
}) {
  const requestStartedAt = Date.now();

  // Deadline machinery: the client signal plus two timers — a first-token
  // timeout and a mid-stream silence timeout. On timeout the fetch is aborted
  // and a classified 504 is thrown so the chain retries/falls back instead of
  // letting the request hang until the platform kills it mid-stream.
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forwardAbort, { once: true });
  }
  let deadlineHit = false;
  let firstChunk = true;
  let ttftTimer = setTimeout(() => {
    deadlineHit = true;
    controller.abort();
  }, ttftTimeoutMs);
  let idleTimer = null;
  const clearTimers = () => {
    clearTimeout(ttftTimer);
    clearTimeout(idleTimer);
  };

  const responsesApi = resolveApiMode({ endpoint, api }) === "responses";
  const requestBody = responsesApi
    ? { model, input: toResponsesInput(messages), stream: true, ...bodyExtra }
    : { model, messages, stream: true, ...bodyExtra };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      const failure = new Error(
        `HTTP ${response.status}: ${safeErrorDetail(detail)}`,
      );
      failure.status = response.status;
      const retryAfter = Number(response.headers.get("Retry-After") || 0);
      if (Number.isFinite(retryAfter) && retryAfter > 0)
        failure.retryAfter = retryAfter;
      throw failure;
    }

    if (!response.body)
      throw new Error(`${label} streaming response had no body`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usage = null;
    let finishReason = null;
    let sawDone = false;
    let ttftEmitted = false;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        // First chunk clears the TTFT timer; the idle timer re-arms per
        // chunk so mid-stream silence also aborts the request.
        if (firstChunk) {
          firstChunk = false;
          clearTimeout(ttftTimer);
        }
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          deadlineHit = true;
          controller.abort();
        }, idleTimeoutMs);
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const parsed = parseSseData(line.trim());
          if (!parsed) continue;
          if (parsed.done) {
            sawDone = true;
            continue;
          }
          if (responsesApi) {
            // Responses API streaming: deltas are response.output_text.delta,
            // completion is response.completed with usage in response.usage.
            if (
              parsed.type === "response.output_text.delta" &&
              typeof parsed.delta === "string" &&
              parsed.delta
            ) {
              if (!ttftEmitted) {
                ttftEmitted = true;
                const ttftMs = Date.now() - requestStartedAt;
                if (typeof onTtft === "function") onTtft(ttftMs);
                yield { text: parsed.delta, ttftMs };
              } else {
                yield { text: parsed.delta };
              }
            } else if (
              parsed.type === "response.completed" &&
              parsed.response
            ) {
              const u = parsed.response.usage;
              if (u && typeof u === "object") usage = mapUsage(u);
              finishReason = parsed.response.status || "stop";
              sawDone = true;
            } else if (parsed.usage) {
              usage = mapUsage(parsed.usage);
            }
            continue;
          }
          if (parsed.usage) usage = mapUsage(parsed.usage);
          const choice = parsed.choices && parsed.choices[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          if (choice?.delta) {
            // Reasoning deltas (reasoning_content / reasoning) are tracked for
            // diagnostics but never yielded as user-visible content. TTFT
            // measures time to first *content*.
            const reasoningDelta = reasoningDeltaOf(choice.delta);
            const delta = extractContentText(choice.delta.content);
            if (delta) {
              if (!ttftEmitted) {
                ttftEmitted = true;
                const ttftMs = Date.now() - requestStartedAt;
                if (typeof onTtft === "function") onTtft(ttftMs);
                yield { text: delta, ttftMs };
              } else {
                yield { text: delta };
              }
            } else if (reasoningDelta) {
              // Internal reasoning signal for diagnostics (not user-visible).
              // Keep TTFT pending until real content arrives.
              yield { text: "", reasoning: reasoningDelta };
            }
          }
          if (choice?.finish_reason) sawDone = true;
        }
      }
      if (!sawDone && finishReason === null && !ttftEmitted) {
        // No chunks at all: treat as empty response.
        throw new Error("empty streaming response");
      }
      // A stream that ends on content without [DONE]/finish_reason is
      // accepted: the accumulated text is the answer.
      yield { text: "", usage, finishReason };
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Already released.
      }
    }
  } catch (err) {
    if (deadlineHit) {
      const failure = new Error(
        `${label} provider timed out (${firstChunk ? `no response within ${Math.ceil(ttftTimeoutMs / 1000)}s` : `no data for ${Math.ceil(idleTimeoutMs / 1000)}s mid-stream`}). The provider may be overloaded — please try again in a moment.`,
      );
      failure.status = 504;
      failure.retryable = true;
      throw failure;
    }
    throw err;
  } finally {
    clearTimers();
    if (signal) signal.removeEventListener("abort", forwardAbort);
  }
}

export async function callChatEndpoint({
  endpoint,
  api,
  key,
  model,
  label,
  messages,
  signal,
  extraHeaders = {},
  bodyExtra = {},
  timeoutMs = DEFAULT_NONSTREAM_TIMEOUT_MS,
}) {
  // Deadline guard: same rationale as the streaming endpoint — a hung
  // non-stream call must fail (504, transient) so the chain retries or falls
  // back instead of hanging the whole request until the platform kills it.
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forwardAbort, { once: true });
  }
  let deadlineHit = false;
  const timer = setTimeout(() => {
    deadlineHit = true;
    controller.abort();
  }, timeoutMs);
  const responsesApi = resolveApiMode({ endpoint, api }) === "responses";
  const requestBody = responsesApi
    ? { model, input: toResponsesInput(messages), ...bodyExtra }
    : { model, messages, ...bodyExtra };

  try {
    // Every provider gets its own Authorization header from its own key:
    // credentials are never merged or forwarded between providers.
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      const failure = new Error(
        `HTTP ${response.status}: ${safeErrorDetail(detail)}`,
      );
      failure.status = response.status;
      const retryAfter = Number(response.headers.get("Retry-After") || 0);
      if (Number.isFinite(retryAfter) && retryAfter > 0)
        failure.retryAfter = retryAfter;
      return { failure };
    }

    const data = await response.json();
    if (responsesApi) {
      // Responses API: primary format is `output` array; acceptance of
      // `choices` is retained for explicit responses-mode overrides.
      if (Array.isArray(data.output)) {
        const { content, reasoning, usage, stopReason } =
          extractResponsesContent(data);
        if (content) {
          return {
            content,
            reasoning,
            model: `${label}:${model}`,
            usage,
            stopReason,
          };
        }
        const choiceMessage = data?.choices?.[0]?.message;
        if (choiceMessage) {
          return chatCompletionResult(data, label, model, {
            usageFallback: usage,
            stopReasonFallback: stopReason,
          });
        }
        // No content at all — return empty success for outer empty handling.
        return {
          content: "",
          reasoning,
          model: `${label}:${model}`,
          usage,
          stopReason,
        };
      }
      const fallbackMessage = data?.choices?.[0]?.message;
      if (fallbackMessage !== undefined) {
        return chatCompletionResult(data, label, model);
      }
      const { content, reasoning, usage, stopReason } =
        extractResponsesContent(data);
      return {
        content,
        reasoning,
        model: `${label}:${model}`,
        usage,
        stopReason,
      };
    }
    return chatCompletionResult(data, label, model);
  } catch (err) {
    if (deadlineHit) {
      const failure = new Error(
        `${label} provider timed out after ${Math.ceil(timeoutMs / 1000)}s. The provider may be overloaded — please try again in a moment.`,
      );
      failure.status = 504;
      failure.retryable = true;
      return { failure };
    }
    console.warn(
      `${label} model ${model} request failed:`,
      safeErrorDetail(err),
    );
    const failure =
      err instanceof Error ? err : new Error(safeErrorDetail(err));
    if (failure.status === undefined && Number(err?.status))
      failure.status = Number(err.status);
    if (err?.retryAfter) failure.retryAfter = err.retryAfter;
    return { failure };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", forwardAbort);
  }
}
