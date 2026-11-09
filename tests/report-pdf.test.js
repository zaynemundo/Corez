import { describe, it, expect, vi, beforeEach } from 'vitest';

const launch = vi.fn();
vi.mock('@cloudflare/puppeteer', () => ({
  default: { launch: (...args) => launch(...args) },
}));

import {
  handleReportPdf,
  normalizeReportPdfPayload,
  renderReportPrintHtml,
  reportPdfFileName,
} from '../worker/reportPdf.js';
import worker from '../worker/entry.js';

function makeBrowser(pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])) {
  const page = {
    setJavaScriptEnabled: vi.fn(async () => {}),
    setOfflineMode: vi.fn(async () => {}),
    setContent: vi.fn(async () => {}),
    pdf: vi.fn(async () => pdfBytes),
  };
  const browser = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => {}),
  };
  return { browser, page };
}

function reportRequest(body, { ip = '198.51.100.10', method = 'POST' } = {}) {
  return new Request('https://corez.pro/api/pdf/report', {
    method,
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': ip,
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
}

const REPORT = {
  title: 'Quantum Computing — Q3 2026',
  paragraphs: [
    { kind: 'heading', text: 'Findings' },
    { kind: 'bullet', text: 'qubit coherence improved' },
    { kind: 'numbered', text: '1. Source — https://nature.example' },
  ],
};

describe('report PDF payload validation', () => {
  it('normalises text, block kinds and bounds the payload', () => {
    const payload = normalizeReportPdfPayload({
      title: '  Résumé\n  report  ',
      paragraphs: [
        { kind: 'heading', text: '  Findings\n\n ' },
        { kind: 'not-a-kind', text: 'body copy' },
        { kind: 'paragraph', text: '   ' },
      ],
    });
    expect(payload.title).toBe('Résumé report');
    expect(payload.paragraphs).toEqual([
      { kind: 'heading', text: 'Findings' },
      { kind: 'paragraph', text: 'body copy' },
    ]);
  });

  it('rejects payloads with no printable content', () => {
    expect(normalizeReportPdfPayload({})).toBeNull();
    expect(normalizeReportPdfPayload({ paragraphs: [] })).toBeNull();
    expect(normalizeReportPdfPayload({ paragraphs: [{ kind: 'paragraph', text: '  ' }] })).toBeNull();
  });

  it('caps the number of blocks and total characters', () => {
    const paragraphs = Array.from({ length: 700 }, (_, index) => ({
      kind: 'paragraph',
      text: `block ${index} `.repeat(40),
    }));
    const payload = normalizeReportPdfPayload({ title: 'Long', paragraphs });
    expect(payload.paragraphs.length).toBeLessThanOrEqual(600);
    const total = payload.paragraphs.reduce((sum, block) => sum + block.text.length, 0);
    expect(total).toBeLessThanOrEqual(120_000);
  });
});

describe('report print document', () => {
  it('escapes model text instead of letting it become markup', () => {
    const html = renderReportPrintHtml({
      title: '<img src=x onerror=alert(1)>',
      paragraphs: [
        { kind: 'paragraph', text: '<script>alert("xss")</script>' },
      ],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('groups list blocks and keeps numbered sources starting at their number', () => {
    const html = renderReportPrintHtml({
      title: 'Sources',
      paragraphs: [
        { kind: 'bullet', text: 'one' },
        { kind: 'bullet', text: 'two' },
        { kind: 'heading', text: 'Sources' },
        { kind: 'numbered', text: '3. Third — https://example.com' },
        { kind: 'numbered', text: '4. Fourth — https://example.com' },
      ],
    });
    expect(html).toContain('<ul>\n<li dir="auto">one</li>\n<li dir="auto">two</li>\n</ul>');
    expect(html).toContain('<ol start="3">');
    expect(html).toContain('Third — https://example.com');
    expect(html).not.toContain('3. Third');
  });

  it('marks every block dir="auto" so Arabic paragraphs order correctly', () => {
    const html = renderReportPrintHtml({
      title: 'تقرير البحث',
      paragraphs: [{ kind: 'paragraph', text: 'تحسّن تماسك الكيوبت' }],
    });
    expect(html).toContain('dir="auto"');
    expect(html).toContain('تقرير البحث');
    expect(html).toContain('تحسّن تماسك الكيوبت');
  });
});

describe('report PDF file name', () => {
  it('folds and slugifies the title', () => {
    expect(reportPdfFileName('Résumé — Q3 2026')).toBe('Resume-Q3-2026.pdf');
    expect(reportPdfFileName('')).toBe('research-report.pdf');
  });
});

describe('handleReportPdf', () => {
  beforeEach(() => {
    launch.mockReset();
  });

  it('rejects non-POST requests', async () => {
    const response = await handleReportPdf(reportRequest(null, { method: 'GET' }), { BROWSER: {} });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });

  it('reports unavailable rendering when Browser Run is not bound', async () => {
    const response = await handleReportPdf(reportRequest(REPORT, { ip: '198.51.100.21' }), {});
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.retry).toBe(true);
  });

  it('rejects invalid JSON and empty payloads', async () => {
    const invalid = await handleReportPdf(
      new Request('https://corez.pro/api/pdf/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.22' },
        body: 'not json',
      }),
      { BROWSER: {} },
    );
    expect(invalid.status).toBe(400);

    const empty = await handleReportPdf(
      reportRequest({ paragraphs: [] }, { ip: '198.51.100.23' }),
      { BROWSER: {} },
    );
    expect(empty.status).toBe(400);
    expect(launch).not.toHaveBeenCalled();
  });

  it('renders the report with Browser Run and returns PDF bytes', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const { browser, page } = makeBrowser(pdfBytes);
    launch.mockResolvedValue(browser);

    const response = await handleReportPdf(
      reportRequest(REPORT, { ip: '198.51.100.24' }),
      { BROWSER: {} },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Quantum-Computing-Q3-2026.pdf"',
    );
    const body = new Uint8Array(await response.arrayBuffer());
    expect([...body]).toEqual([...pdfBytes]);

    const html = page.setContent.mock.calls[0][0];
    expect(html).toContain('Quantum Computing');
    expect(html).toContain('qubit coherence improved');
    // The renderer is offline and script-free; nothing can be fetched/run.
    expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(page.setOfflineMode).toHaveBeenCalledWith(true);
    expect(browser.close).toHaveBeenCalled();
  });

  it('falls back to a 502 when the browser render fails', async () => {
    launch.mockRejectedValue(new Error('browser unavailable'));
    const response = await handleReportPdf(
      reportRequest(REPORT, { ip: '198.51.100.25' }),
      { BROWSER: {} },
    );
    expect(response.status).toBe(502);
    expect(response.headers.get('Retry-After')).toBe('5');
  });

  it('rate limits repeated renders per client', async () => {
    const env = {}; // no browser: each allowed request answers 503
    for (let i = 0; i < 12; i += 1) {
      const response = await handleReportPdf(
        reportRequest(REPORT, { ip: '203.0.113.77' }),
        env,
      );
      expect(response.status).toBe(503);
    }
    const limited = await handleReportPdf(
      reportRequest(REPORT, { ip: '203.0.113.77' }),
      env,
    );
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('is wired into the Worker entrypoint before the auth gate', async () => {
    const { browser } = makeBrowser(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    launch.mockResolvedValue(browser);
    const response = await worker.fetch(
      new Request('https://corez.test/api/pdf/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.90',
        },
        body: JSON.stringify(REPORT),
      }),
      { BROWSER: {}, ENVIRONMENT: 'development' },
      {},
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    );
  });
});
