import { describe, it, expect } from 'vitest';
import { synthesizePdfDocumentHtml } from '../src/services/pdfGenerator.js';
import {
  extractResearchReportData,
  isResearchReportDocument,
  downloadResearchReportPdf,
} from '../src/services/pdfDownload.js';

function reportDoc() {
  return synthesizePdfDocumentHtml({
    title: 'Quantum Computing — Q3 2026',
    body: '## Findings\n\n- qubit coherence improved\n- error correction matured\n\n## Outlook\n\nSteady progress is expected.',
    sources: [{ title: 'Nature', url: 'https://nature.example/quantum' }],
  });
}

describe('one-click research report download', () => {
  it('recognises a research report document and extracts its data', () => {
    const doc = reportDoc();
    expect(isResearchReportDocument(doc.html)).toBe(true);

    const data = extractResearchReportData(doc.html);
    expect(data).not.toBeNull();
    expect(data.title).toContain('Quantum Computing');
    expect(Array.isArray(data.paragraphs)).toBe(true);
    expect(data.paragraphs.length).toBeGreaterThan(2);
    expect(data.paragraphs.some((b) => b.kind === 'bullet')).toBe(true);
    expect(data.paragraphs.some((b) => b.kind === 'heading')).toBe(true);
  });

  it('does not claim ordinary HTML artifacts as reports', () => {
    expect(
      isResearchReportDocument('<!DOCTYPE html><html><body><h1>App</h1></body></html>'),
    ).toBe(false);
    expect(extractResearchReportData('<html></html>')).toBeNull();
  });

  it('builds and downloads the report PDF with a safe filename', () => {
    const doc = reportDoc();
    const created = [];
    const revoked = [];
    let clicked = null;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => {
      created.push(blob);
      return 'blob:corez-report';
    };
    URL.revokeObjectURL = (url) => revoked.push(url);
    globalThis.document = {
      createElement: () => ({
        href: '',
        download: '',
        click() {
          clicked = { href: this.href, download: this.download };
        },
        remove() {},
      }),
      body: { appendChild() {} },
    };
    try {
      expect(downloadResearchReportPdf(doc.html)).toBe(true);
    } finally {
      delete globalThis.document;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }

    expect(created).toHaveLength(1);
    expect(clicked).not.toBeNull();
    expect(clicked.href).toBe('blob:corez-report');
    expect(clicked.download).toMatch(/^[\x20-\x7e]+\.pdf$/);
    expect(clicked.download).toContain('Quantum-Computing');
  });

  it('refuses to download a non-report artifact', () => {
    expect(downloadResearchReportPdf('<html><body>app</body></html>')).toBe(false);
  });
});
