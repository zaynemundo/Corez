// Server-printed research report PDFs.
//
// The client-side builder (src/services/pdfBuilder.js via
// packages/corez-shared/src/artifacts/pdfBuilder.js) draws with base-14
// Helvetica, which addresses a single-byte encoding: every character outside
// printable ASCII is folded away. Arabic, Chinese, Cyrillic or emoji report
// text therefore downloaded as a blank page — the report looked complete in
// the canvas but the PDF was not. This route renders the report in a real
// Browser Run Chromium instance instead, so the PDF uses proper font fallback
// (Browser Run ships KACST Arabic, Noto CJK and Indic fonts) and real
// bidirectional layout.
//
// Input is structured data, never client HTML: the Worker builds the document
// itself, so the endpoint cannot be used as an open proxy or as a renderer
// for attacker-supplied markup.

import puppeteer from "@cloudflare/puppeteer";
import {
  createRateLimiter,
  jsonResponse,
  readBoundedJson,
  safeErrorDetail,
} from "./utils.js";

export const REPORT_PDF_PATH = "/api/pdf/report";
export const REPORT_PDF_MAX_BODY_BYTES = 512 * 1024;
export const REPORT_PDF_MAX_TITLE_CHARS = 300;
export const REPORT_PDF_MAX_BLOCKS = 600;
export const REPORT_PDF_MAX_BLOCK_CHARS = 8_000;
export const REPORT_PDF_MAX_TOTAL_CHARS = 120_000;
export const REPORT_PDF_RENDER_TIMEOUT_MS = 25_000;

const BLOCK_KINDS = new Set([
  "heading",
  "subheading",
  "bullet",
  "numbered",
  "paragraph",
]);

// One PDF is one browser session, so the anonymous path must be bounded: a
// published report is readable by anyone, and its download button uses this
// route too. Twelve per minute keeps a shared office/NAT network from tripping
// the limit while still capping browser usage from a single client.
const reportPdfRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 12 });

function cleanText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    // Control characters would corrupt the rendered layout and are never part
    // of report copy.
    // eslint-disable-next-line no-control-regex -- stripping C0 controls is the point
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validate and bound the report payload. Returns null when there is nothing
 * printable, so an empty or malformed request can never launch a browser.
 *
 * @param {unknown} body Parsed request JSON.
 * @returns {{title: string, paragraphs: Array<{kind: string, text: string}>}|null}
 */
export function normalizeReportPdfPayload(body) {
  const title =
    cleanText(body?.title).slice(0, REPORT_PDF_MAX_TITLE_CHARS) ||
    "Research Report";
  const blocks = Array.isArray(body?.paragraphs) ? body.paragraphs : [];
  const paragraphs = [];
  let totalChars = 0;
  for (const block of blocks) {
    if (paragraphs.length >= REPORT_PDF_MAX_BLOCKS) break;
    const kind =
      typeof block?.kind === "string" && BLOCK_KINDS.has(block.kind)
        ? block.kind
        : "paragraph";
    const text = cleanText(block?.text).slice(0, REPORT_PDF_MAX_BLOCK_CHARS);
    if (!text) continue;
    if (totalChars + text.length > REPORT_PDF_MAX_TOTAL_CHARS) break;
    totalChars += text.length;
    paragraphs.push({ kind, text });
  }
  if (paragraphs.length === 0) return null;
  return { title, paragraphs };
}

export function escapeReportHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Numbered blocks arrive with their original label ("3. Source — url"). Keep
// the numbers stable by starting a new <ol> whenever the sequence breaks,
// instead of letting the browser renumber every group from 1.
function splitNumbered(text) {
  const match = text.match(/^(\d{1,3})[.)]\s+/);
  if (!match) return { number: null, text };
  return { number: Number(match[1]), text: text.slice(match[0].length) };
}

/**
 * Build the print document for Browser Run. Every block carries `dir="auto"`
 * so Arabic/Hebrew paragraphs align and order correctly while English
 * headings keep their normal reading direction.
 */
export function renderReportPrintHtml({ title, paragraphs }) {
  const parts = [];
  let listTag = null;
  let listItems = [];
  let listStart = 1;
  let nextNumber = 1;

  const flushList = () => {
    if (!listTag) return;
    const start = listTag === "ol" && listStart !== 1 ? ` start="${listStart}"` : "";
    parts.push(`<${listTag}${start}>\n${listItems.join("\n")}\n</${listTag}>`);
    listTag = null;
    listItems = [];
    listStart = 1;
  };

  for (const block of paragraphs) {
    if (block.kind === "heading") {
      flushList();
      parts.push(`<h2 dir="auto">${escapeReportHtml(block.text)}</h2>`);
    } else if (block.kind === "subheading") {
      flushList();
      parts.push(`<h3 dir="auto">${escapeReportHtml(block.text)}</h3>`);
    } else if (block.kind === "bullet") {
      if (listTag !== "ul") {
        flushList();
        listTag = "ul";
      }
      listItems.push(`<li dir="auto">${escapeReportHtml(block.text)}</li>`);
    } else if (block.kind === "numbered") {
      const { number, text } = splitNumbered(block.text);
      if (listTag !== "ol" || (number !== null && number !== nextNumber)) {
        flushList();
        listTag = "ol";
        listStart = number ?? 1;
      }
      listItems.push(`<li dir="auto">${escapeReportHtml(text)}</li>`);
      nextNumber = (number ?? nextNumber) + 1;
    } else {
      flushList();
      parts.push(`<p dir="auto">${escapeReportHtml(block.text)}</p>`);
    }
  }
  flushList();

  const safeTitle = escapeReportHtml(title || "Research Report");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; color: #111827; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 11.5pt;
    line-height: 1.65;
    overflow-wrap: anywhere;
  }
  h1.title {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 20pt;
    line-height: 1.25;
    margin: 0 0 20pt;
    color: #111827;
  }
  h2 {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 11pt;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: #4338ca;
    margin: 22pt 0 8pt;
    padding-bottom: 4pt;
    border-bottom: 1px solid #d1d5db;
    break-after: avoid;
  }
  h3 {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 12pt;
    margin: 16pt 0 6pt;
    break-after: avoid;
  }
  p { margin: 0 0 9pt; }
  ul, ol { margin: 0 0 10pt; padding-left: 20pt; }
  li { margin-bottom: 5pt; break-inside: avoid; }
  a { color: #4338ca; text-decoration: none; }
</style>
</head>
<body>
<h1 class="title" dir="auto">${safeTitle}</h1>
${parts.join("\n")}
</body>
</html>`;
}

/**
 * Filesystem-safe download name. Deliberately ASCII: RFC 6266 quoted filenames
 * are simplest to keep byte-identical across browsers, and the report title is
 * still the visible first line of the PDF.
 */
export function reportPdfFileName(title) {
  let folded;
  try {
    folded = String(title || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  } catch {
    folded = String(title || "");
  }
  const slug = folded
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${(slug || "research-report").slice(0, 80)}.pdf`;
}

function withTimeout(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("PDF rendering timed out.")),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Render the report with Browser Run. Network access is disabled and
 * JavaScript is off: the document is fully self-contained, so nothing in the
 * renderer can fetch or execute anything.
 *
 * @returns {Promise<Uint8Array>} application/pdf bytes
 */
export async function renderReportPdfBytes(env, payload) {
  if (!env?.BROWSER) {
    const error = new Error("PDF rendering is not configured.");
    error.status = 503;
    throw error;
  }
  let browser = null;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setOfflineMode(true);
    await page.setContent(renderReportPrintHtml(payload), {
      waitUntil: "load",
      timeout: 15_000,
    });
    const pdf = await withTimeout(
      page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" },
      }),
      REPORT_PDF_RENDER_TIMEOUT_MS,
    );
    return pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * POST /api/pdf/report — structured report data in, PDF bytes out.
 *
 * Anonymous callers are allowed because published research reports are public
 * and their Download button uses this route; the per-client rate limit bounds
 * browser usage. Only validated text reaches the renderer.
 */
export async function handleReportPdf(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." }, { Allow: "POST" });
  }
  const retryAfter = reportPdfRateLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(
      429,
      { error: "Too many PDF downloads. Try again shortly." },
      { "Retry-After": String(retryAfter) },
    );
  }
  if (!env?.BROWSER) {
    return jsonResponse(503, {
      error: "PDF rendering is unavailable right now.",
      retry: true,
    });
  }
  let body;
  try {
    body = await readBoundedJson(request, REPORT_PDF_MAX_BODY_BYTES);
  } catch {
    return jsonResponse(400, { error: "Invalid or oversized PDF request." });
  }
  const payload = normalizeReportPdfPayload(body);
  if (!payload) {
    return jsonResponse(400, { error: "No report content to render." });
  }
  try {
    const bytes = await renderReportPdfBytes(env, payload);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportPdfFileName(payload.title)}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    console.error("Report PDF rendering failed:", safeErrorDetail(error));
    return jsonResponse(
      502,
      { error: "Could not render the PDF. Try again.", retry: true },
      { "Retry-After": "5" },
    );
  }
}
