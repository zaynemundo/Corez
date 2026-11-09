import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { synthesizePdfDocumentHtml } from '../src/services/pdfGenerator.js';
import {
  extractResearchReportData,
  isResearchReportDocument,
  downloadResearchReportPdf,
  REPORT_PDF_ENDPOINT,
} from '../src/services/pdfDownload.js';

function reportDoc() {
  return synthesizePdfDocumentHtml({
    title: 'Quantum Computing — Q3 2026',
    body: '## Findings\n\n- qubit coherence improved\n- error correction matured\n\n## Outlook\n\nSteady progress is expected.',
    sources: [{ title: 'Nature', url: 'https://nature.example/quantum' }],
  });
}

function stubDownloadEnvironment() {
  const created = [];
  const revoked = [];
  const state = { clicked: null };
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
        state.clicked = { href: this.href, download: this.download };
      },
      remove() {},
    }),
    body: { appendChild() {} },
  };
  return {
    created,
    revoked,
    state,
    restore() {
      delete globalThis.document;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    },
  };
}

describe('one-click research report download', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('downloads the server-rendered PDF (full Unicode) when the Worker can render', async () => {
    const doc = reportDoc();
    const env = stubDownloadEnvironment();
    const serverBlob = new Blob(['%PDF-1.4 server'], { type: 'application/pdf' });
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => serverBlob }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(downloadResearchReportPdf(doc.html)).resolves.toBe(true);
    } finally {
      env.restore();
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(REPORT_PDF_ENDPOINT);
    expect(options.method).toBe('POST');
    const payload = JSON.parse(options.body);
    expect(payload.title).toContain('Quantum Computing');
    expect(Array.isArray(payload.paragraphs)).toBe(true);
    expect(payload.paragraphs.length).toBeGreaterThan(0);

    // The server blob is what the browser was told to save.
    expect(env.created).toEqual([serverBlob]);
    expect(env.state.clicked.download).toBe('Quantum-Computing-Q3-2026.pdf');
    expect(env.state.clicked.download).toMatch(/^[\x20-\x7e]+\.pdf$/);
  });

  it('falls back to the local ASCII builder when the server render fails', async () => {
    const doc = reportDoc();
    const env = stubDownloadEnvironment();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    try {
      await expect(downloadResearchReportPdf(doc.html)).resolves.toBe(true);
    } finally {
      env.restore();
    }

    expect(env.created).toHaveLength(1);
    expect(env.created[0].type).toBe('application/pdf');
    expect(env.created[0].size).toBeGreaterThan(0);
    expect(env.state.clicked.download).toBe('Quantum-Computing-Q3-2026.pdf');
  });

  it('also falls back when the server reports it cannot render', async () => {
    const doc = reportDoc();
    const env = stubDownloadEnvironment();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    try {
      await expect(downloadResearchReportPdf(doc.html)).resolves.toBe(true);
    } finally {
      env.restore();
    }
    expect(env.created).toHaveLength(1);
    expect(env.state.clicked.download).toMatch(/\.pdf$/);
  });

  it('refuses to download a non-report artifact', async () => {
    await expect(downloadResearchReportPdf('<html><body>app</body></html>')).resolves.toBe(false);
  });
});
