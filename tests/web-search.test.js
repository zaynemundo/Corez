import { describe, it, expect, vi } from 'vitest';
import { generateAIResponse, isWebSearchRequest, formatSearchResults } from '../src/services/aiService.js';
import { fetchWebSearch, SearchApiError } from '../src/services/searchService.js';
import { handleSearch, cleanSearchQuery } from '../worker/search.js';

describe('Web search detection', () => {
  it('detects recency/news/search requests', () => {
    expect(isWebSearchRequest('What is the latest news about AI regulation?')).toBe(true);
    expect(isWebSearchRequest('Search the web for the current Bitcoin price')).toBe(true);
    expect(isWebSearchRequest('Who won the 2026 World Cup final?')).toBe(true);
    expect(isWebSearchRequest('Look up today\'s weather in London')).toBe(true);
    expect(isWebSearchRequest('Google the latest iPhone release date')).toBe(true);
  });

  it('detects generic freshness and status questions', () => {
    expect(isWebSearchRequest("What's new in AI?")).toBe(true);
    expect(isWebSearchRequest("What's new with LOOM?")).toBe(true);
    expect(isWebSearchRequest('Anything new from Vite?')).toBe(true);
    expect(isWebSearchRequest("What's the latest iPhone?")).toBe(true);
    expect(isWebSearchRequest('Is LOOM still active?')).toBe(true);
    expect(isWebSearchRequest('Are they still together?')).toBe(true);
    expect(isWebSearchRequest("What's the latest music Imagine Dragons created?")).toBe(true);
    expect(isWebSearchRequest('What is the latest music from Imagine Dragons?')).toBe(true);
    expect(isWebSearchRequest("What's the newest Imagine Dragons song?")).toBe(true);
  });

  it('does not search for knowledge questions without a recency signal', () => {
    expect(isWebSearchRequest('Explain black roses')).toBe(false);
    expect(isWebSearchRequest('What is photosynthesis?')).toBe(false);
    expect(isWebSearchRequest('Build me a chess game')).toBe(false);
    expect(isWebSearchRequest('Help me fix this JavaScript error')).toBe(false);
    expect(isWebSearchRequest('Write a poem about the ocean')).toBe(false);
    // Local-context freshness questions never trigger a search.
    expect(isWebSearchRequest("What's new in my game?")).toBe(false);
    expect(isWebSearchRequest("What's new in the app?")).toBe(false);
    expect(isWebSearchRequest('Are you still making games?')).toBe(false);
    expect(isWebSearchRequest('Play the next song in my playlist')).toBe(false);
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
      body: JSON.stringify({ query: 'web search', detail: false })
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

  it('returns a deterministic live currency conversion result', async () => {
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'Convert 25000 PHP to USD.' })
      }),
      {
        __SEARCH_FETCH: async (url) => {
          const parsed = new URL(url);
          if (parsed.hostname === 'api.frankfurter.app') {
            expect(parsed.searchParams.get('amount')).toBe('25000');
            expect(parsed.searchParams.get('from')).toBe('PHP');
            expect(parsed.searchParams.get('to')).toBe('USD');
            return Response.json({ amount: 25000, base: 'PHP', date: '2026-08-07', rates: { USD: 410.74 } });
          }
          return Response.json({ query: { search: [] } });
        }
      }
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results[0]).toMatchObject({
      source: 'Frankfurter',
      snippet: '25000 PHP = 410.74 USD. Reference rate date: 2026-08-07.'
    });
    expect(data.meta.sources).toContain('Frankfurter');
  });

  it('falls back to an independent currency provider', async () => {
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'Convert 25000 PHP to USD.' })
      }),
      {
        __SEARCH_FETCH: async (url) => {
          const parsed = new URL(url);
          if (parsed.hostname === 'api.frankfurter.app') return Response.json({}, { status: 503 });
          if (parsed.hostname === 'open.er-api.com') {
            expect(parsed.pathname).toBe('/v6/latest/PHP');
            return Response.json({
              result: 'success',
              time_last_update_utc: 'Sun, 09 Aug 2026 00:02:31 +0000',
              rates: { USD: 0.016432 }
            });
          }
          return Response.json({ query: { search: [] } });
        }
      }
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results[0]).toMatchObject({
      source: 'ExchangeRate-API',
      snippet: '25000 PHP = 410.8 USD. Rate updated: Sun, 09 Aug 2026 00:02:31 +0000.'
    });
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

  it('leads with Exa results when EXA_API_KEY is configured', async () => {
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'quantum computing news' })
      }),
      {
        EXA_API_KEY: 'exa-uuid-test',
        __SEARCH_FETCH: async (url, init) => {
          const u = new URL(url);
          if (u.hostname === 'api.exa.ai') {
            const requestBody = JSON.parse(init.body);
            expect(requestBody.query).toBe('quantum computing news');
            expect(init.headers['x-api-key']).toBe('exa-uuid-test');
            expect(requestBody.contents).toEqual({ highlights: true });
            return Response.json({
              resolvedSearchType: 'auto',
              results: [
                { title: 'Quantum News', url: 'https://quantum.example/news', highlights: ['Latest breakthrough.'] }
              ]
            });
          }
          return Response.json({ query: { search: [] } });
        }
      }
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results[0]).toMatchObject({
      title: 'Quantum News',
      url: 'https://quantum.example/news',
      snippet: 'Latest breakthrough.',
      source: 'Exa'
    });
    expect(data.meta.sources).toContain('Exa');
  });

  it('never calls Exa without a key and keeps the keyless backstop', async () => {
    let exaCalled = false;
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'keyless test' })
      }),
      {
        __SEARCH_FETCH: async (url) => {
          const u = new URL(url);
          if (u.hostname === 'api.exa.ai') {
            exaCalled = true;
            return Response.json({ results: [] });
          }
          if (u.hostname === 'en.wikipedia.org') {
            return Response.json({
              query: { search: [{ title: 'Keyless', snippet: 'S.', wordcount: 5 }] }
            });
          }
          return Response.json({});
        }
      }
    );
    expect(response.status).toBe(200);
    expect(exaCalled).toBe(false);
    const data = await response.json();
    expect(data.results.some((r) => r.source === 'Wikipedia')).toBe(true);
  });

  it('keeps answering via keyless providers when Exa fails', async () => {
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'red turtles' })
      }),
      {
        EXA_API_KEY: 'exa-uuid-test',
        __SEARCH_FETCH: async (url) => {
          const u = new URL(url);
          if (u.hostname === 'api.exa.ai') throw new Error('exa offline');
          if (u.hostname === 'en.wikipedia.org') {
            return Response.json({
              query: { search: [{ title: 'Red turtle', snippet: 'S.', wordcount: 5 }] }
            });
          }
          return Response.json({});
        }
      }
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results[0].source).toBe('Wikipedia');
  });

  it('attaches full Exa page text as the extract in detail mode', async () => {
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'deep dive', detail: true })
      }),
      {
        EXA_API_KEY: 'exa-uuid-test',
        __SEARCH_FETCH: async (url, init) => {
          const u = new URL(url);
          if (u.hostname === 'api.exa.ai') {
            expect(JSON.parse(init.body).contents).toEqual({ text: true, highlights: true });
            return Response.json({
              results: [
                {
                  title: 'Deep Page',
                  url: 'https://deep.example/page',
                  text: 'Full article text. '.repeat(200),
                  highlights: ['Highlight.']
                }
              ]
            });
          }
          return Response.json({ query: { search: [] } });
        }
      }
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.meta.extracted).toBe(true);
    const exaResult = data.results.find((r) => r.source === 'Exa');
    expect(exaResult.extract).toContain('Full article text.');
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

describe('cleanSearchQuery', () => {
  it('strips question leads and filler so the topic is searched, not the sentence', () => {
    expect(cleanSearchQuery('what is gold')).toBe('gold');
    expect(cleanSearchQuery('What are the symptoms of flu?')).toBe('symptoms of flu');
    expect(cleanSearchQuery('who is Albert Einstein')).toBe('Albert Einstein');
    expect(cleanSearchQuery('tell me about natural hydrogen')).toBe('natural hydrogen');
    expect(cleanSearchQuery('i want to know about gold fixing')).toBe('gold fixing');
    expect(cleanSearchQuery('search the web for bitcoin price')).toBe('bitcoin price');
    expect(cleanSearchQuery('how to make a website')).toBe('make a website');
    expect(cleanSearchQuery('research quantum computing')).toBe('quantum computing');
    expect(cleanSearchQuery('can you tell me about what is gold?')).toBe('gold');
  });

  it('keeps genuine topics intact', () => {
    expect(cleanSearchQuery('bitcoin price today')).toBe('bitcoin price today');
    expect(cleanSearchQuery('2026 world cup final')).toBe('2026 world cup final');
    expect(cleanSearchQuery('gold')).toBe('gold');
  });

  it('falls back to the raw query when cleaning would empty it', () => {
    expect(cleanSearchQuery('what is')).toBe('what is');
    expect(cleanSearchQuery('')).toBe('');
  });
});

describe('Worker /api/search query relevance', () => {  it('searches the cleaned topic so "what is gold" cannot flood results with "What Is ..." titles', async () => {
    const capturedQueries = [];
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'what is gold' })
      }),
      {
        __SEARCH_FETCH: async (url) => {
          const u = new URL(url);
          const searchParam = u.searchParams.get('srsearch') || u.searchParams.get('pssearch');
          if (searchParam) capturedQueries.push(searchParam);
          if (u.hostname === 'lite.duckduckgo.com') return Response.json({ AbstractText: '', RelatedTopics: [] });
          if (u.searchParams.get('list') === 'prefixsearch') {
            return Response.json({
              query: { prefixsearch: [{ title: 'Gold' }] }
            });
          }
          return Response.json({
            query: { search: [
              { title: 'Gold', snippet: 'Chemical element.', wordcount: 5 },
              { title: 'Gold as an investment', snippet: 'Store of value.', wordcount: 5 },
              { title: 'What Is Intelligence?', snippet: 'x', wordcount: 5 },
              { title: 'WhatsApp', snippet: 'x', wordcount: 5 },
              { title: 'Fools Gold (song)', snippet: 'x', wordcount: 5 },
              { title: 'Miaow (album)', snippet: 'x', wordcount: 5 }
            ] }
          });
        }
      }
    );

    expect(response.status).toBe(200);
    // The topic sent to Wikipedia and DuckDuckGo is the cleaned term.
    expect(capturedQueries).toContain('gold');
    expect(capturedQueries).not.toContain('what is gold');

    const data = await response.json();
    const titles = data.results.map((r) => r.title);
    // The exact-topic article leads (prefix hit first, deduped with token hit).
    expect(titles[0]).toBe('Gold');
    expect(titles.filter((t) => t === 'Gold')).toHaveLength(1);
    // Topic-phrase titles are promoted ahead of unrelated titles.
    const goldIdx = titles.indexOf('Gold as an investment');
    const noiseIdx = Math.max(titles.indexOf('What Is Intelligence?'), titles.indexOf('WhatsApp'));
    expect(noiseIdx).toBeGreaterThan(goldIdx);
    // Media-disambiguation titles are dropped for single-word topics.
    expect(titles).not.toContain('Fools Gold (song)');
    expect(titles).not.toContain('Miaow (album)');
  });

  it('keeps media titles for multi-word topics like a movie query', async () => {
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'gold movie' })
      }),
      {
        __SEARCH_FETCH: async (url) => {
          const u = new URL(url);
          if (u.hostname === 'lite.duckduckgo.com') return Response.json({ AbstractText: '', RelatedTopics: [] });
          if (u.searchParams.get('list') === 'prefixsearch') {
            return Response.json({ query: { prefixsearch: [] } });
          }
          return Response.json({
            query: { search: [
              { title: 'Gold (film)', snippet: '2016 film.', wordcount: 5 },
              { title: 'Gold standard', snippet: 'Monetary system.', wordcount: 5 }
            ] }
          });
        }
      }
    );
    const data = await response.json();
    const titles = data.results.map((r) => r.title);
    expect(titles).toContain('Gold (film)');
    expect(titles).toContain('Gold standard');
  });

  it('falls back to the raw query when cleaning empties it', async () => {
    const capturedQueries = [];
    const response = await handleSearch(
      new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'what is' })
      }),
      {
        __SEARCH_FETCH: async (url) => {
          const u = new URL(url);
          const searchParam = u.searchParams.get('srsearch') || u.searchParams.get('pssearch');
          if (searchParam) capturedQueries.push(searchParam);
          if (u.hostname === 'lite.duckduckgo.com') return Response.json({ AbstractText: '', RelatedTopics: [] });
          return Response.json({ query: { search: [{ title: 'What is', snippet: 'x', wordcount: 5 }] } });
        }
      }
    );
    expect(response.status).toBe(200);
    expect(capturedQueries).toContain('what is');
  });
});
