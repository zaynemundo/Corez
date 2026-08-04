/**
 * Web search endpoint for CoreZ.
 *
 * Searches the internet from the worker side and returns normalized results
 * that the AI (or the local fallback) uses to answer the user's request.
 *
 * Provider chain (honest, dependency-free, no API keys required):
 *   1. Wikipedia search API (reliable, keyless, works from Workers egress).
 *   2. DuckDuckGo Instant Answer API (zero-click; frequently returns empty
 *      and is often blocked from datacenter egress, so it is the fallback).
 *
 * Every result is normalized to { title, url, snippet, source }. When no
 * provider yields usable results the request fails honestly (502) — CoreZ
 * never fabricates search results.
 */

import { jsonResponse, readBoundedJson } from './utils.js';

const MAX_QUERY_CHARS = 200;
const MAX_RESULTS = 12;
const MAX_EXTRACT_RESULTS = 4;
const MAX_EXTRACT_CHARS = 3000;
const PROVIDER_TIMEOUT_MS = 8_000;
const EXTRACT_TIMEOUT_MS = 8_000;
const MAX_SEARCH_BODY_BYTES = 64 * 1024;
const DDG_LITE_ENDPOINT = 'https://lite.duckduckgo.com/lite/';
const WIKIPEDIA_ENDPOINT = 'https://en.wikipedia.org/w/api.php';
const WIKIPEDIA_EXTRACTS_ENDPOINT = 'https://en.wikipedia.org/w/api.php';
const OPENROUTER_RERANK_ENDPOINT = 'https://openrouter.ai/api/v1/rerank';
const OPENROUTER_EMBEDDINGS_ENDPOINT = 'https://openrouter.ai/api/v1/embeddings';
const DEFAULT_RERANK_MODEL = 'voyageai/rerank-2.5';
const DEFAULT_EMBED_MODEL = 'perplexity/pplx-embed-v1-0.6b';
const RERANK_TIMEOUT_MS = 10_000;
const EMBED_TIMEOUT_MS = 10_000;

// Question/filler lead phrases stripped before a query reaches a provider.
// Wikipedia's search matches EVERY token, so filler words like "what"/"is"
// flood results with irrelevant "What Is ..." titles — "what is gold" must
// search as "gold". Applied iteratively ("tell me about what is X" ->
// "X"); if cleaning would empty the query the raw query is kept.
const QUERY_LEAD_PATTERNS = [
  /^(?:what|who|when|where|why|how|which|whose|whom)\s+(?:is|are|was|were|do|does|did|would|will|should|could|can|am|be|to|'s|'re|'ve|'d)\s+/i,
  /^(?:tell\s+me(?:\s+(?:about|more\s+about|everything\s+about|something\s+about))?\s+|i\s+(?:want|wanna|need|would\s+like)\s+to\s+know(?:\s+about)?\s+|can\s+you\s+(?:tell|explain|give)\s+me(?:\s+(?:about|info|information))?\s+|explain(?:\s+to\s+me)?(?:\s+about)?\s+|define\s+|describe\s+|what\s+is\s+meant\s+by\s+|give\s+me\s+(?:info|information|details)(?:\s+(?:about|on))?\s+|information\s+(?:about|on)\s+|info\s+(?:about|on)\s+|search\s+the\s+web\s+for\s+|search\s+for\s+|look\s+(?:up|into)\s+|find\s+out(?:\s+about)?\s+|research(?:\s+on\s+|\s+about\s+|\s+)|about\s+)/i,
  /^(?:is|are|was|were|do|does|did|the|a|an|tell|about)\s+/i
];

/**
 * Reduces a natural-language request to its searchable topic:
 * "what is gold?" -> "gold", "tell me about natural hydrogen" ->
 * "natural hydrogen". Keeps the raw query when cleaning would leave nothing.
 */
export function cleanSearchQuery(rawQuery) {
  if (typeof rawQuery !== 'string') return '';
  let query = rawQuery.trim().replace(/[?!.]+$/, '').trim();
  if (!query) return '';
  let changed = true;
  let guard = 0;
  while (changed && guard < 10) {
    changed = false;
    guard += 1;
    for (const pattern of QUERY_LEAD_PATTERNS) {
      const next = query.replace(pattern, '');
      if (next !== query && next.trim()) {
        query = next.trim();
        changed = true;
      }
    }
  }
  return query.replace(/\s+/g, ' ').trim();
}

// Media-disambiguation titles ("Fools Gold (song)", "Gold (film)") are noise
// for single-word topics: a "what is gold" request wants the article about
// the topic itself, not media with the topic in their names.
const MEDIA_DISAMBIG_PATTERN = /\((?:song|single|album|ep|band|film|movie|video game|television series|tv series|novel|book|musical|opera|poem|magazine|song cycle|extended play)\)\s*$/i;

function filterMediaNoise(results, searchTerm) {
  if (/\s/.test(searchTerm)) return results;
  const topic = searchTerm.toLowerCase();
  const filtered = results.filter((result) => {
    const title = (result.title || '').toLowerCase();
    if (!MEDIA_DISAMBIG_PATTERN.test(title)) return true;
    return title === topic || title.startsWith(`${topic} `);
  });
  return filtered.length > 0 ? filtered : results;
}

// Promote titles that actually contain the topic phrase so provider quirks
// can never push the exact-topic article below unrelated titles. Stable and
// never removes results.
function promoteTitleMatches(results, searchTerm) {
  const phrase = searchTerm.toLowerCase();
  if (!phrase) return results;
  const matching = [];
  const others = [];
  for (const result of results) {
    if ((result.title || '').toLowerCase().includes(phrase)) {
      matching.push(result);
    } else {
      others.push(result);
    }
  }
  return [...matching, ...others];
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validQuery(value) {
  if (typeof value !== 'string') return null;
  const query = value.trim();
  if (!query || query.length > MAX_QUERY_CHARS) return null;
  // Control characters (NUL, tab, newline, etc.) are rejected.
  for (let i = 0; i < query.length; i += 1) {
    const code = query.charCodeAt(i);
    if (code < 32 || code === 127) return null;
  }
  return query;
}

function normalizeResult(title, url, snippet, source) {
  const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 200) : '';
  const cleanUrl = typeof url === 'string' ? url.trim().slice(0, 500) : '';
  const cleanSnippet = typeof snippet === 'string' ? snippet.trim().slice(0, 500) : '';
  if (!cleanTitle && !cleanUrl) return null;
  return { title: cleanTitle, url: cleanUrl, snippet: cleanSnippet, source };
}

function validHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Wikipedia's API policy requires a descriptive User-Agent; requests with a
// generic/blank UA (e.g. Cloudflare Workers default egress) can be rejected
// with 403. Setting an explicit UA is required for Workers deployments.
const PROVIDER_USER_AGENT = 'CoreZ/1.0 (https://corez.pro; web search agent)';

function providerFetchOptions() {
  return {
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    headers: { 'User-Agent': PROVIDER_USER_AGENT }
  };
}

/**
 * DuckDuckGo Lite: real web results (not the zero-click instant-answer API,
 * which returns nothing for most queries). The Lite HTML page lists results
 * as redirect links (`uddg=` carries the real URL) with snippets. No key.
 */
async function searchDuckDuckGo(query, fetchImpl) {
  const url = new URL(DDG_LITE_ENDPOINT);
  url.searchParams.set('q', query);
  const response = await fetchImpl(url, providerFetchOptions());
  if (!response.ok) {
    throw new Error(`DuckDuckGo HTTP ${response.status}`);
  }
  const html = await response.text();
  const results = [];
  const links = [];
  const linkPattern = /<a[^>]*href="([^"]*uddg=[^"]*)"[^>]*class=['"]result-link['"]>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    links.push({ href: match[1], title: decodeHtmlText(stripHtmlTags(match[2])).trim() });
    if (links.length >= MAX_RESULTS) break;
  }
  const snippets = [];
  const snippetPattern = /class=['"]result-snippet['"]>([\s\S]*?)<\/td>/gi;
  while ((match = snippetPattern.exec(html)) !== null) {
    snippets.push(decodeHtmlText(stripHtmlTags(match[1])).trim());
  }
  links.forEach((link, index) => {
    const realUrl = extractUddgUrl(link.href);
    if (!realUrl || !validHttpUrl(realUrl) || isAdUrl(realUrl)) return;
    const result = normalizeResult(
      link.title || 'DuckDuckGo result',
      realUrl,
      snippets[index] || '',
      'DuckDuckGo'
    );
    if (result) results.push(result);
  });
  return results.slice(0, MAX_RESULTS);
}

function extractUddgUrl(href) {
  const match = String(href).match(/[?&]uddg=([^&]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function stripHtmlTags(value) {
  return String(value).replace(/<[^>]*>/g, '');
}

// DuckDuckGo Lite can interleave sponsored links that redirect through
// duckduckgo.com/y.js?ad_domain=...&click_metadata=... — never surface ads
// as search results.
function isAdUrl(value) {
  const url = String(value || '');
  return /(?:y\.js\?|ad_domain=|ad_provider=|ad_type=|click_metadata=|\/aclick\?)/i.test(url);
}

const HTML_ENTITIES = Object.freeze([
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#34;/g, '"'],
  [/&#x22;/g, '"'],
  [/&#39;/g, "'"],
  [/&#039;/g, "'"],
  [/&#x27;/g, "'"],
  [/&apos;/g, "'"],
  [/&#x2F;/g, '/'],
  [/&nbsp;/g, ' '],
  [/&hellip;/g, '...'],
  [/&ndash;/g, '-'],
  [/&mdash;/g, '—'],
  [/&lsquo;/g, '\u2018'],
  [/&rsquo;/g, '\u2019'],
  [/&ldquo;/g, '\u201C'],
  [/&rdquo;/g, '\u201D'],
  [/&bull;/g, '\u2022']
]);

function decodeHtmlText(value) {
  let out = String(value);
  for (const [pattern, replacement] of HTML_ENTITIES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length || vecA.length === 0) {
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

function resultText(result) {
  return `${result.title || ''}. ${result.snippet || ''}`.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function openRouterKey(env) {
  return env?.OPENROUTER_API_KEY || null;
}

/**
 * Re-rank merged search results with an OpenRouter rerank model
 * (voyageai/rerank-2.5 by default) so the most
 * relevant results lead. Best effort: any failure returns null and the
 * caller keeps the original order — search never breaks on rerank.
 * The OpenRouter key is only ever sent to OpenRouter.
 */
async function rerankWithOpenRouter(query, results, env) {
  const apiKey = openRouterKey(env);
  const model = env?.OPENROUTER_RERANK_MODEL || DEFAULT_RERANK_MODEL;
  if (!apiKey || env?.OPENROUTER_RERANK_DISABLED === 'true') return null;

  let response;
  try {
    response = await fetch(OPENROUTER_RERANK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        query,
        documents: results.map((result) => ({ text: resultText(result) }))
      }),
      signal: AbortSignal.timeout(RERANK_TIMEOUT_MS)
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
      .filter((entry) => Number.isFinite(entry?.index) && Number.isFinite(entry?.relevance_score))
      .map((entry) => [entry.index, entry.relevance_score])
  );
  if (scoreByIndex.size < results.length) return null;

  return {
    method: 'rerank',
    results: [...results]
      .map((result, index) => ({ result, score: scoreByIndex.get(index) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.result)
  };
}

/**
 * Fallback ranking with OpenRouter embeddings (perplexity/pplx-embed-v1-0.6b
 * by default): cosine similarity between the query and each result text.
 * Best effort — any failure returns null and the original order is kept.
 */
async function rankWithEmbeddings(query, results, env) {
  const apiKey = openRouterKey(env);
  const model = env?.OPENROUTER_EMBED_MODEL || DEFAULT_EMBED_MODEL;
  if (!apiKey || env?.OPENROUTER_EMBED_DISABLED === 'true') return null;

  let response;
  try {
    response = await fetch(OPENROUTER_EMBEDDINGS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [query, ...results.map((result) => resultText(result))]
      }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS)
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
      .filter((item) => Number.isFinite(item?.index) && item.index > 0 && Array.isArray(item.embedding))
      .map((item) => [item.index - 1, item.embedding])
  );
  if (!Array.isArray(queryVector) || docVectors.size < results.length) return null;

  return {
    method: 'embeddings',
    results: [...results]
      .map((result, index) => ({ result, score: cosineSimilarity(queryVector, docVectors.get(index)) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.result)
  };
}

// Rank merged results: OpenRouter rerank first, embeddings similarity as the
// fallback. Never throws — returns null when neither can rank.
async function rankSearchResults(query, results, env) {
  const reranked = await rerankWithOpenRouter(query, results, env);
  if (reranked) return reranked;
  return rankWithEmbeddings(query, results, env);
}

/**
 * Fetch full plain-text article extracts for Wikipedia results. The MediaWiki
 * extracts API only returns content for ONE page per batched titles= request,
 * so each title is fetched in parallel (bounded, best effort). Used for deep
 * research so reports are grounded in the actual article content, not just
 * search snippets. Any failure omits the extract rather than failing search.
 */
async function fetchWikipediaExtracts(titles, fetchImpl) {
  const unique = Array.from(new Set(titles.filter((title) => typeof title === 'string' && title.trim())))
    .slice(0, MAX_EXTRACT_RESULTS);
  if (unique.length === 0) return new Map();

  const extracts = new Map();
  await Promise.allSettled(unique.map(async (title) => {
    const url = new URL(WIKIPEDIA_EXTRACTS_ENDPOINT);
    url.searchParams.set('action', 'query');
    url.searchParams.set('prop', 'extracts');
    url.searchParams.set('explaintext', '1');
    url.searchParams.set('exlimit', '1');
    url.searchParams.set('titles', title);
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');

    const response = await fetchImpl(url, {
      ...providerFetchOptions(),
      signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS)
    });
    if (!response.ok) return;
    const data = await response.json();
    const pages = data?.query?.pages;
    if (!isObject(pages)) return;
    for (const page of Object.values(pages)) {
      if (!isObject(page) || typeof page.title !== 'string') continue;
      const extract = typeof page.extract === 'string' ? page.extract.trim() : '';
      if (extract) extracts.set(page.title, extract.slice(0, MAX_EXTRACT_CHARS));
    }
  }));
  return extracts;
}

/** Wikipedia search: free, no key required. */
async function searchWikipedia(query, fetchImpl) {
  // Search the cleaned topic, not the raw request: token search on
  // "what is gold" matches "what"/"is" and floods results with unrelated
  // "What Is ..." articles.
  const searchTerm = cleanSearchQuery(query) || query;

  const tokenUrl = new URL(WIKIPEDIA_ENDPOINT);
  tokenUrl.searchParams.set('action', 'query');
  tokenUrl.searchParams.set('list', 'search');
  tokenUrl.searchParams.set('srsearch', searchTerm);
  tokenUrl.searchParams.set('format', 'json');
  tokenUrl.searchParams.set('srlimit', String(MAX_RESULTS));
  tokenUrl.searchParams.set('origin', '*');

  // Title-prefix search is the strongest relevance signal: "gold" yields
  // "Gold" first. Its hits lead the merged list so the exact-topic article
  // always surfaces ahead of generic token matches.
  const prefixUrl = new URL(WIKIPEDIA_ENDPOINT);
  prefixUrl.searchParams.set('action', 'query');
  prefixUrl.searchParams.set('list', 'prefixsearch');
  prefixUrl.searchParams.set('pssearch', searchTerm);
  prefixUrl.searchParams.set('pslimit', '6');
  prefixUrl.searchParams.set('format', 'json');
  prefixUrl.searchParams.set('origin', '*');

  const [tokenResponse, prefixResponse] = await Promise.allSettled([
    fetchImpl(tokenUrl, providerFetchOptions()),
    fetchImpl(prefixUrl, providerFetchOptions())
  ]);

  const results = [];
  const seenTitles = new Set();

  const appendHit = (hit, withSnippet) => {
    if (!isObject(hit) || typeof hit.title !== 'string') return;
    const title = hit.title.trim();
    if (!title || seenTitles.has(title.toLowerCase())) return;
    seenTitles.add(title.toLowerCase());
    const slug = encodeURIComponent(title.replace(/ /g, '_'));
    const snippet = withSnippet && typeof hit.snippet === 'string'
      ? decodeHtmlText(stripHtmlTags(hit.snippet)).trim()
      : '';
    const result = normalizeResult(title, `https://en.wikipedia.org/wiki/${slug}`, snippet, 'Wikipedia');
    if (result) results.push(result);
  };

  // Prefix hits first (exact-topic articles), then token-search hits.
  if (prefixResponse.status === 'fulfilled' && prefixResponse.value?.ok) {
    const data = await prefixResponse.value.json().catch(() => null);
    const hits = data?.query?.prefixsearch;
    if (Array.isArray(hits)) {
      for (const hit of hits.slice(0, 6)) appendHit(hit, false);
    }
  }
  if (tokenResponse.status === 'fulfilled' && tokenResponse.value?.ok) {
    const data = await tokenResponse.value.json().catch(() => null);
    const hits = data?.query?.search;
    if (Array.isArray(hits)) {
      for (const hit of hits) appendHit(hit, true);
    }
  }

  return promoteTitleMatches(filterMediaNoise(results, searchTerm), searchTerm).slice(0, MAX_RESULTS);
}

export async function handleSearch(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  let body;
  try {
    body = await readBoundedJson(request, MAX_SEARCH_BODY_BYTES);
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' });
  }
  const query = validQuery(body?.query);
  if (!query) {
    return jsonResponse(400, {
      error: `Query must be a non-empty string up to ${MAX_QUERY_CHARS} characters.`
    });
  }

  const fetchImpl = env?.__SEARCH_FETCH || fetch;
  // Providers search the cleaned topic ("what is gold" -> "gold") so filler
  // tokens never flood results; the original query is kept for reranking.
  const searchTerm = cleanSearchQuery(query) || query;
  // Free, keyless providers, run together and merged (deduped by URL):
  // Wikipedia (reliable from Worker egress) and DuckDuckGo Lite (real web
  // results, no key). One provider answering no longer hides the other.
  const providers = [
    async () => searchWikipedia(query, fetchImpl),
    async () => searchDuckDuckGo(searchTerm, fetchImpl)
  ];

  const failures = [];
  const providerResults = [];
  for (const provider of providers) {
    try {
      providerResults.push(await provider());
    } catch (error) {
      providerResults.push([]);
      failures.push(String(error?.message || error).slice(0, 200));
    }
  }

  // Round-robin merge (Wikipedia, DuckDuckGo, Wikipedia, ...) so one provider
  // never hides the other, deduped by URL.
  const merged = [];
  const seen = new Set();
  const maxLen = Math.max(0, ...providerResults.map((list) => list.length));
  for (let index = 0; index < maxLen && merged.length < MAX_RESULTS; index += 1) {
    for (const list of providerResults) {
      const result = list[index];
      if (!result) continue;
      const key = String(result.url || result.title).replace(/\/+$/, '').toLowerCase();
      if (!key || seen.has(key) || isAdUrl(result.url)) continue;
      seen.add(key);
      merged.push(result);
      if (merged.length >= MAX_RESULTS) break;
    }
  }

  if (merged.length > 0) {
    let results = merged.slice(0, MAX_RESULTS);
    let rerankMethod = null;
    if (results.length > 1) {
      const ranked = await rankSearchResults(query, results, env);
      if (ranked) {
        results = ranked.results;
        rerankMethod = ranked.method;
      }
    }

    // Deep research mode (body.detail === true): attach full Wikipedia
    // article extracts to the top Wikipedia results so reports can be
    // grounded in real article content, not just snippets. Best effort.
    let extracted = false;
    if (body?.detail === true) {
      const wikiResults = results.filter((result) => result.source === 'Wikipedia');
      const extracts = await fetchWikipediaExtracts(wikiResults.map((result) => result.title), fetchImpl);
      if (extracts.size > 0) {
        results = results.map((result) => {
          const extract = extracts.get(result.title);
          return extract ? { ...result, extract } : result;
        });
        extracted = true;
      }
    }

    const sources = Array.from(new Set(results.map((r) => r.source)));
    return jsonResponse(200, {
      kind: 'search',
      query,
      results,
      meta: {
        source: results[0]?.source || 'search',
        sources,
        rerank: rerankMethod,
        extracted,
        servedAt: new Date().toISOString()
      }
    });
  }

  // No provider yielded usable results: report honestly, never fabricate.
  return jsonResponse(502, {
    error: 'Web search returned no usable results.',
    detail: failures.length > 0
      ? `All search providers failed: ${failures.slice(0, 3).join(' | ')}`
      : 'All search providers returned no results.'
  });
}
