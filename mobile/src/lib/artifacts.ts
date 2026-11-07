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
