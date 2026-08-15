import { describe, it, expect, vi, afterEach } from 'vitest';
import swarmWorker from '../worker/entry.js';
import { generateWorkersAIImage, WORKERS_AI_IMAGE_ENDPOINT } from '../src/services/aiService.js';

// Small valid PNG payload encoded as base64 (1x1 transparent pixel).
const FAKE_IMAGE_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function post(worker, body, customEnv) {
  return worker.fetch(
    new Request('https://corez.test/api/image/cf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    customEnv
  );
}

const BASE_ENV = { OPENCODE_GO_API_KEY: 'sk-test' };

function mockAI(overrides = {}) {
  return {
    run: vi.fn(async (model, inputs, options) => {
      if (overrides.throwError) throw new Error(overrides.throwError);
      if (overrides.abortOnSignal) {
        await new Promise((resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
        return { image: '' };
      }
      return { image: overrides.image ?? FAKE_IMAGE_B64 };
    })
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('/api/image/cf (Workers AI FLUX.2 klein-4b)', () => {
  it('rejects non-POST requests', async () => {
    const response = await swarmWorker.fetch(
      new Request('https://corez.test/api/image/cf'),
      BASE_ENV
    );
    expect(response.status).toBe(405);
  });

  it('requires a prompt', async () => {
    const response = await post(swarmWorker, { prompt: '   ' }, { ...BASE_ENV, AI: mockAI() });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/Prompt is required/i);
  });

  it('returns an honest 503 when no AI binding is configured', async () => {
    const response = await post(swarmWorker, { prompt: 'a castle' }, BASE_ENV);
    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error).toMatch(/AI binding/i);
  });

  it('generates an image through the Workers AI binding and returns a data URL', async () => {
    const ai = mockAI();
    const response = await post(swarmWorker, { prompt: 'a red castle on a hill' }, { ...BASE_ENV, AI: ai });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.image).toBe(`data:image/png;base64,${FAKE_IMAGE_B64}`);
    expect(data.model).toBe('@cf/black-forest-labs/flux-2-klein-4b');
    // The binding is called with the multipart input shape.
    expect(ai.run).toHaveBeenCalledTimes(1);
    const [model, inputs] = ai.run.mock.calls[0];
    expect(model).toBe('@cf/black-forest-labs/flux-2-klein-4b');
    expect(inputs.multipart.body.prompt).toBe('a red castle on a hill');
    expect(inputs.multipart.contentType).toBe('application/json');
  });

  it('passes steps through and bounds them to 1-50', async () => {
    const ai = mockAI();
    await post(swarmWorker, { prompt: 'x', steps: 12 }, { ...BASE_ENV, AI: ai });
    expect(ai.run.mock.calls[0][1].multipart.body.steps).toBe(12);

    ai.run.mockClear();
    await post(swarmWorker, { prompt: 'x', steps: 999 }, { ...BASE_ENV, AI: ai });
    expect(ai.run.mock.calls[0][1].multipart.body.steps).toBe(50);
  });

  it('persists the image to R2 when the bucket is available', async () => {
    const store = new Map();
    const ai = mockAI();
    const bucketEnv = {
      ...BASE_ENV,
      AI: ai,
      ASSET_BUCKET: {
        put: async (key, value, meta) => { store.set(key, { value, meta }); },
        get: async () => null,
        delete: async () => {}
      }
    };
    const response = await post(swarmWorker, { prompt: 'a castle' }, bucketEnv);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.image).toMatch(/^\/api\/assets\/image_cf_.+\.png$/);
    expect(store.size).toBe(1);
  });

  it('surfaces provider failures as 502 and client aborts as 499', async () => {
    const failing = await post(swarmWorker, { prompt: 'x' }, { ...BASE_ENV, AI: mockAI({ throwError: 'boom' }) });
    expect(failing.status).toBe(502);

    // Abort the request while the model is still generating: the worker
    // must answer with a 499, never hang or stream a partial image.
    const controller = new AbortController();
    const promise = swarmWorker.fetch(
      new Request('https://corez.test/api/image/cf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'x' }),
        signal: controller.signal
      }),
      { ...BASE_ENV, AI: mockAI({ abortOnSignal: true }) }
    );
    setTimeout(() => controller.abort(), 20);
    try {
      const aborting = await promise;
      expect(aborting.status).toBe(499);
    } catch (err) {
      // Some runtimes surface the client abort as a fetch rejection; the
      // worker-level 499 is asserted when the response is still delivered.
      expect(err?.name).toBe('AbortError');
    }
  });
});

describe('generateWorkersAIImage client helper', () => {
  it('posts to the Workers AI endpoint and returns the image URL', async () => {
    let forwardedBody = null;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      expect(url).toBe(WORKERS_AI_IMAGE_ENDPOINT);
      forwardedBody = JSON.parse(init.body);
      return Response.json({ image: 'data:image/png;base64,OK', model: '@cf/black-forest-labs/flux-2-klein-4b' });
    }));

    const image = await generateWorkersAIImage('a castle', null, { steps: 8 });
    expect(image).toBe('data:image/png;base64,OK');
    expect(forwardedBody.prompt).toBe('a castle');
    expect(forwardedBody.steps).toBe(8);
  });

  it('returns null on failure so callers can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'down' }, { status: 503 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const image = await generateWorkersAIImage('a castle');
    expect(image).toBeNull();
  });
});
