import { describe, it, expect, vi } from 'vitest';
import {
  generateAIResponse,
  parseSlashCommand,
  isSlashCommand
} from '../src/services/aiService.js';
import { generatePdfDocument, synthesizePdfDocumentHtml } from '../src/services/pdfGenerator.js';

describe('parseSlashCommand', () => {
  it('parses known commands and strips the token', () => {
    expect(parseSlashCommand('/website build me a landing page')).toEqual({
      command: 'website',
      rest: 'build me a landing page'
    });
    expect(parseSlashCommand('/game make a platformer')).toEqual({
      command: 'game',
      rest: 'make a platformer'
    });
    expect(parseSlashCommand('/research quantum computing')).toEqual({
      command: 'research',
      rest: 'quantum computing'
    });
  });

  it('is case-insensitive', () => {
    expect(parseSlashCommand('/WEBSITE Homepage')).toEqual({ command: 'website', rest: 'Homepage' });
  });

  it('returns no command for plain prompts or unknown tokens', () => {
    expect(parseSlashCommand('create a website')).toEqual({ command: null, rest: 'create a website' });
    expect(parseSlashCommand('/unknown do something')).toEqual({ command: null, rest: '/unknown do something' });
    expect(isSlashCommand('plain text')).toBe(false);
    expect(isSlashCommand('/research AI safety')).toBe(true);
  });
});

describe('/website and /game routing', () => {
  it('forces the app intent and sends a clean prompt for /website', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/ai') {
        const payload = JSON.parse(init.body);
        // The model receives the clean prompt, never the slash token.
        expect(payload.prompt).not.toContain('/website');
        expect(payload.prompt).toContain('Build a website');
        expect(payload.intent.type).toBe('app');
        return Response.json({ content: '```html\n<!DOCTYPE html><html><body><h1>Site</h1></body></html>\n```' });
      }
      if (url === '/api/inspiration') {
        return Response.json({ kind: 'inspiration', category: 'websites', sites: [] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('/website premium headphones store', []);
    expect(response).toContain('<!DOCTYPE html>');
    vi.unstubAllGlobals();
  });

  it('forces the game intent for /game', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/ai') {
        const payload = JSON.parse(init.body);
        expect(payload.prompt).toContain('Build a game');
        expect(payload.prompt).not.toContain('/game');
        expect(payload.intent.type).toBe('app');
        return Response.json({ content: '```html\n<!DOCTYPE html><html><body><canvas></canvas></body></html>\n```' });
      }
      if (url === '/api/inspiration') {
        return Response.json({ kind: 'inspiration', category: 'websites', sites: [] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('/game space shooter', []);
    expect(response).toContain('<canvas>');
    vi.unstubAllGlobals();
  });
});

describe('/research command', () => {
  it('produces a grounded research report with a downloadable PDF', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/search') {
        return Response.json({
          kind: 'search',
          query: 'quantum computing',
          results: [
            { title: 'Quantum Computing Basics', url: 'https://en.wikipedia.org/wiki/Quantum_computing', snippet: 'Quantum computing uses qubits.', source: 'Wikipedia' },
            { title: 'Qubits Explained', url: 'https://example.com/qubits', snippet: 'Qubits can be 0, 1, or both.', source: 'DuckDuckGo' }
          ],
          meta: { source: 'Wikipedia' }
        });
      }
      if (url === '/api/ai') {
        return Response.json({ content: 'Overview\n\nQuantum computing is a field.\n\nKey Findings\n\n- Qubits.\n\nSources\n\n1. Quantum Computing Basics — https://en.wikipedia.org/wiki/Quantum_computing' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('/research quantum computing', []);
    expect(response).toContain('Download .pdf');
    expect(response).toContain('```html');
    expect(response).toContain('Quantum computing is a field');
    vi.unstubAllGlobals();
  });

  it('reports honestly when search returns nothing', async () => {
    vi.stubGlobal('fetch', async (url) => {
      if (url === '/api/search') {
        return Response.json({ kind: 'search', results: [] });
      }
      throw new Error('unexpected');
    });
    const response = await generateAIResponse('/research zzzzqqq', []);
    expect(response).toMatch(/couldn't research|no reliable results/i);
    expect(response).not.toContain('Download .pdf');
    vi.unstubAllGlobals();
  });

  it('asks for a topic when none is given', async () => {
    const response = await generateAIResponse('/research', []);
    expect(response).toMatch(/what to research/i);
  });
});

describe('PDF generator', () => {
  it('produces a structurally valid PDF binary', () => {
    const pdf = generatePdfDocument({ title: 'Report', lines: ['Line one.', 'Line two.'] });
    const text = new TextDecoder().decode(pdf);
    expect(text.slice(0, 5)).toBe('%PDF-');
    expect(text).toContain('%%EOF');
    expect(text).toContain('xref');
    expect(text).toContain('/MediaBox [0 0 595.28 841.89]');

    // xref offsets match real object byte positions.
    const positions = new Map();
    const re = /(\d+) 0 obj/g;
    let m;
    while ((m = re.exec(text))) positions.set(Number(m[1]), m.index);
    const xrefLines = text.slice(text.indexOf('xref')).split('\n');
    for (let i = 3; i < xrefLines.length; i += 1) {
      const entry = xrefLines[i].match(/^(\d{10}) 00000 n/);
      if (!entry) break;
      expect(positions.get(i - 2)).toBe(Number(entry[1]));
    }
  });

  it('builds an editable research document with sources', () => {
    const doc = synthesizePdfDocumentHtml({
      title: 'Test Research',
      body: 'Some findings here.',
      sources: [{ title: 'Wiki', url: 'https://en.wikipedia.org/wiki/X' }]
    });
    expect(doc.html).toContain('Download .pdf');
    expect(doc.html).toContain('window.print');
    expect(doc.html).toContain('Sources');
    expect(doc.html).toContain('https://en.wikipedia.org/wiki/X');
  });
});
