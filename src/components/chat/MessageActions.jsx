import { useEffect, useRef, useState } from "react";
import { Copy, Check, ThumbsUp, ThumbsDown, Share2 } from "lucide-react";
import { useI18n } from "../../i18n/index.jsx";

export async function fetchImageAsPngBlob(url) {
  if (!url || typeof url !== "string") throw new Error("Invalid image URL");

  if (url.startsWith("data:image/png")) {
    try {
      const res = await fetch(url);
      return await res.blob();
    } catch {
      /* Fallback to canvas */
    }
  }

  try {
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      if (blob.type === "image/png") {
        return blob;
      }
    }
  } catch {
    // Cross-origin or network error, fallback to Canvas below
  }

  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      return reject(new Error("Image constructor unavailable"));
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width || 300;
        canvas.height = img.naturalHeight || img.height || 300;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context unavailable");
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        }, "image/png");
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () =>
      reject(new Error("Image failed to load for clipboard copy"));
    img.src = url;
  });
}

export async function copyImageToClipboard(url) {
  if (!url) return false;
  const fullUrl =
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:")
      ? url
      : typeof window !== "undefined"
        ? new URL(url, window.location.origin).href
        : url;

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof window !== "undefined" &&
    window.ClipboardItem &&
    navigator.clipboard.write
  ) {
    try {
      const blob = await fetchImageAsPngBlob(fullUrl);
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        return true;
      }
    } catch (err) {
      console.warn(
        "Direct image clipboard write failed, falling back to text URL:",
        err,
      );
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(fullUrl);
    return true;
  }
  return false;
}

export function MessageActions({ content }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState(null); // 'like' | 'dislike' | null
  const [rateOpen, setRateOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const rateWrapperRef = useRef(null);

  useEffect(() => {
    if (!rateOpen) return;
    const handleOutsideClick = (e) => {
      if (
        rateWrapperRef.current &&
        !rateWrapperRef.current.contains(e.target)
      ) {
        setRateOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [rateOpen]);

  const handleCopy = async () => {
    if (!content) return;
    const imgMatch = content.match(/^!\[(.*?)\]\((.*?)\)\s*$/);
    if (imgMatch) {
      const fullUrl =
        imgMatch[2].startsWith("data:") || imgMatch[2].startsWith("http")
          ? imgMatch[2]
          : typeof window !== "undefined"
            ? new URL(imgMatch[2], window.location.origin).href
            : imgMatch[2];
      await copyImageToClipboard(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(content).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRateToggle = () => {
    setRateOpen((prev) => !prev);
  };

  const handleRateChoice = (choice) => {
    setRating((prev) => (prev === choice ? null : choice));
    setRateOpen(false);
  };

  const handleShare = async () => {
    const imgMatch = content.match(/^!\[(.*?)\]\((.*?)\)\s*$/);
    const shareData = {
      title: t("chat.actions.shareTitle"),
      text: imgMatch
        ? new URL(imgMatch[2], window.location.origin).href
        : content,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        /* Dismissed by the user */
      }
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(content).catch(() => {});
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  return (
    <div className="message-actions" aria-label={t("chat.actions.label")}>
      <button
        type="button"
        className={`message-action-btn copy-action ${copied ? "active" : ""}`}
        onClick={handleCopy}
        title={
          copied
            ? t("chat.actions.responseCopied")
            : t("chat.actions.copyResponse")
        }
        aria-label={
          copied
            ? t("chat.actions.responseCopied")
            : t("chat.actions.copyResponse")
        }
      >
        {copied ? (
          <Check size={14} strokeWidth={1.5} />
        ) : (
          <Copy size={14} strokeWidth={1.5} />
        )}
      </button>
      <div className="rate-wrapper" ref={rateWrapperRef}>
        <button
          type="button"
          className={`message-action-btn ${rating ? "active" : ""}`}
          onClick={handleRateToggle}
          title={
            rating
              ? rating === "good"
                ? t("chat.actions.goodResponseChange")
                : t("chat.actions.badResponseChange")
              : t("chat.actions.rateResponse")
          }
          aria-label={
            rating
              ? t("chat.actions.changeRating")
              : t("chat.actions.rateResponse")
          }
          aria-pressed={!!rating}
          aria-expanded={rateOpen}
          aria-haspopup="true"
        >
          {rating === "good" ? (
            <ThumbsUp size={14} strokeWidth={1.5} />
          ) : rating === "bad" ? (
            <ThumbsDown size={14} strokeWidth={1.5} />
          ) : (
            <ThumbsUp size={14} strokeWidth={1.5} />
          )}
        </button>
        {rateOpen && (
          <div
            className="rate-options"
            role="group"
            aria-label={t("chat.actions.rateThisResponse")}
          >
            <button
              type="button"
              className={`rate-option-btn ${rating === "good" ? "active good" : ""}`}
              onClick={() => handleRateChoice("good")}
              title={t("chat.actions.goodResponse")}
              aria-label={t("chat.actions.goodResponse")}
              aria-pressed={rating === "good"}
            >
              <ThumbsUp size={13} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className={`rate-option-btn ${rating === "bad" ? "active bad" : ""}`}
              onClick={() => handleRateChoice("bad")}
              title={t("chat.actions.badResponse")}
              aria-label={t("chat.actions.badResponse")}
              aria-pressed={rating === "bad"}
            >
              <ThumbsDown size={13} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className={`message-action-btn ${shared ? "active" : ""}`}
        onClick={handleShare}
        title={shared ? t("common.action.copied") : t("chat.actions.shareResponse")}
        aria-label={
          shared ? t("common.action.copied") : t("chat.actions.shareResponse")
        }
      >
        <Share2 size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
