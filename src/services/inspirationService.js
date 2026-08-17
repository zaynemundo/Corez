/**
 * Awwwards design inspiration client for CoreZ.
 *
 * Fetches real award-winning site references from the worker's
 * /api/inspiration endpoint. The worker parses Awwwards category pages and
 * returns { title, url } references. Failure is never fatal: the client
 * returns an empty list so the app can continue without fabricated
 * inspiration.
 */

export const INSPIRATION_PROXY_ENDPOINT = '/api/inspiration';

const MAX_SITES = 6;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSites(payload) {
  if (!isObject(payload) || !Array.isArray(payload.sites)) return [];
  return payload.sites
    .filter((site) => isObject(site) && (typeof site.title === 'string' || typeof site.url === 'string'))
    .map((site) => {
      const item = {
        title: typeof site.title === 'string' ? site.title : '',
        url: typeof site.url === 'string' ? site.url : '',
        source: 'Awwwards'
      };
      if (typeof site.liveUrl === 'string' && site.liveUrl) item.liveUrl = site.liveUrl;
      if (typeof site.description === 'string' && site.description) item.description = site.description;
      if (typeof site.screenshotUrl === 'string' && site.screenshotUrl) item.screenshotUrl = site.screenshotUrl;
      if (Array.isArray(site.videoUrls) && site.videoUrls.length > 0) item.videoUrls = site.videoUrls.filter((v) => typeof v === 'string');
      if (Array.isArray(site.tags) && site.tags.length > 0) item.tags = site.tags.filter((t) => typeof t === 'string');
      return item;
    })
    .slice(0, MAX_SITES);
}

/**
 * Fetch live Awwwards inspiration for a design prompt.
 * Returns { sites, category, source }. Never throws for inspiration
 * availability: on any failure it returns an empty sites array so the
 * caller's design path continues with static tokens.
 */
export async function fetchAwwwardsInspiration(prompt, signal = null) {
  const query = String(prompt || '').trim().slice(0, 300);
  if (!query) return { sites: [], category: 'websites', source: 'Awwwards' };

  const fetchOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  };
  if (signal) fetchOptions.signal = signal;

  try {
    const response = await fetch(INSPIRATION_PROXY_ENDPOINT, fetchOptions);
    if (!response.ok) return { sites: [], category: 'websites', source: 'Awwwards' };
    const data = await response.json();
    return {
      sites: normalizeSites(data),
      category: typeof data?.category === 'string' ? data.category : 'websites',
      source: 'Awwwards'
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return { sites: [], category: 'websites', source: 'Awwwards' };
  }
}
