import { classifyProviderFailure, createTaskStateStore, safeErrorDetail } from './utils.js';

export const OPENCODE_DEFAULT_ENDPOINT = 'https://opencode.ai/zen/go/v1/chat/completions';
export const DEEPSEEK_DEFAULT_ENDPOINT = 'https://api.deepseek.com/chat/completions';
export const OPENROUTER_DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_MODEL = 'deepseek-v4-flash';

// OpenRouter retired black-forest-labs/flux-1-schnell, so image generation
// uses Google's Nano Banana 2 lite (Gemini 3.1 Flash Lite Image) only.
// OPENROUTER_IMAGE_MODEL overrides the chain with a single model.
export const DEFAULT_IMAGE_MODEL_CHAIN = [
  'google/gemini-3.1-flash-lite-image'
];

// Transient failures are retried with adaptive exponential backoff (base
// 750ms doubling, jittered, honouring the provider's Retry-After) until
// recovery, cancellation, permanent classification, or the single request's
// practical window. Beyond that window the retry schedule is persisted so a
// later invocation resumes the same task instead of returning a 502.
const RETRY_STORE_PREFIX = 'retry/';
// The retry schedule is also mirrored under `task-status/<taskId>` so the
// public GET /api/task/<taskId> endpoint can report when a deferred task
// becomes eligible again (the retry key itself embeds the provider id and
// message hash, which the client never sees).
export const TASK_STATUS_STORE_PREFIX = 'task-status/';

async function persistRetrySchedule(store, retryKey, taskId, schedule) {
  await store.save(retryKey, schedule);
  if (taskId) {
    await store.save(`${TASK_STATUS_STORE_PREFIX}${taskId}`, { ...schedule, retryKey });
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
const SLEEP_CHUNK_MS = 250;

function extractContentText(content) {
  if (typeof content === 'string') return content;
  // Multimodal responses can wrap text in content parts: [{ type, text }]
  if (Array.isArray(content)) {
    return content
      .map(part => (part && typeof part === 'object' && typeof part.text === 'string') ? part.text : '')
      .join('');
  }
  return '';
}

// Reasoning models can emit their internal thought inline wrapped in
// <think>/<thinking> blocks. Strip those sections so thinking text is never
// presented as the answer. An unclosed block (output truncated mid-thought)
// is reasoning too: everything from the marker onward is dropped, since any
// real answer would only ever follow a closed block.
function stripThinkingBlocks(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<(?:think|thinking)\b[^>]*>[\s\S]*$/gi, '')
    .trim();
}

// The real answer of a chat message is its content field. reasoning_content
// is internal model thought: it is a retry signal, never the answer (surfacing
// it previously handed users raw <think> dumps instead of the requested code).
function answerText(message) {
  if (!message || typeof message !== 'object') return '';
  return stripThinkingBlocks(extractContentText(message.content));
}

function hasReasoning(message) {
  if (!message || typeof message !== 'object') return false;
  const reasoning = extractContentText(message.reasoning_content);
  if (reasoning.trim()) return true;
  return /<(?:think|thinking)\b/i.test(extractContentText(message.content));
}

function isDisabled(value) {
  if (value === undefined || value === null) return false;
  const str = String(value).trim().toLowerCase();
  return str !== '' && str !== 'false' && str !== '0' && str !== 'no';
}

async function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultClock() {
  return Date.now();
}

// Parse an SSE data line from a streaming OpenAI-compatible endpoint.
function parseSseData(line) {
  if (!line.startsWith('data:')) return null;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return { done: true };
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
 * Provider fallback is NOT handled here: runProviderChain owns the chain.
 */
async function* streamChatEndpoint({ endpoint, key, model, label, messages, signal, extraHeaders = {}, bodyExtra = {}, onTtft }) {
  const requestStartedAt = Date.now();
  let ttftEmitted = false;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...bodyExtra
    }),
    signal
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    const failure = new Error(`HTTP ${response.status}: ${safeErrorDetail(detail)}`);
    failure.status = response.status;
    const retryAfter = Number(response.headers.get('Retry-After') || 0);
    if (Number.isFinite(retryAfter) && retryAfter > 0) failure.retryAfter = retryAfter;
    throw failure;
  }

  if (!response.body) throw new Error(`${label} streaming response had no body`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = null;
  let finishReason = null;
  let sawDone = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const parsed = parseSseData(line.trim());
        if (!parsed) continue;
        if (parsed.done) {
          sawDone = true;
          continue;
        }
        if (parsed.usage) usage = parsed.usage;
        const choice = parsed.choices && parsed.choices[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (choice?.delta) {
          const delta = extractContentText(choice.delta.content);
          if (delta) {
            if (!ttftEmitted) {
              ttftEmitted = true;
              const ttftMs = Date.now() - requestStartedAt;
              if (typeof onTtft === 'function') onTtft(ttftMs);
              yield { text: delta, ttftMs };
            } else {
              yield { text: delta };
            }
          }
        }
      }
    }
    if (!sawDone && finishReason === null && !ttftEmitted) {
      // No chunks at all: treat as empty response.
      throw new Error('empty streaming response');
    }
    yield { text: '', usage, finishReason };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already released.
    }
  }
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
      if (typeof iterator.return === 'function') {
        iterator.return().catch(() => {});
      }
    }
  });
}

function taskHash(messages) {
  const input = JSON.stringify(messages || []);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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

async function callChatEndpoint({ endpoint, key, model, label, messages, signal, extraHeaders = {}, bodyExtra = {} }) {
  try {
    // Every provider gets its own Authorization header from its own key:
    // credentials are never merged or forwarded between providers.
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...extraHeaders
      },
      body: JSON.stringify({
        model,
        messages,
        ...bodyExtra
      }),
      signal
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 200);
      const failure = new Error(`HTTP ${response.status}: ${safeErrorDetail(detail)}`);
      failure.status = response.status;
      const retryAfter = Number(response.headers.get('Retry-After') || 0);
      if (Number.isFinite(retryAfter) && retryAfter > 0) failure.retryAfter = retryAfter;
      return { failure, classified: classifyProviderFailure(failure) };
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    return {
      content: answerText(message),
      reasoning: hasReasoning(message),
      model: `${label}:${model}`,
      usage: data?.usage
        ? {
            inputTokens: Number(data.usage.prompt_tokens) || 0,
            outputTokens: Number(data.usage.completion_tokens) || 0
          }
        : null,
      stopReason: data?.choices?.[0]?.finish_reason || null
    };
  } catch (err) {
    console.warn(`${label} model ${model} request failed:`, safeErrorDetail(err));
    const failure = err instanceof Error ? err : new Error(safeErrorDetail(err));
    if (failure.status === undefined && Number(err?.status)) failure.status = Number(err.status);
    if (err?.retryAfter) failure.retryAfter = err.retryAfter;
    return { failure, classified: classifyProviderFailure(failure) };
  }
}

/**
 * Build the ordered provider fallback chain: OpenCode Go is preferred and
 * stays preferred; the official DeepSeek API and OpenRouter are fallbacks
 * tried only when the preferred provider cannot serve. Any provider can be
 * disabled through OPENCODE_GO_DISABLED / DEEPSEEK_DISABLED /
 * OPENROUTER_DISABLED (any truthy value).
 */
export function buildProviderChain(env = {}) {
  const chain = [];

  const opencodeKey = env?.OPENCODE_GO_API_KEY || env?.OPENCODE_API_KEY;
  if (opencodeKey && !isDisabled(env?.OPENCODE_GO_DISABLED)) {
    const model = env?.OPENCODE_MODEL || DEFAULT_MODEL;
    const callOptions = (envOverrides = {}) => ({
      endpoint: envOverrides.endpoint || env?.OPENCODE_ENDPOINT || OPENCODE_DEFAULT_ENDPOINT,
      key: opencodeKey,
      model,
      label: 'opencode',
      extraHeaders: { 'HTTP-Referer': 'https://corez.ai', 'X-Title': 'COREZ AI' }
    });
    chain.push({
      id: 'opencode-go',
      label: 'opencode',
      model,
      call: (messages, options = {}) => callChatEndpoint({
        ...callOptions(),
        messages,
        signal: options.signal
      }),
      stream: (messages, options = {}) => streamChatEndpoint({
        ...callOptions(),
        messages,
        signal: options.signal,
        onTtft: options.onTtft
      })
    });
  }

  const deepseekKey = env?.DEEPSEEK_API_KEY;
  if (deepseekKey && !isDisabled(env?.DEEPSEEK_DISABLED)) {
    const model = env?.DEEPSEEK_MODEL || DEFAULT_MODEL;
    const callOptions = (envOverrides = {}) => ({
      endpoint: envOverrides.endpoint || env?.DEEPSEEK_ENDPOINT || DEEPSEEK_DEFAULT_ENDPOINT,
      key: deepseekKey,
      model,
      label: 'deepseek'
    });
    chain.push({
      id: 'deepseek',
      label: 'deepseek',
      model,
      call: (messages, options = {}) => callChatEndpoint({
        ...callOptions(),
        messages,
        signal: options.signal,
        bodyExtra: { stream: false }
      }),
      stream: (messages, options = {}) => streamChatEndpoint({
        ...callOptions(),
        messages,
        signal: options.signal,
        onTtft: options.onTtft
      })
    });
  }

  const openrouterKey = env?.OPENROUTER_API_KEY;
  if (openrouterKey && !isDisabled(env?.OPENROUTER_DISABLED)) {
    const model = env?.OPENROUTER_MODEL || DEFAULT_MODEL;
    const callOptions = (envOverrides = {}) => ({
      endpoint: envOverrides.endpoint || env?.OPENROUTER_ENDPOINT || OPENROUTER_DEFAULT_ENDPOINT,
      key: openrouterKey,
      model,
      label: 'openrouter',
      extraHeaders: { 'HTTP-Referer': 'https://corez.ai', 'X-Title': 'COREZ AI' }
    });
    chain.push({
      id: 'openrouter',
      label: 'openrouter',
      model,
      call: (messages, options = {}) => callChatEndpoint({
        ...callOptions(),
        messages,
        signal: options.signal
      }),
      stream: (messages, options = {}) => streamChatEndpoint({
        ...callOptions(),
        messages,
        signal: options.signal,
        onTtft: options.onTtft
      })
    });
  }

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
 * of failing with a 502.
 *
 * Options: { env, signal, sleep, clock, jitter, store, maxRequestRetryMs,
 * taskHash, taskId } — sleep/clock/jitter are injectable for deterministic
 * tests. Every request is uncapped: the provider decides how long it
 * generates, and no output ceiling is ever sent.
 */
export async function runProviderChain(messages, options = {}) {
  const env = options.env || {};
  const signal = options.signal || null;
  const clock = options.clock || defaultClock;
  const sleep = options.sleep || defaultSleep;
  const jitter = options.jitter || Math.random;
  const store = options.store !== undefined ? options.store : createTaskStateStore(env);
  const maxRequestRetryMs = Number.isFinite(options.maxRequestRetryMs) && options.maxRequestRetryMs >= 0
    ? options.maxRequestRetryMs
    : DEFAULT_REQUEST_RETRY_MS;
  const hash = typeof options.taskHash === 'string' && options.taskHash ? options.taskHash : taskHash(messages);
  const taskId = typeof options.taskId === 'string' && options.taskId ? options.taskId : `rt-${hash}`;

  const failures = [];
  let lastErrorStatus = 0;
  const recordFailure = (label, reason) => {
    const safe = safeErrorDetail(reason);
    if (safe) failures.push(`${label}: ${safe}`);
  };

  const startedAt = clock();
  const providers = buildProviderChain(env);

  for (const provider of providers) {
    let attempt = 0;
    let resumed = false;
    const retryKey = `${RETRY_STORE_PREFIX}${provider.id}/${hash}`;

    if (store) {
      let schedule = null;
      try {
        schedule = await store.load(retryKey);
      } catch {
        // Corrupt or missing record behaves as absent.
      }
      if (schedule && schedule.status === 'retry-scheduled') {
        resumed = true;
        attempt = Math.max(0, Number(schedule.attempt) || 0);
        const waitMs = Math.max(0, (Number(schedule.nextEligibleAt) || 0) - clock());
        if (waitMs > 0) {
          if (waitMs > maxRequestRetryMs) {
            // Still outside this invocation's practical window: keep the
            // persisted schedule and tell the client when to come back.
            return {
              taskId,
              status: 'retry-scheduled',
              retryAfterSeconds: Math.ceil(waitMs / 1000),
              provider: provider.id
            };
          }
          await sleepInterruptible(waitMs, signal, sleep);
          if (signal?.aborted) return { taskId, status: 'cancelled' };
        }
      }
    }

    let result = await provider.call(messages, { signal, attempt });

    while (result?.failure) {
      const cls = result.classified || classifyProviderFailure(result.failure);
      recordFailure(provider.label, result.failure);
      lastErrorStatus = Number(result.failure?.status) > 0 ? Number(result.failure.status) : lastErrorStatus;

      if (cls.kind === 'permanent') {
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

      if (signal?.aborted) return { taskId, status: 'cancelled' };

      attempt += 1;
      const backoffMs = cls.retryAfterMs > 0
        ? cls.retryAfterMs
        : Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1) + jitter() * BACKOFF_JITTER_MS, MAX_SINGLE_SLEEP_MS);
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
              status: 'retry-scheduled',
              lastError: safeErrorDetail(result.failure)
            });
          } catch {
            // Best effort.
          }
        }
        return {
          taskId,
          status: 'retry-scheduled',
          retryAfterSeconds: Math.max(1, Math.ceil(backoffMs / 1000)),
          provider: provider.id
        };
      }

      await sleepInterruptible(backoffMs, signal, sleep);
      if (signal?.aborted) return { taskId, status: 'cancelled' };
      result = await provider.call(messages, { signal, attempt });
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
        stopReason: result.stopReason || null
      };
    }

    // Reasoning-only or empty reply: no built-in recovery — record the
    // failure and let the next provider in the chain try. If no provider
    // produces a usable answer the request fails honestly.
    if (!result || !result.failure) {
      recordFailure(provider.label, 'empty or reasoning-only response');
      if (signal?.aborted) return { taskId, status: 'cancelled' };
    }
  }

  return {
    status: 'failed',
    error: failures.slice(0, 3).join(' | ').slice(0, 300) || 'all providers returned no usable response',
    errorStatus: lastErrorStatus,
    taskId
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
 * and the request fails honestly if none produces content.
 */
export function runStreamingChain(messages, options = {}) {
  const env = options.env || {};
  const signal = options.signal || null;
  const clock = options.clock || defaultClock;

  const startedAt = clock();
  const providers = buildProviderChain(env);
  const failureMessages = [];

  async function* events() {
    if (providers.length === 0) {
      yield { type: 'error', message: 'No AI provider key configured on this deployment.', status: 502 };
      return;
    }

    for (const provider of providers) {
      yield { type: 'meta', provider: provider.id, model: provider.model };
      const ttftHolder = { ms: 0 };
      try {
        // Streams a candidate message set, yielding deltas and returning the
        // accumulated text/usage/finish. Built as a generator so deltas flow
        // through to the client immediately.
        async function* tryStream(msgs) {
          const iter = provider.stream(msgs, {
            signal,
            onTtft: (ms) => { ttftHolder.ms = ttftHolder.ms || ms; }
          });
          let text = '';
          let usage = null;
          let finishReason = null;
          for await (const chunk of iter) {
            if (chunk.text) {
              text += chunk.text;
              yield { type: 'delta', text: chunk.text };
            }
            if (chunk.usage) usage = chunk.usage;
            if (chunk.finishReason) finishReason = chunk.finishReason;
          }
          return { text, usage, finishReason };
        }
        let got = yield* tryStream(messages);
        // No built-in recovery: an empty or whitespace-only stream is a
        // failure of this provider, surfaced honestly. The provider chain
        // (opencode-go -> DeepSeek -> OpenRouter) is the only fallback, and
        // if no provider produces content the client gets a clear error.
        if (!got.text.trim()) {
          failureMessages.push(`${provider.label}: empty or reasoning-only stream`);
          if (signal?.aborted) {
            yield { type: 'error', message: 'AI request cancelled.', status: 499 };
            return;
          }
        }
        if (got.text.trim()) {
          yield {
            type: 'usage',
            inputTokens: got.usage?.inputTokens ?? 0,
            outputTokens: got.usage?.outputTokens ?? 0
          };
          yield {
            type: 'done',
            finishReason: got.finishReason || 'stop',
            ttftMs: ttftHolder.ms || 0,
            totalMs: clock() - startedAt,
            provider: provider.id,
            model: provider.model
          };
          return;
        }
      } catch (err) {
        const failure = err instanceof Error ? err : new Error(safeErrorDetail(err));
        failureMessages.push(`${provider.label}: ${safeErrorDetail(failure)}`);
        if (signal?.aborted) {
          yield { type: 'error', message: 'AI request cancelled.', status: 499 };
          return;
        }
      }
    }
    yield {
      type: 'error',
      message: failureMessages.slice(0, 3).join(' | ').slice(0, 300) || 'all providers returned no usable stream',
      status: 502
    };
  }

  return iterableToReadableStream(events());
}

/**
 * Image generation through OpenRouter. Tries each model in the chain (env
 * override, then the default chain) and returns the first usable image as
 * { url, model } — the response reports the model that actually produced
 * the image. The preferred path parses choices[0].message.images[0].url;
 * content URLs and data:image payloads are also accepted. Returns null when
 * no model produced a usable image.
 *
 * referenceImage (optional) is a validated data: URL or public https URL of
 * the user's own image. When present the message becomes OpenAI-style
 * multimodal content ([{ type: 'text' }, { type: 'image_url' }]) so image
 * models use it as visual reference instead of inventing from text alone.
 */
export async function callOpenRouterImage(apiKey, prompt, parentSignal, imageModels = DEFAULT_IMAGE_MODEL_CHAIN, referenceImage = null) {
  const models = Array.isArray(imageModels) && imageModels.length > 0 ? imageModels : DEFAULT_IMAGE_MODEL_CHAIN;
  const userContent = (typeof referenceImage === 'string' && referenceImage)
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: referenceImage } }
      ]
    : prompt;
  for (const model of models) {
    try {
      const response = await fetch(OPENROUTER_DEFAULT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://corez.ai',
          'X-Title': 'COREZ AI',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: userContent }]
        }),
        signal: parentSignal
      });

      if (response.ok) {
        const data = await response.json();
        const message = data?.choices?.[0]?.message;
        if (Array.isArray(message?.images) && message.images.length > 0) {
          // Providers differ: some expose images[0].url, others use the
          // OpenAI-style images[0].image_url.url — accept both.
          const first = message.images[0];
          const imageUrl = first?.url || first?.image_url?.url;
          if (typeof imageUrl === 'string' && imageUrl) {
            return { url: imageUrl, model };
          }
        }
        const content = typeof message?.content === 'string' ? message.content : '';
        const urlMatch = content.match(/https?:\/\/[^\s)"']+\.(?:png|jpg|jpeg|webp)/i)
          || content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        if (urlMatch) return { url: urlMatch[1] || urlMatch[0], model };
        if (content.startsWith('data:image')) return { url: content, model };
      }
    } catch (err) {
      console.warn(`OpenRouter image generation attempt failed (${model}):`, safeErrorDetail(err));
    }
  }
  return null;
}
