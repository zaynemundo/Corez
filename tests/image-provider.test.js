import { describe, it, expect, vi, afterEach } from 'vitest';
import { callOpenRouterImage } from '../worker/imageProvider.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function imageResponse(url = 'https://img.example.com/a.png') {
  return Response.json({
    choices: [{ message: { images: [{ url }] } }],
  });
}

describe('callOpenRouterImage', () => {
  it('retries a transient 503 and reports both attempts', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? new Response('busy', { status: 503 })
        : imageResponse('https://img.example.com/retry.png');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await callOpenRouterImage(
      'sk-test',
      'a cat',
      null,
      ['m1'],
      null,
      [0, 0],
    );

    expect(result.url).toBe('https://img.example.com/retry.png');
    expect(result.model).toBe('m1');
    expect(calls).toBe(2);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toMatchObject({ model: 'm1', ok: false, attempt: 1 });
    expect(result.attempts[0].reason).toMatch(/503/);
    expect(result.attempts[1]).toEqual({ model: 'm1', ok: true, attempt: 2 });
  });

  it('does not retry a permanent 400', async () => {
    const fetchMock = vi.fn(async () => new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await callOpenRouterImage(
      'sk-test',
      'a cat',
      null,
      ['m1'],
      null,
      [0, 0],
    );

    expect(result.url).toBeNull();
    expect(result.model).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.attempts[0].reason).toMatch(/400/);
  });

  it('retries transient network failures up to the bounded count', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await callOpenRouterImage(
      'sk-test',
      'a cat',
      null,
      ['m1'],
      null,
      [0, 0],
    );

    expect(result.url).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.attempts).toHaveLength(3);
    for (const attempt of result.attempts) {
      expect(attempt.ok).toBe(false);
      expect(attempt.reason).toMatch(/network down/);
    }
  });
});
