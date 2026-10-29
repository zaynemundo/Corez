import { useMemo, useState } from "react";
import { Layers, Copy, Check, Wand2, Download } from "lucide-react";
import {
  downloadResearchReportPdf,
  isResearchReportDocument,
} from "../../services/pdfDownload.js";
import { stripJunkAfterDocumentEnd } from "../../utils/htmlRepair";
import {
  ensureLeadingPageMarker,
  findArtifactStartIndex,
} from "../../utils/previewTransformer";
import { useI18n } from "../../i18n/index.jsx";

// A code block only gets "Open Canvas Preview" / "Revise" actions when it is a
// genuine runnable deliverable (a full HTML page or a React/JSX component).
// Generic Q&A snippets — small functions, imports, data samples, fragments,
// or embed markup echoed inside an informational answer — stay as plain
// copyable code.
export function isExecutableCodeBlock(lang, code) {
  const normalizedLang = (lang || "").toLowerCase();
  const text = code || "";

  // Multi-page site marker detection (<!-- PAGE: index.html --> or <!-- CORESITE-PAGES: ... -->)
  if (/<!--\s*(?:PAGE|CORESITE-PAGES):\s*[^\s>]+\s*-->/i.test(text))
    return true;

  // Strip leading HTML comments or whitespace before checking for document root
  const stripped = text.replace(/^(?:\s*<!--[\s\S]*?-->\s*)+/i, "").trim();

  // Full HTML documents, with or without an explicit language tag. A block
  // must be a DOCUMENT to be a deliverable: an <html> root or a doctype.
  // Fragments that merely contain <style>/<script>/<body> tags (embeds,
  // page excerpts from search results, markup examples) are NOT runnable
  // pages and must not get preview actions.
  if (/^<!DOCTYPE html/i.test(stripped) || /^<html[\s>]/i.test(stripped))
    return true;

  // Standalone canvas games with a 2D context or animation frame loop
  if (
    /<canvas[\s>]/i.test(stripped) &&
    (/\.getContext\s*\(/i.test(text) || /requestAnimationFrame/i.test(text))
  ) {
    return true;
  }

  // React/JSX blocks are app deliverables by output contract.
  if (["jsx", "tsx", "react"].includes(normalizedLang)) {
    return true;
  }

  // Plain JS is executable only when it mounts React or renders to the DOM
  // as a standalone app — helper snippets from explanations are excluded.
  if (["js", "javascript"].includes(normalizedLang)) {
    return (
      /ReactDOM\.render\s*\(|createRoot\s*\(|hydrateRoot\s*\(/.test(text) ||
      (/export\s+default/.test(text) && /<\w[\s>]/.test(text))
    );
  }

  return false;
}

export function extractUnfencedDeliverable(text) {
  if (!text || typeof text !== "string") return null;

  // Where the artifact begins is decided in ONE place (see
  // findArtifactStartIndex): a `<!-- PAGE: ... -->` marker is NOT necessarily
  // the start of the site, because models write the home page unmarked and only
  // start marking from the second document. Slicing from the first marker
  // deleted index.html and blocked publishing.
  const matchIdx = findArtifactStartIndex(text);

  if (matchIdx === -1) return null;

  let preamble = text.slice(0, matchIdx).trim();
  // Strip trailing "Fullscreen" or "Preview" single-word labels if present at end of preamble
  preamble = preamble
    .replace(/(?:\r?\n|^)\s*(?:Fullscreen|Preview)\s*$/i, "")
    .trim();

  // Normalise the marker convention: an unmarked leading document (the home
  // page) gets its own explicit marker, so every consumer downstream sees a
  // site whose first page is named — regardless of how the model framed it.
  const code = ensureLeadingPageMarker(
    stripJunkAfterDocumentEnd(text.slice(matchIdx)).trim(),
  );
  const isExecutable = isExecutableCodeBlock("html", code);

  if (!isExecutable) return null;

  return { preamble, code };
}

export function CodeSnippetBlock({ code, lang, onRunInCanvas, onReviseCode }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  // A research report is a document, not a runnable app: its most useful
  // action is saving the PDF, and it should not need the preview first.
  const isReport = useMemo(() => isResearchReportDocument(code), [code]);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadPdf = () => {
    try {
      downloadResearchReportPdf(code);
    } catch (err) {
      console.warn("PDF download failed:", err);
    }
  };

  return (
    <div className="code-block-container">
      <div className="code-header">
        <span className="code-lang">{lang || "code"}</span>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          {isReport && (
            <button
              className="code-btn primary-preview-btn"
              style={{
                padding: "0.35rem 0.75rem",
                background: "var(--text-primary)",
                color: "var(--bg-primary)",
                fontWeight: 600,
                fontSize: "0.75rem",
                borderRadius: "5px",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
              onClick={handleDownloadPdf}
              title={t("chat.message.code.downloadPdfTitle")}
            >
              <Download size={13} strokeWidth={2} />
              <span>{t("chat.message.code.downloadPdf")}</span>
            </button>
          )}
          {onRunInCanvas && (
            <button
              className="code-btn"
              style={{
                padding: "0.35rem 0.75rem",
                background: "var(--text-primary)",
                color: "var(--bg-primary)",
                fontWeight: 600,
                fontSize: "0.75rem",
                borderRadius: "5px",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
              onClick={() => onRunInCanvas(code)}
              title={t("chat.message.code.runLive")}
            >
              <Layers size={13} strokeWidth={2} />
              <span>{t("chat.message.code.openPreview")}</span>
            </button>
          )}
          {onReviseCode && (
            <button
              className="code-btn"
              style={{
                padding: "0.35rem 0.65rem",
                fontSize: "0.75rem",
                borderRadius: "5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
              onClick={() => onReviseCode(code)}
              title={t("chat.message.code.reviseTitle")}
            >
              <Wand2 size={13} strokeWidth={1.5} />
              <span>{t("chat.message.code.revise")}</span>
            </button>
          )}
          <button
            className="code-btn"
            onClick={handleCopy}
            title={t("chat.message.code.copyTitle")}
          >
            {copied ? (
              <Check size={12} strokeWidth={1.5} />
            ) : (
              <Copy size={12} strokeWidth={1.5} />
            )}
            <span>
              {copied ? t("common.action.copied") : t("common.action.copy")}
            </span>
          </button>
        </div>
      </div>
      <pre className="code-content">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ExecutableCodeBlock({ code, onRunInCanvas, onReviseCode }) {
  const { t } = useI18n();
  // A research report is a document deliverable: saving its PDF is the primary
  // action, so the button comes first and does not require the preview.
  const isReport = useMemo(() => isResearchReportDocument(code), [code]);

  const handleDownloadPdf = () => {
    try {
      downloadResearchReportPdf(code);
    } catch (err) {
      console.warn("PDF download failed:", err);
    }
  };

  return (
    <div
      className="executable-code-action-bar"
      style={{
        margin: "0.75rem 0",
        width: "100%",
        display: "flex",
        gap: "0.6rem",
        alignItems: "stretch",
      }}
    >
      {isReport && (
        <button
          className="code-btn primary-preview-btn"
          style={{
            flex: 1,
            padding: "0.75rem 1rem",
            background: "var(--text-primary)",
            color: "var(--bg-primary)",
            fontWeight: 600,
            fontSize: "0.875rem",
            borderRadius: "var(--radius-md, 12px)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            boxShadow: "none",
            transition: "var(--transition-fast)",
          }}
          onClick={handleDownloadPdf}
          title={t("chat.message.code.downloadPdfTitle")}
        >
          <Download size={16} strokeWidth={2} />
          <span>{t("chat.message.code.downloadPdf")}</span>
        </button>
      )}
      {onRunInCanvas && (
        <button
          className="code-btn primary-preview-btn"
          style={{
            flex: 1,
            padding: "0.75rem 1rem",
            background: "var(--text-primary)",
            color: "var(--bg-primary)",
            fontWeight: 600,
            fontSize: "0.875rem",
            borderRadius: "var(--radius-md, 12px)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            boxShadow: "none",
            transition: "var(--transition-fast)",
          }}
          onClick={() => onRunInCanvas(code)}
          title={t("chat.message.code.runLive")}
        >
          <Layers size={16} strokeWidth={2} />
          <span>{t("chat.message.code.openCanvasPreview")}</span>
        </button>
      )}
      {onReviseCode && (
        <button
          className="code-btn secondary-revise-btn"
          style={{
            flex: 1,
            padding: "0.75rem 1rem",
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            fontWeight: 500,
            fontSize: "0.875rem",
            borderRadius: "var(--radius-md, 12px)",
            border: "1px solid var(--border-color)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            transition: "var(--transition-fast)",
          }}
          onClick={() => onReviseCode(code)}
          title={t("chat.message.code.reviseTitle")}
        >
          <Wand2 size={16} strokeWidth={1.5} />
          <span>{t("chat.message.code.revise")}</span>
        </button>
      )}
    </div>
  );
}
