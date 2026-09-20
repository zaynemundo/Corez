// Plan usage for the settings panel.
//
// The numbers come from the server (D1 counters), never from a local tally: the
// same account can be used from several browsers, and a limit the client
// believed was not spent is still refused by the Worker.

/**
 * @returns {Promise<{
 *   available: boolean,
 *   error: string|null,
 *   period: string|null,
 *   resetsAt: number|null,
 *   plan: string,
 *   metrics: Record<string, {used: number, limit: number|null, remaining: number|null}>,
 *   exceeded: string[],
 *   nearLimit: string[],
 * }>}
 */
export async function fetchUsage() {
  const empty = {
    available: false,
    error: null,
    period: null,
    resetsAt: null,
    plan: 'free',
    metrics: {},
    exceeded: [],
    nearLimit: [],
  };
  try {
    const response = await fetch('/api/usage', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      return {
        ...empty,
        error:
          response.status === 401
            ? 'Sign in again to see your usage.'
            : `Could not load usage (${response.status}).`,
      };
    }
    return {
      available: true,
      error: null,
      period: data.period || null,
      resetsAt: Number.isFinite(data.resetsAt) ? data.resetsAt : null,
      plan: data.plan || 'free',
      metrics: data.metrics && typeof data.metrics === 'object' ? data.metrics : {},
      exceeded: Array.isArray(data.exceeded) ? data.exceeded : [],
      nearLimit: Array.isArray(data.nearLimit) ? data.nearLimit : [],
      meteringEnabled: data.meteringEnabled !== false,
    };
  } catch (error) {
    return {
      ...empty,
      error: error?.message ? `Could not load usage: ${error.message}` : 'Could not load usage.',
    };
  }
}

// What each metric is called in front of a person, and the order they matter in.
export const USAGE_METRIC_LABELS = [
  { id: 'messages', label: 'Generations', hint: 'one per message you send' },
  { id: 'swarm_runs', label: 'Build runs', hint: 'website, app and game builds' },
  { id: 'images', label: 'Images', hint: 'generated artwork' },
  { id: 'publishes', label: 'Publishes', hint: 'pages put on a public link' },
  { id: 'publishedPages', label: 'Published pages', hint: 'live at the same time' },
  { id: 'tokens', label: 'Tokens', hint: 'provider usage, reported or estimated' },
];

export function formatUsageValue(value) {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  return String(Math.round(value));
}

/** 0..1 for the bar. Unlimited metrics report 0 (nothing to fill). */
export function usageRatio(metric) {
  const limit = metric?.limit;
  const used = metric?.used;
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(used)) return 0;
  return Math.max(0, Math.min(1, used / limit));
}
