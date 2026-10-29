import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Code2, Loader2 } from "lucide-react";
import {
  formatCodeForPreview,
  parseMultiPageSite,
  injectMultiPageRouter,
  validateMultiPageSite,
} from "../utils/previewTransformer";
import { publishAppInR2 } from "../services/appStorageService";
import { useAuth } from "../context/AuthContext";
import { createZipBlob } from "../utils/zipPackager";
import { repairMalformedHtml } from "../utils/htmlRepair";
import { printHtmlDocument } from "../utils/printDocument";
import { generateEmbedSnippet } from "../utils/qrCode";
import { useI18n } from "../i18n/index.jsx";
import { CanvasHeader } from "./canvas/CanvasHeader.jsx";
import {
  PREVIEW_ERROR_DEFAULT,
  MultiPageValidationBanner,
  PreviewRuntimeBanners,
} from "./canvas/PreviewErrorBanners.jsx";
import { PublishShareModal } from "./canvas/PublishShareModal.jsx";

export default function CanvasPreview({
  code,
  title = "Untitled Application",
  onClose,
  isFullScreen,
  onToggleFullScreen,
  sessionId = null,
  isStreaming = false,
}) {
  const { t } = useI18n();
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
  // Runtime failure reported by the preview iframe (blank/white previews get
  // an explicit reason instead of silence).
  const [runtimeError, setRuntimeError] = useState(null);
  // File link inside the preview that names an asset which was never
  // bundled: without this the click dies silently and downloads look broken.
  const [missingDownload, setMissingDownload] = useState(null);
  const [fixCopied, setFixCopied] = useState(false);
  const [errorCopied, setErrorCopied] = useState(false);

  // Publish gating: sharing to corez.pro (including custom URL slugs) is a
  // Standard/Premium feature. publishPlan stays null while unknown — unknown
  // is allowed through and the server enforces the real gate, so logged-out
  // guests still get the server's auth error and tests without a session
  // keep working.
  let auth = null;
  try {
    auth = useAuth();
  } catch {
    auth = null;
  }
  const [publishPlan, setPublishPlan] = useState(null);
  const [planExpired, setPlanExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadPlan = async () => {
      try {
        const r = await fetch("/api/subscriptions/me", {
          credentials: "include",
        });
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok && d) {
          setPublishPlan(
            String(d.plan || auth?.user?.plan || "free").toLowerCase(),
          );
          setPlanExpired(d.status === "expired" || d.isExpired === true);
          return;
        }
      } catch {}
      if (!cancelled && auth?.user?.plan) {
        setPublishPlan(String(auth.user.plan).toLowerCase());
      }
    };
    loadPlan();
    return () => {
      cancelled = true;
    };
  }, []);

  const isPaidPublishPlan = (plan, expired) =>
    (plan === "standard" || plan === "premium") && !expired;
  // Publishing is available on every plan. Free (and expired) plans carry a
  // small "Made with Corez" badge on the published page, applied server-side;
  // Standard/Premium publish badge-free.
  const publishShowsBadge =
    publishPlan !== null && !isPaidPublishPlan(publishPlan, planExpired);
  // Custom URL slugs remain a paid perk even though publishing is not.
  const customSlugRequiresUpgrade =
    publishPlan !== null && !isPaidPublishPlan(publishPlan, planExpired);
  const publishBadgeMessage = t("canvas.publish.badge");

  const resolvePublishPlan = async () => {
    if (publishPlan !== null)
      return { plan: publishPlan, expired: planExpired };
    try {
      const r = await fetch("/api/subscriptions/me", {
        credentials: "include",
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d) {
        const plan = String(
          d.plan || auth?.user?.plan || "free",
        ).toLowerCase();
        const expired = d.status === "expired" || d.isExpired === true;
        setPublishPlan(plan);
        setPlanExpired(expired);
        return { plan, expired };
      }
    } catch {}
    if (auth?.user?.plan) {
      const plan = String(auth.user.plan).toLowerCase();
      setPublishPlan(plan);
      return { plan, expired: false };
    }
    return { plan: null, expired: false };
  };

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
    setRuntimeError(null);
    setMissingDownload(null);
    setFixCopied(false);
    setErrorCopied(false);
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
      if (!data || typeof data !== "object") return;
      // Runtime/resource failures reported by the preview error reporter
      // (previewTransformer) so a blank frame explains itself.
      if (data.type === "corez-preview-error") {
        setRuntimeError({
          kind: typeof data.kind === "string" ? data.kind : "error",
          message: String(data.message || PREVIEW_ERROR_DEFAULT).slice(0, 500),
          source: data.source ? String(data.source).slice(0, 200) : "",
          line: Number(data.line) || 0,
        });
        setErrorCopied(false);
        return;
      }
      if (data.type !== "corez-nav") {
        // Dead file link the guard rescued from a silent no-op: name the
        // missing asset instead of leaving the user with a dead click.
        if (data.type === "corez-download-missing") {
          const name =
            typeof data.name === "string" && data.name
              ? data.name.slice(0, 80)
              : "file";
          setMissingDownload(name);
          setFixCopied(false);
        }
        return;
      }
      if (typeof data.page !== "string" || !data.page) return;
      const target = multiPage.pages.find((p) => p.name === data.page);
      if (!target) return;
      setActivePage(target.name);
    };
    window.addEventListener("message", handleNavMessage);
    return () => window.removeEventListener("message", handleNavMessage);
  }, [multiPage]);

  const copyDownloadFix = useCallback(() => {
    if (!missingDownload) return;
    const prompt =
      `The download link for "${missingDownload}" does nothing because that file ` +
      `is not embedded in the page. Embed the file's bytes directly (a data: URL) ` +
      `or generate the file client-side (Blob + download link) so the button works ` +
      `in the sandboxed preview.`;
    const clipboard = navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      clipboard
        .writeText(prompt)
        .then(() => {
          setFixCopied(true);
          window.setTimeout(() => setFixCopied(false), 1800);
        })
        .catch(() => {});
    }
  }, [missingDownload]);

  const copyRuntimeError = useCallback(() => {
    if (!runtimeError) return;
    const location = runtimeError.source
      ? `\n${runtimeError.source}${runtimeError.line ? `:${runtimeError.line}` : ""}`
      : "";
    const label = runtimeError.kind === "error" ? "runtime" : runtimeError.kind;
    const text = `Preview ${label} error: ${runtimeError.message}${location}`;
    const clipboard = navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      clipboard
        .writeText(text)
        .then(() => {
          setErrorCopied(true);
          window.setTimeout(() => setErrorCopied(false), 1800);
        })
        .catch(() => {});
    }
  }, [runtimeError]);

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
    if (multiPageValidation && !multiPageValidation.valid) {
      const errors = multiPageValidation.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message)
        .slice(0, 3);
      setPublishError(
        t("canvas.publish.errorIncomplete", { errors: errors.join("; ") }),
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
        const serverError = result?.error ? String(result.error) : "";
        const isServiceUnavailable =
          serverError.includes("530") ||
          serverError.toLowerCase().includes("not configured");
        if (isServiceUnavailable) {
          setPublishError(t("canvas.publish.errorR2"));
        } else if (serverError) {
          setPublishError(t("canvas.publish.errorWith", { error: serverError }));
        } else {
          setPublishError(t("canvas.publish.errorUnavailable"));
        }
      }
    } catch (err) {
      console.warn("Publish error:", err);
      const msg = err?.message
        ? String(err.message)
        : t("canvas.publish.errorRetry");
      setPublishError(
        msg.includes("Publish")
          ? msg
          : t("canvas.publish.errorWith", { error: msg }),
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
    const { plan: slugPlan, expired: slugExpired } =
      await resolvePublishPlan();
    if (slugPlan !== null && !isPaidPublishPlan(slugPlan, slugExpired)) {
      setSlugError(t("canvas.publish.slugUpgrade"));
      setSlugSuccess(null);
      return;
    }
    const cleaned = (customSlug || "").trim().toLowerCase();
    if (!cleaned || cleaned === publishResult?.slug || isUpdatingSlug) return;

    if (
      !/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(cleaned) ||
      cleaned.includes("--")
    ) {
      setSlugError(t("canvas.publish.slugInvalid"));
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
        setSlugSuccess(t("canvas.publish.slugUpdated"));
      } else {
        setSlugError(result?.error || t("canvas.publish.slugTaken"));
      }
    } catch {
      setSlugError(t("canvas.publish.slugFailed"));
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
      const filesToZip = multiPage.pages.map((p) => ({
        name: p.name,
        content: repairMalformedHtml(p.html),
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
      const blob = new Blob([repairMalformedHtml(editableCode)], {
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
    const source = currentPage?.html || editableCode;
    if (source) {
      try {
        if (printHtmlDocument(repairMalformedHtml(source))) return;
      } catch {}
    }
    try {
      window.print();
    } catch {}
  };

  const handleRefresh = () => {
    setRuntimeError(null);
    setKey((prev) => prev + 1);
  };

  const deviceSpecs = {
    desktop: {
      label: t("canvas.header.device.desktop"),
      width: "100%",
      res: "Fluid / 1920px",
      ratio: null,
    },
    laptop: {
      label: t("canvas.header.device.laptop"),
      width: "1100px",
      res: "1366 × 768",
      ratio: "16 / 9",
    },
    tablet: {
      label: t("canvas.header.device.tablet"),
      width: "768px",
      res: "768 × 1024",
      ratio: "3 / 4",
    },
    mobile: {
      label: t("canvas.header.device.mobile"),
      width: "375px",
      res: "375 × 812",
      ratio: "375 / 812",
    },
  };

  return (
    <div className={`canvas-pane ${isFullScreen ? "full-width" : ""}`}>
      <CanvasHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        deviceMode={deviceMode}
        setDeviceMode={setDeviceMode}
        editableCode={editableCode}
        isStreaming={isStreaming}
        publishing={publishing}
        handlePublish={handlePublish}
        handleRefresh={handleRefresh}
        handleCopy={handleCopy}
        copied={copied}
        handleDownload={handleDownload}
        isMultiPage={multiPage.isMultiPage}
        handlePrint={handlePrint}
        isFullScreen={isFullScreen}
        onToggleFullScreen={onToggleFullScreen}
        onClose={onClose}
      />

      <div
        className={`canvas-body ${deviceMode !== "desktop" && activeTab === "preview" ? "device-wrapper" : ""}`}
      >
        <MultiPageValidationBanner multiPageValidation={multiPageValidation} />

        {editableCode ? (
          activeTab === "preview" ? (
            <div className={`preview-container device-mode-${deviceMode}`}>
              <PreviewRuntimeBanners
                runtimeError={runtimeError}
                setRuntimeError={setRuntimeError}
                errorCopied={errorCopied}
                copyRuntimeError={copyRuntimeError}
                missingDownload={missingDownload}
                setMissingDownload={setMissingDownload}
                fixCopied={fixCopied}
                copyDownloadFix={copyDownloadFix}
              />
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
                  title={t("canvas.header.iframeTitle", {
                    device: deviceSpecs[deviceMode].label,
                  })}
                  srcDoc={formattedSrcDoc}
                  className="preview-iframe"
                  sandbox="allow-scripts allow-forms allow-pointer-lock allow-downloads allow-popups"
                  style={
                    deviceMode !== "desktop"
                      ? {
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
              id="canvas-source-editor"
              name="source-code"
              className="canvas-source-editor"
              aria-label={t("canvas.header.sourceEditor")}
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
              {t("canvas.empty.building")}
            </h3>
            <p
              style={{
                maxWidth: "300px",
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                margin: 0,
              }}
            >
              {t("canvas.empty.buildingDetail")}
            </p>
          </div>
        ) : (
          <div className="canvas-empty-state">
            <div className="canvas-empty-icon">
              <Code2 size={22} strokeWidth={1.5} />
            </div>
            <h3 style={{ fontSize: "0.95rem" }}>{t("canvas.empty.noApp")}</h3>
            <p style={{ maxWidth: "280px", fontSize: "0.8rem" }}>
              {t("canvas.empty.intro")}
              <b>{t("canvas.empty.runPreview")}</b>
              {t("canvas.empty.end")}
            </p>
          </div>
        )}
      </div>

      <PublishShareModal
        publishLink={publishLink}
        publishResult={publishResult}
        setPublishResult={setPublishResult}
        title={title}
        publishShowsBadge={publishShowsBadge}
        publishBadgeMessage={publishBadgeMessage}
        publishTab={publishTab}
        setPublishTab={setPublishTab}
        copied={copied}
        handleCopyLink={handleCopyLink}
        customSlugRequiresUpgrade={customSlugRequiresUpgrade}
        customSlug={customSlug}
        setCustomSlug={setCustomSlug}
        setSlugError={setSlugError}
        setSlugSuccess={setSlugSuccess}
        handleUpdateSlug={handleUpdateSlug}
        isUpdatingSlug={isUpdatingSlug}
        slugError={slugError}
        slugSuccess={slugSuccess}
        embedCopied={embedCopied}
        handleCopyEmbed={handleCopyEmbed}
        publishError={publishError}
        setPublishError={setPublishError}
      />
    </div>
  );
}
