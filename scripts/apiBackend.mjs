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
 * The backend the proxy must use.
 *
 * Production is NEVER selected implicitly. A dev session that silently talks to
 * the deployed Worker writes real subscriptions, tasks and published creations
 * for someone who only ran `npm run dev`, so the deployed backend must be named
 * explicitly:
 *
 *   API_BACKEND_URL=https://corez.pro npm run dev
 *
 * Without it the target is the local Worker, and a local Worker that is not
 * listening is reported as such instead of being papered over by a failover.
 *
 * @param {{ probe?: () => Promise<boolean>, envTarget?: string|null }} input
 * @returns {Promise<{ target: string, explicit: boolean, localWorkerUp: boolean|null }>}
 */
export async function chooseBackend({ probe, envTarget = null } = {}) {
  if (envTarget) return { target: envTarget, explicit: true, localWorkerUp: null };
  let localWorkerUp = false;
  try {
    localWorkerUp = Boolean(await probe?.());
  } catch {
    // A probe that throws means nothing answered the probe: not listening.
  }
  return { target: DEFAULT_LOCAL_TARGET, explicit: false, localWorkerUp };
}

/**
 * The message a developer sees when a request could not be delivered. It names
 * the target that actually failed, and the advice distinguishes "nothing is
 * listening" from "something answered and the answer was bad" — restarting a
 * healthy Worker does not fix an HTTP error.
 */
export function backendErrorMessage({
  attemptedTarget,
  error,
  liveTarget = DEFAULT_LIVE_TARGET,
  hasExplicitTarget = false,
}) {
  const detail = error?.code || error?.message || 'proxy error';
  if (hasExplicitTarget) {
    return `Could not reach a Worker at ${attemptedTarget} (${detail}). Check API_BACKEND_URL.`;
  }
  const advice = isConnectionFailure(error)
    ? `Start one with "npm run dev:worker", or set API_BACKEND_URL=${liveTarget} to use the deployed Worker.`
    : `The Worker at ${attemptedTarget} answered with an error. Set API_BACKEND_URL=${liveTarget} to use the deployed Worker instead.`;
  return `Could not reach a Worker at ${attemptedTarget} (${detail}). ${advice}`;
}

/**
 * The startup warning when the chosen backend is a local Worker that is not
 * answering. Returns null when there is nothing to warn about, so the caller can
 * log unconditionally.
 */
export function localBackendWarning(choice) {
  if (!choice || choice.explicit || choice.localWorkerUp !== false) return null;
  return `[api-proxy] no Worker is listening at ${choice.target}. Start one with "npm run dev:worker", or set API_BACKEND_URL to point at a deployed Worker.`;
}
