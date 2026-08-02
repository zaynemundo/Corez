import { describe, it, expect, vi } from 'vitest';
import {
  generateAIResponse,
  generateLocalAIResponse,
  generatePdfDocument,
  isPdfRequest
} from '../src/services/aiService.js';

describe('PDF document generation', () => {
  it('detects PDF and document requests', () => {
    expect(isPdfRequest('Create a PDF report about our sales data')).toBe(true);
    expect(isPdfRequest('Make me a resume PDF')).toBe(true);
    expect(isPdfRequest('Convert this HTML to a PDF file')).toBe(true);
    expect(isPdfRequest('Write a printable invoice')).toBe(true);
    expect(isPdfRequest('Generate a downloadable PDF document')).toBe(true);
  });

  it('does not treat games, apps, or questions as PDF requests', () => {
    expect(isPdfRequest('Build me a chess game')).toBe(false);
    expect(isPdfRequest('Explain black roses')).toBe(false);
    expect(isPdfRequest('Create a timer app')).toBe(false);
    expect(isPdfRequest('Design a landing page for a bakery')).toBe(false);
  });

  it('synthesizes a print-ready PDF document locally when hosted AI is down', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'down' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('Create a PDF report about our sales data', []);

    expect(response).toContain('```html');
    expect(response).toContain('Download .pdf');
    expect(response).toContain('window.print');
    expect(response).not.toContain("doesn't match any app template");
    expect(response).not.toContain('I can see the code you want to revise');
    vi.unstubAllGlobals();
  });

  it('returns the PDF template through the local fallback directly', async () => {
    const response = await generateLocalAIResponse('Make a printable resume PDF');

    expect(response).toContain('```html');
    expect(response).toContain('Download .pdf');
    expect(response).toContain('CoreZ PDF Document');
  });

  it('produces a structurally valid PDF binary', () => {
    const pdf = generatePdfDocument({
      title: 'Quarterly Report',
      lines: [
        'Revenue grew 12% quarter over quarter.',
        'Costs fell 4% thanks to the new pipeline.',
        'Outlook remains positive for next quarter.'
      ]
    });

    expect(pdf).toBeInstanceOf(Uint8Array);
    const text = new TextDecoder().decode(pdf);

    // PDF header and trailer.
    expect(text.slice(0, 5)).toBe('%PDF-');
    expect(text).toContain('%%EOF');
    expect(text).toContain('startxref');
    expect(text).toContain('xref');

    // xref table offsets must match the real byte positions of each object.
    const objectPositions = new Map();
    const objectRegex = /(\d+) 0 obj/g;
    let match;
    while ((match = objectRegex.exec(text))) {
      objectPositions.set(Number(match[1]), match.index);
    }
    const xrefLines = text.slice(text.indexOf('xref')).split('\n');
    for (let i = 3; i < xrefLines.length; i += 1) {
      const entry = xrefLines[i].match(/^(\d{10}) 00000 n/);
      if (!entry) break;
      const objectNumber = i - 2;
      expect(objectPositions.get(objectNumber)).toBe(Number(entry[1]));
    }

    // A4 page, wrapped Helvetica text stream, shared font object.
    expect(text).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(text).toContain('BT /F1 18 Tf');
    expect(text).toContain('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    // Long content paginates into multiple pages.
    const longPdf = generatePdfDocument({
      title: 'Long Document',
      lines: Array.from({ length: 120 }, (_, i) => `Paragraph ${i + 1}: ${'Sentence with plenty of words to wrap across the page width. '.repeat(3)}`)
    });
    const longText = new TextDecoder().decode(longPdf);
    const pageCount = (longText.match(/\/Type \/Page \//g) || []).length;
    expect(pageCount).toBeGreaterThan(1);
  });

  it('escapes PDF special characters in content', () => {
    const pdf = generatePdfDocument({
      title: 'A (B) \\ C',
      lines: ['Parentheses (and) backslashes \\ here']
    });
    const text = new TextDecoder().decode(pdf);
    expect(text).toContain('A \\(B\\) \\\\ C');
    expect(text).not.toContain('(and)');
  });

  it('replaces a prose-only hosted reply with a real PDF document', async () => {
    // Hosted AI is "up" but answers with the classic refusal: no HTML.
    const fetchMock = vi.fn(async () => Response.json({
      content: "I understand you want an actual PDF file. I can't directly attach or send files in this chat, but I can give you a print-ready HTML file..."
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('Create a PDF schedule for my project', []);

    expect(response).toContain('Download .pdf');
    expect(response).toContain('```html');
    expect(response).not.toContain("can't directly attach or send files");
    vi.unstubAllGlobals();
  });

  it('keeps a hosted reply that already contains an HTML document', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      content: 'Here is the document:\n\n```html\n<!DOCTYPE html><html><body><h1>Schedule</h1></body></html>\n```'
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('Create a PDF schedule for my project', []);

    expect(response).toContain('<!DOCTYPE html>');
    expect(response).not.toContain('Download .pdf');
    vi.unstubAllGlobals();
  });

  it('keeps normal app generation intact (chess still works)', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'down' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateAIResponse('Build me a chess game', []);
    expect(response).toContain('```html');
    expect(response).toContain('COREZ Chess');
    vi.unstubAllGlobals();
  });

  it('still rejects unsynthesizable apps honestly', async () => {
    const response = await generateLocalAIResponse('Build me a landing page for a bakery');
    expect(response).toContain("doesn't match any app template");
    expect(response).not.toContain('```html');
  });
});
