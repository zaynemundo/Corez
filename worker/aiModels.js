/**
 * Workers AI ranking models for CoreZ: bge-reranker-base (reranking) and
 * bge-m3 (multilingual embeddings), both served by the account's OWN Workers
 * AI binding (env.AI) — no third-party key, billed inside the daily free
 * neuron allocation.
 *
 * Public endpoints:
 *   POST /api/rerank — { query, contexts: string[], top_k? } -> relevance
 *     scores via @cf/baai/bge-reranker-base. Context index is preserved in
 *     the response so callers can reorder their own lists.
 *   POST /api/embed  — { text: string | string[] } -> vectors via
 *     @cf/baai/bge-m3 (1024-dim, multilingual, 60k-token context window).
 *
 * The same model IDs are reused by the web-search ranking chain
 * (worker/search.js): rerank first, embedding cosine similarity as the
 * fallback — the free Workers AI path is tried before any keyed provider.
 */

import { jsonResponse, readBoundedJson, createRateLimiter } from './utils.js';

export const WORKERS_AI_RERANK_MODEL = '@cf/baai/bge-reranker-base';
export const WORKERS_AI_EMBED_MODEL = '@cf/baai/bge-m3';

// Input bounds: generous for real RAG workloads, tight enough that a public
// endpoint cannot be used to burn unbounded neurons or memory.
const MAX_RERANK_QUERY_CHARS = 1024;
const MAX_RERANK_CONTEXTS = 50;
const MAX_RERANK_CONTEXT_CHARS = 2000;
const MAX_EMBED_ITEMS = 64;
const MAX_EMBED_ITEM_CHARS = 8000;
const MAX_EMBED_BODY_BYTES = 512 * 1024;
const MAX_RERANK_BODY_BYTES = 256 * 1024;

const rerankRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 60 });
const embedRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 120 });

export function hasWorkersAIBinding(env) {
  return Boolean(env?.AI && typeof env.AI.run === 'function');
}

// Only a client disconnect aborts (Stop button, tab close); the model call
// itself is never timed out.
function clientSignal(request) {
  const controller = new AbortController();
  if (request.signal) {
    if (request.signal.aborted) controller.abort();
    else request.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

function rateLimited(retryAfter) {
  return jsonResponse(429, { error: 'Too many requests. Try again shortly.' }, { 'Retry-After': String(retryAfter) });
}

/**
 * POST /api/rerank: score { query, contexts } pairs with the Workers AI
 * bge-reranker-base model. Scores are raw relevance logits (map to [0,1]
 * with sigmoid); higher is more relevant. The response array keeps the
 * original context index so callers can reorder their own documents.
 */
export async function handleRerank(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }
  const retryAfter = rerankRateLimiter(request);
  if (retryAfter !== null) {
    return rateLimited(retryAfter);
  }

  let body;
  try {
    body = await readBoundedJson(request, MAX_RERANK_BODY_BYTES);
  } catch (bodyErr) {
    const message = bodyErr?.message || 'Invalid JSON payload.';
    return jsonResponse(400, { error: `Request body rejected: ${message}` });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(400, { error: 'Request body must be a JSON object.' });
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query || query.length > MAX_RERANK_QUERY_CHARS) {
    return jsonResponse(400, {
      error: `Query must be a non-empty string up to ${MAX_RERANK_QUERY_CHARS} characters.`
    });
  }

  const contexts = Array.isArray(body.contexts) ? body.contexts : null;
  if (!contexts || contexts.length < 1 || contexts.length > MAX_RERANK_CONTEXTS) {
    return jsonResponse(400, {
      error: `Contexts must be an array of 1-${MAX_RERANK_CONTEXTS} text strings.`
    });
  }
  const texts = contexts.map((context) => (typeof context === 'string' ? context.trim() : ''));
  if (texts.some((text) => !text || text.length > MAX_RERANK_CONTEXT_CHARS)) {
    return jsonResponse(400, {
      error: `Each context must be a non-empty string up to ${MAX_RERANK_CONTEXT_CHARS} characters.`
    });
  }

  if (!hasWorkersAIBinding(env)) {
    return jsonResponse(503, {
      error: 'Workers AI reranking is unavailable: no AI binding is configured on this deployment.'
    });
  }

  const topK = body.top_k === undefined || body.top_k === null
    ? undefined
    : Math.min(MAX_RERANK_CONTEXTS, Math.max(1, Math.round(Number(body.top_k))));

  let result;
  try {
    result = await env.AI.run(
      WORKERS_AI_RERANK_MODEL,
      {
        query,
        contexts: texts.map((text) => ({ text })),
        ...(topK ? { top_k: topK } : {})
      },
      { signal: clientSignal(request) }
    );
  } catch (err) {
    if (err?.name === 'AbortError') {
      return jsonResponse(499, { error: 'Rerank request cancelled.' });
    }
    console.warn('Workers AI rerank failed:', safeError(err));
    return jsonResponse(502, { error: 'Reranking failed: the Workers AI provider returned an error.' });
  }

  // The provider returns the scored list under `response` with `id` fields
  // ({ response: [{ id, score }] }); accept that shape plus `results`/`index`
  // and a bare array defensively.
  const scored = Array.isArray(result?.response)
    ? result.response
    : Array.isArray(result?.results)
      ? result.results
      : Array.isArray(result)
        ? result
        : [];
  const results = scored
    .filter((entry) => Number.isFinite(entry?.score) && (Number.isFinite(entry?.index) || Number.isFinite(entry?.id)))
    .map((entry) => ({ index: Number.isFinite(entry.index) ? entry.index : entry.id, score: entry.score }));
  if (results.length === 0) {
    return jsonResponse(502, { error: 'Reranking failed: the Workers AI provider returned no scores.' });
  }

  return jsonResponse(200, { model: WORKERS_AI_RERANK_MODEL, results });
}

/**
 * POST /api/embed: embed text with the Workers AI bge-m3 model. Accepts a
 * single string or an array of strings; returns { model, shape, data }
 * where data is an array of vectors aligned with the input order.
 */
export async function handleEmbed(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }
  const retryAfter = embedRateLimiter(request);
  if (retryAfter !== null) {
    return rateLimited(retryAfter);
  }

  let body;
  try {
    body = await readBoundedJson(request, MAX_EMBED_BODY_BYTES);
  } catch (bodyErr) {
    const message = bodyErr?.message || 'Invalid JSON payload.';
    return jsonResponse(400, { error: `Request body rejected: ${message}` });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(400, { error: 'Request body must be a JSON object.' });
  }

  const raw = body.text;
  const items = Array.isArray(raw) ? raw : [raw];
  const texts = items.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (texts.length < 1 || texts.length > MAX_EMBED_ITEMS) {
    return jsonResponse(400, {
      error: `Text must be a string or an array of 1-${MAX_EMBED_ITEMS} strings.`
    });
  }
  if (texts.some((text) => !text || text.length > MAX_EMBED_ITEM_CHARS)) {
    return jsonResponse(400, {
      error: `Each text item must be a non-empty string up to ${MAX_EMBED_ITEM_CHARS} characters.`
    });
  }

  if (!hasWorkersAIBinding(env)) {
    return jsonResponse(503, {
      error: 'Workers AI embeddings are unavailable: no AI binding is configured on this deployment.'
    });
  }

  let result;
  try {
    result = await env.AI.run(
      WORKERS_AI_EMBED_MODEL,
      { text: texts.length === 1 ? texts[0] : texts },
      { signal: clientSignal(request) }
    );
  } catch (err) {
    if (err?.name === 'AbortError') {
      return jsonResponse(499, { error: 'Embedding request cancelled.' });
    }
    console.warn('Workers AI embedding failed:', safeError(err));
    return jsonResponse(502, { error: 'Embedding failed: the Workers AI provider returned an error.' });
  }

  const vectors = Array.isArray(result?.data) ? result.data : [];
  const data = vectors
    .filter((vector) => Array.isArray(vector))
    .map((vector) => vector.map((value) => (Number.isFinite(value) ? value : 0)));
  if (data.length !== texts.length || data.some((vector) => vector.length === 0)) {
    return jsonResponse(502, { error: 'Embedding failed: the Workers AI provider returned no vectors.' });
  }
  const shape = Array.isArray(result?.shape)
    ? result.shape
    : [data.length, data[0].length];

  return jsonResponse(200, { model: WORKERS_AI_EMBED_MODEL, shape, data });
}

function safeError(error) {
  const raw = error instanceof Error
    ? error.message
    : typeof error?.message === 'string'
      ? error.message
      : String(error);
  return raw.slice(0, 300);
}
