import { describe, it, expect, vi } from 'vitest';
import { fetchEmbeddings } from '../src/services/semanticCodeRetrieval.js';

describe('fetchEmbeddings client contract', () => {
  it('truncates items to the worker 8000-char limit', async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [[0.1, 0.2]] }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchEmbeddings(['x'.repeat(12_000)]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text[0]).toHaveLength(8000);
    expect(data).toEqual([[0.1, 0.2]]);
    vi.unstubAllGlobals();
  });

  it('skips empty items and keeps a 1:1 vector mapping', async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [[0.2]] }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchEmbeddings(['', 'real text']);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toEqual(['real text']);
    expect(data).toHaveLength(2);
    expect(data[1]).toEqual([0.2]);
    expect(Array.isArray(data[0])).toBe(true);
    vi.unstubAllGlobals();
  });

  it('does not call the endpoint for an empty array', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchEmbeddings([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('falls back to local vectors when the endpoint rejects', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: 'Each text item must be a non-empty string up to 8000 characters.' }, { status: 400 }),
    );
    const data = await fetchEmbeddings(['fallback text']);
    expect(data).toHaveLength(1);
    expect(Array.isArray(data[0])).toBe(true);
    expect(data[0].length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
