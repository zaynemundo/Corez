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
const MAX_RESULTS = 8;
const PROVIDER_TIMEOUT_MS = 8_000;
const MAX_SEARCH_BODY_BYTES = 64 * 1024;
const DDG_ENDPOINT = 'https://api.duckduckgo.com/';
const WIKIPEDIA_ENDPOINT = 'https://en.wikipedia.org/w/api.php';

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

/** DuckDuckGo Instant Answer: no key required. */
async function searchDuckDuckGo(query, fetchImpl) {
  const url = new URL(DDG_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_html', '1');
  url.searchParams.set('skip_disambig', '1');
  const response = await fetchImpl(url, providerFetchOptions());
  if (!response.ok) {
    throw new Error(`DuckDuckGo HTTP ${response.status}`);
  }
  const data = await response.json();
  const results = [];

  if (typeof data.AbstractText === 'string' && data.AbstractText.trim()
    && validHttpUrl(data.AbstractURL)) {
    const abstract = normalizeResult(
      data.Heading || 'DuckDuckGo result',
      data.AbstractURL,
      data.AbstractText,
      'DuckDuckGo'
    );
    if (abstract) results.push(abstract);
  }
  if (Array.isArray(data.RelatedTopics)) {
    const collect = (topics) => {
      for (const topic of topics) {
        if (!isObject(topic)) continue;
        if (Array.isArray(topic.Topics)) {
          collect(topic.Topics);
          continue;
        }
        if (typeof topic.Text === 'string' && topic.Text.trim()
          && validHttpUrl(topic.FirstURL)) {
          const result = normalizeResult(
            topic.Text.split(' - ')[0] || 'Result',
            topic.FirstURL,
            topic.Text,
            'DuckDuckGo'
          );
          if (result) results.push(result);
        }
        if (results.length >= MAX_RESULTS) break;
      }
    };
    collect(data.RelatedTopics);
  }
  return results.slice(0, MAX_RESULTS);
}

/** Wikipedia search: free, no key required. */
async function searchWikipedia(query, fetchImpl) {
  const url = new URL(WIKIPEDIA_ENDPOINT);
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('srlimit', String(MAX_RESULTS));
  url.searchParams.set('origin', '*');
  const response = await fetchImpl(url, providerFetchOptions());
  if (!response.ok) {
    throw new Error(`Wikipedia HTTP ${response.status}`);
  }
  const data = await response.json();
  const hits = data?.query?.search;
  if (!Array.isArray(hits)) return [];
  return hits
    .map((hit) => {
      if (!isObject(hit) || typeof hit.title !== 'string') return null;
      const slug = encodeURIComponent(hit.title.replace(/ /g, '_'));
      return normalizeResult(
        hit.title,
        `https://en.wikipedia.org/wiki/${slug}`,
        typeof hit.snippet === 'string' ? hit.snippet.replace(/<[^>]*>/g, '') : '',
        'Wikipedia'
      );
    })
    .filter(Boolean)
    .slice(0, MAX_RESULTS);
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
  // Free, keyless providers: Wikipedia first (reliable from Worker egress),
  // DuckDuckGo second (zero-click API is often empty or blocked).
  const providers = [
    async () => searchWikipedia(query, fetchImpl),
    async () => searchDuckDuckGo(query, fetchImpl)
  ];

  const failures = [];
  for (const provider of providers) {
    try {
      const results = await provider();
      if (Array.isArray(results) && results.length > 0) {
        return jsonResponse(200, {
          kind: 'search',
          query,
          results,
          meta: { source: results[0]?.source || 'search', servedAt: new Date().toISOString() }
        });
      }
    } catch (error) {
      failures.push(String(error?.message || error).slice(0, 200));
    }
  }

  // No provider yielded usable results: report honestly, never fabricate.
  return jsonResponse(502, {
    error: 'Web search returned no usable results.',
    detail: failures.length > 0
      ? `All search providers failed: ${failures.slice(0, 3).join(' | ')}`
      : 'All search providers returned no results.'
  });
}
