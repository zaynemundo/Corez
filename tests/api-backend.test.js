// @vitest-environment jsdom
// The dev/preview proxy backend rules. Vite 6 has no `router` option, so the
// previous config's per-request routing was silently ignored and every /api call
// went to a dead local Worker as an opaque 500. These assertions pin the rules
// that replaced it.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LIVE_TARGET,
  DEFAULT_LOCAL_TARGET,
  PROBE_PATH,
  backendErrorMessage,
  chooseBackend,
  isConnectionFailure,
  isLocalTarget,
} from '../scripts/apiBackend.mjs';

describe('dev proxy backend selection', () => {
  it('prefers a Worker running on this machine', async () => {
    const target = await chooseBackend({ probe: async () => true });
    expect(target).toBe(DEFAULT_LOCAL_TARGET);
  });

  it('falls back to the deployed Worker, so the app works with no local backend', async () => {
    const target = await chooseBackend({ probe: async () => false });
    expect(target).toBe(DEFAULT_LIVE_TARGET);
  });

  it('treats a throwing probe as "not available" instead of failing config load', async () => {
    const target = await chooseBackend({
      probe: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(target).toBe(DEFAULT_LIVE_TARGET);
  });

  it('never second-guesses an explicit API_BACKEND_URL', async () => {
    let probed = false;
    const target = await chooseBackend({
      envTarget: 'http://192.168.1.50:8787',
      probe: async () => {
        probed = true;
        return false;
      },
    });
    expect(target).toBe('http://192.168.1.50:8787');
    expect(probed).toBe(false);
  });

  it('probes a route that exists on every deployment', () => {
    expect(PROBE_PATH.startsWith('/api/')).toBe(true);
  });

  it('recognises local targets, and only local ones', () => {
    expect(isLocalTarget(DEFAULT_LOCAL_TARGET)).toBe(true);
    expect(isLocalTarget('http://localhost:8787')).toBe(true);
    expect(isLocalTarget(DEFAULT_LIVE_TARGET)).toBe(false);
    expect(isLocalTarget('not a url')).toBe(false);
  });

  it('fails over only for connection failures, never for HTTP errors', () => {
    // Connection-level: retrying elsewhere can work.
    expect(isConnectionFailure({ code: 'ECONNREFUSED' })).toBe(true);
    expect(isConnectionFailure({ code: 'ECONNRESET' })).toBe(true);
    expect(isConnectionFailure({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isConnectionFailure(new Error('socket hang up'))).toBe(true);
    // An HTTP error is an answer: switching backend would hide the real cause.
    expect(isConnectionFailure({ message: 'HTTP 500' })).toBe(false);
    expect(isConnectionFailure(undefined)).toBe(false);
  });

  it('names the target that actually failed, not the one it switched to', () => {
    // The first request after a local Worker dies is answered with the old
    // target in the message; reporting the new one sends people looking in the
    // wrong place.
    const message = backendErrorMessage({
      attemptedTarget: DEFAULT_LOCAL_TARGET,
      error: { code: 'ECONNREFUSED' },
    });
    expect(message).toContain(DEFAULT_LOCAL_TARGET);
    expect(message).not.toContain(`at ${DEFAULT_LIVE_TARGET}`);
    expect(message).toContain('npm run dev:worker');
    expect(message).toContain(DEFAULT_LIVE_TARGET);

    const explicit = backendErrorMessage({
      attemptedTarget: 'http://192.168.1.50:8787',
      error: { code: 'ETIMEDOUT' },
      hasExplicitTarget: true,
    });
    expect(explicit).toContain('Check API_BACKEND_URL');
  });
});
