import { describe, it, expect, vi } from 'vitest';
import { generateAIResponse, isWebSearchRequest, formatSearchResults } from '../src/services/aiService.js';
import { fetchWebSearch, SearchApiError } from '../src/services/searchService.js';
import { handleSearch } from '../worker/search.js';

describe('Web search detection', () => {
  it('detects recency/news/search requests', () => {
    expect(isWebSearchRequest('What is the latest news about AI regulation?')).toBe(true);
    expect(isWebSearchRequest('Search the web for the current Bitcoin price')).toBe(true);
    expect(isWebSearchRequest('Who won the 2026 World Cup final?')).toBe(true);
    expect(isWebSearchRequest('Look up today\'s weather in London')).toBe(true);
    expect(isWebSearchRequest('Google the latest iPhone release date')).toBe(true);
  });

  it('does not search for knowledge questions without a recency signal', () => {
    expect(isWebSearchRequest('Explain black roses')).toBe(false);
    expect(isWebSearchRequest('What is photosynthesis?')).toBe(false);
    expect(isWebSearchRequest('Build me a chess game')).toBe(false);
    expect(isWebSearchRequest('Help me fix this JavaScript error')).toBe(false);
    expect(isWebSearchRequest('Write a poem about the ocean')).toBe(false);
  });
});

describe('Search result formatting', () => {
  it('formats results with titles, URLs, and sources', () => {
    const formatted = formatSearchResults({
      query: 'test query',
      results: [
        { title: 'Result One', url: 'https://example.com/1', snippet: 'Snippet one', source: 'Wikipedia' },
        { title: 'Result Two', url: 'https://example.com/2', snippet: '', source: 'DuckDuckGo' }
      ]
    });
    expect(formatted).toContain('Result One');
    expect(formatted).toContain('https://example.com/1');
    expect(formatted).toContain('Wikipedia');
    expect(formatted).toContain('Result Two');
  });

  it('reports honestly when there are no results', () => {
    const formatted = formatSearchResults({ query: 'nothing', results: [] });
    expect(formatted).toMatch(/no reliable results/i);
  });
});

describe('fetchWebSearch client', () => {
  it('returns normalized results on success', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      kind: 'search',
      query: 'web search',
      results: [{ title: 'T', url: 'https://example.com', snippet: 'S', source: 'Wikipedia' }],
      meta: { source: 'Wikipedia' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWebSearch('web search');
    expect(result.results[0]).toEqual({
      title: 'T', url: 'https://example.com', snippet: 'S', source: 'Wikipedia'
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/search', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ query: 'web search' })
    }));
    vi.unstubAllGlobals();
  });

  it('throws an honest error when the worker returns no results', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'Web search returned no usable results.' }, { status: 502 }));
    await expect(fetchWebSearch('zzz')).rejects.toBeInstanceOf(SearchApiError);
    await expect(fetchWebSearch('zzz')).rejects.toMatchObject({ status: 502 });
    vi.unstubAllGlobals();
  });

  it('rejects empty queries', async () => {
    await expect(fetchWebSearch('  ')).rejects.toMatchObject({ status: 400 });
  });

  it('propagates abort as AbortError', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', async (_url, _options) => {
      controller.abort();
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    await expect(fetchWebSearch('query', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    vi.unstubAllGlobals();
  });
});

describe('Worker /api/search endpoint', () => {
  const wikipediaFetch = async (url) => {
    const u = new URL(url);
    if (u.hostname === 'en.wikipedia.org') {
      return Response.json({
        query: { search: [{ title: 'Web Search', snippet: 'Web search is a tool.', wordcount: 5 }] }
      });
    }
    return Response.json({ AbstractText: '', RelatedTopics: [] });
  };

  it('returns normalized Wikipedia results without a key', async () => {
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'web search' })
      }),
      { __SEARCH_FETCH: wikipediaFetch }
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.kind).toBe('search');
    expect(data.results[0].url).toBe('https://en.wikipedia.org/wiki/Web_Search');
    expect(data.results[0].source).toBe('Wikipedia');
  });

  it('merges DuckDuckGo and Wikipedia results, deduped by URL', async () => {
    const fetchImpl = async (url) => {
      const u = new URL(url);
      if (u.hostname === 'lite.duckduckgo.com') {
        return new Response(
          `<a rel="nofollow" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://example.com/result')}&amp;rut=x" class='result-link'>A DDG result</a>
           <td class='result-snippet'>From DuckDuckGo.</td>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }
      return Response.json({ query: { search: [] } });
    };
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'testing order' })
      }),
      { __SEARCH_FETCH: fetchImpl }
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    // DuckDuckGo results are merged in alongside Wikipedia results.
    expect(data.results.some((r) => r.source === 'DuckDuckGo')).toBe(true);
    expect(data.results[0].url).toBe('https://example.com/result');
    expect(data.meta.sources).toContain('DuckDuckGo');
  });

  it('rejects invalid queries with 400', async () => {
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '   ' })
      }),
      {}
    );
    expect(response.status).toBe(400);
  });

  it('returns an honest 502 when every provider yields nothing', async () => {
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'zzzzzqqqqq' })
      }),
      { __SEARCH_FETCH: async () => Response.json({}) }
    );
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toMatch(/no usable results/i);
  });
});

describe('generateAIResponse search routing', () => {
  it('answers a recency request with grounded search results when hosted AI is down', async () => {
    // Search endpoint returns one result; hosted AI is down.
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/search') {
        return Response.json({
          kind: 'search',
          query: 'latest news about AI regulation',
          results: [{ title: 'AI News', url: 'https://news.example/ai', snippet: 'Regulators propose new AI rules.', source: 'Wikipedia' }],
          meta: { source: 'Wikipedia' }
        });
      }
      throw new Error('hosted AI down');
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('What is the latest news about AI regulation?', []);
    expect(response).toContain('AI News');
    expect(response).toContain('https://news.example/ai');
    expect(response).toContain('searched the web');
    vi.unstubAllGlobals();
  });

  it('falls back to the standard path when search is unavailable', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/search') {
        return Response.json({ error: 'no results' }, { status: 502 });
      }
      return Response.json({ content: 'standard answer' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('What is the latest news about AI regulation?', []);
    expect(response).toBe('standard answer');
    vi.unstubAllGlobals();
  });

  it('does not route pure knowledge questions to search', async () => {
    const fetchMock = vi.fn(async () => Response.json({ content: 'explanation answer' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('Explain black roses', []);
    expect(response).toBe('explanation answer');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/search', expect.anything());
    vi.unstubAllGlobals();
  });
});
