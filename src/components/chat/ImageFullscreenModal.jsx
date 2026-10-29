import { useEffect, useRef, useState } from "react";
import { Copy, Check, Download, Minimize2 } from "lucide-react";
import { useI18n } from "../../i18n/index.jsx";
import { copyImageToClipboard } from "./MessageActions.jsx";

export function ImageFullscreenModal({ fullscreenImage, onClose }) {
  const { t } = useI18n();
  const [imageCopied, setImageCopied] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    if (!fullscreenImage) return;
    setImageCopied(false);
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (typeof document !== "undefined" && document.fullscreenElement) {
          document.exitFullscreen?.().catch?.(() => {});
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreenImage, onClose]);

  if (!fullscreenImage) return null;

  const handleExitFullscreen = () => {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen?.().catch?.(() => {});
    }
    onClose();
  };

  const handleCopyImage = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!fullscreenImage?.url) return;
    await copyImageToClipboard(fullscreenImage.url);
    setImageCopied(true);
    setTimeout(() => setImageCopied(false), 2000);
  };

  const handleDownloadImage = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!fullscreenImage?.url) return;
    const filename = fullscreenImage.alt
      ? `${fullscreenImage.alt
          .replace(/[^a-z0-9_-]/gi, "_")
          .toLowerCase()
          .slice(0, 40)}.png`
      : "corez_generated_image.png";

    try {
      if (fullscreenImage.url.startsWith("data:")) {
        const a = document.createElement("a");
        a.href = fullscreenImage.url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      const res = await fetch(fullscreenImage.url);
      if (!res.ok) throw new Error("Fetch failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      const a = document.createElement("a");
      a.href = fullscreenImage.url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div
      ref={modalRef}
      className="image-fullscreen-modal"
      role="dialog"
      aria-modal="true"
      aria-label={
        fullscreenImage.alt || t("chat.message.image.fullscreenPreview")
      }
      onClick={onClose}
    >
      <div className="image-fullscreen-backdrop" />
      <div
        className="image-fullscreen-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="image-fullscreen-toolbar">
          <span className="image-fullscreen-title">
            {fullscreenImage.alt || t("chat.message.image.generatedImage")}
          </span>
          <div className="image-fullscreen-actions">
            <button
              type="button"
              className="image-fullscreen-btn"
              onClick={handleCopyImage}
              title={
                imageCopied
                  ? t("chat.message.image.copiedToClipboard")
                  : t("chat.message.image.copyToClipboard")
              }
              aria-label={
                imageCopied
                  ? t("chat.message.image.copiedToClipboard")
                  : t("chat.message.image.copy")
              }
            >
              {imageCopied ? (
                <Check size={15} strokeWidth={1.75} />
              ) : (
                <Copy size={15} strokeWidth={1.75} />
              )}
              <span>
                {imageCopied
                  ? t("chat.message.image.copied")
                  : t("chat.message.image.copyImage")}
              </span>
            </button>
            <button
              type="button"
              className="image-fullscreen-btn"
              onClick={handleDownloadImage}
              title={t("chat.message.image.download")}
              aria-label={t("chat.message.image.download")}
            >
              <Download size={15} strokeWidth={1.75} />
              <span>{t("common.action.download")}</span>
            </button>
            <button
              type="button"
              className="image-fullscreen-btn exit-fullscreen-btn"
              onClick={handleExitFullscreen}
              title={t("chat.message.image.exitFullscreenTitle")}
              aria-label={t("chat.message.image.exitFullscreen")}
            >
              <Minimize2 size={15} strokeWidth={1.75} />
              <span>{t("chat.message.image.exitFullscreenLabel")}</span>
            </button>
          </div>
        </div>
        <div className="image-fullscreen-content" onClick={onClose}>
          <img
            src={fullscreenImage.url}
            alt={fullscreenImage.alt || t("chat.message.image.generatedImage")}
            className="image-fullscreen-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </div>
  );
}
