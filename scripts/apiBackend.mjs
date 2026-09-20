/**
 * Dev/preview proxy backend selection, kept out of vite.config.js so the rules
 * can be unit-tested.
 *
 * Why this exists at all: Vite 6 has no `router` proxy option (ProxyOptions:
 * rewrite, configure, bypass). The previous config passed one, it was ignored,
 * every /api request went to the default target, and a dead local Worker turned
 * into an opaque 500 on every API call.
 *
 * The rules:
 *   - an explicit API_BACKEND_URL always wins, and is never second-guessed
 *   - otherwise a Worker running on this machine is preferred
 *   - otherwise the deployed Worker, so the app is usable with no local backend
 *   - once the chosen local Worker starts refusing connections, the caller
 *     should switch to the deployed one instead of failing every request
 */

export const DEFAULT_LOCAL_TARGET = 'http://127.0.0.1:8787';
export const DEFAULT_LIVE_TARGET = 'https://corez.pro';

/** The probe hits a route that exists on every deployment and needs no session. */
export const PROBE_PATH = '/api/usage';

/** Connection-level failures worth failing over for (not HTTP errors). */
export function isConnectionFailure(error) {
  const code = String(error?.code || '');
  return (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    /socket hang up/i.test(String(error?.message || ''))
  );
}

export function isLocalTarget(target) {
  try {
    const url = new URL(target);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  } catch {
    return false;
  }
}

/**
 * @param {{ probe: () => Promise<boolean>, envTarget?: string|null }} input
 * @returns {Promise<string>} the target the proxy should use
 */
export async function chooseBackend({ probe, envTarget = null }) {
  if (envTarget) return envTarget;
  try {
    const localUp = await probe();
    return localUp ? DEFAULT_LOCAL_TARGET : DEFAULT_LIVE_TARGET;
  } catch {
    return DEFAULT_LIVE_TARGET;
  }
}

/**
 * The message a developer sees when a request could not be delivered. It names
 * the target that actually failed — after a failover the current target is no
 * longer the one that refused the connection, and reporting the new one sends
 * people looking in the wrong place.
 */
export function backendErrorMessage({ attemptedTarget, error, liveTarget = DEFAULT_LIVE_TARGET, hasExplicitTarget = false }) {
  const detail = error?.code || error?.message || 'proxy error';
  const advice = hasExplicitTarget
    ? 'Check API_BACKEND_URL.'
    : `Start one with "npm run dev:worker", or leave it off to use ${liveTarget}`;
  return `Could not reach a Worker at ${attemptedTarget} (${detail}). ${advice}.`;
}
