/**
 * Pure PDF builder for research reports.
 *
 * One implementation shared by the generated document's "Download .pdf"
 * button (inside the preview iframe) and the one-click download action in the
 * chat message. The document HTML carries its report data as
 * `var REPORT_TITLE` / `var REPORT_PARAGRAPHS`, so the chat action can rebuild
 * the same PDF without reaching into a sandboxed iframe.
 *
 * Produces a valid PDF 1.4 document (A4, Helvetica, wrapped text, multi-page)
 * entirely in the browser. Offsets are BYTE offsets measured as the document
 * is assembled — counting characters produced a startxref pointing at the
 * wrong byte ("Broken xref table") on every report with a bullet.
 */

/**
 * Base-14 Helvetica addresses a single-byte encoding, so every string is
 * folded to printable ASCII before it becomes a PDF string. Folding also keeps
 * one character equal to one byte, which the xref offsets and /Length depend
 * on: é used to be emitted as two UTF-8 bytes inside a string that counted as
 * one, so accented text rendered as garbage AND drifted every later byte
 * offset. The "Print / Save as PDF" button renders full Unicode via the
 * browser and is the path for text this export cannot represent.
 */
export function foldToAscii(t) {
  let s = String(t);
  try {
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    // normalize unavailable: fall through with the raw string
  }
  return s
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u00b7\u25cf\u25aa\u2043]/g, "-")
    .replace(/[\u00ae]/g, "(R)")
    .replace(/[\u00a9]/g, "(C)")
    .replace(/[\u2122]/g, "(TM)")
    .replace(/\u00b0/g, " deg")
    .replace(/\u00d7/g, "x")
    .replace(/\u00f7/g, "/")
    .replace(/\u20ac/g, "EUR")
    .replace(/\u00a3/g, "GBP")
    .replace(/\u00a5/g, "JPY")
    .replace(/[^\x20-\x7e]/g, "");
}

export function escapePdfText(t) {
  return foldToAscii(t)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

// UTF-8 length, because the Blob encodes the string as UTF-8 and PDF offsets
// are byte offsets. Folded text is one byte per character, so this is a
// belt-and-braces guarantee rather than the mechanism.
export function pdfByteLength(t) {
  try {
    return new TextEncoder().encode(String(t)).length;
  } catch {
    return String(t).length;
  }
}

// Real rendered width of a string in the PDF's font, in points.
export function pdfTextWidth(t, size, widths) {
  const s = String(t);
  let total = 0;
  for (let i = 0; i < s.length; i += 1) {
    const idx = s.charCodeAt(i) - 32;
    const w = idx >= 0 && idx < widths.length ? widths[idx] : 556;
    total += (w * size) / 1000;
  }
  return total;
}

// Wrap to a measured width. A word too long to fit (a URL in a source list)
// is hard-broken instead of being allowed to run off the page.
export function wrapPdfText(t, maxWidth, size, widths) {
  const words = String(t).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  function breakWord(word) {
    let piece = "";
    for (let i = 0; i < word.length; i += 1) {
      if (piece && pdfTextWidth(piece + word[i], size, widths) > maxWidth) {
        lines.push(piece);
        piece = word[i];
      } else {
        piece += word[i];
      }
    }
    return piece;
  }
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && pdfTextWidth(next, size, widths) > maxWidth) {
      lines.push(cur);
      cur = breakWord(word);
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Build the report PDF as a Blob.
 *
 * @param {string} title Report title (folded to ASCII for the filename).
 * @param {Array<{kind: string, text: string}>} paragraphs Structured blocks
 *   from the report body (heading / subheading / bullet / numbered /
 *   paragraph).
 * @param {number[]} widths Helvetica advance widths (ASCII 32..126).
 * @returns {Blob} application/pdf
 */
export function buildResearchPdfBlob(title, paragraphs, widths) {
  const REPORT_TITLE = String(title || "Untitled");
  const REPORT_PARAGRAPHS = Array.isArray(paragraphs) ? paragraphs : [];
  const HELVETICA_WIDTHS = Array.isArray(widths) ? widths : [];

  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 56.69;
  const lineH = 16;
  // Measured, not counted: A4 width minus the margins, less a small safety
  // margin so no metric wobble can push a line past the page edge.
  const wrapWidth = pageW - margin * 2 - 6;
  const items = [];
  const titleLines = wrapPdfText(
    escapePdfText(REPORT_TITLE || "Untitled"),
    wrapWidth,
    18,
    HELVETICA_WIDTHS,
  );
  for (const line of titleLines) items.push({ t: line, s: 18, g: 10 });
  items.push({ t: "", s: 12, g: 6 });
  for (const block of REPORT_PARAGRAPHS) {
    const text = escapePdfText(block.text);
    if (block.kind === "heading") {
      for (const line of wrapPdfText(text, wrapWidth, 14, HELVETICA_WIDTHS)) {
        items.push({ t: line, s: 14, g: 14 });
      }
      items.push({ t: "", s: 12, g: 6 });
    } else if (block.kind === "subheading") {
      for (const line of wrapPdfText(text, wrapWidth, 13, HELVETICA_WIDTHS)) {
        items.push({ t: line, s: 13, g: 13 });
      }
      items.push({ t: "", s: 12, g: 5 });
    } else if (block.kind === "bullet") {
      const lines = wrapPdfText(text, wrapWidth - 14, 12, HELVETICA_WIDTHS);
      lines.forEach((line, index) => {
        items.push({ t: (index === 0 ? "- " : "  ") + line, s: 12, g: lineH });
      });
      items.push({ t: "", s: 12, g: 6 });
    } else if (block.kind === "numbered") {
      // Numbered items keep their number in the text (server-side).
      for (const line of wrapPdfText(text, wrapWidth - 16, 12, HELVETICA_WIDTHS)) {
        items.push({ t: line, s: 12, g: lineH });
      }
      items.push({ t: "", s: 12, g: 6 });
    } else {
      for (const line of wrapPdfText(text, wrapWidth, 12, HELVETICA_WIDTHS)) {
        items.push({ t: line, s: 12, g: lineH });
      }
      items.push({ t: "", s: 12, g: 6 });
    }
  }

  const pages = [];
  let cur = [];
  let y = pageH - margin;
  for (const item of items) {
    if (item.t && item.s > 13 && y - 24 < margin) {
      pages.push(cur);
      cur = [];
      y = pageH - margin;
    }
    if (item.t && y - item.s - 4 < margin) {
      pages.push(cur);
      cur = [];
      y = pageH - margin;
    }
    if (item.t) {
      cur.push(`BT /F1 ${item.s} Tf ${margin} ${y} Td (${item.t}) Tj ET`);
      y -= item.g;
    } else {
      y -= item.g;
    }
  }
  if (cur.length > 0 || pages.length === 0) pages.push(cur);

  const fontObjectNumber = 3 + pages.length * 2;
  const objects = [];
  const addObj = (body) => {
    objects.push(body);
    return objects.length;
  };
  addObj("<< /Type /Catalog /Pages 2 0 R >>");
  const refs = [];
  for (let pn = 0; pn < pages.length; pn += 1) refs.push(`${3 + pn * 2} 0 R`);
  addObj(`<< /Type /Pages /Kids [${refs.join(" ")}] /Count ${pages.length} >>`);
  for (let pi = 0; pi < pages.length; pi += 1) {
    const cid = 3 + pi * 2;
    const sid = cid + 1;
    addObj(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${sid} 0 R /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> >>`,
    );
    const stream = pages[pi].join("\n");
    addObj(`<< /Length ${pdfByteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const parts = [];
  const offsets = [];
  let cursor = 0;
  const push = (chunk) => {
    parts.push(chunk);
    cursor += pdfByteLength(chunk);
  };
  push("%PDF-1.4\n");
  for (let oi = 0; oi < objects.length; oi += 1) {
    offsets[oi] = cursor;
    push(`${oi + 1} 0 obj ${objects[oi]} endobj\n`);
  }
  const xrefStart = cursor;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) {
    push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
  );
  return new Blob(parts, { type: "application/pdf" });
}

/**
 * Filesystem-safe download name for a report title: folded to ASCII, runs of
 * punctuation collapse to one dash, ends trimmed ("Résumé — Q3 2026" becomes
 * Resume-Q3-2026.pdf rather than Resume---Q3-2026.pdf).
 */
export function reportFileName(title) {
  const name = foldToAscii(title)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${(name || "research-report").slice(0, 80)}.pdf`;
}
