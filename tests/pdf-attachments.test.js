// @vitest-environment jsdom
// PDF attachments are readable: the client extracts their text (pdf.js,
// lazy-loaded) into `content`, which the existing prompt pipeline already
// feeds to the model. These tests pin the detection, extraction, truncation
// and fallback behaviour with an injected pdf.js loader — no real PDFs needed.
import { describe, it, expect, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import {
  isPdfFile,
  extractPdfText,
  processFiles,
  MAX_PDF_PAGES,
  MAX_TEXT_CONTENT_BYTES,
} from '../src/utils/fileAttachmentUtils.js';

/** Fake pdf.js loader: pages is an array of pages, each an array of strings. */
function fakeLoader(pages, calls = null) {
  return async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: async (i) => {
          if (calls) calls.push(i);
          return {
            getTextContent: async () => ({
              items: pages[i - 1].map((s) => ({ str: s })),
            }),
            cleanup: () => {},
          };
        },
        destroy: async () => {},
      }),
    }),
  });
}

function pdfFile(name = 'report.pdf', type = 'application/pdf') {
  return new File(['%PDF-1.4 fake-bytes'], name, { type });
}

describe('isPdfFile', () => {
  it('matches the PDF mime type', () => {
    expect(isPdfFile({ name: 'x', type: 'application/pdf' })).toBe(true);
    expect(isPdfFile({ name: 'x', type: 'application/pdf; charset=binary' })).toBe(true);
    expect(isPdfFile({ name: 'x', type: 'APPLICATION/PDF' })).toBe(true);
  });

  it('falls back to the extension when the mime is missing', () => {
    expect(isPdfFile({ name: 'report.pdf', type: '' })).toBe(true);
    expect(isPdfFile({ name: 'REPORT.PDF', type: '' })).toBe(true);
    expect(isPdfFile({ name: 'report.pdf', type: 'application/octet-stream' })).toBe(true);
  });

  it('rejects non-PDF files', () => {
    expect(isPdfFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false);
    expect(isPdfFile({ name: 'photo.png', type: 'image/png' })).toBe(false);
    expect(isPdfFile({ name: 'archive.zip', type: 'application/zip' })).toBe(false);
    expect(isPdfFile(null)).toBe(false);
    expect(isPdfFile({})).toBe(false);
  });
});

describe('extractPdfText', () => {
  it('joins pages with markers and reports the count', async () => {
    const result = await extractPdfText(pdfFile(), fakeLoader([['Hello', 'world'], ['Second page']]));
    expect(result.pages).toBe(2);
    expect(result.text).toContain('[Page 1]');
    expect(result.text).toContain('Hello world');
    expect(result.text).toContain('[Page 2]');
    expect(result.text).toContain('Second page');
  });

  it('caps extraction at MAX_PDF_PAGES', async () => {
    const calls = [];
    const many = Array.from({ length: MAX_PDF_PAGES + 20 }, () => ['x']);
    const result = await extractPdfText(pdfFile(), fakeLoader(many, calls));
    expect(result.pages).toBe(MAX_PDF_PAGES);
    expect(calls).toHaveLength(MAX_PDF_PAGES);
  });

  it('truncates text beyond the prompt budget', async () => {
    const big = 'w'.repeat(MAX_TEXT_CONTENT_BYTES + 1000);
    const result = await extractPdfText(pdfFile(), fakeLoader([[big]]));
    expect(result.text.length).toBeLessThanOrEqual(MAX_TEXT_CONTENT_BYTES + 100);
    expect(result.text).toContain('[truncated');
  });

  it('returns null when no page has text (scanned-image PDF)', async () => {
    await expect(extractPdfText(pdfFile(), fakeLoader([[], ['   ']]))).resolves.toBeNull();
  });

  it('returns null when the loader fails, without throwing', async () => {
    await expect(
      extractPdfText(pdfFile(), async () => { throw new Error('no pdfjs'); }),
    ).resolves.toBeNull();
  });

  it('returns null for empty or oversized files without touching the loader', async () => {
    const loader = vi.fn(async () => { throw new Error('must not load'); });
    await expect(
      extractPdfText(new File([], 'empty.pdf', { type: 'application/pdf' }), loader),
    ).resolves.toBeNull();
    await expect(
      extractPdfText({ name: 'huge.pdf', type: 'application/pdf', size: 50 * 1024 * 1024 }, loader),
    ).resolves.toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });
});

describe('processFiles with PDFs', () => {
  function stateful() {
    let attachments = [];
    const setAttachments = (updater) => {
      attachments = typeof updater === 'function' ? updater(attachments) : updater;
    };
    return { setAttachments, get: () => attachments };
  }

  it('marks the chip busy, then fills content from the extracted text', async () => {
    const s = stateful();
    processFiles([pdfFile()], s.setAttachments, {
      pdfLoader: fakeLoader([['Invoice total: 42 AED']]),
    });
    expect(s.get()).toHaveLength(1);
    expect(s.get()[0].uploading).toBe(true);
    await waitFor(() => {
      expect(s.get()[0].uploading).toBe(false);
    });
    expect(s.get()[0].content).toContain('Invoice total: 42 AED');
  });

  it('falls back to a name-only chip when extraction fails', async () => {
    const s = stateful();
    processFiles([pdfFile()], s.setAttachments, {
      pdfLoader: async () => { throw new Error('parse failed'); },
    });
    await waitFor(() => {
      expect(s.get()[0].uploading).toBe(false);
    });
    expect(s.get()[0].name).toBe('report.pdf');
    expect(s.get()[0].content).toBeUndefined();
  });
});
