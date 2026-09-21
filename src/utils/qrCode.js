/**
 * SVG QR Code Generator
 *
 * Produces real, scannable QR codes for published creation links. The matrix
 * is produced by the vendored, battle-tested MIT encoder
 * (`qrcode-generator` by Kazuhiko Arase, see src/utils/vendor/) — the previous
 * hand-drawn pattern had finder/timing decoration but no data encoding, ECC,
 * or masking, so no scanner could ever read it.
 */

import { qrcode } from "./vendor/qrcode-generator.mjs";

// The library's default stringToBytes codec is Latin-1, which corrupts any
// non-ASCII payload (the scanner then rejects or mis-decodes the code).
// Published URLs are ASCII, but user-supplied links/labels are not: encode
// genuine UTF-8 bytes instead.
qrcode.stringToBytes = (value) =>
  Array.from(new TextEncoder().encode(String(value)));

const DEFAULT_ECC = "M";

/**
 * Build the QR module matrix (1 = dark, 0 = light) for `text`.
 * Type number 0 lets the encoder pick the smallest version that fits, at the
 * given error-correction level. Exported for direct testing.
 */
export function createQRMatrix(text, options = {}) {
  const ecc = options.ecc || DEFAULT_ECC;
  const qr = qrcode(0, ecc);
  qr.addData(String(text));
  qr.make();
  const count = qr.getModuleCount();
  const matrix = Array.from({ length: count }, (_, r) =>
    Array.from({ length: count }, (_, c) => (qr.isDark(r, c) ? 1 : 0)),
  );
  return matrix;
}

/**
 * Generates an SVG for a given URL or text payload. Returns "" for missing or
 * non-string input.
 */
export function generateQrCodeSvg(text, options = {}) {
  if (!text || typeof text !== "string") return "";
  const size = options.size || 160;
  const fgColor = options.fgColor || "#ffffff";
  const bgColor = options.bgColor || "transparent";
  // QR readers need a quiet zone; the spec asks for at least 4 modules.
  const margin = options.margin !== undefined ? options.margin : 4;

  const matrix = createQRMatrix(text, options);
  const matrixSize = matrix.length;
  const totalCells = matrixSize + margin * 2;
  const cellSize = size / totalCells;

  let rects = "";
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c] === 1) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="${fgColor}" />`;
      }
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    (bgColor !== "transparent"
      ? `<rect width="${size}" height="${size}" fill="${bgColor}" rx="8" />`
      : "") +
    rects +
    `</svg>`;

  return svg;
}

/**
 * Encodes a generated QR SVG as a `data:` URL so it can be rendered with an
 * `<img src>` instead of injecting markup into the document. An SVG loaded via
 * `<img>` cannot execute script or event handlers, so the QR — whose colour
 * options and matrix are the only inputs — no longer needs an HTML sink.
 */
export function generateQrCodeDataUrl(text, options = {}) {
  const svg = generateQrCodeSvg(text, options);
  if (!svg) return "";
  // encodeURIComponent keeps the URL valid without requiring atob/btoa in
  // every runtime that imports this module.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Generates standard embed iframe HTML for published creation.
 * Returns "" when no URL is supplied.
 */export function generateEmbedSnippet(
  publishedUrl,
  { width = "100%", height = "600", title = "CoreZ Creation" } = {},
) {
  if (typeof publishedUrl !== "string" || !publishedUrl) return "";
  const fullUrl = publishedUrl.startsWith("http")
    ? publishedUrl
    : `https://corez.pro${publishedUrl.startsWith("/") ? "" : "/"}${publishedUrl}`;

  return `<iframe src="${fullUrl}" title="${title.replace(/"/g, "&quot;")}" width="${width}" height="${height}" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" style="border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; max-width: 100%;"></iframe>`;
}
