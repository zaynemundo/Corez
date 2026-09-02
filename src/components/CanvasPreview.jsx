import { useState, useEffect, useMemo, useRef } from "react";
import {
  Code2,
  RotateCw,
  Maximize2,
  Minimize2,
  Download,
  Copy,
  Check,
  X,
  Monitor,
  Laptop,
  Tablet,
  Smartphone,
  Share2,
  ExternalLink,
  Loader2,
  Lock,
  Printer,
  QrCode,
  Code,
  Link2,
} from "lucide-react";
import {
  formatCodeForPreview,
  parseMultiPageSite,
  injectMultiPageRouter,
  validateMultiPageSite,
} from "../utils/previewTransformer";
import { publishAppInR2 } from "../services/appStorageService";
import { createZipBlob } from "../utils/zipPackager";
import { generateQrCodeSvg, generateEmbedSnippet } from "../utils/qrCode";

export default function CanvasPreview({
  code,
  title = "Untitled Application",
  onClose,
  isFullScreen,
  onToggleFullScreen,
  sessionId = null,
  isStreaming = false,
}) {
  const [activeTab, setActiveTab] = useState("preview");
  const [deviceMode, setDeviceMode] = useState("desktop"); // 'desktop' | 'laptop' | 'tablet' | 'mobile'
  const [editableCode, setEditableCode] = useState(code || "");
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null); // { slug, url }
  const [publishError, setPublishError] = useState(null);
  const [customSlug, setCustomSlug] = useState("");
  const [isUpdatingSlug, setIsUpdatingSlug] = useState(false);
  const [slugError, setSlugError] = useState(null);
  const [slugSuccess, setSlugSuccess] = useState(null);
  const [activePage, setActivePage] = useState("index.html");
  const [publishTab, setPublishTab] = useState("link"); // 'link' | 'qr' | 'embed'
  const [embedCopied, setEmbedCopied] = useState(false);

  const iframeRef = useRef(null);

  const multiPage = useMemo(
    () => parseMultiPageSite(editableCode),
    [editableCode],
  );

  // Completeness gate: before the creation is shown or published, check that
  // a multi-page output has an index.html, no empty pages, and no broken
  // internal links. Errors block publishing; warnings are shown as quality
  // notes. Single-page outputs are validated against their own page too
  // (named index.html): a lone page whose nav links to about.html/contact.html
  // — pages the model referenced but never shipped — is an incomplete site,
  // not a publishable link, and is caught here instead of being published
  // broken.
  const multiPageValidation = useMemo(() => {
    if (multiPage.isMultiPage) return validateMultiPageSite(multiPage.pages);
    if (!editableCode) return null;
    return validateMultiPageSite([{ name: "index.html", html: editableCode }]);
  }, [multiPage, editableCode]);

  const currentPage = useMemo(() => {
    return (
      multiPage.pages.find((p) => p.name === activePage) ||
      multiPage.pages[0] || { name: "index.html", html: "" }
    );
  }, [multiPage, activePage]);

  const formattedSrcDoc = useMemo(() => {
    if (!currentPage.html) return "";
    const doc = formatCodeForPreview(currentPage.html);
    return multiPage.isMultiPage
      ? injectMultiPageRouter(
          doc,
          multiPage.pages.map((p) => p.name),
        )
      : doc;
  }, [currentPage, multiPage]);

  useEffect(() => {
    setEditableCode(code || "");
    setActivePage("index.html");
    setKey((prev) => prev + 1);
  }, [code]);

  // Multi-page navigation: the sandboxed iframe cannot navigate or reach the
  // parent, so pages postMessage a { type: 'corez-nav', page } request. Only
  // messages from THIS preview iframe are trusted, and the requested page
  // must already exist in the parsed page set — message content is never
  // treated as code or HTML.
  useEffect(() => {
    const handleNavMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object" || data.type !== "corez-nav")
        return;
      if (typeof data.page !== "string" || !data.page) return;
      const target = multiPage.pages.find((p) => p.name === data.page);
      if (!target) return;
      setActivePage(target.name);
    };
    window.addEventListener("message", handleNavMessage);
    return () => window.removeEventListener("message", handleNavMessage);
  }, [multiPage]);

  // Exit fullscreen on Escape key press
  useEffect(() => {
    if (!isFullScreen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (typeof onToggleFullScreen === "function") {
          onToggleFullScreen();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullScreen, onToggleFullScreen]);

  const handlePublish = async () => {
    if (publishing || !editableCode) return;
    // Completeness gate: never publish an incomplete site (multi-page or a
    // single page with links to pages that were never shipped). The user
    // sees exactly which pages are missing or broken and can ask Corez to
    // fix the output instead of sharing a broken link.
    if (multiPageValidation && !multiPageValidation.valid) {
      const errors = multiPageValidation.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message)
        .slice(0, 3);
      setPublishError(
        `This site is incomplete: ${errors.join("; ")}. Ask Corez to fix it before publishing.`,
      );
      return;
    }
    setPublishing(true);
    setPublishError(null);
    try {
      const pagesPayload = {};
      if (multiPage.isMultiPage) {
        for (const page of multiPage.pages) {
          pagesPayload[page.name] = injectMultiPageRouter(
            formatCodeForPreview(page.html),
            multiPage.pages.map((p) => p.name),
          );
        }
      }
      // The published home page is always the site's index page — never
      // whatever page the user happened to be viewing when they hit
      // Publish (the preview's active page is not the site's home).
      const homeHtml =
        multiPage.isMultiPage && pagesPayload["index.html"]
          ? pagesPayload["index.html"]
          : formattedSrcDoc;
      const result = await publishAppInR2({
        html: homeHtml,
        title,
        slug: publishResult?.slug || null,
        sessionId,
        ...(Object.keys(pagesPayload).length > 0
          ? { pages: pagesPayload }
          : {}),
      });
      if (result && result.url) {
        setPublishResult({
          slug: result.slug,
          url: result.url,
          customized: Boolean(result.customized),
        });
        setPublishError(null);
      } else {
        // Surface the server-provided error (401 auth, 403 ownership, 429 rate-limit, 530 R2, etc.)
        // instead of hiding it behind a generic "hosted service may be unavailable".
        const serverError = result?.error ? String(result.error) : "";
        const isServiceUnavailable =
          serverError.includes("530") ||
          serverError.toLowerCase().includes("not configured");
        if (isServiceUnavailable) {
          setPublishError(
            "Publishing failed: R2 storage is not configured on the hosted service — contact support.",
          );
        } else if (serverError) {
          setPublishError(`Publishing failed: ${serverError}`);
        } else {
          setPublishError(
            "Publishing failed. The hosted service may be unavailable — try again.",
          );
        }
      }
    } catch (err) {
      console.warn("Publish error:", err);
      const msg = err?.message
        ? String(err.message)
        : "Publishing failed. Please try again.";
      setPublishError(
        msg.includes("Publish") ? msg : `Publishing failed: ${msg}`,
      );
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    if (publishResult?.slug) {
      setCustomSlug(publishResult.slug);
    }
  }, [publishResult?.slug]);

  const handleUpdateSlug = async (e) => {
    if (e) e.preventDefault();
    const cleaned = (customSlug || "").trim().toLowerCase();
    if (!cleaned || cleaned === publishResult?.slug || isUpdatingSlug) return;

    if (
      !/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(cleaned) ||
      cleaned.includes("--")
    ) {
      setSlugError(
        "Slug must be 3-50 characters with lowercase letters, numbers, and single hyphens.",
      );
      setSlugSuccess(null);
      return;
    }

    setIsUpdatingSlug(true);
    setSlugError(null);
    setSlugSuccess(null);

    try {
      const pagesPayload = {};
      if (multiPage.isMultiPage) {
        for (const page of multiPage.pages) {
          pagesPayload[page.name] = injectMultiPageRouter(
            formatCodeForPreview(page.html),
            multiPage.pages.map((p) => p.name),
          );
        }
      }
      // The published home page is always the site's index page.
      const homeHtml =
        multiPage.isMultiPage && pagesPayload["index.html"]
          ? pagesPayload["index.html"]
          : formattedSrcDoc;
      const result = await publishAppInR2({
        html: homeHtml,
        title,
        slug: cleaned,
        previousSlug: publishResult?.slug || null,
        sessionId,
        ...(Object.keys(pagesPayload).length > 0
          ? { pages: pagesPayload }
          : {}),
      });

      if (result && result.url && result.success !== false) {
        setPublishResult({
          slug: result.slug,
          url: result.url,
          customized: true,
        });
        setSlugSuccess("URL updated successfully!");
      } else {
        setSlugError(
          result?.error || "Slug already in use or unavailable. Try another.",
        );
      }
    } catch {
      setSlugError("Failed to update slug. Please try again.");
    } finally {
      setIsUpdatingSlug(false);
    }
  };

  const publishLink = publishResult
    ? new URL(publishResult.url, window.location.origin).href
    : null;

  const handleCopyLink = () => {
    if (publishLink && navigator.clipboard) {
      navigator.clipboard.writeText(publishLink).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(editableCode).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!editableCode) return;

    if (multiPage.isMultiPage && multiPage.pages.length > 0) {
      // Multi-page site export: package all individual HTML files into a ZIP archive
      const filesToZip = multiPage.pages.map((p) => ({
        name: p.name,
        content: formatCodeForPreview(p.html),
      }));
      const blob = createZipBlob(filesToZip);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fileSlug =
        (title || "corez-site")
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "-")
          .replace(/(^-|-$)/g, "") || "corez-site";
      a.download = `${fileSlug}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // Single-file HTML deliverable export
      const blob = new Blob([formatCodeForPreview(editableCode)], {
        type: "text/html",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fileSlug =
        (title || "corez-app")
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "-")
          .replace(/(^-|-$)/g, "") || "corez-app";
      a.download = `${fileSlug}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleCopyEmbed = () => {
    if (!publishLink) return;
    const snippet = generateEmbedSnippet(publishLink, { title });
    navigator.clipboard?.writeText(snippet);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  };

  const handlePrint = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
        return;
      } catch {
        // fall through
      }
    }
    window.print();
  };

  const handleRefresh = () => {
    setKey((prev) => prev + 1);
  };

  const deviceSpecs = {
    desktop: {
      label: "Desktop",
      width: "100%",
      res: "Fluid / 1920px",
      ratio: null,
    },
    laptop: {
      label: "Laptop",
      width: "1100px",
      res: "1366 × 768",
      ratio: "16 / 9",
    },
    tablet: {
      label: "Tablet",
      width: "768px",
      res: "768 × 1024",
      ratio: "3 / 4",
    },
    mobile: {
      label: "Mobile",
      width: "375px",
      res: "375 × 812",
      ratio: "375 / 812",
    },
  };

  return (
    <div className={`canvas-pane ${isFullScreen ? "full-width" : ""}`}>
      <div className="canvas-header">
        <div className="canvas-title">
          {/* View Mode toggle: Preview <-> Source (sized like Publish) */}
          <button
            type="button"
            className="code-btn publish-btn"
            onClick={() =>
              setActiveTab(activeTab === "preview" ? "code" : "preview")
            }
            title={
              activeTab === "preview" ? "View source code" : "Back to preview"
            }
            aria-label={
              activeTab === "preview" ? "View source code" : "Back to preview"
            }
          >
            {activeTab === "preview" ? "Source" : "Preview"}
          </button>
        </div>

        {/* Device Viewport Selector (Desktop vs Laptop vs Tablet vs Mobile Icon-only) */}
        {activeTab === "preview" && (
          <div className="device-mode-bar">
            <button
              onClick={() => setDeviceMode("desktop")}
              title="Desktop Screen View"
              className={`device-btn ${deviceMode === "desktop" ? "active" : ""}`}
            >
              <Monitor size={15} strokeWidth={1.5} />
            </button>

            <button
              onClick={() => setDeviceMode("laptop")}
              title="Laptop View (1366 × 768)"
              className={`device-btn ${deviceMode === "laptop" ? "active" : ""}`}
            >
              <Laptop size={15} strokeWidth={1.5} />
            </button>

            <button
              onClick={() => setDeviceMode("tablet")}
              title="Tablet View (768 × 1024)"
              className={`device-btn ${deviceMode === "tablet" ? "active" : ""}`}
            >
              <Tablet size={15} strokeWidth={1.5} />
            </button>

            <button
              onClick={() => setDeviceMode("mobile")}
              title="Mobile View (375 × 812)"
              className={`device-btn ${deviceMode === "mobile" ? "active" : ""}`}
            >
              <Smartphone size={15} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Multi-page navigation happens inside the preview itself: the
            injected router intercepts <a href="..."> clicks and posts a
            corez-nav message, so no external tab bar is needed. */}

        <div className="canvas-controls">
          {/* Publish: share the creation with anyone via a short link */}
          {editableCode && !isStreaming && (
            <button
              type="button"
              className="code-btn publish-btn"
              onClick={handlePublish}
              disabled={publishing}
              title="Publish this creation and share the link"
              aria-label={publishing ? "Publishing..." : "Publish"}
            >
              {publishing ? (
                <Loader2 size={13} className="spin-icon" />
              ) : (
                <Share2 size={13} />
              )}
              <span>{publishing ? "Publishing..." : "Publish"}</span>
            </button>
          )}

          <button
            className="icon-btn"
            onClick={handleRefresh}
            title="Reload Preview"
          >
            <RotateCw size={14} strokeWidth={1.5} />
          </button>
          <button
            className="icon-btn"
            onClick={handleCopy}
            title="Copy Source Code"
          >
            {copied ? (
              <Check size={14} strokeWidth={1.5} style={{ color: "#ffffff" }} />
            ) : (
              <Copy size={14} strokeWidth={1.5} />
            )}
          </button>
          <button
            className="icon-btn"
            onClick={handleDownload}
            title={
              multiPage.isMultiPage
                ? "Download Website (.zip)"
                : "Download .html file"
            }
          >
            <Download size={14} strokeWidth={1.5} />
          </button>
          <button
            className="icon-btn"
            onClick={handlePrint}
            title="Export to PDF / Print"
          >
            <Printer size={14} strokeWidth={1.5} />
          </button>
          <button
            className="icon-btn"
            onClick={onToggleFullScreen}
            title="Toggle Fullscreen"
          >
            {isFullScreen ? (
              <Minimize2 size={14} strokeWidth={1.5} />
            ) : (
              <Maximize2 size={14} strokeWidth={1.5} />
            )}
          </button>
          <button className="icon-btn" onClick={onClose} title="Close Preview">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div
        className={`canvas-body ${deviceMode !== "desktop" && activeTab === "preview" ? "device-wrapper" : ""}`}
      >
        {multiPageValidation && !multiPageValidation.valid && (
          <div
            role="alert"
            className="multipage-validation-banner"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              margin: "0 0 10px",
              padding: "8px 12px",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-primary)",
              fontSize: "0.78rem",
              lineHeight: 1.4,
            }}
          >
            <span
              style={{
                color: "#f87171",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              Incomplete site
            </span>
            <span>
              {multiPageValidation.issues
                .filter((issue) => issue.severity === "error")
                .map((issue) => issue.message)
                .join(" · ")}{" "}
              Publishing is blocked until fixed.
            </span>
          </div>
        )}
        {editableCode ? (
          activeTab === "preview" ? (
            <div className={`preview-container device-mode-${deviceMode}`}>
              {deviceMode !== "desktop" && (
                <div className="device-frame-header">
                  <div className="device-camera-dot" />
                  <span className="device-spec-tag">
                    {deviceSpecs[deviceMode].label} •{" "}
                    {deviceSpecs[deviceMode].res}
                  </span>
                </div>
              )}
              <div
                style={{ position: "relative", width: "100%", height: "100%" }}
              >
                <iframe
                  key={`${key}-${activePage}`}
                  ref={iframeRef}
                  title={`Live Application Preview (${deviceSpecs[deviceMode].label})`}
                  srcDoc={formattedSrcDoc}
                  className="preview-iframe"
                  sandbox="allow-scripts allow-forms allow-pointer-lock allow-downloads allow-popups"
                  style={
                    deviceMode !== "desktop"
                      ? {
                          // Fixed device width, real device aspect ratio, and
                          // height derived from it — the frame never stretches
                          // to the pane height or clips. margin:auto centers
                          // while remaining scrollable when the pane is small.
                          width: deviceSpecs[deviceMode].width,
                          maxWidth: "100%",
                          aspectRatio: deviceSpecs[deviceMode].ratio,
                          height: "auto",
                          margin: "auto",
                          borderRadius:
                            deviceMode === "mobile" ? "20px" : "12px",
                        }
                      : {}
                  }
                />
              </div>
            </div>
          ) : (
            <textarea
              className="canvas-source-editor"
              aria-label="Source code editor"
              value={editableCode}
              onChange={(e) => setEditableCode(e.target.value)}
            />
          )
        ) : isStreaming ? (
          <div className="canvas-empty-state canvas-building-state">
            <div className="canvas-building-spinner">
              <Loader2
                size={28}
                className="spin-icon"
                style={{ color: "var(--accent, #6366f1)" }}
              />
            </div>
            <h3
              style={{
                fontSize: "1rem",
                margin: "0.5rem 0 0.25rem",
                fontWeight: 500,
              }}
            >
              Live Designing & Building...
            </h3>
            <p
              style={{
                maxWidth: "300px",
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                margin: 0,
              }}
            >
              Streaming visual components, layout shaders & logic into preview
              canvas.
            </p>
          </div>
        ) : (
          <div className="canvas-empty-state">
            <div className="canvas-empty-icon">
              <Code2 size={22} strokeWidth={1.5} />
            </div>
            <h3 style={{ fontSize: "0.95rem" }}>No Active App Running</h3>
            <p style={{ maxWidth: "280px", fontSize: "0.8rem" }}>
              Ask Corez to build an application or click <b>"Run Preview"</b> on
              any code block.
            </p>
          </div>
        )}
      </div>

      {/* Publish share modal */}
      {publishLink && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Share your published creation"
          onClick={() => setPublishResult(null)}
        >
          <div
            className="modal-card publish-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <span className="modal-title">
                <Share2
                  size={15}
                  style={{
                    marginRight: "6px",
                    verticalAlign: "middle",
                    color: "var(--accent, #818cf8)",
                  }}
                />
                Your creation is live
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPublishResult(null)}
                title="Close"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            <p
              style={{
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                margin: 0,
              }}
            >
              Anyone with this link can open{" "}
              <b style={{ color: "var(--text-primary)" }}>
                {title.slice(0, 60)}
              </b>
              :
            </p>

            {/* Share Modal Tabs: Link | QR Code | Embed */}
            <div
              className="publish-modal-tabs"
              style={{
                display: "flex",
                gap: "6px",
                margin: "8px 0 12px",
                borderBottom:
                  "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
                paddingBottom: "8px",
              }}
            >
              <button
                type="button"
                className={`publish-tab-btn ${publishTab === "link" ? "active" : ""}`}
                onClick={() => setPublishTab("link")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm, 6px)",
                  border:
                    publishTab === "link"
                      ? "1px solid var(--accent, #3b82f6)"
                      : "1px solid transparent",
                  background:
                    publishTab === "link"
                      ? "rgba(59, 130, 246, 0.12)"
                      : "transparent",
                  color:
                    publishTab === "link"
                      ? "var(--text-primary, #ffffff)"
                      : "var(--text-secondary, #9ca3af)",
                  fontSize: "0.75rem",
                  fontWeight: publishTab === "link" ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                <Link2 size={13} />
                <span>Share Link</span>
              </button>
              <button
                type="button"
                className={`publish-tab-btn ${publishTab === "qr" ? "active" : ""}`}
                onClick={() => setPublishTab("qr")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm, 6px)",
                  border:
                    publishTab === "qr"
                      ? "1px solid var(--accent, #3b82f6)"
                      : "1px solid transparent",
                  background:
                    publishTab === "qr"
                      ? "rgba(59, 130, 246, 0.12)"
                      : "transparent",
                  color:
                    publishTab === "qr"
                      ? "var(--text-primary, #ffffff)"
                      : "var(--text-secondary, #9ca3af)",
                  fontSize: "0.75rem",
                  fontWeight: publishTab === "qr" ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                <QrCode size={13} />
                <span>QR Code</span>
              </button>
              <button
                type="button"
                className={`publish-tab-btn ${publishTab === "embed" ? "active" : ""}`}
                onClick={() => setPublishTab("embed")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm, 6px)",
                  border:
                    publishTab === "embed"
                      ? "1px solid var(--accent, #3b82f6)"
                      : "1px solid transparent",
                  background:
                    publishTab === "embed"
                      ? "rgba(59, 130, 246, 0.12)"
                      : "transparent",
                  color:
                    publishTab === "embed"
                      ? "var(--text-primary, #ffffff)"
                      : "var(--text-secondary, #9ca3af)",
                  fontSize: "0.75rem",
                  fontWeight: publishTab === "embed" ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                <Code size={13} />
                <span>Embed Code</span>
              </button>
            </div>

            {publishTab === "link" && (
              <>
                <div
                  className="publish-link-box"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-md)",
                    padding: "8px 10px",
                  }}
                >
                  <input
                    readOnly
                    value={publishLink}
                    onFocus={(e) => e.target.select()}
                    aria-label="Published share link"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "var(--text-primary)",
                      fontSize: "0.8rem",
                      fontFamily: "monospace",
                    }}
                  />
                  <button
                    type="button"
                    className="code-btn"
                    onClick={handleCopyLink}
                    title="Copy link"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                  <a
                    className="code-btn"
                    href={publishLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in new tab"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      textDecoration: "none",
                    }}
                  >
                    <ExternalLink size={14} />
                    <span>Open</span>
                  </a>
                </div>

                {/* Slug Customization / 1-Time Change */}
                {publishResult.customized ||
                (publishResult.slug &&
                  !/^[a-z0-9]{4,8}-[0-9]{1,6}$/.test(publishResult.slug)) ? (
                  <div
                    className="publish-slug-locked"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "7px 10px",
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <Lock
                      size={13}
                      style={{ color: "var(--text-secondary)", flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: "0.74rem",
                          fontWeight: 500,
                          color: "var(--text-primary)",
                          margin: 0,
                        }}
                      >
                        Custom slug locked (1-time change used)
                      </p>
                      <p
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-secondary)",
                          margin: "1px 0 0",
                        }}
                      >
                        Republishing automatically updates this link.
                      </p>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={handleUpdateSlug}
                    className="publish-slug-form"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "5px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <label
                        htmlFor="custom-slug-input"
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          color: "var(--text-secondary)",
                        }}
                      >
                        Customize URL slug:
                      </label>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        1-time change
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          flex: 1,
                          minWidth: 0,
                          background: "var(--bg-tertiary)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "var(--radius-md)",
                          padding: "0 8px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--text-secondary)",
                            fontFamily: "var(--font-mono)",
                            userSelect: "none",
                          }}
                        >
                          corez.pro/
                        </span>
                        <input
                          id="custom-slug-input"
                          type="text"
                          value={customSlug}
                          onChange={(e) => {
                            setCustomSlug(
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, ""),
                            );
                            setSlugError(null);
                            setSlugSuccess(null);
                          }}
                          placeholder="my-custom-slug"
                          aria-label="Custom slug"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            color: "var(--text-primary)",
                            fontSize: "0.8rem",
                            fontFamily: "var(--font-mono)",
                            padding: "7px 4px",
                          }}
                        />
                      </div>
                      <button
                        type="submit"
                        className="code-btn"
                        onClick={handleUpdateSlug}
                        disabled={
                          isUpdatingSlug ||
                          !customSlug ||
                          customSlug === publishResult.slug
                        }
                        style={{
                          whiteSpace: "nowrap",
                          padding: "6px 12px",
                          fontSize: "0.75rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {isUpdatingSlug ? (
                          <Loader2 size={13} className="spin-icon" />
                        ) : (
                          "Save Slug"
                        )}
                      </button>
                    </div>
                    {slugError && (
                      <p
                        role="alert"
                        style={{
                          fontSize: "0.74rem",
                          color: "#f87171",
                          margin: "2px 0 0",
                        }}
                      >
                        {slugError}
                      </p>
                    )}
                    {slugSuccess && (
                      <p
                        role="status"
                        style={{
                          fontSize: "0.74rem",
                          color: "#4ade80",
                          margin: "2px 0 0",
                        }}
                      >
                        {slugSuccess}
                      </p>
                    )}
                  </form>
                )}
              </>
            )}

            {publishTab === "qr" && (
              <div
                className="publish-qr-view"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "16px 12px",
                  background: "var(--bg-tertiary, #181922)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-md, 10px)",
                  gap: "10px",
                }}
              >
                <div
                  className="qr-code-svg-container"
                  style={{
                    background: "#ffffff",
                    padding: "8px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: generateQrCodeSvg(publishLink, {
                      size: 140,
                      fgColor: "#090a0f",
                      bgColor: "#ffffff",
                    }),
                  }}
                />
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary, #9ca3af)",
                    margin: 0,
                    textAlign: "center",
                  }}
                >
                  Scan with your phone's camera to preview live on mobile.
                </p>
              </div>
            )}

            {publishTab === "embed" && (
              <div
                className="publish-embed-view"
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <textarea
                  readOnly
                  value={generateEmbedSnippet(publishLink, { title })}
                  onFocus={(e) => e.target.select()}
                  aria-label="Embed iframe HTML"
                  style={{
                    width: "100%",
                    height: "80px",
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-md)",
                    padding: "8px 10px",
                    color: "var(--text-primary)",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    resize: "none",
                  }}
                />
                <button
                  type="button"
                  className="code-btn"
                  onClick={handleCopyEmbed}
                  style={{
                    alignSelf: "flex-end",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  {embedCopied ? <Check size={13} /> : <Copy size={13} />}
                  <span>
                    {embedCopied ? "Copied Embed Code" : "Copy Embed Code"}
                  </span>
                </button>
              </div>
            )}

            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                margin: 0,
              }}
            >
              Only this app is shared — your chat stays private.
            </p>
          </div>
        </div>
      )}

      {publishError && (
        <div
          role="alert"
          style={{
            position: "absolute",
            bottom: "12px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
            borderRadius: "var(--radius-md)",
            padding: "8px 14px",
            fontSize: "0.8rem",
            zIndex: 20,
          }}
        >
          {publishError}
          <button
            type="button"
            className="icon-btn"
            onClick={() => setPublishError(null)}
            title="Dismiss"
            aria-label="Dismiss"
            style={{ marginLeft: "8px", verticalAlign: "middle" }}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
