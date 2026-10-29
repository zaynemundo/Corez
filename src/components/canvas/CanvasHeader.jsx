import {
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
  Loader2,
  Printer,
} from "lucide-react";
import { useI18n } from "../../i18n/index.jsx";

export function CanvasHeader({
  activeTab,
  setActiveTab,
  deviceMode,
  setDeviceMode,
  editableCode,
  isStreaming,
  publishing,
  handlePublish,
  handleRefresh,
  handleCopy,
  copied,
  handleDownload,
  isMultiPage,
  handlePrint,
  isFullScreen,
  onToggleFullScreen,
  onClose,
}) {
  const { t } = useI18n();

  return (
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
            activeTab === "preview"
              ? t("canvas.header.viewSource")
              : t("canvas.header.backToPreview")
          }
          aria-label={
            activeTab === "preview"
              ? t("canvas.header.viewSource")
              : t("canvas.header.backToPreview")
          }
        >
          {activeTab === "preview"
            ? t("canvas.header.source")
            : t("canvas.header.preview")}
        </button>
      </div>

      {/* Device Viewport Selector (Desktop vs Laptop vs Tablet vs Mobile Icon-only) */}
      {activeTab === "preview" && (
        <div className="device-mode-bar">
          <button
            onClick={() => setDeviceMode("desktop")}
            title={t("canvas.header.desktopView")}
            className={`device-btn ${deviceMode === "desktop" ? "active" : ""}`}
          >
            <Monitor size={15} strokeWidth={1.5} />
          </button>

          <button
            onClick={() => setDeviceMode("laptop")}
            title={t("canvas.header.laptopView")}
            className={`device-btn ${deviceMode === "laptop" ? "active" : ""}`}
          >
            <Laptop size={15} strokeWidth={1.5} />
          </button>

          <button
            onClick={() => setDeviceMode("tablet")}
            title={t("canvas.header.tableView")}
            className={`device-btn ${deviceMode === "tablet" ? "active" : ""}`}
          >
            <Tablet size={15} strokeWidth={1.5} />
          </button>

          <button
            onClick={() => setDeviceMode("mobile")}
            title={t("canvas.header.mobileView")}
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
        {/* Publish: share the creation with anyone via a short link. Free
            plans publish with a small "Made with Corez" badge. */}
        {editableCode && !isStreaming && (
          <button
            type="button"
            className="code-btn publish-btn"
            onClick={handlePublish}
            disabled={publishing}
            title={t("canvas.publish.shareTitle")}
            aria-label={
              publishing
                ? t("canvas.publish.publishing")
                : t("canvas.publish.action")
            }
          >
            {publishing ? (
              <Loader2 size={13} className="spin-icon" />
            ) : (
              <Share2 size={13} />
            )}
            <span>
              {publishing
                ? t("canvas.publish.publishing")
                : t("canvas.publish.action")}
            </span>
          </button>
        )}

        <button
          className="icon-btn"
          onClick={handleRefresh}
          title={t("canvas.header.reloadPreview")}
        >
          <RotateCw size={14} strokeWidth={1.5} />
        </button>
        <button
          className="icon-btn"
          onClick={handleCopy}
          title={t("canvas.header.copySource")}
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
            isMultiPage
              ? t("canvas.header.downloadZip")
              : t("canvas.header.downloadHtml")
          }
        >
          <Download size={14} strokeWidth={1.5} />
        </button>
        <button
          className="icon-btn"
          onClick={handlePrint}
          title={t("canvas.header.exportPrint")}
        >
          <Printer size={14} strokeWidth={1.5} />
        </button>
        <button
          className="icon-btn"
          onClick={onToggleFullScreen}
          title={t("canvas.header.toggleFullscreen")}
        >
          {isFullScreen ? (
            <Minimize2 size={14} strokeWidth={1.5} />
          ) : (
            <Maximize2 size={14} strokeWidth={1.5} />
          )}
        </button>
        <button
          className="icon-btn"
          onClick={onClose}
          title={t("canvas.header.closePreview")}
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
