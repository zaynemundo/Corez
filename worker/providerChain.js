import { classifyProviderFailure, createTaskStateStore, safeErrorDetail } from './utils.js';

export const OPENCODE_DEFAULT_ENDPOINT = 'https://opencode.ai/zen/go/v1/chat/completions';
export const DEEPSEEK_DEFAULT_ENDPOINT = 'https://api.deepseek.com/chat/completions';
export const OPENROUTER_DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_MODEL = 'deepseek-v4-flash';
export const FLUX_IMAGE_MODEL = 'black-forest-labs/flux-1-schnell';

// Transient failures are retried with adaptive exponential backoff (base
// 750ms doubling, jittered, honouring the provider's Retry-After) until
// recovery, cancellation, permanent classification, or the single request's
// practical window. Beyond that window the retry schedule is persisted so a
// later invocation resumes the same task instead of returning a 502.
const RETRY_STORE_PREFIX = 'retry/';
const BACKOFF_BASE_MS = 750;
const BACKOFF_JITTER_MS = 500;
const MAX_SINGLE_SLEEP_MS = 30_000;
const DEFAULT_REQUEST_RETRY_MS = 30_000;
const SLEEP_CHUNK_MS = 250;

export const CONTINUATION_NUDGE = {
  role: 'user',
  content: 'Your previous reply contained only internal reasoning and no final answer. Now respond with the actual complete final answer to the user\'s request (the code, explanation, or text itself). Do not include thinking, reasoning, or <think> blocks.'
};

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
      model: `${label}:${model}`
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
    chain.push({
      id: 'opencode-go',
      label: 'opencode',
      model,
      call: (messages, options = {}) => callChatEndpoint({
        endpoint: env?.OPENCODE_ENDPOINT || OPENCODE_DEFAULT_ENDPOINT,
        key: opencodeKey,
        model,
        label: 'opencode',
        messages,
        signal: options.signal,
        extraHeaders: { 'HTTP-Referer': 'https://corez.ai', 'X-Title': 'COREZ AI' }
      })
    });
  }

  const deepseekKey = env?.DEEPSEEK_API_KEY;
  if (deepseekKey && !isDisabled(env?.DEEPSEEK_DISABLED)) {
    const model = env?.DEEPSEEK_MODEL || DEFAULT_MODEL;
    chain.push({
      id: 'deepseek',
      label: 'deepseek',
      model,
      call: (messages, options = {}) => callChatEndpoint({
        endpoint: env?.DEEPSEEK_ENDPOINT || DEEPSEEK_DEFAULT_ENDPOINT,
        key: deepseekKey,
        model,
        label: 'deepseek',
        messages,
        signal: options.signal,
        bodyExtra: { stream: false }
      })
    });
  }

  const openrouterKey = env?.OPENROUTER_API_KEY;
  if (openrouterKey && !isDisabled(env?.OPENROUTER_DISABLED)) {
    const model = env?.OPENROUTER_MODEL || DEFAULT_MODEL;
    chain.push({
      id: 'openrouter',
      label: 'openrouter',
      model,
      call: (messages, options = {}) => callChatEndpoint({
        endpoint: env?.OPENROUTER_ENDPOINT || OPENROUTER_DEFAULT_ENDPOINT,
        key: openrouterKey,
        model,
        label: 'openrouter',
        messages,
        signal: options.signal,
        extraHeaders: { 'HTTP-Referer': 'https://corez.ai', 'X-Title': 'COREZ AI' }
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
 * tests.
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
            await store.remove(retryKey);
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
            await store.save(retryKey, {
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
          await store.remove(retryKey);
        } catch {
          // Best effort.
        }
      }
      return {
        content: result.content,
        model: result.model || `${provider.label}:${provider.model}`,
        provider: provider.id,
        taskId,
        resumed
      };
    }

    // Reasoning-only or empty reply: one continuation nudge per provider so
    // the actual answer is produced instead of raw thought.
    if (!result || !result.failure) {
      result = await provider.call([...messages, CONTINUATION_NUDGE], { signal, attempt });
      if (result?.content) {
        if (store) {
          try {
            await store.remove(retryKey);
          } catch {
            // Best effort.
          }
        }
        return {
          content: result.content,
          model: result.model || `${provider.label}:${provider.model}`,
          provider: provider.id,
          taskId,
          resumed
        };
      }
      if (result?.failure) {
        const cls = result.classified || classifyProviderFailure(result.failure);
        recordFailure(provider.label, result.failure);
        lastErrorStatus = Number(result.failure?.status) > 0 ? Number(result.failure.status) : lastErrorStatus;
        if (cls.kind === 'permanent' && store) {
          try {
            await store.remove(retryKey);
          } catch {
            // Best effort.
          }
        }
      } else {
        recordFailure(provider.label, 'empty or reasoning-only response after continuation');
      }
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
 * FLUX 1 Schnell image generation through OpenRouter. The preferred path
 * parses choices[0].message.images[0].url; content URLs and data:image
 * payloads are also accepted. Returns the image URL or null when no usable
 * image was produced.
 */
export async function callOpenRouterImage(apiKey, prompt, parentSignal) {
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
        model: FLUX_IMAGE_MODEL,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: parentSignal
    });

    if (response.ok) {
      const data = await response.json();
      const message = data?.choices?.[0]?.message;
      if (Array.isArray(message?.images) && message.images[0]?.url) {
        return message.images[0].url;
      }
      const content = typeof message?.content === 'string' ? message.content : '';
      const urlMatch = content.match(/https?:\/\/[^\s)"']+\.(?:png|jpg|jpeg|webp)/i)
        || content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
      if (urlMatch) return urlMatch[1] || urlMatch[0];
      if (content.startsWith('data:image')) return content;
    }
  } catch (err) {
    console.warn('OpenRouter image generation attempt failed:', safeErrorDetail(err));
  }
  return null;
}
