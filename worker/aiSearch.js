/**
 * AI Search retrieval endpoint for CoreZ.
 *
 * Cloudflare AI Search (managed RAG) is used for RETRIEVAL ONLY: the
 * search() method returns indexed content chunks with scores, source keys
 * and scoring details. Text/chat generation is deliberately never invoked
 * from this worker — all conversation generation goes through the OpenCode
 * Go gateway (deepseek-v4-flash) in providerChain.js. This module must not
 * contain the AI Search chat/answer method name, and the contract tests
 * enforce that the worker never calls it.
 *
 * Public endpoint: POST /api/ai-search
 *   { query, instance?, max_results?, match_threshold?, retrieval_type?,
 *     context_expansion?, rerank? }
 * -> { instance, model, search_query, results: [{ id, score, text, item,
 *      scoring_details }] }
 *
 * The instance binding is a namespace binding (ai_search_namespaces) so the
 * endpoint resolves instances at runtime: env.AI_SEARCH.get(instance).
 */

import { jsonResponse, readBoundedJson, createRateLimiter } from './utils.js';

export const AI_SEARCH_DEFAULT_INSTANCE = 'corez';
const AI_SEARCH_RERANK_MODEL = '@cf/baai/bge-reranker-base';

const MAX_QUERY_CHARS = 2000;
const MAX_RESULTS = 50;
const MAX_BODY_BYTES = 64 * 1024;
const SAFE_INSTANCE_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/i;
const RETRIEVAL_TYPES = new Set(['hybrid', 'vector', 'keyword']);

const aiSearchRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 60 });

export function hasAISearchBinding(env) {
  return Boolean(env?.AI_SEARCH && typeof env.AI_SEARCH.get === 'function');
}

function clientSignal(request) {
  const controller = new AbortController();
  if (request.signal) {
    if (request.signal.aborted) controller.abort();
    else request.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

/**
 * POST /api/ai-search: retrieve relevant chunks from an AI Search instance.
 * Retrieval only — the response contains indexed chunks and scores, never a
 * generated answer. Generation is left to the OpenCode Go gateway
 * (deepseek-v4-flash) via /api/ai.
 */
export async function handleAISearch(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }
  const retryAfter = aiSearchRateLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(429, { error: 'Too many requests. Try again shortly.' }, { 'Retry-After': String(retryAfter) });
  }

  let body;
  try {
    body = await readBoundedJson(request, MAX_BODY_BYTES);
  } catch (bodyErr) {
    const message = bodyErr?.message || 'Invalid JSON payload.';
    return jsonResponse(400, { error: `Request body rejected: ${message}` });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(400, { error: 'Request body must be a JSON object.' });
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query || query.length > MAX_QUERY_CHARS) {
    return jsonResponse(400, {
      error: `Query must be a non-empty string up to ${MAX_QUERY_CHARS} characters.`
    });
  }

  const instance = typeof body.instance === 'string' && body.instance.trim()
    ? body.instance.trim()
    : AI_SEARCH_DEFAULT_INSTANCE;
  if (!SAFE_INSTANCE_NAME.test(instance)) {
    return jsonResponse(400, {
      error: 'Instance must be a lowercase name using letters, digits and dashes (max 63 chars).'
    });
  }

  const maxResults = body.max_results === undefined || body.max_results === null
    ? 10
    : Math.min(MAX_RESULTS, Math.max(1, Math.round(Number(body.max_results))));
  const contextExpansion = body.context_expansion === undefined || body.context_expansion === null
    ? 0
    : Math.min(3, Math.max(0, Math.round(Number(body.context_expansion))));

  const retrievalType = body.retrieval_type === undefined || body.retrieval_type === null
    ? 'hybrid'
    : typeof body.retrieval_type === 'string' && RETRIEVAL_TYPES.has(body.retrieval_type)
      ? body.retrieval_type
      : null;
  if (retrievalType === null) {
    return jsonResponse(400, {
      error: 'Retrieval type must be one of: hybrid, vector, keyword.'
    });
  }

  let matchThreshold;
  if (body.match_threshold !== undefined && body.match_threshold !== null) {
    matchThreshold = Number(body.match_threshold);
    if (!Number.isFinite(matchThreshold) || matchThreshold < 0 || matchThreshold > 1) {
      return jsonResponse(400, { error: 'Match threshold must be a number between 0 and 1.' });
    }
  }

  if (!hasAISearchBinding(env)) {
    return jsonResponse(503, {
      error: 'AI Search is unavailable: no AI_SEARCH binding is configured on this deployment.'
    });
  }

  const retrieval = {
    retrieval_type: retrievalType,
    max_num_results: maxResults,
    context_expansion: contextExpansion
  };
  if (matchThreshold !== undefined) retrieval.match_threshold = matchThreshold;
  const aiSearchOptions = { retrieval };
  if (body.rerank !== false) {
    aiSearchOptions.reranking = { enabled: true, model: AI_SEARCH_RERANK_MODEL };
  }

  let result;
  try {
    result = await env.AI_SEARCH.get(instance).search(
      { query, ai_search_options: aiSearchOptions },
      { signal: clientSignal(request) }
    );
  } catch (err) {
    if (err?.name === 'AbortError') {
      return jsonResponse(499, { error: 'AI Search request cancelled.' });
    }
    console.warn('AI Search retrieval failed:', safeError(err));
    return jsonResponse(502, { error: 'AI Search retrieval failed: the provider returned an error.' });
  }

  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  const results = chunks
    .filter((chunk) => chunk && typeof chunk === 'object' && typeof chunk.text === 'string')
    .slice(0, MAX_RESULTS)
    .map((chunk) => ({
      id: typeof chunk.id === 'string' ? chunk.id : '',
      score: Number.isFinite(chunk.score) ? chunk.score : null,
      text: chunk.text,
      ...(chunk.item && typeof chunk.item === 'object' ? { item: chunk.item } : {}),
      ...(chunk.scoring_details && typeof chunk.scoring_details === 'object' ? { scoring_details: chunk.scoring_details } : {})
    }));

  return jsonResponse(200, {
    instance,
    model: 'ai-search-retrieval',
    search_query: typeof result?.search_query === 'string' ? result.search_query : query,
    results
  });
}

function safeError(error) {
  const raw = error instanceof Error
    ? error.message
    : typeof error?.message === 'string'
      ? error.message
      : String(error);
  return raw.slice(0, 300);
}
