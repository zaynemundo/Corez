import { useEffect, useId, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Share2,
  X,
} from "lucide-react";
import { useI18n } from "../i18n/index.jsx";

function parseShare(data) {
  return {
    shared: Boolean(data?.shared),
    url: typeof data?.url === "string" ? data.url : "",
    title: typeof data?.title === "string" ? data.title : "",
  };
}

export default function ChatShareModal({ chatId, onClose }) {
  const { t } = useI18n();
  const titleId = useId();
  const [status, setStatus] = useState({
    loading: true,
    shared: false,
    url: "",
    title: "",
    busy: false,
    error: "",
    copied: false,
  });

  useEffect(() => {
    if (!chatId) return undefined;
    const controller = new AbortController();
    setStatus({
      loading: true,
      shared: false,
      url: "",
      title: "",
      busy: false,
      error: "",
      copied: false,
    });

    fetch(`/api/chats/${encodeURIComponent(chatId)}/share`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "status-failed");
        return data;
      })
      .then((data) => {
        setStatus((prev) => ({
          ...prev,
          loading: false,
          ...parseShare(data),
        }));
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setStatus((prev) => ({
          ...prev,
          loading: false,
          error: t("chat.share.error"),
        }));
      });

    return () => controller.abort();
  }, [chatId, t]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const updateShare = async (method) => {
    setStatus((prev) => ({ ...prev, busy: true, error: "" }));
    try {
      const response = await fetch(
        `/api/chats/${encodeURIComponent(chatId)}/share`,
        { method },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "update-failed");
      setStatus((prev) => ({
        ...prev,
        busy: false,
        copied: false,
        ...parseShare(data),
      }));
    } catch {
      setStatus((prev) => ({
        ...prev,
        busy: false,
        error: t("chat.share.error"),
      }));
    }
  };

  const copyLink = async () => {
    if (!status.url) return;
    try {
      await navigator.clipboard.writeText(status.url);
      setStatus((prev) => ({ ...prev, copied: true, error: "" }));
      setTimeout(
        () => setStatus((prev) => ({ ...prev, copied: false })),
        2000,
      );
    } catch {
      setStatus((prev) => ({ ...prev, error: t("chat.share.copyFailed") }));
    }
  };

  const nativeShare = async () => {
    if (!status.url || !navigator.share) {
      copyLink();
      return;
    }
    try {
      await navigator.share({
        title: status.title || t("chat.share.title"),
        url: status.url,
      });
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card share-chat-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title" id={titleId}>
            {t("chat.share.title")}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            title={t("common.action.close")}
            aria-label={t("common.action.close")}
          >
            <X size={16} strokeWidth={1.6} />
          </button>
        </div>

        <p className="share-chat-description">
          {t("chat.share.description")}
        </p>

        {status.loading ? (
          <div className="share-chat-loading" role="status">
            <Loader2 className="spin-icon" size={16} strokeWidth={1.8} />
            <span>{t("common.status.loadingCorez")}</span>
          </div>
        ) : status.shared ? (
          <>
            <div className="share-chat-link-row">
              <Link2 size={15} strokeWidth={1.6} aria-hidden="true" />
              <input
                className="share-chat-link"
                value={status.url}
                readOnly
                aria-label={t("chat.share.linkLabel")}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                className="share-chat-copy"
                onClick={copyLink}
                title={
                  status.copied
                    ? t("chat.share.copied")
                    : t("chat.share.copy")
                }
                aria-label={
                  status.copied
                    ? t("chat.share.copied")
                    : t("chat.share.copy")
                }
              >
                {status.copied ? (
                  <Check size={15} strokeWidth={1.8} />
                ) : (
                  <Copy size={15} strokeWidth={1.6} />
                )}
              </button>
            </div>

            <p className="share-chat-snapshot">
              {t("chat.share.snapshot")}
            </p>

            <div className="share-chat-actions">
              <button
                type="button"
                className="share-chat-primary"
                onClick={nativeShare}
                disabled={status.busy}
              >
                <Share2 size={14} strokeWidth={1.8} aria-hidden="true" />
                {t("chat.share.send")}
              </button>
              <a
                className="share-chat-secondary"
                href={status.url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} strokeWidth={1.8} aria-hidden="true" />
                {t("chat.share.open")}
              </a>
            </div>

            <button
              type="button"
              className="share-chat-stop"
              onClick={() => updateShare("DELETE")}
              disabled={status.busy}
            >
              {status.busy
                ? t("chat.share.stopping")
                : t("chat.share.stop")}
            </button>
          </>
        ) : (
          <>
            <div className="share-chat-warning">
              {t("chat.share.warning")}
            </div>
            <button
              type="button"
              className="share-chat-primary"
              onClick={() => updateShare("POST")}
              disabled={status.busy}
            >
              {status.busy ? (
                <Loader2
                  className="spin-icon"
                  size={14}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              ) : (
                <Share2 size={14} strokeWidth={1.8} aria-hidden="true" />
              )}
              {status.busy
                ? t("chat.share.creating")
                : t("chat.share.create")}
            </button>
          </>
        )}

        {status.error && (
          <p className="share-chat-error" role="alert">
            {status.error}
          </p>
        )}
      </div>
    </div>
  );
}
