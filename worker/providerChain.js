// Unified worker chat provider chain.
//
// Chat is OpenCode Go only (no DeepSeek/OpenRouter text fallback). This module
// owns retry scheduling, persisted resumable tasks, session affinity, and the
// streaming event contract. Request shaping and the HTTP/SSE client live in
// opencodeClient.js; image generation lives in imageProvider.js.

import {
  classifyProviderFailure,
  createTaskStateStore,
  safeErrorDetail,
} from "./utils.js";
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_NONSTREAM_TIMEOUT_MS,
  DEFAULT_TTFT_TIMEOUT_MS,
  OPENCODE_DEFAULT_ENDPOINT,
  OPENCODE_SESSION_HEADER,
  callChatEndpoint,
  resolveApiMode,
  resolveOpencodeSessionId,
  streamChatEndpoint,
} from "./opencodeClient.js";

export const DEFAULT_MODEL = "deepseek-flash";

// Transient failures are retried with adaptive exponential backoff (base
// 750ms doubling, jittered, honouring the provider's Retry-After) until
// recovery, cancellation, permanent classification, or the single request's
// practical window. Beyond that window the retry schedule is persisted so a
// later invocation resumes the same task instead of returning a 502.
const RETRY_STORE_PREFIX = "retry/";
// The retry schedule is also mirrored under `task-status/<taskId>` so the
// public GET /api/task/<taskId> endpoint can report when a deferred task
// becomes eligible again (the retry key itself embeds the provider id and
// message hash, which the client never sees).
export const TASK_STATUS_STORE_PREFIX = "task-status/";

async function persistRetrySchedule(store, retryKey, taskId, schedule) {
  await store.save(retryKey, schedule);
  if (taskId) {
    await store.save(`${TASK_STATUS_STORE_PREFIX}${taskId}`, {
      ...schedule,
      retryKey,
    });
  }
}

async function clearRetrySchedule(store, retryKey, taskId) {
  await store.remove(retryKey);
  if (taskId) {
    await store.remove(`${TASK_STATUS_STORE_PREFIX}${taskId}`);
  }
}

const BACKOFF_BASE_MS = 750;
const BACKOFF_JITTER_MS = 500;
const MAX_SINGLE_SLEEP_MS = 30_000;
const DEFAULT_REQUEST_RETRY_MS = 30_000;
// Streaming retries: a 429/5xx that clears within seconds must ride through
// inside the open stream instead of failing the chat instantly. Attempts are
// bounded so a hard outage still fails honestly.
const MAX_STREAM_TRANSIENT_ATTEMPTS = 8;
const SLEEP_CHUNK_MS = 250;

function envTimeoutMs(env, key, fallback) {
  const value = Number(env?.[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isDisabled(value) {
  if (value === undefined || value === null) return false;
  const str = String(value).trim().toLowerCase();
  return str !== "" && str !== "false" && str !== "0" && str !== "no";
}

async function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultClock() {
  return Date.now();
}

// Wrap an async iterable in a backpressure-aware ReadableStream.
export function iterableToReadableStream(iterable) {
  const iterator = iterable[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      if (typeof iterator.return === "function") {
        iterator.return().catch(() => {});
      }
    },
  });
}

function taskHash(messages) {
  const input = JSON.stringify(messages || []);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Sleeps in small chunks so a client disconnect interrupts the backoff
// promptly instead of waiting out the whole window.
async function sleepInterruptible(ms, signal, sleep) {
  let remaining = ms;
  while (remaining > 0) {
    if (signal?.aborted) return;
    const step = Math.min(SLEEP_CHUNK_MS, remaining);
    await sleep(step);
    remaining -= step;
  }
}

/**
 * Build the chat provider chain — SINGLE provider only.
 * Cloudflare Chat ( /api/ai ) uses OPENCODE_GO_API_KEY exclusively.
 * No DeepSeek or OpenRouter fallback for chat. Image generation
 * (callOpenRouterImage in imageProvider.js) still uses OPENROUTER_API_KEY
 * separately when configured. Disable with OPENCODE_GO_DISABLED (any truthy
 * value).
 */
export function buildProviderChain(env = {}, extra = {}) {
  const chain = [];
  // Session affinity for the OpenCode gateway (required header, resolved once
  // per chain so every attempt in the run shares it).
  const defaultSessionId = resolveOpencodeSessionId(extra?.sessionId);
  const ttftTimeoutMs = envTimeoutMs(
    env,
    "AI_TTFT_TIMEOUT_MS",
    DEFAULT_TTFT_TIMEOUT_MS,
  );
  const idleTimeoutMs = envTimeoutMs(
    env,
    "AI_IDLE_TIMEOUT_MS",
    DEFAULT_IDLE_TIMEOUT_MS,
  );
  const nonstreamTimeoutMs = envTimeoutMs(
    env,
    "AI_NONSTREAM_TIMEOUT_MS",
    DEFAULT_NONSTREAM_TIMEOUT_MS,
  );

  const opencodeKey = env?.OPENCODE_GO_API_KEY || env?.OPENCODE_API_KEY;
  if (opencodeKey && !isDisabled(env?.OPENCODE_GO_DISABLED)) {
    const rawModel =
      String(env?.OPENCODE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    // Guard against a misconfigured env that points the main text model at the
    // vision-only MiMo family (vendor-prefixed or future ids included).
    const model = /^(?:xiaomi\/)?mimo(?:-|$)/i.test(rawModel)
      ? DEFAULT_MODEL
      : rawModel;
    const endpoint = env?.OPENCODE_ENDPOINT || OPENCODE_DEFAULT_ENDPOINT;
    const api = resolveApiMode({ endpoint, api: env?.OPENCODE_API_MODE });
    const callOptions = (sessionId) => ({
      endpoint,
      api,
      key: opencodeKey,
      model,
      label: "opencode",
      extraHeaders: {
        "HTTP-Referer": "https://corez.ai",
        "X-Title": "COREZ AI",
        // Required by the OpenCode gateway (HTTP 400 MissingSessionID
        // without it). Stable per chain so every attempt in the run shares
        // one affinity id.
        [OPENCODE_SESSION_HEADER]: sessionId || defaultSessionId,
      },
      ttftTimeoutMs,
      idleTimeoutMs,
      timeoutMs: nonstreamTimeoutMs,
    });
    const buildBodyExtra = (options = {}) => {
      const bodyExtra = { ...(options.bodyExtra || {}) };
      // Reasoning hints are model-specific: OPENCODE_REASONING_DISABLED lets
      // an operator switch to a non-reasoning model without a 400.
      if (options.reasoning && !isDisabled(env?.OPENCODE_REASONING_DISABLED)) {
        bodyExtra.reasoning = options.reasoning;
      }
      if (Number.isFinite(options.temperature))
        bodyExtra.temperature = options.temperature;
      return bodyExtra;
    };
    chain.push({
      id: "opencode-go",
      label: "opencode",
      model,
      call: (messages, options = {}) =>
        callChatEndpoint({
          ...callOptions(options.sessionId),
          messages,
          signal: options.signal,
          bodyExtra: buildBodyExtra(options),
          ...(options.model ? { model: options.model } : {}),
        }),
      stream: (messages, options = {}) =>
        streamChatEndpoint({
          ...callOptions(options.sessionId),
          messages,
          signal: options.signal,
          onTtft: options.onTtft,
          bodyExtra: buildBodyExtra(options),
          ...(options.model ? { model: options.model } : {}),
        }),
    });
  }

  // NOTE: Fallback text providers are intentionally NOT part of the chat chain.
  // Chat is OpenCode Go only. Image generation via callOpenRouterImage()
  // still uses its own key when present.

  return chain;
}

/**
 * Run the provider chain for a task. The same messages travel to every
 * provider, so a fallback resumes the same work — completed work is never
 * restarted. Transient failures (408, 429, 5xx, network) are retried with
 * adaptive backoff until recovery, cancellation, permanent classification, or
 * the single request's practical window. Beyond the window the retry schedule
 * is persisted under `retry/<providerId>/<hash>` (via createTaskStateStore)
 * and a resumable taskId is returned so a later invocation continues instead
 * of failing with a 502. The gateway session id is persisted with the schedule
 * so a resumed task keeps the original backend affinity and token cache.
 *
 * Options: { env, signal, sleep, clock, jitter, store, maxRequestRetryMs,
 * taskHash, taskId, model, reasoning, temperature, bodyExtra, sessionId } —
 * sleep/clock/jitter are injectable for deterministic tests. `model` overrides
 * the provider's configured model for this call (e.g. the harness build phase
 * pins deepseek-flash). `reasoning` and `temperature` are forwarded as body
 * fields for reasoning models. Every request is uncapped: the provider decides
 * how long it generates, and no output ceiling is ever sent.
 */
export async function runProviderChain(messages, options = {}) {
  const env = options.env || {};
  const signal = options.signal || null;
  const clock = options.clock || defaultClock;
  const sleep = options.sleep || defaultSleep;
  const jitter = options.jitter || Math.random;
  const store =
    options.store !== undefined ? options.store : createTaskStateStore(env);
  const maxRequestRetryMs =
    Number.isFinite(options.maxRequestRetryMs) && options.maxRequestRetryMs >= 0
      ? options.maxRequestRetryMs
      : DEFAULT_REQUEST_RETRY_MS;
  const hash =
    typeof options.taskHash === "string" && options.taskHash
      ? options.taskHash
      : taskHash(messages);
  const taskId =
    typeof options.taskId === "string" && options.taskId
      ? options.taskId
      : `rt-${hash}`;
  const sessionId = resolveOpencodeSessionId(options.sessionId);

  // An already-aborted signal must not spend a provider call.
  if (signal?.aborted) return { taskId, status: "cancelled" };

  const failures = [];
  let lastErrorStatus = 0;
  const recordFailure = (label, reason) => {
    const safe = safeErrorDetail(reason);
    if (safe) failures.push(`${label}: ${safe}`);
  };

  const startedAt = clock();
  const providers = buildProviderChain(env, { sessionId });

  for (const provider of providers) {
    let attempt = 0;
    let resumed = false;
    // A resumed task reuses the persisted session id so the gateway keeps the
    // backend (and its prompt/token cache) from the original run.
    let providerSessionId = sessionId;
    const retryKey = `${RETRY_STORE_PREFIX}${provider.id}/${hash}`;

    if (store) {
      let schedule = null;
      try {
        schedule = await store.load(retryKey);
      } catch {
        // Corrupt or missing record behaves as absent.
      }
      if (schedule && schedule.status === "retry-scheduled") {
        resumed = true;
        attempt = Math.max(0, Number(schedule.attempt) || 0);
        if (typeof schedule.sessionId === "string" && schedule.sessionId) {
          providerSessionId = schedule.sessionId;
        }
        const waitMs = Math.max(
          0,
          (Number(schedule.nextEligibleAt) || 0) - clock(),
        );
        if (waitMs > 0) {
          if (waitMs > maxRequestRetryMs) {
            // Still outside this invocation's practical window: keep the
            // persisted schedule and tell the client when to come back.
            return {
              taskId,
              status: "retry-scheduled",
              retryAfterSeconds: Math.ceil(waitMs / 1000),
              provider: provider.id,
            };
          }
          await sleepInterruptible(waitMs, signal, sleep);
          if (signal?.aborted) return { taskId, status: "cancelled" };
        }
      }
    }

    const callProvider = () =>
      provider.call(messages, {
        signal,
        model: options.model,
        reasoning: options.reasoning,
        temperature: options.temperature,
        bodyExtra: options.bodyExtra,
        sessionId: providerSessionId,
      });

    let result = await callProvider();

    while (result?.failure) {
      const cls = classifyProviderFailure(result.failure);
      recordFailure(provider.label, result.failure);
      lastErrorStatus =
        Number(result.failure?.status) > 0
          ? Number(result.failure.status)
          : lastErrorStatus;

      if (cls.kind === "permanent") {
        // Authentication, validation, unsupported-model etc.: never retried.
        if (store) {
          try {
            await clearRetrySchedule(store, retryKey, taskId);
          } catch {
            // Best effort.
          }
        }
        break;
      }

      if (signal?.aborted) return { taskId, status: "cancelled" };

      attempt += 1;
      const backoffMs =
        cls.retryAfterMs > 0
          ? cls.retryAfterMs
          : Math.min(
              BACKOFF_BASE_MS * 2 ** (attempt - 1) +
                jitter() * BACKOFF_JITTER_MS,
              MAX_SINGLE_SLEEP_MS,
            );
      const now = clock();
      const nextEligibleAt = now + backoffMs;

      if (now - startedAt + backoffMs > maxRequestRetryMs) {
        // The provider cannot recover within this request's practical window:
        // persist the retry schedule so a later invocation resumes the task.
        if (store) {
          try {
            await persistRetrySchedule(store, retryKey, taskId, {
              provider: provider.id,
              providerLabel: provider.label,
              taskId,
              attempt,
              nextEligibleAt,
              sessionId: providerSessionId,
              status: "retry-scheduled",
              lastError: safeErrorDetail(result.failure),
            });
          } catch {
            // Best effort.
          }
        }
        return {
          taskId,
          status: "retry-scheduled",
          retryAfterSeconds: Math.max(1, Math.ceil(backoffMs / 1000)),
          provider: provider.id,
        };
      }

      await sleepInterruptible(backoffMs, signal, sleep);
      if (signal?.aborted) return { taskId, status: "cancelled" };
      result = await callProvider();
    }

    if (result?.content) {
      if (store) {
        try {
          await clearRetrySchedule(store, retryKey, taskId);
        } catch {
          // Best effort.
        }
      }
      return {
        content: result.content,
        model: result.model || `${provider.label}:${provider.model}`,
        provider: provider.id,
        taskId,
        resumed,
        usage: result.usage || null,
        stopReason: result.stopReason || null,
      };
    }

    // Reasoning-only or empty reply: no built-in recovery — record the
    // failure and let the next provider in the chain try. If no provider
    // produces a usable answer the request fails honestly.
    if (!result || !result.failure) {
      recordFailure(provider.label, "empty or reasoning-only response");
      if (signal?.aborted) return { taskId, status: "cancelled" };
    }
  }

  return {
    status: "failed",
    error:
      failures.slice(0, 3).join(" | ").slice(0, 300) ||
      "all providers returned no usable response",
    errorStatus: lastErrorStatus,
    taskId,
  };
}

/**
 * Streaming variant of runProviderChain. Returns a ReadableStream of events:
 *
 *   { type: 'meta', provider, model }
 *   { type: 'delta', text }
 *   { type: 'usage', inputTokens, outputTokens }
 *   { type: 'done', finishReason, ttftMs, totalMs, provider, model, resumed }
 *   { type: 'error', message, status }  — all providers failed
 *
 * The same provider fallback order applies; a provider that fails mid-stream
 * falls through to the next one, and the client sees one meta event per
 * provider actually attempted. TTFT is measured per provider from request
 * start to its first delta. Empty or reasoning-only streams are failures of
 * that provider: there is no built-in recovery, the next provider is tried
 * and the request fails honestly if none produces content. Transient transport
 * failures (429 rate limits, 5xx, network blips) are retried on the SAME
 * provider with backoff (honouring Retry-After) inside the open stream, within
 * maxRequestRetryMs, before falling through — a rate-limit blip that clears in
 * seconds never surfaces to the user. A rate limit that outlasts the budget
 * fails as retryable 429 with a short message (never a raw provider dump) so
 * the client can back off and re-issue.
 */
export function runStreamingChain(messages, options = {}) {
  const env = options.env || {};
  const signal = options.signal || null;
  const clock = options.clock || defaultClock;
  const sleep = options.sleep || defaultSleep;
  const jitter = options.jitter || Math.random;
  // Optional per-call model override (e.g. the harness build phase pins its
  // own model): applied to whichever provider serves the request, and
  // reported in meta/done events instead of the provider's default model.
  const model = options.model || null;
  const reasoning = options.reasoning || null;
  const temperature = Number.isFinite(options.temperature)
    ? options.temperature
    : null;
  const bodyExtra = options.bodyExtra || null;

  const startedAt = clock();
  const providers = buildProviderChain(env, { sessionId: options.sessionId });
  const failureMessages = [];
  let onlyEmptyFailures = true;
  // Last transient (retryable-class) failure seen, for the rate-limit branch
  // of the terminal error below.
  let lastTransient = null;
  const maxRequestRetryMs =
    Number.isFinite(options.maxRequestRetryMs) &&
    options.maxRequestRetryMs >= 0
      ? options.maxRequestRetryMs
      : DEFAULT_REQUEST_RETRY_MS;

  async function* events() {
    // An already-aborted signal must not spend a provider call.
    if (signal?.aborted) {
      yield {
        type: "error",
        message: "AI request cancelled.",
        status: 499,
      };
      return;
    }
    if (providers.length === 0) {
      yield {
        type: "error",
        message: "No AI provider key configured on this deployment.",
        status: 502,
      };
      return;
    }

    for (const provider of providers) {
      yield {
        type: "meta",
        provider: provider.id,
        model: model || provider.model,
      };
      const ttftHolder = { ms: 0 };
      let emptyAttempts = 0;
      const MAX_EMPTY_ATTEMPTS = 3;
      // Chars already streamed to the client for this provider: a failure
      // after partial content cannot resume without duplicating it.
      let streamedChars = 0;
      let transientAttempts = 0;
      while (true) {
        try {
          // Streams a candidate message set, yielding deltas and returning the
          // accumulated text/usage/finish. Built as a generator so deltas flow
          // through to the client immediately.
          async function* tryStream(msgs) {
            const iter = provider.stream(msgs, {
              signal,
              onTtft: (ms) => {
                ttftHolder.ms = ttftHolder.ms || ms;
              },
              model,
              reasoning,
              temperature,
              bodyExtra,
            });
            let text = "";
            let usage = null;
            let finishReason = null;
            for await (const chunk of iter) {
              if (chunk.text) {
                streamedChars += chunk.text.length;
                text += chunk.text;
                yield { type: "delta", text: chunk.text };
              }
              if (chunk.usage) usage = chunk.usage;
              if (chunk.finishReason) finishReason = chunk.finishReason;
            }
            return { text, usage, finishReason };
          }
          let got = yield* tryStream(messages);
          if (!got.text.trim()) {
            emptyAttempts += 1;
            // Reasoning models occasionally emit only thinking with no
            // content. That is transient, not permanent: retry the SAME
            // provider a bounded number of times (short backoff) before
            // falling through to the next provider.
            if (emptyAttempts < MAX_EMPTY_ATTEMPTS && !signal?.aborted) {
              await sleep(750 * emptyAttempts);
              continue;
            }
            failureMessages.push(
              `${provider.label}: empty or reasoning-only stream`,
            );
            if (signal?.aborted) {
              yield {
                type: "error",
                message: "AI request cancelled.",
                status: 499,
              };
              return;
            }
            break;
          }
          yield {
            type: "usage",
            inputTokens: got.usage?.inputTokens ?? 0,
            outputTokens: got.usage?.outputTokens ?? 0,
          };
          yield {
            type: "done",
            finishReason: got.finishReason || "stop",
            ttftMs: ttftHolder.ms || 0,
            totalMs: clock() - startedAt,
            provider: provider.id,
            model: model || provider.model,
          };
          return;
        } catch (err) {
          onlyEmptyFailures = false;
          const failure =
            err instanceof Error ? err : new Error(safeErrorDetail(err));
          const cls = classifyProviderFailure(failure);
          failureMessages.push(
            `${provider.label}: ${safeErrorDetail(failure)}`,
          );
          if (signal?.aborted) {
            yield {
              type: "error",
              message: "AI request cancelled.",
              status: 499,
            };
            return;
          }
          // Permanent failures (auth, validation, bad model) are never
          // retried; partial streams cannot resume without duplicating
          // content already sent to the client.
          if (cls.kind !== "transient" || streamedChars > 0) {
            break;
          }
          // Transient blip (429 rate limit, 5xx, network): back off on the
          // SAME provider inside the open stream, honouring Retry-After.
          transientAttempts += 1;
          lastTransient = {
            status: Number(failure?.status) || 0,
            retryAfter: Number(failure?.retryAfter) || 0,
            message: String(failure?.message || ""),
          };
          const backoffMs =
            cls.retryAfterMs > 0
              ? Math.min(cls.retryAfterMs, MAX_SINGLE_SLEEP_MS)
              : Math.min(
                  BACKOFF_BASE_MS * 2 ** (transientAttempts - 1) +
                    jitter() * BACKOFF_JITTER_MS,
                  MAX_SINGLE_SLEEP_MS,
                );
          if (
            transientAttempts >= MAX_STREAM_TRANSIENT_ATTEMPTS ||
            clock() - startedAt + backoffMs > maxRequestRetryMs
          ) {
            break;
          }
          await sleepInterruptible(backoffMs, signal, sleep);
          if (signal?.aborted) {
            yield {
              type: "error",
              message: "AI request cancelled.",
              status: 499,
            };
            return;
          }
          continue;
        }
      }
    }
    const rateLimited =
      lastTransient &&
      (lastTransient.status === 429 ||
        /429|rate.?limit|too many requests/i.test(lastTransient.message));
    if (rateLimited) {
      // A rate limit that outlasted the in-stream budget: fail as retryable
      // 429 with a short message (never a raw provider JSON dump) so the
      // client backs off and re-issues instead of showing a dead end.
      const retryAfterSeconds =
        Number.isFinite(lastTransient.retryAfter) &&
        lastTransient.retryAfter > 0
          ? Math.max(1, Math.ceil(lastTransient.retryAfter))
          : undefined;
      yield {
        type: "error",
        message:
          "The AI service is rate-limited right now and automatic retries are backing off. Please wait a moment and try again.",
        status: 429,
        retryable: true,
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      };
      return;
    }
    // Empty/reasoning-only streams are TRANSIENT by nature (the model just
    // thought without answering): when every provider failed that way, the
    // error is retryable (503) so the client's harness auto-resume re-issues
    // the identical request instead of treating it as permanent. Hard
    // provider errors (auth, validation) stay non-retryable 502.
    yield {
      type: "error",
      message:
        failureMessages.slice(0, 3).join(" | ").slice(0, 300) ||
        "all providers returned no usable stream",
      status: onlyEmptyFailures ? 503 : 502,
      ...(onlyEmptyFailures ? { retryable: true } : {}),
    };
  }

  return iterableToReadableStream(events());
}
