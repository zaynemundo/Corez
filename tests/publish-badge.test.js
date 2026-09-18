import { describe, it, expect } from 'vitest';
import worker from '../worker/entry.js';

function memoryBucket() {
  const map = new Map();
  return {
    map,
    async put(key, value, options = {}) {
      map.set(key, {
        value: typeof value === 'string' ? value : JSON.stringify(value),
        customMetadata: options?.customMetadata || {},
      });
      return { key };
    },
    async get(key) {
      if (!map.has(key)) return null;
      const entry = map.get(key);
      return {
        text: async () => entry.value,
        customMetadata: entry.customMetadata || {},
      };
    },
    async head(key) {
      if (!map.has(key)) return null;
      return { customMetadata: map.get(key).customMetadata || {} };
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return {
        objects: [...map.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key })),
      };
    },
  };
}

// Minimal D1 double for getActiveSubscription: it only needs the pending
// lookup (none), the users row, and no-op writes.
function planDb(plan, status = 'active') {
  return {
    prepare(query) {
      const stmt = {
        bind() {
          return stmt;
        },
        async first() {
          if (query.includes("status='pending'")) return null;
          if (query.includes('FROM users WHERE id=?')) {
            return {
              plan,
              subscription_plan: plan,
              subscription_status: status,
              subscription_period_end: null,
              downgrade_plan: null,
              downgrade_scheduled_at: null,
            };
          }
          return null;
        },
        async run() {
          return { success: true };
        },
      };
      return stmt;
    },
  };
}

function publish(env, body) {
  return worker.fetch(
    new Request('https://corez.test/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  );
}

const HTML = '<!DOCTYPE html><html><body><h1>Hi</h1></body></html>';

describe('free publishing with a Made with Corez badge', () => {
  it('free plans publish successfully and get the badge', async () => {
    const bucket = memoryBucket();
    const res = await publish(
      { ASSET_BUCKET: bucket },
      { title: 'Free build', html: HTML },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.badge).toBe(true);

    const record = JSON.parse(bucket.map.get(`publish/${data.slug}.json`).value);
    expect(record.badge).toBe(true);
    expect(record.html).toContain('corez-badge:start');
    expect(record.html).toContain('Made with Corez');

    const served = await worker.fetch(
      new Request(`https://corez.test/${data.slug}`, { method: 'GET' }),
      { ASSET_BUCKET: bucket },
    );
    const servedHtml = await served.text();
    expect(servedHtml).toContain('Made with Corez');
    expect(servedHtml).toContain('<h1>Hi</h1>');
  });

  it('standard plans publish badge-free', async () => {
    const bucket = memoryBucket();
    const env = { ASSET_BUCKET: bucket, DB: planDb('standard') };
    const res = await publish(env, { title: 'Paid build', html: HTML });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.badge).toBe(false);

    const record = JSON.parse(bucket.map.get(`publish/${data.slug}.json`).value);
    expect(record.badge).toBe(false);
    expect(record.html).not.toContain('corez-badge');
    expect(record.html).toBe(HTML);

    const served = await worker.fetch(
      new Request(`https://corez.test/${data.slug}`, { method: 'GET' }),
      env,
    );
    expect(await served.text()).not.toContain('Made with Corez');
  });

  it('republishing free content on a paid plan strips the old badge', async () => {
    const bucket = memoryBucket();
    const free = await (await publish({ ASSET_BUCKET: bucket }, { title: 'Free', html: HTML })).json();
    expect(free.badge).toBe(true);

    const paidRes = await publish(
      { ASSET_BUCKET: bucket, DB: planDb('premium') },
      { slug: free.slug, previousSlug: free.slug, html: HTML },
    );
    expect(paidRes.status).toBe(200);
    const paid = await paidRes.json();
    expect(paid.badge).toBe(false);

    const record = JSON.parse(bucket.map.get(`publish/${free.slug}.json`).value);
    expect(record.html).not.toContain('corez-badge');
    expect(record.html).toBe(HTML);
  });

  it('expired paid plans fall back to the free badge instead of a 403', async () => {
    const env = { ASSET_BUCKET: memoryBucket(), DB: planDb('premium', 'expired') };
    const res = await publish(env, { title: 'Expired', html: HTML });
    expect(res.status).toBe(200);
    expect((await res.json()).badge).toBe(true);
  });
});
