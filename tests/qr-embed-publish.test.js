import { describe, it, expect } from 'vitest';
import { generateQrCodeSvg, generateEmbedSnippet, createQRMatrix } from '../src/utils/qrCode.js';

describe('QR Code & Embed Generator Utility', () => {
  it('generates valid SVG for a given published URL', () => {
    const url = 'https://corez.pro/my-app-123';
    const svg = generateQrCodeSvg(url, { size: 180, fgColor: '#000000', bgColor: '#ffffff' });

    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 180 180"');
    expect(svg).toContain('width="180"');
    expect(svg).toContain('height="180"');
    expect(svg).toContain('<rect');
    expect(svg).toContain('</svg>');
  });

  it('returns empty string for invalid or missing URL input', () => {
    expect(generateQrCodeSvg('')).toBe('');
    expect(generateQrCodeSvg(null)).toBe('');
    expect(generateQrCodeSvg(undefined)).toBe('');
  });

  it('generates standard embed snippet iframe with attributes', () => {
    const snippet = generateEmbedSnippet('/custom-slug-1', {
      title: 'Retro Arcade Game',
      width: '100%',
      height: '500'
    });

    expect(snippet).toContain('<iframe src="https://corez.pro/custom-slug-1"');
    expect(snippet).toContain('title="Retro Arcade Game"');
    expect(snippet).toContain('width="100%"');
    expect(snippet).toContain('height="500"');
    expect(snippet).toContain('allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"');
    expect(snippet).toContain('</iframe>');
  });

  it('escapes quotes in iframe title safely', () => {
    const snippet = generateEmbedSnippet('https://corez.pro/game', {
      title: 'Game "Super" Deluxe'
    });

    expect(snippet).toContain('title="Game &quot;Super&quot; Deluxe"');
  });

  it('returns an empty embed snippet for a missing URL', () => {
    expect(generateEmbedSnippet('')).toBe('');
    expect(generateEmbedSnippet(null)).toBe('');
    expect(generateEmbedSnippet(undefined)).toBe('');
  });
});

describe('real QR matrix encoding', () => {
  it('produces a valid QR version size (21 modules for short data)', () => {
    const matrix = createQRMatrix('hello');
    expect(matrix.length).toBe(21);
    expect(matrix.every((row) => row.length === 21)).toBe(true);
    expect(matrix.flat().every((cell) => cell === 0 || cell === 1)).toBe(true);
  });

  it('grows the symbol when the payload needs more capacity', () => {
    const short = createQRMatrix('https://corez.pro/demo');
    const long = createQRMatrix('https://corez.pro/' + 'a'.repeat(150));
    expect(long.length).toBeGreaterThan(short.length);
  });

  it('draws the three finder patterns with a dark border and center', () => {
    const matrix = createQRMatrix('https://corez.pro/demo-1');
    for (const [r0, c0] of [[0, 0], [0, matrix.length - 7], [matrix.length - 7, 0]]) {
      expect(matrix[r0][c0]).toBe(1);
      expect(matrix[r0 + 1][c0 + 1]).toBe(0);
      expect(matrix[r0 + 3][c0 + 3]).toBe(1);
    }
  });

  it('alternates the timing pattern', () => {
    const matrix = createQRMatrix('https://corez.pro/demo-1');
    for (let i = 8; i < matrix.length - 8; i++) {
      expect(matrix[6][i]).toBe(i % 2 === 0 ? 1 : 0);
      expect(matrix[i][6]).toBe(i % 2 === 0 ? 1 : 0);
    }
  });

  it('is deterministic and payload-sensitive', () => {
    const a = createQRMatrix('https://corez.pro/one');
    const b = createQRMatrix('https://corez.pro/one');
    const c = createQRMatrix('https://corez.pro/two');
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('encodes text as UTF-8 bytes, not Latin-1 code units', () => {
    // Version 1-M holds 14 byte-mode bytes, version 2-M holds 26. Eleven
    // 'é' characters are 22 UTF-8 bytes (version 2) but only 11 Latin-1 code
    // units (version 1) — the size proves which codec ran.
    expect(createQRMatrix('a'.repeat(14)).length).toBe(21);
    expect(createQRMatrix('a'.repeat(15)).length).toBe(25);
    expect(createQRMatrix('é'.repeat(11)).length).toBe(25);
  });
});
