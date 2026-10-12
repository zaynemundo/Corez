import { describe, it, expect, vi } from 'vitest';
import {
  generateAIResponse,
  parseSlashCommand,
  isSlashCommand,
  extractOutlineItems,
  dedupeSources
} from '../src/services/aiService.js';
import { synthesizePdfDocumentHtml } from '../src/services/pdfGenerator.js';

describe('deep research outline parsing', () => {
  it('parses a clean JSON outline answer', () => {
    const items = extractOutlineItems('{"items":[{"name":"Alpha","query":"alpha framework 2026"},{"name":"Beta","query":"beta library comparison"}]}');
    expect(items).toEqual([
      { name: 'Alpha', query: 'alpha framework 2026' },
      { name: 'Beta', query: 'beta library comparison' }
    ]);
  });

  it('extracts JSON wrapped in prose and markdown fences', () => {
    const items = extractOutlineItems('Here is the plan:\n```json\n{"items":[{"name":"Gamma","query":"gamma engine features"}]}\n```\nHope this helps.');
    expect(items).toEqual([{ name: 'Gamma', query: 'gamma engine features' }]);
  });

  it('caps the item count at the deep research limit', () => {
    const items = extractOutlineItems(JSON.stringify({
      items: Array.from({ length: 9 }, (_, i) => ({ name: `Item ${i}`, query: `query ${i}` }))
    }));
    expect(items.length).toBe(5);
  });

  it('returns null for unusable answers and empty item lists', () => {
    expect(extractOutlineItems('no json here')).toBeNull();
    expect(extractOutlineItems('{"items":[]}')).toBeNull();
    expect(extractOutlineItems('{"items":[{"name":"","query":""}]}')).toBeNull();
    expect(extractOutlineItems(null)).toBeNull();
  });
});

describe('deep research source aggregation', () => {
  it('deduplicates sources by URL preserving first occurrence', () => {
    const sources = dedupeSources([
      { title: 'A', url: 'https://a.example' },
      { title: 'A dupe', url: 'https://a.example' },
      { title: 'B', url: 'https://b.example' },
      { title: '', url: '' }
    ]);
    expect(sources).toEqual([
      { title: 'A', url: 'https://a.example' },
      { title: 'B', url: 'https://b.example' }
    ]);
  });
});

describe('parseSlashCommand', () => {
  it('parses @ commands (@website, @game, @research, @image) and strips the token', () => {
    expect(parseSlashCommand('@website build me a landing page')).toEqual({
      command: 'website',
      rest: 'build me a landing page'
    });
    expect(parseSlashCommand('@game make a platformer')).toEqual({
      command: 'game',
      rest: 'make a platformer'
    });
    expect(parseSlashCommand('@research quantum computing')).toEqual({
      command: 'research',
      rest: 'quantum computing'
    });
    expect(parseSlashCommand('@image sunset over the mountains')).toEqual({
      command: 'image',
      rest: 'sunset over the mountains'
    });
  });

  it('is case-insensitive', () => {
    expect(parseSlashCommand('@WEBSITE Homepage')).toEqual({ command: 'website', rest: 'Homepage' });
    expect(parseSlashCommand('@IMAGE Cyberpunk City')).toEqual({ command: 'image', rest: 'Cyberpunk City' });
  });

  it('returns no command for slash commands, plain prompts or unknown tokens', () => {
    expect(parseSlashCommand('/website build me a landing page')).toEqual({ command: null, rest: '/website build me a landing page' });
    expect(parseSlashCommand('/game make a platformer')).toEqual({ command: null, rest: '/game make a platformer' });
    expect(parseSlashCommand('/research quantum computing')).toEqual({ command: null, rest: '/research quantum computing' });
    expect(parseSlashCommand('/image sunset')).toEqual({ command: null, rest: '/image sunset' });
    expect(parseSlashCommand('create a website')).toEqual({ command: null, rest: 'create a website' });
    expect(parseSlashCommand('@unknown do something')).toEqual({ command: null, rest: '@unknown do something' });
    expect(isSlashCommand('plain text')).toBe(false);
    expect(isSlashCommand('/research AI safety')).toBe(false);
    expect(isSlashCommand('@research AI safety')).toBe(true);
    expect(isSlashCommand('/image sunset')).toBe(false);
    expect(isSlashCommand('@image sunset')).toBe(true);
  });
});

describe('@website and @game routing', () => {
  it('forces the app intent and sends a clean prompt for @website', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/ai') {
        const payload = JSON.parse(init.body);
        // The model receives the clean prompt, never the @ token.
        expect(payload.prompt).not.toContain('@website');
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

    const response = await generateAIResponse('@website premium headphones store', []);
    expect(response).toContain('<!DOCTYPE html>');
    vi.unstubAllGlobals();
  });

  it('forces the game intent for @game', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/ai') {
        const payload = JSON.parse(init.body);
        expect(payload.prompt).toContain('Build a game');
        expect(payload.prompt).not.toContain('@game');
        expect(payload.intent.type).toBe('app');
        expect(payload.intent.primaryIntent).toBe('game_creation');
        // Game requests run through the agentic creation harness and ask
        // for STREAMING: the worker answers with SSE phase/delta events as
        // the build progresses, finishing with a done event.
        expect(payload.harness).toBe(true);
        expect(payload.stream).toBe(true);
        // The skill resolver must select the game-development skill for
        // @game so the model receives its instructions (direct route and
        // swarm route).
        expect(Array.isArray(payload.skills)).toBe(true);
        expect(payload.skills.some((s) => s.id === 'game-development')).toBe(true);
        return new Response(
          'data: {"type":"meta"}\n\ndata: {"type":"phase","phase":"building","attempt":0,"total":5}\n\ndata: {"type":"delta","text":"<canvas></canvas>"}\n\ndata: {"type":"phase","phase":"done","attempt":0,"total":5}\n\ndata: {"type":"done","final":true}\n\n',
          { status: 200 }
        );
      }
      if (url === '/api/inspiration') {
        return Response.json({ kind: 'inspiration', category: 'websites', sites: [] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('@game space shooter', [], null, () => {});
    expect(response).toContain('<canvas>');
    vi.unstubAllGlobals();
  });
});

describe('@research command', () => {
  it('runs the deep research pipeline: outline, per-item search, synthesis and review', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/search') {
        const body = JSON.parse(init.body);
        expect(body.detail).toBe(true); // deep research requests full extracts
        if (body.query === 'quantum computing') {
          return Response.json({
            kind: 'search',
            query: body.query,
            results: [
              { title: 'Quantum Computing Basics', url: 'https://en.wikipedia.org/wiki/Quantum_computing', snippet: 'Quantum computing uses qubits.', source: 'Wikipedia', extract: 'Quantum computing is the use of quantum mechanics for computation.' },
              { title: 'Qubits Explained', url: 'https://example.com/qubits', snippet: 'Qubits can be 0, 1, or both.', source: 'DuckDuckGo' }
            ],
            meta: { source: 'Wikipedia', extracted: true }
          });
        }
        if (body.query.includes('superposition')) {
          return Response.json({
            kind: 'search',
            query: body.query,
            results: [
              { title: 'Superposition in Quantum Computing', url: 'https://example.com/superposition', snippet: 'Superposition allows multiple states at once.', source: 'Wikipedia', extract: 'A qubit in superposition is a combination of 0 and 1.' }
            ],
            meta: { source: 'Wikipedia', extracted: true }
          });
        }
        if (body.query.includes('entanglement')) {
          return Response.json({
            kind: 'search',
            query: body.query,
            results: [
              { title: 'Entanglement Explained', url: 'https://example.com/entanglement', snippet: 'Entangled qubits share state.', source: 'DuckDuckGo' }
            ],
            meta: { source: 'DuckDuckGo' }
          });
        }
        return Response.json({ kind: 'search', results: [] });
      }
      if (url === '/api/ai') {
        const payload = JSON.parse(init.body);
        const prompt = payload.prompt || '';
        if (/research outline planner/.test(prompt)) {
          // Outline pass returns the item decomposition as strict JSON.
          return Response.json({ content: '{"items":[{"name":"Superposition","query":"superposition in quantum computing"},{"name":"Entanglement","query":"quantum entanglement explained"}]}' });
        }
        const isReview = /editorial reviewer/.test(prompt);
        return Response.json({ content: isReview
          ? 'Overview\n\nQuantum computing is a field, revised and verified.\n\nKey Findings\n\n- Qubits.'
          : '## Table of Contents\n\n1. Superposition\n2. Entanglement\n\n## Item: Superposition\n\nSuperposition is a quantum property [3].\n\n## Item: Entanglement\n\nEntangled qubits share state [4].\n\n## Conclusion\n\nDone.' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('@research quantum computing', []);
    expect(response).toContain('Download .pdf');
    expect(response).toContain('```html');
    expect(response).toContain('deep-researched across');
    // Outline pass + draft pass + editorial review pass.
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/ai').length).toBe(3);
    // Topic-level search + one dedicated search per researched item.
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/search').length).toBe(3);
    vi.unstubAllGlobals();
  });

  it('falls back to an honest source report when the hosted AI is unavailable', async () => {
    vi.stubGlobal('fetch', async (url) => {
      if (url === '/api/search') {
        return Response.json({
          kind: 'search',
          results: [
            { title: 'Quantum Computing Basics', url: 'https://en.wikipedia.org/wiki/Quantum_computing', snippet: 'Quantum computing uses qubits.', source: 'Wikipedia', extract: 'Quantum computing uses quantum mechanics.' }
          ],
          meta: { source: 'Wikipedia', extracted: true }
        });
      }
      if (url === '/api/ai') {
        return Response.json({ error: 'unavailable' }, { status: 500 });
      }
      throw new Error('unexpected');
    });
    const response = await generateAIResponse('@research quantum computing', []);
    expect(response).toContain('Download .pdf');
    // Real sources are presented directly — nothing is fabricated.
    expect(response).toContain('presented directly');
    expect(response).toContain('Quantum Computing Basics');
    vi.unstubAllGlobals();
  });

  it('reports honestly when search returns nothing', async () => {
    vi.stubGlobal('fetch', async (url) => {
      if (url === '/api/search') {
        return Response.json({ kind: 'search', results: [] });
      }
      throw new Error('unexpected');
    });
    const response = await generateAIResponse('@research zzzzqqq', []);
    expect(response).toMatch(/couldn't research|no reliable results/i);
    expect(response).not.toContain('Download .pdf');
    vi.unstubAllGlobals();
  });

  it('asks for a topic when none is given', async () => {
    const response = await generateAIResponse('@research', []);
    expect(response).toMatch(/what to research/i);
  });
});

describe('@image command', () => {
  it('generates an image and returns markdown with clean prompt', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/image') {
        const payload = JSON.parse(init.body);
        expect(payload.prompt).toBe('a futuristic neon city at night');
        expect(payload.prompt).not.toContain('@image');
        return Response.json({ image: 'https://example.com/neon-city.png' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('@image a futuristic neon city at night', []);
    expect(response).toBe('![](https://example.com/neon-city.png)');
    expect(fetchMock).toHaveBeenCalledWith('/api/image', expect.anything());
    vi.unstubAllGlobals();
  });

  it('forwards reference images from conversation history', async () => {
    const referenceImage = 'data:image/png;base64,REF_DATA';
    let capturedBody = null;
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/image') {
        capturedBody = JSON.parse(init.body);
        return Response.json({ image: 'data:image/png;base64,RESULT' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const history = [
      { role: 'user', content: 'here is a sketch', attachments: [{ name: 'sketch.png', type: 'image/png', thumb: referenceImage }] },
      { role: 'assistant', content: 'Received!' }
    ];

    const response = await generateAIResponse('@image render this in oil painting style', history);
    expect(response).toBe('![](data:image/png;base64,RESULT)');
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.prompt).toBe('render this in oil painting style');
    expect(capturedBody.referenceImage).toBe(referenceImage);
    vi.unstubAllGlobals();
  });

  it('asks for an image description when none is given', async () => {
    const response = await generateAIResponse('@image', []);
    expect(response).toMatch(/what image to generate/i);
  });

  it('falls back to a labelled placeholder when the image endpoint fails', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await generateAIResponse('@image a magical forest', []);
    expect(response).toContain('data:image/svg+xml');
    expect(decodeURIComponent(response)).toContain('LOCAL IMAGE PLACEHOLDER');
    vi.unstubAllGlobals();
  });
});

describe('PDF generator', () => {
  // The exported .pdf is written byte by byte in the browser, so these tests
  // inspect the bytes a PDF reader actually walks. The previous builder counted
  // JavaScript characters while the Blob encoded UTF-8, which produced a
  // startxref pointing at the wrong byte and a wrong /Length — every report
  // containing a bullet failed to parse with "Broken xref table".
  const PAGE_WIDTH = 595.28;
  const MARGIN = 56.69;
  const TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2;
  // Adobe core Helvetica widths (units/1000 em), ASCII 32..126: the same metric
  // the builder wraps against, used here to re-measure the drawn lines.
  const HELVETICA = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    278, 278, 584, 584, 584, 556, 1015,
    667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667,
    778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
    278, 278, 278, 469, 556, 333,
    556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556,
    556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
    334, 260, 334, 584
  ];

  function textWidth(text, size) {
    return [...text].reduce((sum, ch) => {
      const index = ch.charCodeAt(0) - 32;
      const width = index >= 0 && index < HELVETICA.length ? HELVETICA[index] : 556;
      return sum + (width * size) / 1000;
    }, 0);
  }

  // Run the emitted script exactly as the sandboxed preview iframe would.
  function buildPdf(doc) {
    const script = doc.html.match(/<script>([\s\S]*?)<\/script>/)[1];
    let captured = null;
    const blobShim = function (parts) {
      captured = parts.join('');
      return { type: 'application/pdf' };
    };
    const api = new Function('Blob', `${script}\n;return { buildPdf };`)(blobShim);
    api.buildPdf();
    return Buffer.from(captured, 'utf8'); // what new Blob([...]) produces
  }

  function drawnLines(bytes) {
    const raw = bytes.toString('latin1');
    const start = raw.indexOf('stream\n') + 7;
    const stream = raw.slice(start, raw.indexOf('\nendstream', start));
    return [...stream.matchAll(/\/F1 (\d+(?:\.\d+)?) Tf [\d.]+ [\d.]+ Td \((.*)\) Tj ET/g)].map(
      (match) => ({
        size: Number(match[1]),
        raw: match[2],
        // A content-stream string escapes ( ) and backslash. The glyphs drawn —
        // and therefore the rendered width — are the decoded characters.
        text: match[2].replace(/\\([()\\])/g, '$1')
      })
    );
  }

  it('writes a PDF whose cross-reference table a strict reader can follow', () => {
    const bytes = buildPdf(
      synthesizePdfDocumentHtml({
        title: 'Quarterly Briefing',
        body: '## Executive Summary\n\nThe market grew by 12%.\n\n- First finding.\n- Second finding.',
        sources: [{ title: 'Example', url: 'https://example.com/a' }]
      })
    );
    const raw = bytes.toString('latin1');

    // startxref must land on the xref table IN BYTES: a character offset drifts
    // by one byte per non-ASCII character and breaks the whole table.
    const startxref = Number(raw.match(/startxref\s+(\d+)\s+%%EOF/)[1]);
    expect(bytes.subarray(startxref, startxref + 4).toString('latin1')).toBe('xref');

    // Every entry must resolve to its object, and every /Length must be the real
    // byte length of its stream.
    const lines = raw.slice(startxref).split('\n');
    const count = Number(lines[1].trim().split(' ')[1]);
    for (let objectNumber = 1; objectNumber < count; objectNumber += 1) {
      const offset = Number(lines[2 + objectNumber].slice(0, 10));
      expect(
        bytes.subarray(offset, offset + 16).toString('latin1'),
        `xref entry ${objectNumber} does not point at object ${objectNumber}`
      ).toMatch(new RegExp(`^${objectNumber} 0 obj`));
    }
    for (const match of raw.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) {
      expect(Number(match[1])).toBe(Buffer.byteLength(match[2], 'utf8'));
    }

    // One byte per character is what makes the offsets above stable.
    expect([...raw].every((ch) => ch.charCodeAt(0) < 128)).toBe(true);
  });

  it('folds text the base-14 font cannot address instead of emitting broken bytes', () => {
    const bytes = buildPdf(
      synthesizePdfDocumentHtml({
        title: 'Résumé 2026',
        body: '## Résumé du marché\n\nCosts rose 12% at 20°C in the café — a “must read”.\n\n- Beyoncé © 2026, naïve façade, jalapeño.',
        sources: []
      })
    );
    const lines = drawnLines(bytes);
    expect(lines.map((line) => line.raw).join('\n')).toContain('Beyonce \\(C\\)');
    const text = lines.map((line) => line.text).join('\n');
    // Accents decompose, typographic punctuation normalises, symbols expand.
    expect(text).toContain('Resume du marche');
    expect(text).toContain('cafe');
    expect(text).toContain('20 degC');
    expect(text).toContain('"must read"');
    expect(text).toContain('Beyonce (C) 2026, naive facade, jalapeno');
    // Nothing unrepresentable survives to be rendered as two wrong glyphs.
    for (const line of lines) {
      expect(line.text, `unrepresentable character in ${JSON.stringify(line.text)}`).not.toMatch(
        /[^\x20-\x7e]/
      );
    }
  });

  it('never draws a line wider than the text area, even for wide glyphs or long URLs', () => {
    const bodies = [
      '## Wide\n\n' + 'MMMM WWWW @@@@ WWWWW MMMM WWWWWW @@@@@ WWWW MMMMM WWW @@@ WWWWW MMM WWWWWWW @@@@ MMMM WWWWW'.repeat(3),
      '## Long\n\n' + 'extraordinarily straightforward internationalization characterization counterrevolutionaries'.repeat(2),
      '## THE COMPLETE INTERNATIONAL MARKET OUTLOOK AND STRATEGIC POSITIONING SUMMARY FOR ENTERPRISE BUYERS\n\nBody.',
      '## Ordinary\n\n' + 'This paragraph describes conditions in some detail so the wrapper has to break it somewhere sensible.'.repeat(4)
    ];
    const sources = [
      {
        title: 'Long source',
        url: 'https://example.com/a/very/long/path/that/keeps/going/without/any/break/opportunity/at/all/abcdefghijklmnop'
      }
    ];
    for (const body of bodies) {
      for (const line of drawnLines(buildPdf(synthesizePdfDocumentHtml({ title: 'Wide', body, sources })))) {
        expect(
          textWidth(line.text, line.size),
          `line overflows the text area: ${JSON.stringify(line.text)}`
        ).toBeLessThanOrEqual(TEXT_WIDTH + 0.5);
      }
    }
  });

  it('folds the download filename too', () => {
    const doc = synthesizePdfDocumentHtml({ title: 'Résumé — Q3 2026', body: 'x', sources: [] });
    // The filename is derived from the folded title and collapsed to a safe
    // pattern, so it can never contain a path separator or a mangled character.
    expect(doc.html).toContain('foldToAscii(REPORT_TITLE).replace(/[^A-Za-z0-9]+/g');
  });

  it('runs the download action end to end and names the file safely', () => {
    const doc = synthesizePdfDocumentHtml({ title: 'Résumé — Q3 2026', body: 'Body.', sources: [] });
    const script = doc.html.match(/<script>([\s\S]*?)<\/script>/)[1];

    const created = [];
    const revoked = [];
    let clicked = null;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => {
      created.push(blob);
      return 'blob:corez-test';
    };
    URL.revokeObjectURL = (url) => revoked.push(url);
    // This suite runs without a DOM, so the anchor the builder appends to is
    // stubbed: the point is that the click path runs and names the file safely.
    vi.stubGlobal('document', {
      createElement: () => ({
        href: '',
        download: '',
        click() {
          clicked = { href: this.href, download: this.download };
        },
        remove() {}
      }),
      body: { appendChild() {} }
    });
    try {
      const api = new Function(`${script}\n;return { downloadPdf };`)();
      expect(() => api.downloadPdf()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }

    expect(created).toHaveLength(1);
    expect(clicked).not.toBeNull();
    // A folded, filesystem-safe name with collapsed separators: accents and em
    // dashes must not survive into a download filename.
    expect(clicked.download).toBe('Resume-Q3-2026.pdf');
    expect(clicked.download).toMatch(/^[\x20-\x7e]+\.pdf$/);
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

  it('drops the body Sources section in favour of the styled list and skips rules', () => {
    const doc = synthesizePdfDocumentHtml({
      title: 'Dupes',
      body: '## Overview\n\nIntro text.\n\n---\n\n## Sources\n\n1. Fake — https://example.com',
      sources: [{ title: 'Real Source', url: 'https://real.example' }]
    });
    expect(doc.html).toContain('Intro text');
    expect(doc.html).not.toContain('<p>---</p>');
    expect(doc.html).not.toContain('Fake'); // body copy of the sources is removed
    expect(doc.html).toContain('Real Source'); // styled list is the single source of truth
    expect((doc.html.match(/<h2>Sources<\/h2>/g) || []).length).toBe(1);
    // The downloaded PDF still lists the structured sources.
    const paras = JSON.parse(doc.html.match(/var REPORT_PARAGRAPHS = (\[[\s\S]*?\]);/)[1]);
    expect(paras.some((p) => p.kind === 'numbered' && p.text.includes('Real Source — https://real.example'))).toBe(true);
  });

  it('renders subheadings and numbered items as real lists', () => {
    const doc = synthesizePdfDocumentHtml({
      title: 'Structure',
      body: '## Details\n\n### 1. First\n\n- a bullet\n\n1. numbered one\n\n2. numbered two',
      sources: []
    });
    expect(doc.html).toContain('<h3>1. First</h3>');
    expect(doc.html).toContain('<ol><li>numbered one</li><li>numbered two</li></ol>');
  });
});
