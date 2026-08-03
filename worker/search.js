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
const DDG_LITE_ENDPOINT = 'https://lite.duckduckgo.com/lite/';
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
    if (!realUrl || !validHttpUrl(realUrl)) return;
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

function decodeHtmlText(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
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
  // Free, keyless providers, run together and merged (deduped by URL):
  // Wikipedia (reliable from Worker egress) and DuckDuckGo Lite (real web
  // results, no key). One provider answering no longer hides the other.
  const providers = [
    async () => searchWikipedia(query, fetchImpl),
    async () => searchDuckDuckGo(query, fetchImpl)
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
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(result);
      if (merged.length >= MAX_RESULTS) break;
    }
  }

  if (merged.length > 0) {
    const sources = Array.from(new Set(merged.map((r) => r.source)));
    return jsonResponse(200, {
      kind: 'search',
      query,
      results: merged.slice(0, MAX_RESULTS),
      meta: {
        source: merged[0]?.source || 'search',
        sources,
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
