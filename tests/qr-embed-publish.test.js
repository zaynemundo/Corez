import { describe, it, expect } from 'vitest';
import { generateQrCodeSvg, generateEmbedSnippet } from '../src/utils/qrCode.js';

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
});
