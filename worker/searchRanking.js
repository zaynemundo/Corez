import {
  WORKERS_AI_RERANK_MODEL,
  WORKERS_AI_EMBED_MODEL,
  hasWorkersAIBinding,
} from "./aiModels.js";

const OPENROUTER_RERANK_ENDPOINT = "https://openrouter.ai/api/v1/rerank";
const OPENROUTER_EMBEDDINGS_ENDPOINT =
  "https://openrouter.ai/api/v1/embeddings";
const OPENCODE_RERANK_ENDPOINT = "https://opencode.ai/zen/go/v1/rerank";
const OPENCODE_EMBEDDINGS_ENDPOINT = "https://opencode.ai/zen/go/v1/embeddings";
const DEFAULT_RERANK_MODEL = "voyageai/rerank-2.5";
const DEFAULT_EMBED_MODEL = "perplexity/pplx-embed-v1-0.6b";
const RERANK_TIMEOUT_MS = 10_000;
const EMBED_TIMEOUT_MS = 10_000;

export function cosineSimilarity(vecA, vecB) {
  if (
    !Array.isArray(vecA) ||
    !Array.isArray(vecB) ||
    vecA.length !== vecB.length ||
    vecA.length === 0
  ) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dot / magnitude : 0;
}

export function resultText(result) {
  return `${result.title || ""}. ${result.snippet || ""}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

// Compact variant for the Workers AI reranker, whose input context is ~512
// tokens: keeps the whole merged result list (up to 12) inside the limit.
export function rerankText(result) {
  return `${result.title || ""}. ${result.snippet || ""}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function openRouterKey(env) {
  return env?.OPENROUTER_API_KEY || null;
}

function openCodeKey(env) {
  return env?.OPENCODE_GO_API_KEY || env?.OPENCODE_API_KEY || null;
}

// Ranking providers, most preferred first. DeepSeek V4 Flash (the default
// chat model) is served through the OpenCode Go gateway, so the same key and
// gateway are used for rerank and embeddings first; OpenRouter is the
// fallback provider. Each provider keeps its own key and endpoint.
export function rankingProviders(env) {
  const providers = [];
  const opencodeKey = openCodeKey(env);
  if (opencodeKey) {
    providers.push({
      label: "opencode",
      apiKey: opencodeKey,
      rerankEndpoint: OPENCODE_RERANK_ENDPOINT,
      embedEndpoint: OPENCODE_EMBEDDINGS_ENDPOINT,
      rerankModel: env?.OPENCODE_RERANK_MODEL || DEFAULT_RERANK_MODEL,
      embedModel: env?.OPENCODE_EMBED_MODEL || DEFAULT_EMBED_MODEL,
      rerankDisabled: env?.OPENCODE_RERANK_DISABLED === "true",
      embedDisabled: env?.OPENCODE_EMBED_DISABLED === "true",
    });
  }
  const openrouterKey = openRouterKey(env);
  if (openrouterKey) {
    providers.push({
      label: "openrouter",
      apiKey: openrouterKey,
      rerankEndpoint: OPENROUTER_RERANK_ENDPOINT,
      embedEndpoint: OPENROUTER_EMBEDDINGS_ENDPOINT,
      rerankModel: env?.OPENROUTER_RERANK_MODEL || DEFAULT_RERANK_MODEL,
      embedModel: env?.OPENROUTER_EMBED_MODEL || DEFAULT_EMBED_MODEL,
      rerankDisabled: env?.OPENROUTER_RERANK_DISABLED === "true",
      embedDisabled: env?.OPENROUTER_EMBED_DISABLED === "true",
    });
  }
  return providers;
}

/**
 * Re-rank merged search results with a rerank model (voyageai/rerank-2.5 by
 * default) so the most relevant results lead. Best effort: any failure
 * returns null and the caller keeps the original order — search never
 * breaks on rerank. The provider's key is only ever sent to that provider.
 */
export async function rerankWithProvider(query, results, provider) {
  if (!provider?.apiKey || provider.rerankDisabled) return null;

  let response;
  try {
    response = await fetch(provider.rerankEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.rerankModel,
        query,
        documents: results.map((result) => ({ text: resultText(result) })),
      }),
      signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let data;
  try {
    data = await response.json();
  } catch {
    return null;
  }

  const scored = Array.isArray(data?.results) ? data.results : [];
  // A partial response is treated as a failure: reordering on incomplete
  // scores would scramble the merged order.
  if (scored.length < results.length) return null;

  const scoreByIndex = new Map(
    scored
      .filter(
        (entry) =>
          Number.isFinite(entry?.index) &&
          Number.isFinite(entry?.relevance_score),
      )
      .map((entry) => [entry.index, entry.relevance_score]),
  );
  if (scoreByIndex.size < results.length) return null;

  return {
    method: "rerank",
    provider: provider.label,
    results: [...results]
      .map((result, index) => ({ result, score: scoreByIndex.get(index) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.result),
  };
}

/**
 * Fallback ranking with embeddings (perplexity/pplx-embed-v1-0.6b by
 * default): cosine similarity between the query and each result text.
 * Best effort — any failure returns null and the original order is kept.
 */
export async function rankWithEmbeddingsProvider(query, results, provider) {
  if (!provider?.apiKey || provider.embedDisabled) return null;

  let response;
  try {
    response = await fetch(provider.embedEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.embedModel,
        input: [query, ...results.map((result) => resultText(result))],
      }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let data;
  try {
    data = await response.json();
  } catch {
    return null;
  }

  const vectors = Array.isArray(data?.data) ? data.data : [];
  if (vectors.length < results.length + 1) return null;

  const queryVector = vectors.find((item) => item?.index === 0)?.embedding;
  const docVectors = new Map(
    vectors
      .filter(
        (item) =>
          Number.isFinite(item?.index) &&
          item.index > 0 &&
          Array.isArray(item.embedding),
      )
      .map((item) => [item.index - 1, item.embedding]),
  );
  if (!Array.isArray(queryVector) || docVectors.size < results.length)
    return null;

  return {
    method: "embeddings",
    provider: provider.label,
    results: [...results]
      .map((result, index) => ({
        result,
        score: cosineSimilarity(queryVector, docVectors.get(index)),
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.result),
  };
}

// Rank merged results across every configured provider: the free Workers AI
// path first, then the keyed providers. The Workers AI path fuses BOTH of its
// signals — bge-reranker-base relevance plus bge-m3 embedding similarity —
// with Reciprocal Rank Fusion instead of trusting one score scale, so a
// result that both signals agree on always outranks one that only a single
// signal likes. Never throws — returns null when neither can rank. Both
// signals run inside the daily neuron allocation, so fusing them never costs
// a third-party API call. A provider that cannot serve either is skipped.
export async function rankSearchResults(query, results, env) {
  const workersAIFused = await rankWithWorkersAI(query, results, env);
  if (workersAIFused) return workersAIFused;
  const providers = rankingProviders(env);
  for (const provider of providers) {
    const reranked = await rerankWithProvider(query, results, provider);
    if (reranked) return reranked;
  }
  for (const provider of providers) {
    const embedded = await rankWithEmbeddingsProvider(query, results, provider);
    if (embedded) return embedded;
  }
  return null;
}

/**
 * Reciprocal Rank Fusion over best-first index orders (one per ranking
 * signal). score(i) = SUM 1/(k + rank). A result both signals rank highly
 * outscores one that a single signal loves — the standard fix for
 * winner-takes-all rerank-vs-embeddings disagreements. Indices absent from
 * every order (defensive: both rankers cover all results or fail) keep their
 * original merged position at the tail. Ties break by original position so
 * the output is deterministic. k=60 is the literature standard.
 *
 * @param {number[][]} orders Best-first result indices per signal.
 * @param {number} count Total result count.
 * @param {number} [k] Fusion constant.
 * @returns {number[]} Fused best-first result indices.
 */
export function reciprocalRankFusion(orders, count, k = 60) {
  const fused = new Map();
  for (const order of orders) {
    if (!Array.isArray(order)) continue;
    order.forEach((index, rank) => {
      if (!Number.isInteger(index) || index < 0 || index >= count) return;
      fused.set(index, (fused.get(index) || 0) + 1 / (k + rank + 1));
    });
  }
  const ranked = [...fused.keys()].sort((a, b) => {
    const diff = fused.get(b) - fused.get(a);
    return diff !== 0 ? diff : a - b;
  });
  for (let index = 0; index < count; index += 1) {
    if (!fused.has(index)) ranked.push(index);
  }
  return ranked;
}

/** Best-first original indices of an already-ranked result list. */
function orderOf(rankedResults, originals) {
  return rankedResults
    .map((result) => originals.indexOf(result))
    .filter((index) => index >= 0);
}

/**
 * Free ranking with the account's own Workers AI: rerank and embedding
 * similarity run in parallel and fuse when both succeed (method "fusion");
 * a lone surviving signal is used as-is. Best effort — null when neither
 * serves, and the caller keeps the original order.
 */
export async function rankWithWorkersAI(query, results, env) {
  const [reranked, embedded] = await Promise.all([
    rerankWithWorkersAI(query, results, env),
    rankWithEmbeddingsWorkersAI(query, results, env),
  ]);
  if (reranked && embedded) {
    const fused = reciprocalRankFusion(
      [orderOf(reranked.results, results), orderOf(embedded.results, results)],
      results.length,
    );
    return {
      method: "fusion",
      provider: "workers-ai",
      results: fused.map((index) => results[index]),
    };
  }
  return reranked || embedded;
}

/**
 * Re-rank merged search results with the account's own Workers AI
 * bge-reranker-base model: query + each result text -> relevance scores that
 * reorder the list. Best effort — any failure returns null and the caller
 * keeps the original order, exactly like the keyed providers. Disable with
 * WORKERS_AI_RERANK_DISABLED=true.
 */
export async function rerankWithWorkersAI(query, results, env) {
  if (env?.WORKERS_AI_RERANK_DISABLED === "true") return null;
  if (!hasWorkersAIBinding(env)) return null;

  let data;
  try {
    data = await env.AI.run(WORKERS_AI_RERANK_MODEL, {
      query,
      // bge-reranker-base accepts ~512 input tokens per call, so each
      // document is trimmed hard: 12 results × 160 chars stays comfortably
      // under the limit and the reranker actually runs instead of falling
      // back to embedding similarity.
      contexts: results.map((result) => ({ text: rerankText(result) })),
    });
  } catch {
    return null;
  }

  // The provider returns the scored list under `response` with `id` fields
  // ({ response: [{ id, score }] }); accept `results`/`index` too.
  const scored = Array.isArray(data?.response)
    ? data.response
    : Array.isArray(data?.results)
      ? data.results
      : [];
  // A partial response is treated as a failure: reordering on incomplete
  // scores would scramble the merged order.
  if (scored.length < results.length) return null;

  const scoreByIndex = new Map(
    scored
      .filter(
        (entry) =>
          Number.isFinite(entry?.score) &&
          (Number.isFinite(entry?.index) || Number.isFinite(entry?.id)),
      )
      .map((entry) => [
        Number.isFinite(entry.index) ? entry.index : entry.id,
        entry.score,
      ]),
  );
  if (scoreByIndex.size < results.length) return null;

  return {
    method: "rerank",
    provider: "workers-ai",
    results: [...results]
      .map((result, index) => ({ result, score: scoreByIndex.get(index) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.result),
  };
}

/**
 * Fallback ranking with the account's own Workers AI bge-m3 embeddings:
 * cosine similarity between the query vector and each result vector. Best
 * effort — any failure returns null and the original order is kept. Disable
 * with WORKERS_AI_EMBED_DISABLED=true.
 */
export async function rankWithEmbeddingsWorkersAI(query, results, env) {
  if (env?.WORKERS_AI_EMBED_DISABLED === "true") return null;
  if (!hasWorkersAIBinding(env)) return null;

  let data;
  try {
    data = await env.AI.run(WORKERS_AI_EMBED_MODEL, {
      text: [query, ...results.map((result) => resultText(result))],
    });
  } catch {
    return null;
  }

  const vectors = Array.isArray(data?.data) ? data.data : [];
  if (vectors.length < results.length + 1) return null;

  const queryVector = vectors[0];
  const docVectors = vectors.slice(1, results.length + 1);
  if (!Array.isArray(queryVector) || docVectors.length < results.length)
    return null;

  return {
    method: "embeddings",
    provider: "workers-ai",
    results: [...results]
      .map((result, index) => ({
        result,
        score: cosineSimilarity(queryVector, docVectors[index]),
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.result),
  };
}
