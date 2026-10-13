/**
 * One-click PDF download for research reports.
 *
 * The /research command returns a self-contained report document whose script
 * carries `var REPORT_TITLE` and `var REPORT_PARAGRAPHS`. The document's own
 * "Download .pdf" button works inside the preview, but the user had to open
 * the canvas first — the shortest path is a download button right in the chat
 * message. This module extracts the embedded report data and runs the SAME
 * builder the document uses (src/services/pdfBuilder.js), so both paths
 * produce byte-identical PDFs.
 */
import { buildResearchPdfBlob, reportFileName } from "./pdfBuilder.js";

// The wrapper injects the widths table into the document; the module keeps its
// own copy for chat-side builds. Kept in sync with pdfGenerator.js.
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

/**
 * Build the report PDF and trigger a download from the top-level document.
 * Returns true when a download was started; false when the artifact is not a
 * research report (callers hide the button in that case).
 */
export function downloadResearchReportPdf(code) {
  const data = extractResearchReportData(code);
  if (!data) return false;
  const blob = buildResearchPdfBlob(data.title, data.paragraphs, HELVETICA_WIDTHS);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = reportFileName(data.title);
  document.body.appendChild(anchor);
  anchor.click();
  if (anchor.remove) anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
