import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import worker from '../worker/index.js';
import { publishAppInR2 } from '../src/services/appStorageService.js';

describe('R2 Multi-App Storage & Chat Deletion Cleanup Contract', () => {
  let mockBucket;

  beforeEach(() => {
    const store = new Map();
    mockBucket = {
      store,
      put: async (key, val, opts) => {
        store.set(key, { val, opts });
      },
      get: async (key) => {
        if (!store.has(key)) return null;
        const entry = store.get(key);
        return {
          text: async () => typeof entry.val === 'string' ? entry.val : new TextDecoder().decode(entry.val)
        };
      },
      list: async ({ prefix }) => {
        const objects = [];
        for (const k of store.keys()) {
          if (k.startsWith(prefix)) {
            objects.push({ key: k });
          }
        }
        return { objects };
      },
      delete: async (key) => {
        store.delete(key);
      }
    };
  });

  it('stores a multi-file app under a chat session in R2 via POST /api/apps/store', async () => {
    const req = new Request('http://localhost/api/apps/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-123',
        appId: 'app-dashboard',
        title: 'Analytics Dashboard',
        code: 'function App() { return <div>Dashboard</div>; }',
        html: '<!DOCTYPE html><html><body>Dashboard</body></html>'
      })
    });

    const res = await worker.fetch(req, { ASSET_BUCKET: mockBucket });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.sessionId).toBe('session-123');
    expect(data.appId).toBe('app-dashboard');
    expect(data.key).toBe('apps/session-123/app-dashboard.json');

    expect(mockBucket.store.has('apps/session-123/app-dashboard.json')).toBe(true);
  });

  it('fetches a stored app by sessionId and appId via GET /api/apps/:sessionId/:appId', async () => {
    // Populate R2 mock
    await mockBucket.put('apps/session-123/app-1.json', JSON.stringify({
      sessionId: 'session-123',
      appId: 'app-1',
      title: 'App 1',
      code: 'function App() { return <div>1</div>; }'
    }));

    const req = new Request('http://localhost/api/apps/session-123/app-1');
    const res = await worker.fetch(req, { ASSET_BUCKET: mockBucket });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.appId).toBe('app-1');
    expect(data.title).toBe('App 1');
  });

  it('lists all apps associated with a chat session via GET /api/apps/:sessionId', async () => {
    await mockBucket.put('apps/session-777/app-1.json', JSON.stringify({ sessionId: 'session-777', appId: 'app-1', title: 'First App' }));
    await mockBucket.put('apps/session-777/app-2.json', JSON.stringify({ sessionId: 'session-777', appId: 'app-2', title: 'Second App' }));

    const req = new Request('http://localhost/api/apps/session-777');
    const res = await worker.fetch(req, { ASSET_BUCKET: mockBucket });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.apps.length).toBe(2);
    expect(data.apps.map(a => a.appId)).toContain('app-1');
    expect(data.apps.map(a => a.appId)).toContain('app-2');
  });

  it('deletes ALL stored apps for a chat session when DELETE /api/apps/:sessionId is called', async () => {
    await mockBucket.put('apps/session-to-delete/app-1.json', JSON.stringify({ sessionId: 'session-to-delete', appId: 'app-1' }));
    await mockBucket.put('apps/session-to-delete/app-2.json', JSON.stringify({ sessionId: 'session-to-delete', appId: 'app-2' }));
    await mockBucket.put('apps/session-other/app-3.json', JSON.stringify({ sessionId: 'session-other', appId: 'app-3' }));

    const req = new Request('http://localhost/api/apps/session-to-delete', { method: 'DELETE' });
    const res = await worker.fetch(req, { ASSET_BUCKET: mockBucket });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.deletedCount).toBe(2);

    expect(mockBucket.store.has('apps/session-to-delete/app-1.json')).toBe(false);
    expect(mockBucket.store.has('apps/session-to-delete/app-2.json')).toBe(false);
    // Other session apps are untouched
    expect(mockBucket.store.has('apps/session-other/app-3.json')).toBe(true);
  });

  describe('publishAppInR2', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('publishes a creation and returns the share slug and URL', async () => {
      const fetchMock = vi.fn(async () => new Response(
        JSON.stringify({ success: true, slug: 'asyag23-123', url: '/asyag23-123' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ));
      vi.stubGlobal('fetch', fetchMock);

      const result = await publishAppInR2({ html: '<h1>Game</h1>', title: 'FPS Game' });

      expect(result).toEqual({ success: true, slug: 'asyag23-123', url: '/asyag23-123' });
      expect(fetchMock).toHaveBeenCalledWith('/api/publish', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"html":"<h1>Game</h1>"')
      }));

      // Only the app document is sent: chat/session payloads never leave the client.
      const sentBody = fetchMock.mock.calls[0][1].body;
      expect(sentBody).not.toContain('sessionId');
      expect(sentBody).not.toContain('messages');
      expect(sentBody).not.toContain('history');
    });

    it('reuses the same published link when the same content is republished', async () => {
      const fetchMock = vi.fn(async () => new Response(
        JSON.stringify({ success: true, slug: 'asyag23-123', url: '/asyag23-123' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ));
      vi.stubGlobal('fetch', fetchMock);
      const store = {};
      globalThis.localStorage = {
        getItem: (key) => store[key] ?? null,
        setItem: (key, value) => { store[key] = value; }
      };
      try {
        const html = '<h1>Same content</h1>';
        await publishAppInR2({ html, title: 'First publish' });
        await publishAppInR2({ html, title: 'Updated content' });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        // The second publish updates the SAME link (slug reused), it never
        // allocates a duplicate slug.
        const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
        expect(bodies[0].slug).toBeUndefined();
        expect(bodies[1].slug).toBe('asyag23-123');
        expect(bodies[1].title).toBe('Updated content');
      } finally {
        delete globalThis.localStorage;
      }
    });

    it('returns null when content is missing or the publish request fails', async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'down' }), { status: 400 }));
      vi.stubGlobal('fetch', fetchMock);

      expect(await publishAppInR2({ html: '' })).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();

      expect(await publishAppInR2({ html: '<h1>Game</h1>' })).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
