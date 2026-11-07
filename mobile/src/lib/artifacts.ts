/**
 * Helpers for recognising and naming generated artifacts in chat answers.
 */
export function isHtmlLanguage(language?: string): boolean {
  const value = String(language || "")
    .trim()
    .toLowerCase();
  return value === "html" || value === "htm";
}

/**
 * True when a code block is a complete document (or a self-contained canvas
 * game) that the preview WebView can render. Partial snippets are excluded.
 */
export function isRenderableHtml(code: string): boolean {
  const value = String(code || "");
  return (
    /<!doctype\s+html/i.test(value) ||
    /<html[\s>]/i.test(value) ||
    /<body[\s>]/i.test(value) ||
    /<canvas[\s>]/i.test(value)
  );
}

/** Read the document title, falling back to a stable label. */
export function artifactTitle(code: string, fallback = "Untitled Application"): string {
  const match = String(code || "").match(/<title[^>]*>([^<]{1,120})<\/title>/i);
  const title = (match?.[1] || "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return title || fallback;
}

/** Mime types the chat's artifact links can download through the share sheet. */
const DOWNLOAD_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  md: "text/markdown",
  txt: "text/plain",
  json: "application/json",
};

export interface DownloadableAsset {
  url: string;
  fileName: string;
  mimeType: string;
}

/**
 * Recognise a same-deployment `/api/assets/` link that points at a real file
 * (generated PDF/ZIP/office document) so the app can download and share it
 * natively instead of opening the browser.
 */
export function classifyDownloadableAsset(
  resolvedUrl: string,
): DownloadableAsset | null {
  try {
    const parsed = new URL(String(resolvedUrl || ""));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.pathname.includes("/api/assets/")) return null;
    const match = /\.([a-z0-9]{2,5})$/i.exec(parsed.pathname);
    if (!match) return null;
    const extension = match[1].toLowerCase();
    const mimeType = DOWNLOAD_MIME_BY_EXTENSION[extension];
    if (!mimeType) return null;
    const rawName = parsed.pathname.split("/").pop() || `corez-file.${extension}`;
    let fileName: string;
    try {
      fileName = decodeURIComponent(rawName);
    } catch {
      fileName = rawName;
    }
    return { url: parsed.toString(), fileName, mimeType };
  } catch {
    return null;
  }
}

/** Filesystem-safe name for a saved artifact, preferring the document title. */
export function artifactFileName(
  code: string,
  fallback = "corez-page",
): string {
  const match = String(code || "").match(/<title[^>]*>([^<]{1,80})<\/title>/i);
  const raw = (match?.[1] || fallback)
    .replace(/&amp;/g, "&")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${(raw || fallback).slice(0, 60)}.html`;
}
