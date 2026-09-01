// Deterministic repair of common AI-generated HTML corruption. Pure string
// logic (no DOM) so it runs in the browser bundle and in the Worker.
//
// Background: models occasionally emit a full HTML document whose <script>
// (or <style>) OPENING tag is missing, mangled, or swallowed the first lines
// of its block. The browser's parser then never enters script-data state and
// renders the whole block — from `// comment` lines to the trailing
// `</script>` — as visible page text. This module repairs those failure
// modes before the artifact is previewed, stored, or published. It is kept
// in sync with worker/htmlRepair.js (same logic, no imports).

// JS body hints: lines that can only be JavaScript, not markup.
const JS_LINE_START =
  /^\s*(\/\/|const\s+|let\s+|var\s+|function\s+|async\s+function\s+|document\.|window\.|\(function\s*\(|\(\s*\(|\$\()/;
const JS_BODY_HINT =
  /\/\/|=>\s*\{|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|function\s+[A-Za-z_$]|document\.(?:getElementById|querySelector)|addEventListener\s*\(|querySelectorAll\s*\(/;

// CSS body hints: selector lines or property declarations.
const CSS_LINE_START =
  /^\s*([.#]?[a-zA-Z][\w-]*\s*\{|@media|@keyframes|:\s*root)/;
const CSS_BODY_HINT =
  /^\s*[.#]?[a-zA-Z][\w-]*\s*\{|@media|@keyframes|(?:background|color|margin|padding|font-family|display|position|width|height)\s*:/;

function looksLikeHtmlDocument(html) {
  return /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html);
}
// Strip a leading Base64 blob that was accidentally pasted BEFORE <!DOCTYPE html>.
// Users sometimes copy a portfolio where a data:image/jpeg;base64,... header or raw
// base64 dump (7-10k chars) is prepended before the real document. That blob decodes
// to binary "data" (file: data) and breaks rendering. If the string starts with
// a large base64-looking prefix before the first HTML tag, drop it — generic for all users.
function stripLeadingBase64Blob(html) {
  if (typeof html !== "string" || html.length < 1200) return html;
  const htmlStart = html.search(/<!doctype\s+html|<html[\s>]/i);
  if (htmlStart <= 0) return html;
  if (htmlStart < 500) return html;
  const prefix = html.slice(0, htmlStart);
  if (prefix.length < 500) return html;
  // Must not contain real HTML tags
  if (/<[a-z][a-z0-9-]*[\s>]/i.test(prefix)) return html;
  // If prefix is mostly base64 chars + whitespace and no '<', it's a stray dump
  const base64Len = prefix.replace(/[^A-Za-z0-9+/=\s]/g, "").length;
  const ratio = base64Len / prefix.length;
  if (ratio > 0.85) return html.slice(htmlStart).trimStart();
  if (prefix.length > 1000 && !prefix.includes("<") && ratio > 0.7)
    return html.slice(htmlStart).trimStart();
  return html;
}

// Index (within `segment`) of the first line that starts a JS statement.
// Returns -1 when no JS-looking line exists.
function firstJsLineIndex(segment) {
  const lines = segment.split("\n");
  let offset = 0;
  for (const line of lines) {
    if (JS_LINE_START.test(line)) return offset;
    offset += line.length + 1;
  }
  return -1;
}

// Index (within `segment`) of the first line that starts a CSS rule.
function firstCssLineIndex(segment) {
  const lines = segment.split("\n");
  let offset = 0;
  for (const line of lines) {
    if (CSS_LINE_START.test(line)) return offset;
    offset += line.length + 1;
  }
  return -1;
}

// Start of the region a stray closing tag belongs to: after the last
// structural boundary (</head>, </body>, </html>) AND after the previous
// closing </script>/</style> (so an earlier legitimate block never swallows
// the orphan body). Returns an index into the current string.
function orphanRegionStart(html, closeIdx, closeToken) {
  const head = html.lastIndexOf("</head>", closeIdx);
  const body = html.lastIndexOf("</body>", closeIdx);
  const doc = html.lastIndexOf("</html>", closeIdx);
  const structural = Math.max(head, body, doc);
  const prevClose = html.lastIndexOf(closeToken, closeIdx - 1);
  const prevCloseEnd = prevClose >= 0 ? prevClose + closeToken.length : -1;
  return Math.max(structural, prevCloseEnd);
}

// Repair opening tags that swallowed the first lines of their block (the
// model forgot the closing ">"): the span from "<script"/"<style" up to the
// next ">" or the next "<" is consumed as tag attributes by the tokenizer.
// When that span spans lines and contains JS/CSS content, truncate it to a
// clean opening tag. Preserves the block body and any following tags.
function repairSwallowedOpenTags(html) {
  const tokenPattern = /<(script|style)\b/gi;
  let out = "";
  let last = 0;
  let match;
  while ((match = tokenPattern.exec(html)) !== null) {
    const start = match.index;
    const tagName = match[1].toLowerCase();
    // End of the open-tag span: the next ">" (proper close) or the next "<"
    // (another tag — a legit open tag can never span across one).
    let i = tokenPattern.lastIndex;
    let spanEnd = -1;
    while (i < html.length) {
      const ch = html[i];
      if (ch === ">") {
        spanEnd = i + 1;
        break;
      }
      if (ch === "<") {
        spanEnd = i;
        break;
      }
      i += 1;
    }
    if (spanEnd === -1) spanEnd = html.length;

    const span = html.slice(start, spanEnd);
    const hint = tagName === "script" ? JS_BODY_HINT : CSS_BODY_HINT;
    const looksSwallowed =
      span.length > (tagName === "script" ? 8 : 7) &&
      /[\r\n]/.test(span) &&
      hint.test(span);

    if (looksSwallowed) {
      // The span swallowed the first lines of the block: keep only the
      // mangled first line's replacement, preserving everything after the
      // first newline (the block body).
      const firstNewline = span.search(/[\r\n]/);
      const body = firstNewline === -1 ? "" : span.slice(firstNewline + 1);
      out += `${html.slice(last, start)}<${tagName}>\n${body}`;
    } else {
      out += html.slice(last, start) + span;
    }
    last = spanEnd;
    tokenPattern.lastIndex = spanEnd;
  }
  out += html.slice(last);
  return out;
}

// Wrap orphan block bodies: for every stray </script> or </style> that has no
// matching opening tag in its region, insert the missing opening tag directly
// before the first JS/CSS line of the block. Without this, the browser
// renders the block as visible page text.
function wrapOrphanBlocks(html) {
  let out = html;

  // Script blocks first. Process from the end so earlier insertions never
  // shift the indices of closes that come later in the document.
  const scriptCloses = [...out.matchAll(/<\/script\s*>/gi)];
  for (let i = scriptCloses.length - 1; i >= 0; i -= 1) {
    const closeIdx = scriptCloses[i].index;
    const regionStart = orphanRegionStart(out, closeIdx, "</script>");
    const segment = out.slice(regionStart, closeIdx);
    if (segment.includes("<script") || !JS_BODY_HINT.test(segment)) continue;
    const insertAt = firstJsLineIndex(segment);
    if (insertAt === -1) continue;
    const absolute = regionStart + insertAt;
    out = `${out.slice(0, absolute)}<script>\n${out.slice(absolute)}`;
  }

  // Style blocks.
  const styleCloses = [...out.matchAll(/<\/style\s*>/gi)];
  for (let i = styleCloses.length - 1; i >= 0; i -= 1) {
    const closeIdx = styleCloses[i].index;
    const regionStart = orphanRegionStart(out, closeIdx, "</style>");
    const segment = out.slice(regionStart, closeIdx);
    if (segment.includes("<style") || !CSS_BODY_HINT.test(segment)) continue;
    const insertAt = firstCssLineIndex(segment);
    if (insertAt === -1) continue;
    const absolute = regionStart + insertAt;
    out = `${out.slice(0, absolute)}<style>\n${out.slice(absolute)}`;
  }

  return out;
}

/**
 * Repair an HTML artifact that the browser would render with JavaScript or
 * CSS visible as page text. Returns the repaired string; valid HTML passes
 * through unchanged (all fixes are no-ops on well-formed documents).
 */
export function repairMalformedHtml(html) {
  if (!html || typeof html !== "string") return html;
  let out = stripLeadingBase64Blob(html);

  // 1. Mangled opening tags: "<<script>", "< script>", "&lt;script&gt;".
  out = out
    .replace(/<{2}\s*script\b/gi, "<script")
    .replace(/<\s+script\b/gi, "<script")
    .replace(/&lt;\s*script\b/gi, "<script")
    .replace(/<{2}\s*style\b/gi, "<style")
    .replace(/<\s+style\b/gi, "<style")
    .replace(/&lt;\s*style\b/gi, "<style");

  // 2. An opening tag that swallowed the first lines of its block because the
  //    model forgot the closing ">": e.g. `<script\n// Reveal + skill bars\n
  //    const io=new IntersectionObserver(entries=>{...`. The tokenizer
  //    consumes everything up to the first ">" (or the end of the document)
  //    as tag attributes, so the block body never enters script-data state.
  //    If the tag span up to its first ">" or the next "<" spans lines and
  //    contains JS/CSS content, truncate it to a clean opening tag.
  out = repairSwallowedOpenTags(out);

  // 3. Orphan block bodies (missing opening tag entirely). Only when the
  //    artifact looks like an HTML document — never for React/JSX code.
  if (looksLikeHtmlDocument(out)) {
    out = wrapOrphanBlocks(out);
  }

  // 4. Junk after the final </html> (stray "<fpoq/>", stray "}", fragments).
  //    Browsers keep rendering text after </html>, so a stray fragment would
  //    appear at the bottom of the page.
  const lastHtmlClose = out.lastIndexOf("</html>");
  if (lastHtmlClose !== -1) {
    const tail = out.slice(lastHtmlClose + "</html>".length);
    if (tail.trim() && !/<[a-z][a-z0-9-]*[\s>]/.test(tail)) {
      out = out.slice(0, lastHtmlClose + "</html>".length);
    }
  }

  return out;
}
