/**
 * Web search client for CoreZ.
 *
 * POSTs to the worker's /api/search endpoint and returns normalized results.
 * The worker uses a provider chain (Brave when configured, then free
 * DuckDuckGo + Wikipedia); the client never fabricates results and reports
 * honest errors when no provider could answer.
 */

export const SEARCH_PROXY_ENDPOINT = "/api/search";

const MAX_RESULTS = 12;

export class SearchApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = "SearchApiError";
    this.status = status;
    this.detail = detail;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// DuckDuckGo Lite can interleave sponsored links (y.js?ad_domain=...);
// they are never surfaced as results.
function isAdUrl(value) {
  return /(?:y\.js\?|ad_domain=|ad_provider=|ad_type=|click_metadata=|\/aclick\?)/i.test(
    String(value || ""),
  );
}

function normalizeResults(payload) {
  if (!isObject(payload) || !Array.isArray(payload.results)) return [];
  return payload.results
    .filter((result) => isObject(result) && !isAdUrl(result.url))
    .map((result) => ({
      title: typeof result.title === "string" ? result.title : "",
      url: typeof result.url === "string" ? result.url : "",
      snippet: typeof result.snippet === "string" ? result.snippet : "",
      source: typeof result.source === "string" ? result.source : "search",
      ...(typeof result.extract === "string" && result.extract
        ? { extract: result.extract }
        : {}),
    }))
    .filter((result) => result.title || result.url)
    .slice(0, MAX_RESULTS);
}

/**
 * Search the web through the worker. Returns { results, source } where
 * results is a normalized, validated array. Throws SearchApiError on honest
 * failure (no provider configured, no results, network error) — CoreZ never
 * fabricates search results.
 *
 * With `{ detail: true }` the worker also attaches full article extracts to
 * the top Wikipedia results, so reports can be grounded in real content.
 */
export async function fetchWebSearch(query, signal = null, options = {}) {
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new SearchApiError("A search query is required.", 400);
  }
  const trimmed = query.trim().slice(0, 200);
  const fetchOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: trimmed, detail: options.detail === true }),
  };
  if (signal) fetchOptions.signal = signal;

  let response;
  try {
    response = await fetch(SEARCH_PROXY_ENDPOINT, fetchOptions);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new SearchApiError(
      "Web search request failed (network error).",
      0,
      String(error?.message || error),
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (response.status === 200) {
    const results = normalizeResults(data);
    if (results.length > 0) {
      return { results, source: data?.meta?.source || "search" };
    }
    throw new SearchApiError(
      "Web search returned no usable results.",
      502,
      data?.detail,
    );
  }
  if (response.status === 400) {
    throw new SearchApiError(
      data?.error || "Invalid search request.",
      400,
      data?.detail,
    );
  }
  if (response.status === 405) {
    throw new SearchApiError(
      "Search request method is unsupported.",
      405,
      data?.detail,
    );
  }
  throw new SearchApiError(
    data?.error || "Web search is unavailable.",
    response.status,
    data?.detail,
  );
}
