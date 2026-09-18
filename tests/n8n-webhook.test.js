import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleN8nWebhook } from '../worker/n8nBridge.js';

function post(body, env = {}) {
  return handleN8nWebhook(
    new Request('https://corez.test/api/n8n/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  );
}

function stubFetch() {
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('n8n webhook bridge hardening', () => {
  it('rejects loopback targets by default', async () => {
    const res = await post(
      { webhookUrl: 'http://127.0.0.1:5678/webhook/x', event: 'e' },
      {},
    );
    expect(res.status).toBe(400);
  });

  it('rejects private, link-local and metadata targets by default', async () => {
    for (const target of [
      'https://10.0.0.5/hook',
      'https://192.168.1.10/hook',
      'https://172.16.4.2/hook',
      'https://169.254.169.254/latest/meta-data',
      'https://metadata.google.internal/computeMetadata/v1',
      'https://[::1]/hook',
      'https://service.internal/hook',
    ]) {
      const res = await post({ webhookUrl: target, event: 'e' }, {});
      expect(res.status, target).toBe(400);
    }
  });

  it('forwards to a public https target and never leaks the secret to a caller-supplied host', async () => {
    const calls = stubFetch();
    const res = await post(
      { webhookUrl: 'https://hooks.example.com/x', event: 'corez.publish' },
      { N8N_WEBHOOK_SECRET: 'sekret' },
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://hooks.example.com/x');
    expect(calls[0].init.headers['X-Corez-Secret']).toBeUndefined();
  });

  it('sends the shared secret only to the configured host', async () => {
    const calls = stubFetch();
    const env = {
      N8N_WEBHOOK_URL: 'https://n8n.example.com/webhook/abc',
      N8N_WEBHOOK_SECRET: 'sekret',
    };
    const res = await post(
      { webhookUrl: 'https://n8n.example.com/webhook/other', event: 'e' },
      env,
    );
    expect(res.status).toBe(200);
    expect(calls[0].init.headers['X-Corez-Secret']).toBe('sekret');
  });

  it('keeps http and private targets behind explicit dev flags', async () => {
    const calls = stubFetch();
    const okRes = await post(
      { webhookUrl: 'http://127.0.0.1:5678/webhook/dev', event: 'e' },
      { N8N_ALLOW_HTTP: '1', N8N_ALLOW_PRIVATE: '1' },
    );
    expect(okRes.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('requires a session when AUTH_SECRET is configured', async () => {
    const res = await post(
      { webhookUrl: 'https://hooks.example.com/x', event: 'e' },
      { AUTH_SECRET: 'test-secret-32-characters-long-enough!' },
    );
    expect(res.status).toBe(401);
  });
});
