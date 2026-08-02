/**
 * Awwwards design inspiration for CoreZ.
 *
 * When the user asks for an app/site/game, CoreZ enriches the model prompt
 * with REAL award-winning sites from Awwwards (the design awards platform)
 * so the generated output has concrete, current visual references instead of
 * only generic design tokens.
 *
 * Awwwards has no public API and its pages are JS-rendered, but its category
 * listing pages (https://www.awwwards.com/websites/<category>/) embed real
 * award-site slugs in the server-rendered HTML. We parse those slugs and
 * return { title, url } references.
 *
 * Honest behaviour: when the page is unreachable or yields no slugs, we
 * return an empty list — CoreZ never invents inspiration sites.
 */

import { jsonResponse, readBoundedJson } from './utils.js';

const MAX_SITES = 6;
const MAX_INSPIRATION_BODY_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const BASE = 'https://www.awwwards.com/websites';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Category keyword map mirrors packages/agent-core/context/designTokens.js.
const CATEGORIES = Object.freeze([
  { key: 'e-commerce', url: `${BASE}/e-commerce/`, keywords: ['product', 'shop', 'store', 'buy', 'cart', 'checkout', 'e-commerce', 'ecommerce', 'sell', 'merch'] },
  { key: 'portfolio', url: `${BASE}/portfolio/`, keywords: ['portfolio', 'personal', 'resume', 'cv', 'bio', 'developer', 'designer'] },
  { key: 'agency', url: `${BASE}/agency/`, keywords: ['agency', 'studio', 'company', 'consulting', 'services', 'firm'] },
  { key: 'gaming', url: `${BASE}/gaming/`, keywords: ['game', 'gaming', 'arcade', 'play', 'player', 'esports', 'quest', 'rpg', 'boss'] },
  { key: 'saas', url: `${BASE}/tech/`, keywords: ['saas', 'dashboard', 'analytics', 'software', 'platform', 'metrics'] },
  { key: 'editorial', url: `${BASE}/editorial/`, keywords: ['blog', 'news', 'magazine', 'editorial', 'article', 'publication', 'content'] },
  { key: 'architecture', url: `${BASE}/architecture/`, keywords: ['architecture', 'building', 'interior', 'construction', 'spatial', 'structure', 'house', 'home'] },
  { key: 'art-illustration', url: `${BASE}/art-illustration/`, keywords: ['art', 'artist', 'illustration', 'draw', 'gallery', 'exhibition', 'canvas', 'creative'] },
  { key: 'fashion', url: `${BASE}/fashion/`, keywords: ['fashion', 'apparel', 'clothing', 'brand', 'lookbook', 'model', 'wear', 'style'] },
  { key: 'food-drink', url: `${BASE}/food-drink/`, keywords: ['food', 'drink', 'restaurant', 'cafe', 'coffee', 'dining', 'recipe', 'bar', 'baking'] },
  { key: 'hotel-travel', url: `${BASE}/hotel-restaurant/`, keywords: ['hotel', 'resort', 'travel', 'vacation', 'hospitality', 'booking', 'destination', 'tour'] },
  { key: 'music', url: `${BASE}/music/`, keywords: ['music', 'audio', 'song', 'album', 'band', 'artist', 'track', 'playlist', 'dj', 'concert'] },
  { key: 'mobile-apps', url: `${BASE}/mobile-apps/`, keywords: ['mobile', 'ios', 'android', 'phone-app', 'mobile-app', 'download', 'app-landing'] },
  { key: 'web3-crypto', url: `${BASE}/web3/`, keywords: ['web3', 'crypto', 'nft', 'blockchain', 'token', 'wallet', 'fintech', 'defi', 'solana', 'eth'] },
  { key: 'education', url: `${BASE}/education/`, keywords: ['education', 'course', 'learn', 'academy', 'school', 'university', 'student', 'tutorial'] },
  { key: 'events', url: `${BASE}/events/`, keywords: ['event', 'conference', 'summit', 'meetup', 'festival', 'keynote', 'speaker', 'schedule'] },
  { key: 'health-wellness', url: `${BASE}/health-wellness/`, keywords: ['health', 'medical', 'wellness', 'clinic', 'fitness', 'yoga', 'care', 'doctor', 'therapy'] }
]);

const DEFAULT_CATEGORY = { key: 'websites', url: `${BASE}/`, keywords: [] };

export function detectInspirationCategory(query = '') {
  const lower = String(query || '').toLowerCase();
  for (const category of CATEGORIES) {
    if (category.keywords.some((kw) => lower.includes(kw))) {
      return category;
    }
  }
  return DEFAULT_CATEGORY;
}

function humanizeSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .slice(0, 80);
}

/**
 * Fetch real award-winning site references for a category.
 * Returns { sites: [{ title, url }], category, source: 'Awwwards' }.
 * Returns an empty sites array on any failure — never fabricated data.
 */
export async function fetchAwwwardsInspiration(query, fetchImpl = fetch) {
  const category = detectInspirationCategory(query);
  let html;
  try {
    const response = await fetchImpl(category.url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) return { sites: [], category: category.key, source: 'Awwwards' };
    html = await response.text();
  } catch {
    return { sites: [], category: category.key, source: 'Awwwards' };
  }

  const slugs = [...new Set([...html.matchAll(/\/sites\/([a-z0-9-]{3,60})/g)].map((m) => m[1]))];
  const sites = slugs.slice(0, MAX_SITES).map((slug) => ({
    title: humanizeSlug(slug),
    url: `https://www.awwwards.com/sites/${slug}`
  }));
  return { sites, category: category.key, source: 'Awwwards' };
}

export async function handleInspiration(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }
  let body;
  try {
    body = await readBoundedJson(request, MAX_INSPIRATION_BODY_BYTES);
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' });
  }
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (!query || query.length > 300) {
    return jsonResponse(400, { error: 'Query must be a non-empty string up to 300 characters.' });
  }

  const fetchImpl = env?.__INSPIRATION_FETCH || fetch;
  const result = await fetchAwwwardsInspiration(query, fetchImpl);
  return jsonResponse(200, {
    kind: 'inspiration',
    query,
    category: result.category,
    sites: result.sites,
    meta: { source: result.source, servedAt: new Date().toISOString() }
  });
}
