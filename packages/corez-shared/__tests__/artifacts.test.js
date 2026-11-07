/**
 * Contract tests for the shared package itself.
 *
 * The web and the native client must import the same implementation, not two
 * copies. These pin the byte builders (the mobile app writes bytes to disk; the
 * web wraps them in Blobs) and the re-export identity used by the web shims.
 */
import { describe, it, expect } from 'vitest';
import {
  buildResearchPdfBytes,
  buildResearchPdfBlob,
  createZipBytes,
  createZipBlob,
  computeCrc32,
  reportFileName,
} from '@corez_ai/shared/artifacts';
import { translate as sharedTranslate } from '@corez_ai/shared/i18n';
import { translate as webTranslate } from '../../../src/i18n/dictionaries.js';

const WIDTHS = [278, 278, 355];

describe('shared artifact byte builders', () => {
  it('builds a complete PDF as bytes', async () => {
    const bytes = buildResearchPdfBytes(
      'Shared contract',
      [
        { kind: 'heading', text: 'Findings' },
        { kind: 'paragraph', text: 'The same bytes reach every client.' },
      ],
      WIDTHS,
    );

    expect(bytes).toBeInstanceOf(Uint8Array);
    const text = new TextDecoder().decode(bytes.slice(0, 5));
    expect(text).toBe('%PDF-');
    expect(new TextDecoder().decode(bytes.slice(-6))).toBe('\n%%EOF');
  });

  it('wraps the PDF bytes in an identical Blob', async () => {
    const bytes = buildResearchPdfBytes('Title', [{ kind: 'paragraph', text: 'Body' }], WIDTHS);
    const blob = buildResearchPdfBlob('Title', [{ kind: 'paragraph', text: 'Body' }], WIDTHS);
    const fromBlob = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(fromBlob)).toEqual(Array.from(bytes));
  });

  it('builds a ZIP archive as bytes and wraps it without changing them', async () => {
    const files = [
      { name: 'index.html', content: '<h1>Hello</h1>' },
      { name: 'assets/app.js', content: 'console.log("hi");' },
    ];
    const bytes = createZipBytes(files);
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);

    const blob = createZipBlob(files);
    const fromBlob = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(fromBlob)).toEqual(Array.from(bytes));
  });

  it('keeps the CRC and filename helpers unchanged', () => {
    expect(computeCrc32(new TextEncoder().encode('CoreZ'))).toBeGreaterThan(0);
    expect(reportFileName('Résumé — Q3 2026')).toBe('Resume-Q3-2026.pdf');
  });
});

describe('web shims re-export the shared implementation', () => {
  it('dictionary translation is the same function object', () => {
    expect(webTranslate).toBe(sharedTranslate);
  });

  it('translates through the shared dictionary data', () => {
    expect(sharedTranslate('en', 'common.sidebar.newChat')).toBe('New Chat');
    expect(sharedTranslate('ar', 'common.sidebar.newChat')).toBeTruthy();
  });
});
