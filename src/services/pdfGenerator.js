/**
 * Client-side PDF generation for CoreZ.
 *
 * Produces a valid PDF 1.4 document (A4, Helvetica, wrapped text,
 * multi-page) entirely in the browser — used by the /research command to
 * deliver a downloadable research report. No external dependencies and no
 * API keys; nothing is ever fabricated.
 *
 * The PDF builder itself lives in ./pdfBuilder.js so the preview iframe's
 * "Download .pdf" button and the chat message's one-click download share one
 * implementation. This module owns the report document (HTML + the data the
 * builder consumes) and injects the shared functions into the page.
 */
import {
  buildResearchPdfBlob,
  escapePdfText,
  foldToAscii,
  pdfByteLength,
  pdfTextWidth,
  reportFileName,
  wrapPdfText,
} from "./pdfBuilder.js";

/**
 * Build the self-contained HTML document for the preview canvas: a polished
 * research report with a "Download .pdf" button and a "Print / Save as PDF"
 * button. The PDF is generated client-side from the same content.
 *
 * The report renders its markdown-ish structure (## sections, - bullets,
 * **bold**, [n] citations) as a real document; the redundant title heading
 * and the editable Title/Content form are not shown — the report stands
 * alone with clean typography.
 */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineReportText(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/(\[\d+\](?:\[\d+\])*)/g, '<span class="ref">$1</span>');
}

// Strip bold/italic markers for plain-text output (PDF).
function stripInlineMarkdown(text) {
  return String(text).replace(/\*\*/g, "").replace(/\*/g, "");
}

// Adobe core Helvetica advance widths, in units per 1000 em, for ASCII 32..126.
// The exported PDF draws with base-14 Helvetica, so the wrapper can measure a
// real line instead of guessing from a character count: a line of W/M/@ is about
// 1.8x wider than mixed prose, which is how an "88 character" line ran off the
// page. Defined here (not inside the emitted script) so it stays one reviewed
// table rather than hand-typed numbers in a template string.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667,
  778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556,
  556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];

const HORIZONTAL_RULE = /^[-*_]{3,}\s*$/;
const NUMBERED_ITEM = /^(\d+)[.)]\s+/;

// Parse the report body into structured blocks. The leading "# Title" line
// is dropped (the title is redundant); "## Section" becomes a heading,
// "### / numbered" lines become subheadings, "- item" lines become bullets,
// "1. item" lines become numbered items, horizontal rules are skipped and
// everything else is a paragraph.
function parseReportBlocks(body) {
  const rawLines = String(body || "")
    .split("\n")
    .map((line) => line.replace(/\r/g, ""));
  let start = 0;
  while (start < rawLines.length && !rawLines[start].trim()) start += 1;
  const lines = rawLines.slice(start);
  if (lines.length > 0 && /^#\s+\S/.test(lines[0])) lines.shift();

  const blocks = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || HORIZONTAL_RULE.test(trimmed)) continue;
    if (/^#{2,}\s+/.test(trimmed)) {
      const text = trimmed.replace(/^#{2,}\s+/, "");
      blocks.push({
        kind: NUMBERED_ITEM.test(text) ? "subheading" : "heading",
        text,
      });
    } else if (/^[-*]\s+/.test(trimmed)) {
      blocks.push({ kind: "bullet", text: trimmed.replace(/^[-*]\s+/, "") });
    } else if (NUMBERED_ITEM.test(trimmed)) {
      blocks.push({ kind: "numbered", text: trimmed });
    } else {
      blocks.push({ kind: "paragraph", text: trimmed });
    }
  }
  return blocks;
}

// The AI body often ends with its own "## Sources" listing; when the styled
// structured source list exists, the body copy is redundant and is dropped.
function cutSourcesBlock(blocks, hasStructuredSources) {
  if (!hasStructuredSources) return blocks;
  const index = blocks.findIndex(
    (b) => b.kind === "heading" && /^sources\s*$/i.test(b.text),
  );
  return index >= 0 ? blocks.slice(0, index) : blocks;
}

// Render structured blocks as HTML (sections, grouped bullets, grouped
// numbered items, subheadings, paragraphs with inline formatting).
function renderReportHtml(blocks) {
  const html = [];
  let listTag = null;
  let listItems = null;
  const flushList = () => {
    if (listItems !== null) {
      html.push(`<${listTag}>${listItems}</${listTag}>`);
      listItems = null;
      listTag = null;
    }
  };
  for (const block of blocks) {
    if (block.kind === "heading") {
      flushList();
      html.push(`<h2>${inlineReportText(block.text)}</h2>`);
    } else if (block.kind === "subheading") {
      flushList();
      html.push(`<h3>${inlineReportText(block.text)}</h3>`);
    } else if (block.kind === "bullet") {
      if (listTag !== "ul") flushList();
      listTag = "ul";
      listItems =
        (listItems === null ? "" : listItems) +
        `<li>${inlineReportText(block.text)}</li>`;
    } else if (block.kind === "numbered") {
      if (listTag !== "ol") flushList();
      listTag = "ol";
      listItems =
        (listItems === null ? "" : listItems) +
        `<li>${inlineReportText(block.text.replace(NUMBERED_ITEM, ""))}</li>`;
    } else {
      flushList();
      html.push(`<p>${inlineReportText(block.text)}</p>`);
    }
  }
  flushList();
  return html.join("\n");
}

export function synthesizePdfDocumentHtml({
  title = "CoreZ Research Report",
  body = "",
  sources = [],
}) {
  const safeTitle = String(title)
    .replace(/[<>&"']/g, "")
    .slice(0, 200);
  const sourceItems = Array.isArray(sources)
    ? sources
        .filter((s) => s && (s.title || s.url))
        .map(
          (s) =>
            `<li><a href="${escapeHtml(s.url || "")}">${escapeHtml(s.title || "Source")}</a>${s.url ? `<span>${escapeHtml(s.url)}</span>` : ""}</li>`,
        )
        .join("")
    : "";
  const sourcesBlock = sourceItems
    ? `<h2>Sources</h2><ol class="sources">${sourceItems}</ol>`
    : "";

  // Body blocks with the redundant AI "Sources" section removed when the
  // styled structured list is shown instead.
  const bodyBlocks = cutSourcesBlock(
    parseReportBlocks(body),
    sourceItems.length > 0,
  );
  const reportHtml = renderReportHtml(bodyBlocks);

  // PDF paragraphs: the same structured blocks, with the structured sources
  // appended so the downloaded PDF still lists every source.
  const pdfBlocks = bodyBlocks.map((block) => ({
    kind: block.kind,
    text: stripInlineMarkdown(block.text).replace(/[<>]/g, ""),
  }));
  if (sourceItems.length > 0) {
    pdfBlocks.push({ kind: "heading", text: "Sources" });
    const cleanSources = sources.filter((s) => s && (s.title || s.url));
    cleanSources.forEach((source, index) => {
      pdfBlocks.push({
        kind: "numbered",
        text: `${index + 1}. ${source.title || "Source"} — ${source.url || ""}`.replace(
          /[<>]/g,
          "",
        ),
      });
    });
  }

  // Title/body are baked into the script for the PDF builder; there is no
  // editable form anymore.
  const jsTitle = JSON.stringify(safeTitle);
  const jsParagraphs = JSON.stringify(pdfBlocks);
  const jsWidths = JSON.stringify(HELVETICA_WIDTHS);
  // The shared builder, injected into the page. The download button and the
  // chat's one-click action therefore produce byte-identical PDFs; the inline
  // script only wires the button, the filename and the Blob download. Every
  // helper the builder calls is injected too (the preview iframe has no module
  // scope), and their names stay visible to the emitted-script tests.
  const builderSource = [
    foldToAscii.toString(),
    escapePdfText.toString(),
    pdfByteLength.toString(),
    pdfTextWidth.toString(),
    wrapPdfText.toString(),
    buildResearchPdfBlob.toString(),
    reportFileName.toString(),
  ].join("\n");

  return {
    title: `COREZ Research Report — ${safeTitle}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-serif, Georgia, 'Times New Roman', serif;
    background:
      radial-gradient(1100px 480px at 12% -10%, rgba(99,102,241,.14), transparent 60%),
      radial-gradient(900px 420px at 96% -6%, rgba(168,85,247,.12), transparent 55%),
      linear-gradient(165deg, #eef1f6 0%, #e3e8f0 100%);
    color: #1e293b; min-height: 100vh; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: flex-end; gap: 10px;
    padding: 12px 22px; background: rgba(255,255,255,.72); backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(148,163,184,.35); }
  .btn { border: 0; border-radius: 999px; padding: 9px 18px; font-size: 13px; font-weight: 600;
    font-family: ui-sans-serif, system-ui, sans-serif; cursor: pointer; letter-spacing: .01em; }
  .btn.print { background: #eef2ff; color: #3730a3; }
  .btn.download { background: #4f46e5; color: #fff; box-shadow: 0 6px 18px rgba(79,70,229,.35); }
  .btn:hover { filter: brightness(0.97); }
  .paper { max-width: 840px; margin: 30px auto 64px; background: #fff; border-radius: 14px;
    box-shadow: 0 24px 64px rgba(15,23,42,.16), 0 2px 8px rgba(15,23,42,.06);
    padding: 68px 84px 76px; }
  .paper h2 { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .16em; color: #4f46e5; margin: 38px 0 14px;
    padding-bottom: 9px; border-bottom: 1px solid #e2e8f0; }
  .paper h2:first-child { margin-top: 0; }
  .paper h3 { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 15px; font-weight: 700;
    color: #1e293b; margin: 28px 0 10px; }
  .paper p { margin: 0 0 15px; font-size: 15px; line-height: 1.85; }
  .paper strong { color: #0f172a; font-weight: 700; }
  .paper ul, .paper ol { list-style: none; margin: 0 0 18px; padding: 0; }
  .paper ul li, .paper ol li { position: relative; padding-left: 24px; margin-bottom: 11px; font-size: 15px; line-height: 1.7; }
  .paper ul li::before { content: ''; position: absolute; left: 2px; top: .58em; width: 9px; height: 9px;
    border-radius: 3px; background: linear-gradient(135deg, #6366f1, #8b5cf6); }
  .paper ol { counter-reset: numbered; }
  .paper ol li::before { counter-increment: numbered; content: counter(numbered) '.';
    position: absolute; left: 0; top: 0; color: #6366f1; font-weight: 700;
    font-family: ui-sans-serif, system-ui, sans-serif; font-size: 13px; }
  .paper .ref { color: #7c3aed; font-size: .72em; font-weight: 700; vertical-align: super;
    font-family: ui-sans-serif, system-ui, sans-serif; letter-spacing: .02em; }
  .paper em { color: #475569; }
  .paper .sources { list-style: none; counter-reset: src; margin: 0; padding: 0; }
  .paper .sources li { counter-increment: src; position: relative; padding-left: 40px;
    margin-bottom: 12px; font-size: 13.5px; line-height: 1.6; }
  .paper .sources li::before { content: counter(src); position: absolute; left: 0; top: .15em;
    width: 24px; height: 24px; border-radius: 50%; background: #eef2ff; color: #4338ca;
    font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11.5px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; }
  .paper .sources a { color: #4338ca; text-decoration: none; font-weight: 600; }
  .paper .sources a:hover { text-decoration: underline; }
  .paper .sources span { display: block; color: #64748b; font-size: 12px; word-break: break-all;
    font-family: ui-sans-serif, system-ui, sans-serif; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none !important; }
    .paper { box-shadow: none; border-radius: 0; margin: 0; max-width: none; padding: 0; }
    .paper h2 { color: #111; border-color: #cbd5e1; }
    .paper h3 { color: #111; }
    .paper ul li::before, .paper ol li::before { color: #475569; background: #475569; }
    .paper .ref { color: #334155; }
    .paper .sources a { color: #111; }
    @page { size: A4; margin: 18mm 20mm; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn print" onclick="window.print()" type="button">Print / Save as PDF</button>
    <button class="btn download" onclick="downloadPdf()" type="button">Download .pdf</button>
  </div>
  <article class="paper">
    ${reportHtml}
    ${sourcesBlock}
  </article>
<script>
  var REPORT_TITLE = ${jsTitle};
  var REPORT_PARAGRAPHS = ${jsParagraphs};
  var HELVETICA_WIDTHS = ${jsWidths};

  // The shared builder (src/services/pdfBuilder.js) is injected above: the
  // preview's "Download .pdf" button and the chat's one-click download run the
  // same code, so both produce byte-identical PDFs.
${builderSource}

  // Alias kept for callers/tests that exercise the builder by name.
  function buildPdf(){ return buildResearchPdfBlob(REPORT_TITLE, REPORT_PARAGRAPHS, HELVETICA_WIDTHS); }
  function downloadPdf(){
    var blob = buildPdf();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    // A folded, filesystem-safe name: runs of punctuation collapse to one dash
    // and the ends are trimmed, so "Résumé — Q3 2026" becomes Resume-Q3-2026.pdf
    // rather than Resume---Q3-2026.pdf.
    var name = foldToAscii(REPORT_TITLE).replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    a.href = url; a.download = (name || 'research-report').slice(0,80) + '.pdf';
    document.body.appendChild(a); a.click();
    if (a.remove) a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }
</script>
</body>
</html>`,
  };
}
