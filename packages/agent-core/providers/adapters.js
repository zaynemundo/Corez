// Unified CoreZ provider adapters.
//
// One adapter per provider. Each adapter owns exactly one provider's
// credentials, endpoint and model configuration. No provider ever receives
// another provider's API key, and no adapter ever sends max_tokens /
// max_completion_tokens (generations run as long as the model needs).

import {
  OPENCODE_SESSION_HEADER,
  newOpencodeSessionId,
} from './session.js';
import { classifyFailureStatus } from './failure.js';
import { resolveApiMode } from './endpoint.js';
import { extractContentText, stripThinkingBlocks } from './text.js';

export const PROVIDER_IDS = Object.freeze({
  OPENCODE_GO: 'opencode-go',
  DEEPSEEK: 'deepseek',
  OPENROUTER: 'openrouter'
});

export const DEFAULT_PROVIDER_ORDER = Object.freeze([
  PROVIDER_IDS.OPENCODE_GO,
  PROVIDER_IDS.DEEPSEEK,
  PROVIDER_IDS.OPENROUTER
]);

export const PROVIDER_ENV_KEYS = Object.freeze({
  [PROVIDER_IDS.OPENCODE_GO]: ['OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY'],
  [PROVIDER_IDS.DEEPSEEK]: ['DEEPSEEK_API_KEY'],
  [PROVIDER_IDS.OPENROUTER]: ['OPENROUTER_API_KEY']
});

export const PROVIDER_ENDPOINTS = Object.freeze({
  [PROVIDER_IDS.OPENCODE_GO]: 'https://opencode.ai/zen/go/v1/chat/completions',
  [PROVIDER_IDS.DEEPSEEK]: 'https://api.deepseek.com/chat/completions',
  [PROVIDER_IDS.OPENROUTER]: 'https://openrouter.ai/api/v1/chat/completions'
});

// 401/400/403/404 and the rest of the permanent status range can never be
// fixed by a retry; 408/409/429 and everything in the 5xx range are
// transient. Network-level failures (no status) are transient.
export function classifyProviderFailure(status) {
  return classifyFailureStatus(status);
}

export function parseRetryAfter(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const seconds = Number(value.trim());
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
    const date = Date.parse(value.trim());
    if (Number.isFinite(date)) {
      return Math.max(0, (date - Date.now()) / 1000);
    }
  }
  return null;
}

// Exponential backoff with jitter. Retry-After always wins over the computed
// schedule. There is no fixed attempt count: the schedule grows until the
// provider recovers or an operator-configured hang guard stops the wait.
export function computeBackoffMs({
  attempt = 0,
  baseMs = 1000,
  maxMs = 120000,
  retryAfterSeconds = null
} = {}) {
  const jitter = Math.floor(Math.random() * 200);
  let ms;
  if (retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds)) {
    ms = retryAfterSeconds * 1000;
  } else {
    ms = baseMs * 2 ** Math.min(attempt, 16);
  }
  return Math.min(maxMs, ms) + jitter;
}

export function safeDetail(value, limit = 300) {
  if (value === null || value === undefined) return '';
  return String(value).slice(0, limit);
}

function toResponsesInput(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map((m) => {
    if (!m || typeof m !== 'object') return m;
    const role = m.role || 'user';
    if (Array.isArray(m.content)) return { role, content: m.content };
    if (typeof m.content === 'string') return { role, content: m.content };
    return { role, content: extractContentText(m.content) };
  });
}

function parseResponsesMessage(data) {
  if (!data || typeof data !== 'object') return { content: '', toolCalls: [] };
  const output = Array.isArray(data.output) ? data.output : [];
  const messageItem = output.find((item) => item && item.type === 'message' && item.role === 'assistant');
  if (!messageItem || !Array.isArray(messageItem.content)) return { content: '', toolCalls: [] };
  const textPart = messageItem.content.find((c) => c && c.type === 'output_text' && typeof c.text === 'string');
  const content = textPart ? stripThinkingBlocks(textPart.text) : '';
  return { content, toolCalls: [] };
}

function parseCompletionResponse(data) {
  if (data && Array.isArray(data.output)) {
    return parseResponsesMessage(data);
  }
  const message = data?.choices?.[0]?.message;
  if (!message) return { content: '', toolCalls: [] };
  const content = stripThinkingBlocks(extractContentText(message.content));
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return { content, toolCalls };
}

async function requestProvider({ endpoint, headers, body, signal }) {
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return { ok: false, status: null, detail: safeDetail(err?.message) || 'network failure' };
  }

  const retryAfterSeconds = parseRetryAfter(response.headers?.get?.('retry-after'));

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return {
      ok: false,
      status: response.status,
      retryAfterSeconds,
      detail: safeDetail(text) || safeDetail(response.statusText)
    };
  }

  const data = await response.json().catch(() => null);
  if (!data) {
    return { ok: false, status: response.status, retryAfterSeconds, detail: 'empty or invalid JSON body' };
  }

  const { content, toolCalls } = parseCompletionResponse(data);
  if (!content && toolCalls.length === 0) {
    return { ok: false, status: 200, retryAfterSeconds, detail: 'empty response (reasoning only or no tool calls)' };
  }

  return {
    ok: true,
    status: response.status,
    content,
    toolCalls,
    model: safeDetail(data?.model, 120) || null
  };
}

export class ProviderAdapter {
  constructor(options = {}) {
    this.id = options.id;
    this.apiKey = options.apiKey || null;
    this.endpoint = options.endpoint || '';
    this.defaultModel = options.model || options.defaultModel || '';
    // Explicit endpoint shape; the URL is only sniffed as a documented
    // fallback for legacy endpoint values.
    this.api = resolveApiMode({ endpoint: this.endpoint, api: options.api });
    this.configured = Boolean(this.apiKey);
  }

  buildBody({ model, messages, tools, reasoning, temperature }) {
    const body = {
      model: model || this.defaultModel,
      temperature: Number.isFinite(temperature) ? temperature : 0.42
    };
    if (this.api === 'responses') {
      body.input = toResponsesInput(messages);
    } else {
      body.messages = messages;
    }
    if (reasoning && typeof reasoning === 'object') body.reasoning = reasoning;
    else if (reasoning) body.reasoning = { effort: String(reasoning), exclude: true };
    if (Array.isArray(tools) && tools.length > 0) body.tools = tools;
    return body;
  }

  buildHeaders(_sessionId) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`
    };
    if (this.referer) headers['HTTP-Referer'] = this.referer;
    if (this.title) headers['X-Title'] = this.title;
    return headers;
  }

  async generate({ model, messages, tools, signal, reasoning, temperature, sessionId }) {
    if (!this.configured) {
      return { ok: false, status: null, detail: `${this.id} is not configured` };
    }
    return requestProvider({
      endpoint: this.endpoint,
      headers: this.buildHeaders(sessionId),
      body: this.buildBody({ model, messages, tools, reasoning, temperature }),
      signal
    });
  }
}

export class OpenCodeGoAdapter extends ProviderAdapter {
  constructor(options = {}) {
    const keys = PROVIDER_ENV_KEYS[PROVIDER_IDS.OPENCODE_GO];
    const apiKey = options.opencodeApiKey !== undefined
      ? options.opencodeApiKey
      : (options.apiKey !== undefined ? options.apiKey : firstEnv(keys));
    super({
      id: PROVIDER_IDS.OPENCODE_GO,
      apiKey,
      endpoint: options.endpoint ?? process.env.OPENCODE_ENDPOINT ?? PROVIDER_ENDPOINTS[PROVIDER_IDS.OPENCODE_GO],
      model: options.model ?? process.env.OPENCODE_MODEL ?? 'deepseek-flash',
      api: options.api ?? process.env.OPENCODE_API_MODE,
      referer: 'https://corez.ai',
      title: 'COREZ AI'
    });
    // One affinity id per adapter instance so every step of a harness/tool
    // loop lands on the same gateway backend (and its token cache). A caller
    // may override it per generate() call via the sessionId option.
    this.sessionId = options.sessionId || newOpencodeSessionId();
  }

  buildHeaders(sessionId) {
    return {
      ...super.buildHeaders(),
      [OPENCODE_SESSION_HEADER]: sessionId || this.sessionId
    };
  }
}

export class DeepSeekAdapter extends ProviderAdapter {
  constructor(options = {}) {
    const apiKey = options.deepseekApiKey !== undefined
      ? options.deepseekApiKey
      : (options.apiKey !== undefined ? options.apiKey : firstEnv(PROVIDER_ENV_KEYS[PROVIDER_IDS.DEEPSEEK]));
    super({
      id: PROVIDER_IDS.DEEPSEEK,
      apiKey,
      endpoint: options.endpoint ?? process.env.DEEPSEEK_ENDPOINT ?? PROVIDER_ENDPOINTS[PROVIDER_IDS.DEEPSEEK],
      model: options.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-flash',
      api: options.api
    });
  }
}

export class OpenRouterAdapter extends ProviderAdapter {
  constructor(options = {}) {
    const apiKey = options.openrouterApiKey !== undefined
      ? options.openrouterApiKey
      : (options.apiKey !== undefined ? options.apiKey : firstEnv(PROVIDER_ENV_KEYS[PROVIDER_IDS.OPENROUTER]));
    super({
      id: PROVIDER_IDS.OPENROUTER,
      apiKey,
      endpoint: options.endpoint ?? process.env.OPENROUTER_ENDPOINT ?? PROVIDER_ENDPOINTS[PROVIDER_IDS.OPENROUTER],
      model: options.model ?? process.env.OPENROUTER_MODEL ?? 'deepseek-flash',
      api: options.api,
      referer: 'https://corez.ai',
      title: 'COREZ AI'
    });
  }
}

function firstEnv(names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return null;
}
