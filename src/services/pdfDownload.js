/**
 * One-click PDF download for research reports.
 *
 * The /research command returns a self-contained report document whose script
 * carries `var REPORT_TITLE` and `var REPORT_PARAGRAPHS`. This module extracts
 * that data and asks the Worker to print it to PDF in a real browser
 * (`POST /api/pdf/report`), so Arabic, CJK, Cyrillic and emoji text survive —
 * the local builder draws with base-14 Helvetica and can only represent ASCII.
 *
 * The local builder is kept as an offline/fallback path: it is instant, needs
 * no request, and still produces the correct document for Latin report text
 * when the server renderer is unreachable or rate limited.
 */
import { buildResearchPdfBlob, reportFileName } from "@corez_ai/shared/artifacts";

export const REPORT_PDF_ENDPOINT = "/api/pdf/report";
const REPORT_PDF_REQUEST_TIMEOUT_MS = 30_000;

// The wrapper injects the widths table into the document; the module keeps its
// own copy for the fallback build. Kept in sync with pdfGenerator.js.
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

/**
 * True when an artifact is a research-report document (as opposed to a
 * website/app/game build): the report data variables are the signature.
 */
export function isResearchReportDocument(code) {
  return (
    typeof code === "string" &&
    code.includes("var REPORT_PARAGRAPHS") &&
    code.includes("var REPORT_TITLE")
  );
}

/**
 * Capture the JSON array literal that starts at `start` (which must point at
 * `[`). A regex cannot do this: the document also contains the injected
 * builder source, whose regex literals carry `]` characters, so a greedy
 * match runs past the array. This walks the string with a bracket depth
 * counter, ignoring brackets inside JSON strings.
 */
function captureJsonArray(source, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse the report data out of the document. The values were embedded with
 * JSON.stringify, so each capture is a JSON literal.
 *
 * @returns {{title: string, paragraphs: Array<{kind: string, text: string}>}|null}
 */
export function extractResearchReportData(code) {
  if (!isResearchReportDocument(code)) return null;
  const titleMatch = code.match(/var REPORT_TITLE\s*=\s*("(?:[^"\\]|\\.)*")\s*;/);
  const arrayStart = code.indexOf("[", code.indexOf("var REPORT_PARAGRAPHS"));
  if (arrayStart === -1) return null;
  const arrayLiteral = captureJsonArray(code, arrayStart);
  if (!arrayLiteral) return null;
  let title = "Research Report";
  let paragraphs;
  try {
    if (titleMatch) title = JSON.parse(titleMatch[1]);
    paragraphs = JSON.parse(arrayLiteral);
  } catch {
    return null;
  }
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) return null;
  return { title: String(title || "Research Report"), paragraphs };
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  if (anchor.remove) anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function requestServerPdf(payload) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    REPORT_PDF_REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetch(REPORT_PDF_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob && blob.size > 0 ? blob : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Save a report as a PDF. Tries the Worker's browser-rendered PDF first (full
 * Unicode), then falls back to the local ASCII builder.
 *
 * @returns {Promise<boolean>} true when a download was started; false when the
 *   data is not a report (callers hide the button in that case).
 */
export async function downloadReportPdfFromData(data) {
  if (!data || !Array.isArray(data.paragraphs) || data.paragraphs.length === 0) {
    return false;
  }
  const payload = {
    title: String(data.title || "Research Report"),
    paragraphs: data.paragraphs,
  };
  const fileName = reportFileName(payload.title);

  const serverBlob = await requestServerPdf(payload);
  if (serverBlob) {
    triggerBlobDownload(serverBlob, fileName);
    return true;
  }

  const blob = buildResearchPdfBlob(
    payload.title,
    payload.paragraphs,
    HELVETICA_WIDTHS,
  );
  triggerBlobDownload(blob, fileName);
  return true;
}

/** Extract report data from an artifact and download it as a PDF. */
export async function downloadResearchReportPdf(code) {
  const data = extractResearchReportData(code);
  if (!data) return false;
  return downloadReportPdfFromData(data);
}
