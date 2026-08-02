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
 * Build the self-contained HTML document for the preview canvas: an editable
 * research report with a "Download .pdf" button and a "Print / Save as PDF"
 * button. The PDF is generated client-side from the same content.
 */
export function synthesizePdfDocumentHtml({ title = 'CoreZ Research Report', body = '', sources = [] }) {
  const safeTitle = String(title).replace(/[<>&"']/g, '').slice(0, 200);
  const safeBody = String(body).replace(/[<>&"']/g, '');
  const sourceItems = Array.isArray(sources)
    ? sources
        .filter((s) => s && (s.title || s.url))
        .map((s) => `<li>${String(s.title || 'Source').replace(/[<>&"']/g, '')} — <a href="${String(s.url || '').replace(/[<>&"']/g, '')}">${String(s.url || '').replace(/[<>&"']/g, '')}</a></li>`)
        .join('')
    : '';
  const sourcesBlock = sourceItems
    ? `<h2>Sources</h2><ul>${sourceItems}</ul>`
    : '';

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
  body { margin: 0; font-family: 'Segoe UI', system-ui, sans-serif; background: #e8e8ec; color: #1c1c22; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 10px; align-items: center;
    padding: 12px 20px; background: #fafafa; border-bottom: 1px solid #d4d4d8; }
  .toolbar h1 { font-size: 15px; margin: 0 auto 0 0; font-weight: 600; }
  .btn { border: 0; border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600;
    cursor: pointer; background: #6366f1; color: #fff; }
  .btn.secondary { background: #e4e4e7; color: #27272a; }
  .btn:hover { filter: brightness(0.96); }
  .editor { display: flex; gap: 16px; padding: 16px 20px; max-width: 1200px; margin: 0 auto; }
  .editor label { display: block; font-size: 12px; font-weight: 600; color: #52525b; margin-bottom: 6px; }
  input[type=text], textarea { width: 100%; border: 1px solid #d4d4d8; border-radius: 8px; padding: 10px;
    font: 13px/1.5 inherit; resize: vertical; }
  .paper { background: #fff; width: 794px; min-height: 1123px; margin: 8px auto 40px;
    box-shadow: 0 4px 24px rgba(0,0,0,.18); padding: 64px 72px; font: 12px/1.55 'Times New Roman', Georgia, serif; }
  .paper h1 { font-size: 22px; margin: 0 0 20px; }
  .paper h2 { font-size: 15px; margin: 22px 0 8px; }
  .paper p { margin: 0 0 12px; white-space: pre-wrap; }
  .paper li { margin-bottom: 6px; }
  .paper a { color: #4338ca; }
  @media print {
    body { background: #fff; }
    .toolbar, .editor { display: none !important; }
    .paper { box-shadow: none; margin: 0; width: auto; min-height: 0; padding: 40px 48px; }
    @page { size: A4; margin: 20mm; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <h1>CoreZ Research Report</h1>
    <button class="btn secondary" onclick="window.print()" type="button">Print / Save as PDF</button>
    <button class="btn" onclick="downloadPdf()" type="button">Download .pdf</button>
  </div>
  <div class="editor">
    <div style="flex:1"><label for="docTitle">Title</label><input id="docTitle" type="text" value="${safeTitle}"></div>
    <div style="flex:1.6"><label for="docBody">Content</label><textarea id="docBody" rows="10">${safeBody}</textarea></div>
  </div>
  <div class="paper">
    <h1 id="previewTitle">${safeTitle}</h1>
    <p id="previewBody">${safeBody}</p>
    ${sourcesBlock ? `<div id="previewSources">${sourcesBlock}</div>` : ''}
  </div>
<script>
  var titleInput = document.getElementById('docTitle');
  var bodyInput = document.getElementById('docBody');
  titleInput.addEventListener('input', function(){ document.getElementById('previewTitle').textContent = titleInput.value || 'Untitled'; });
  bodyInput.addEventListener('input', function(){ document.getElementById('previewBody').textContent = bodyInput.value; });
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
    var blob = buildPdf(titleInput.value, bodyInput.value);
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = (titleInput.value || 'research-report').replace(/[^A-Za-z0-9 _-]/g,'') + '.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }
</script>
</body>
</html>`
  };
}
