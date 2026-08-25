import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RemoteRunner } from '../packages/agent-core/runners/RemoteRunner.js';

describe('RemoteRunner', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('delegates a repository task and maps the result', async () => {
    let captured = null;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return Response.json({
        success: true,
        response: 'implemented',
        blocked: false,
        blockedReason: null,
        cancelled: false
      }, { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const runner = new RemoteRunner({ baseUrl: 'https://runner.example.com/', token: 'secret' });
    const result = await runner.runTask('add login', { model: 'muse-spark-1.2-contributor', workspaceId: '/srv/ws' });

    expect(captured.url).toBe('https://runner.example.com/tasks');
    expect(captured.init.headers.Authorization).toBe('Bearer secret');
    expect(JSON.parse(captured.init.body)).toEqual({
      prompt: 'add login',
      model: 'muse-spark-1.2-contributor',
      workspaceId: '/srv/ws'
    });
    expect(result.success).toBe(true);
    expect(result.response).toBe('implemented');
  });

  it('maps blocked results honestly', async () => {
    globalThis.fetch = async () => Response.json({
      success: false,
      response: '',
      blocked: true,
      blockedReason: 'Completion gate not satisfied.',
      cancelled: false
    }, { status: 200 });
    const runner = new RemoteRunner({ baseUrl: 'https://runner.example.com' });
    const result = await runner.runTask('x', {});
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toContain('Completion gate');
  });

  it('throws with an actionable message on 401/403', async () => {
    globalThis.fetch = async () => new Response('nope', { status: 401 });
    const runner = new RemoteRunner({ baseUrl: 'https://runner.example.com' });
    await expect(runner.runTask('x', {})).rejects.toThrow(/COREZ_REMOTE_RUNNER_TOKEN/);
  });

  it('throws on network failure without pretending the task ran', async () => {
    globalThis.fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const runner = new RemoteRunner({ baseUrl: 'https://runner.example.com' });
    await expect(runner.runTask('x', {})).rejects.toThrow(/unreachable/);
  });

  it('surfaces runner errors as failures', async () => {
    globalThis.fetch = async () => Response.json({ error: 'workspace is not in the allowlist' }, { status: 403 });
    const runner = new RemoteRunner({ baseUrl: 'https://runner.example.com' });
    await expect(runner.runTask('x', {})).rejects.toThrow(/allowlist/);
  });

  it('is not configured without a base URL', () => {
    expect(new RemoteRunner({}).configured).toBe(false);
    expect(new RemoteRunner({ baseUrl: 'https://r.example' }).configured).toBe(true);
  });
});
