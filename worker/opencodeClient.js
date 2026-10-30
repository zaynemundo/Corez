// OpenCode Go / Zen client.
//
// One client for the gateway's Responses API (the default — required by the
// configured DeepSeek model) and its chat-completions API (selected only
// when an endpoint override explicitly asks for it): request shaping, deadline
// guards, SSE streaming, usage mapping, and empty-response detection. Failure
// classification, retries and scheduling live in providerChain.js; this module
// never retries on its own and never sends output-token caps.

import { safeErrorDetail } from "./utils.js";
import {
  OPENCODE_SESSION_HEADER,
  newOpencodeSessionId,
  resolveOpencodeSessionId,
} from "../packages/agent-core/providers/session.js";
import {
  parseResponsesStore,
  rejectsReasoningTransport,
  resolveApiMode,
  toGatewayReasoning,
  wantsResponsesReasoning,
  withResponsesReasoningPayload,
  withResponsesStoreOptOut,
} from "../packages/agent-core/providers/endpoint.js";
import {
  createThinkingStreamFilter,
  extractContentText,
  stripThinkingBlocks,
} from "../packages/agent-core/providers/text.js";

export {
  OPENCODE_SESSION_HEADER,
  newOpencodeSessionId,
  parseResponsesStore,
  rejectsReasoningTransport,
  resolveApiMode,
  resolveOpencodeSessionId,
  toGatewayReasoning,
  wantsResponsesReasoning,
  withResponsesReasoningPayload,
};

export const OPENCODE_DEFAULT_ENDPOINT =
  "https://opencode.ai/zen/go/v1/responses";

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

// Text out of a Responses reasoning item. The gateway may deliver reasoning
// as a summary part (summary_text) or a full reasoning part (reasoning_text /
// content), and either may arrive as a delta or as one completed segment.
function reasoningItemText(item) {
  if (!item || typeof item !== "object") return "";
  const parts = Array.isArray(item.summary)
    ? item.summary
    : Array.isArray(item.content)
      ? item.content
      : [];
  return parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (typeof part.text === "string") return part.text;
      return extractContentText(part);
    })
    .join("");
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

// A gateway that does not implement the optional reasoning transport fields
// answers 400 naming them. Only that specific rejection triggers the fallback
// ladder (see rejectsReasoningTransport); any other status is returned as-is
// so the caller sees the real error.
async function sendStreamRequest(
  attempts,
  { endpoint, key, extraHeaders, signal },
) {
  let lastResponse = null;
  // Sequential by design: the next fallback is only tried after the previous
  // rejection is observed, so the attempts can never race.
  for (const [index, body] of attempts.entries()) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal,
    });
    lastResponse = response;
    const isLast = index === attempts.length - 1;
    if (!isLast && response.status === 400) {
      const detail = await response.text().catch(() => "");
      if (!rejectsReasoningTransport(response.status, detail)) return response;
      continue;
    }
    return response;
  }
  return lastResponse;
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
  env = null,
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
  // The Responses API has no `exclude` field and only returns reasoning text
  // when a summary is requested — map the canonical { effort, exclude }
  // shape to the wire format (see toGatewayReasoning).
  if (requestBody.reasoning !== undefined) {
    requestBody.reasoning = toGatewayReasoning(
      requestBody.reasoning,
      responsesApi ? "responses" : "chat",
    );
  }
  // Visible reasoning on the Responses API also needs `store: true` and
  // `include: ['reasoning.encrypted_content']` for the gateway to emit the
  // reasoning stream. `OPENCODE_RESPONSES_STORE` is a positive
  // "storage enabled" setting: `false`/`0`/`no`/`off` send an explicit
  // `store: false` (never an omitted field) and omit the include path.
  const reasoningVisible =
    responsesApi && wantsResponsesReasoning(requestBody.reasoning);
  const storeEnabled = parseResponsesStore(env?.OPENCODE_RESPONSES_STORE);
  // Three-tier fallback for strict gateways, most-capable first:
  //   1. transport fields as configured (store explicit, include when storing)
  //   2. store explicitly denied, summary request kept
  //   3. the plain body with no optional reasoning transport fields
  const reasoningAttempts = reasoningVisible
    ? [
        withResponsesReasoningPayload(requestBody, requestBody.reasoning, {
          storeEnabled,
        }),
        withResponsesReasoningPayload(requestBody, requestBody.reasoning, {
          storeEnabled: false,
          includeReasoningContent: true,
        }),
        requestBody,
      ]
    : [requestBody];
  // Every attempt carries the deployment's storage opt-out. The plain fallback
  // and the no-visible-reasoning path used to send no `store` field at all,
  // which silently dropped the opt-out and left retention to the gateway's
  // default. The opt-out is a transport requirement, not an optional reasoning
  // field, so stripping reasoning fields never strips it.
  const attempts = reasoningAttempts.map((attempt) =>
    withResponsesStoreOptOut(attempt, storeEnabled),
  );

  try {
    const response = await sendStreamRequest(attempts, {
      endpoint,
      key,
      extraHeaders,
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
    // Some gateways send reasoning twice: token deltas and then a completed
    // summary item with the full text. Emitting both duplicates the whole
    // thinking panel, so completed copies are only a fallback.
    let sawReasoningDelta = false;
    // Stateful stripper for inline <think>/<thinking> blocks: tags may be
    // split across chunks, so filtering must span the whole stream.
    const thinkingFilter = createThinkingStreamFilter();

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
              const delta = thinkingFilter.push(parsed.delta);
              if (!delta) continue;
              if (!ttftEmitted) {
                ttftEmitted = true;
                const ttftMs = Date.now() - requestStartedAt;
                if (typeof onTtft === "function") onTtft(ttftMs);
                yield { text: delta, ttftMs };
              } else {
                yield { text: delta };
              }
            } else if (
              (parsed.type === "response.reasoning_summary_text.delta" ||
                parsed.type === "response.reasoning_text.delta") &&
              typeof parsed.delta === "string" &&
              parsed.delta
            ) {
              // Reasoning stays an internal signal for the thinking panel;
              // it is never yielded as answer content.
              sawReasoningDelta = true;
              yield { text: "", reasoning: parsed.delta };
            } else if (
              // Some gateways deliver reasoning as one completed segment
              // instead of token deltas.
              (parsed.type === "response.reasoning_summary_text.done" ||
                parsed.type === "response.reasoning_text.done") &&
              typeof parsed.text === "string" &&
              parsed.text &&
              !sawReasoningDelta
            ) {
              yield { text: "", reasoning: parsed.text };
            } else if (
              // Reasoning may also arrive as a completed output item with
              // summary/content parts (encrypted blobs carry no text and are
              // ignored by reasoningItemText).
              parsed.type === "response.output_item.done" &&
              parsed.item?.type === "reasoning" &&
              !sawReasoningDelta
            ) {
              const reasoningText = reasoningItemText(parsed.item);
              if (reasoningText) yield { text: "", reasoning: reasoningText };
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
            // measures time to first *filtered* content: inline <think> blocks
            // are stripped here, which also covers models that emit reasoning
            // into the content field instead of reasoning_content.
            const reasoningDelta = reasoningDeltaOf(choice.delta);
            const delta = thinkingFilter.push(
              extractContentText(choice.delta.content),
            );
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
      // Release a held-back partial tag; an unclosed thinking block swallows
      // its remainder (truncated mid-thought), leaving no content.
      const tail = thinkingFilter.flush();
      if (tail) {
        if (!ttftEmitted) {
          ttftEmitted = true;
          const ttftMs = Date.now() - requestStartedAt;
          if (typeof onTtft === "function") onTtft(ttftMs);
          yield { text: tail, ttftMs };
        } else {
          yield { text: tail };
        }
      }
      if (!sawDone && finishReason === null && !ttftEmitted) {
        // No chunks at all (or reasoning-only output): empty response.
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
  // Same wire-shape mapping as the streaming path (see toGatewayReasoning).
  if (requestBody.reasoning !== undefined) {
    requestBody.reasoning = toGatewayReasoning(
      requestBody.reasoning,
      responsesApi ? "responses" : "chat",
    );
  }

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
