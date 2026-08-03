/**
 * Client-side PDF generation for CoreZ.
 *
 * Produces a valid PDF 1.4 document (A4, Helvetica, wrapped text,
 * multi-page) entirely in the browser — used by the /research command to
 * deliver a downloadable research report. No external dependencies and no
 * API keys; nothing is ever fabricated.
 */

// Escape text for a PDF content stream and drop characters outside the
// WinAnsi range (PDF standard fonts cannot encode them).
function escapePdfText(text) {
  let out = '';
  const input = String(text);
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 32 || code > 255) continue; // control + non-Latin-1 dropped
    const ch = input[i];
    out += ch === '\\' ? '\\\\' : ch === '(' ? '\\(' : ch === ')' ? '\\)' : ch;
  }
  return out;
}

function wrapPdfText(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Generate a valid PDF binary (Uint8Array) from a title and lines of text.
 */
export function generatePdfDocument({ title = 'CoreZ Document', lines = [] }) {
  const pageWidth = 595.28; // A4 pt
  const pageHeight = 841.89;
  const margin = 56.69; // 2 cm
  const maxChars = 88;
  const lineHeight = 16;
  const contentLines = [];
  contentLines.push({ text: title, size: 18, gap: 10 });
  contentLines.push({ text: '', size: 12, gap: 4 });
  for (const line of Array.isArray(lines) ? lines : []) {
    for (const wrapped of wrapPdfText(line, maxChars)) {
      contentLines.push({ text: wrapped, size: 12, gap: lineHeight });
    }
    contentLines.push({ text: '', size: 12, gap: 6 });
  }

  // Paginate into content streams.
  const pages = [];
  let current = [];
  let y = pageHeight - margin;
  for (const item of contentLines) {
    if (item.text && item.size > 14) {
      // Heading: if it would overflow the page, start a new one.
      if (y - 24 < margin) { pages.push(current); current = []; y = pageHeight - margin; }
    }
    if (item.text && y - item.size - 4 < margin) {
      pages.push(current);
      current = [];
      y = pageHeight - margin;
    }
    if (item.text) {
      current.push(`BT /F1 ${item.size} Tf ${margin} ${y} Td (${escapePdfText(item.text)}) Tj ET`);
      y -= item.gap;
    } else {
      y -= item.gap;
    }
  }
  if (current.length > 0 || pages.length === 0) pages.push(current);

  // Object layout (1-based): 1 catalog, 2 pages, then per page i:
  //   page object  (3 + 2*i), content stream (4 + 2*i); shared font last.
  const fontObjectNumber = 3 + pages.length * 2;
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesRefs = pages.map((_, index) => `${3 + index * 2} 0 R`);
  addObject(`<< /Type /Pages /Kids [${pagesRefs.join(' ')}] /Count ${pages.length} >>`);

  pages.forEach((content, index) => {
    const pageNumber = 3 + index * 2;
    const streamNumber = pageNumber + 1;
    addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${streamNumber} 0 R /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> >>`);
    const stream = content.join('\n');
    addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  // Serialize with correct byte offsets: the offset of each object is the
  // output length BEFORE its body is appended.
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets[index] = out.length;
    out += `${index + 1} 0 obj ${body} endobj\n`;
  });
  const xrefStart = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(out);
}

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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineReportText(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/(\[\d+\](?:\[\d+\])*)/g, '<span class="ref">$1</span>');
}

// Render the report body as structured HTML: the leading "# Title" line is
// dropped (the report title is redundant), "## Section" becomes a section
// heading, "- item" bullets are grouped, everything else is a paragraph.
function renderReportHtml(body) {
  const rawLines = String(body || '').split('\n').map((line) => line.replace(/\r/g, ''));
  let start = 0;
  while (start < rawLines.length && !rawLines[start].trim()) start += 1;
  const lines = rawLines.slice(start);
  if (lines.length > 0 && /^#\s+\S/.test(lines[0])) lines.shift();

  const blocks = [];
  let listItems = null;
  const flushList = () => {
    if (listItems !== null) {
      blocks.push(`<ul>${listItems}</ul>`);
      listItems = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    if (/^#{2,}\s+/.test(trimmed)) {
      flushList();
      blocks.push(`<h2>${inlineReportText(trimmed.replace(/^#{2,}\s+/, ''))}</h2>`);
    } else if (/^[-*]\s+/.test(trimmed)) {
      listItems = (listItems === null ? '' : listItems) + `<li>${inlineReportText(trimmed.replace(/^[-*]\s+/, ''))}</li>`;
    } else {
      flushList();
      blocks.push(`<p>${inlineReportText(trimmed)}</p>`);
    }
  }
  flushList();
  return blocks.join('\n');
}

export function synthesizePdfDocumentHtml({ title = 'CoreZ Research Report', body = '', sources = [] }) {
  const safeTitle = String(title).replace(/[<>&"']/g, '').slice(0, 200);
  const reportHtml = renderReportHtml(body);
  const sourceItems = Array.isArray(sources)
    ? sources
        .filter((s) => s && (s.title || s.url))
        .map((s) => `<li><a href="${escapeHtml(s.url || '')}">${escapeHtml(s.title || 'Source')}</a>${s.url ? `<span>${escapeHtml(s.url)}</span>` : ''}</li>`)
        .join('')
    : '';
  const sourcesBlock = sourceItems
    ? `<h2>Sources</h2><ol class="sources">${sourceItems}</ol>`
    : '';
  // Title/body are baked into the script for the PDF builder; there is no
  // editable form anymore.
  const jsTitle = JSON.stringify(safeTitle);
  const jsBody = JSON.stringify(body || '');

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
  .paper p { margin: 0 0 15px; font-size: 15px; line-height: 1.85; }
  .paper strong { color: #0f172a; font-weight: 700; }
  .paper ul { list-style: none; margin: 0 0 18px; padding: 0; }
  .paper ul li { position: relative; padding-left: 24px; margin-bottom: 11px; font-size: 15px; line-height: 1.7; }
  .paper ul li::before { content: ''; position: absolute; left: 2px; top: .58em; width: 9px; height: 9px;
    border-radius: 3px; background: linear-gradient(135deg, #6366f1, #8b5cf6); }
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
    .paper ul li::before { background: #475569; }
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
  var REPORT_BODY = ${jsBody};
  function escapePdfText(t){ return String(t).replace(/\\\\/g,'\\\\\\\\').replace(/\\(/g,'\\\\(').replace(/\\)/g,'\\\\)').replace(/[^\\x00-\\xff]/g,''); }
  function wrapPdfText(t, maxChars){ var words = String(t).split(/\\s+/).filter(Boolean), lines = [], cur = '';
    for (var i=0;i<words.length;i++){ var w=words[i]; if ((cur+' '+w).trim().length>maxChars){ if(cur) lines.push(cur); cur=w; } else { cur=(cur+' '+w).trim(); } }
    if (cur) lines.push(cur); return lines; }
  function buildPdf(title, bodyText){
    var pageW=595.28, pageH=841.89, margin=56.69, maxChars=88, lineH=16;
    var items=[]; items.push({t:title||'Untitled',s:18,g:10}); items.push({t:'',s:12,g:4});
    var paras=String(bodyText).split(/\\n+/).filter(Boolean);
    for (var p=0;p<paras.length;p++){ var ws=wrapPdfText(paras[p],maxChars); for (var k=0;k<ws.length;k++) items.push({t:ws[k],s:12,g:lineH}); items.push({t:'',s:12,g:6}); }
    var pages=[], cur=[], y=pageH-margin;
    for (var n=0;n<items.length;n++){ var it=items[n];
      if (it.t && y-it.s-4<margin){ pages.push(cur); cur=[]; y=pageH-margin; }
      if (it.t){ cur.push('BT /F1 '+it.s+' Tf '+margin+' '+y+' Td ('+escapePdfText(it.t)+') Tj ET'); y-=it.g; } else { y-=it.g; } }
    if (cur.length>0||pages.length===0) pages.push(cur);
    var fontObjectNumber = 3 + pages.length * 2;
    var objects=[];
    var addObj=function(b){ objects.push(b); return objects.length; };
    addObj('<< /Type /Catalog /Pages 2 0 R >>');
    var refs=[]; for (var pn=0;pn<pages.length;pn++) refs.push((3+pn*2)+' 0 R');
    addObj('<< /Type /Pages /Kids ['+refs.join(' ')+'] /Count '+pages.length+' >>');
    for (var pi=0;pi<pages.length;pi++){ var cid=3+pi*2; var sid=cid+1;
      addObj('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pageW+' '+pageH+'] /Contents '+sid+' 0 R /Resources << /Font << /F1 '+fontObjectNumber+' 0 R >> >> >>');
      var stream=pages[pi].join('\\n');
      addObj('<< /Length '+stream.length+' >>\\nstream\\n'+stream+'\\nendstream'); }
    addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    var out='%PDF-1.4\\n', offsets=[];
    for (var oi=0;oi<objects.length;oi++){ offsets[oi]=out.length; out+=(oi+1)+' 0 obj '+objects[oi]+' endobj\\n'; }
    var xrefStart=out.length;
    out+='xref\\n0 '+(objects.length+1)+'\\n0000000000 65535 f \\n';
    for (var x=0;x<offsets.length;x++) out+=String(offsets[x]).padStart(10,'0')+' 00000 n \\n';
    out+='trailer\\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\\nstartxref\\n'+xrefStart+'\\n%%EOF';
    return new Blob([out], { type: 'application/pdf' });
  }
  function downloadPdf(){
    var blob = buildPdf(REPORT_TITLE, REPORT_BODY);
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = (REPORT_TITLE || 'research-report').replace(/[^A-Za-z0-9 _-]/g,'') + '.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }
</script>
</body>
</html>`
  };
}
