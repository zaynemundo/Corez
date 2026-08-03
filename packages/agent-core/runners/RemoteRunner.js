// RemoteRunner: HTTP repository runner for the CoreZ harness.
//
// The website browser runtime cannot execute file or shell tools, so
// repository tasks delegate to an operator-configured Node runner over HTTP
// (see packages/cli/src/remoteRunnerServer.js for the reference server).
// The runner is authenticated with a shared bearer token and only ever
// touches the workspace the caller was allowed to select.
//
// Contract (synchronous endpoint):
//   POST {baseUrl}/tasks  body { prompt, model, workspaceId }
//   -> { success, response, blocked, blockedReason, cancelled } | { error }
//
// Failures are honest: a network or auth failure throws and the harness
// reports the task as failed/blocked — nothing is ever pretended to run.

const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes

export class RemoteRunner {
  constructor({ baseUrl, token = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.baseUrl = typeof baseUrl === 'string' ? baseUrl.replace(/\/+$/, '') : '';
    this.token = token || null;
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  }

  get configured() {
    return Boolean(this.baseUrl);
  }

  async runTask(prompt, options = {}) {
    if (!this.configured) {
      throw new Error('No remote runner is configured.');
    }
    const body = {
      prompt: String(prompt || ''),
      model: options.model || null,
      workspaceId: options.workspaceId || null
    };
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    let response;
    try {
      response = await fetch(`${this.baseUrl}/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options.signal || AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        const abortError = new DOMException('Remote task cancelled.', 'AbortError');
        abortError.cancelled = true;
        throw abortError;
      }
      throw new Error(`Remote runner unreachable: ${error?.message || 'network failure'}`, { cause: error });
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Remote runner rejected the request (HTTP ${response.status}): check COREZ_REMOTE_RUNNER_TOKEN and the workspace allowlist.`);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Remote runner failed (HTTP ${response.status}): ${detail.slice(0, 300)}`);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Remote runner returned an invalid response.');
    }
    if (data && typeof data === 'object' && data.error) {
      throw new Error(String(data.error).slice(0, 500));
    }
    return {
      success: data?.success === true || data?.status === 'completed',
      cancelled: data?.cancelled === true || data?.status === 'cancelled',
      blocked: data?.blocked === true,
      blockedReason: data?.blockedReason || null,
      response: data?.response || data?.result || ''
    };
  }
}
