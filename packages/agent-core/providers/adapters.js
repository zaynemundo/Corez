// Unified CoreZ provider adapters.
//
// One adapter per provider. Each adapter owns exactly one provider's
// credentials, endpoint and model configuration. No provider ever receives
// another provider's API key, and no adapter ever sends max_tokens /
// max_completion_tokens (generations run as long as the model needs).

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

// 401/400/403/404 and the rest of the 4xx range are permanent (a retry can
// never fix a bad key or a bad request). 408/409/429 and everything in the
// 5xx range are transient. Network-level failures (no status) are transient.
export function classifyProviderFailure(status) {
  if (!Number.isFinite(status) || status <= 0) return 'transient';
  if (status >= 400 && status < 500 && ![408, 409, 429].includes(status)) {
    return 'permanent';
  }
  return 'transient';
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

function extractContentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === 'object' && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }
  return '';
}

function parseCompletionResponse(data) {
  const message = data?.choices?.[0]?.message;
  if (!message) return { content: '', toolCalls: [] };
  const content = extractContentText(message.content);
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
    this.configured = Boolean(this.apiKey);
  }

  buildBody({ model, messages, tools, reasoning, temperature }) {
    const body = {
      model: model || this.defaultModel,
      messages,
      temperature: Number.isFinite(temperature) ? temperature : 0.42
    };
    if (reasoning && typeof reasoning === 'object') body.reasoning = reasoning;
    else if (reasoning) body.reasoning = { effort: String(reasoning), exclude: true };
    if (Array.isArray(tools) && tools.length > 0) body.tools = tools;
    return body;
  }

  buildHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`
    };
    if (this.referer) headers['HTTP-Referer'] = this.referer;
    if (this.title) headers['X-Title'] = this.title;
    return headers;
  }

  async generate({ model, messages, tools, signal, reasoning, temperature }) {
    if (!this.configured) {
      return { ok: false, status: null, detail: `${this.id} is not configured` };
    }
    return requestProvider({
      endpoint: this.endpoint,
      headers: this.buildHeaders(),
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
      model: options.model ?? process.env.OPENCODE_MODEL ?? 'muse-spark-1.2-contributor',
      referer: 'https://corez.ai',
      title: 'COREZ AI'
    });
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
      model: options.model ?? process.env.DEEPSEEK_MODEL ?? 'muse-spark-1.2-contributor'
    });
  }

  buildBody(options) {
    return { ...super.buildBody(options), stream: false };
  }

  async generate(options = {}) {
    return super.generate(options);
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
      model: options.model ?? process.env.OPENROUTER_MODEL ?? 'muse-spark-1.2-contributor',
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
