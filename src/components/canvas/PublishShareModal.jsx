import {
  Share2,
  X,
  Link2,
  QrCode,
  Code,
  Check,
  Copy,
  ExternalLink,
  Lock,
  Loader2,
} from "lucide-react";
import { generateQrCodeDataUrl, generateEmbedSnippet } from "../../utils/qrCode";
import { useI18n } from "../../i18n/index.jsx";

export function PublishShareModal({
  publishLink,
  publishResult,
  setPublishResult,
  title,
  publishShowsBadge,
  publishBadgeMessage,
  publishTab,
  setPublishTab,
  copied,
  handleCopyLink,
  customSlugRequiresUpgrade,
  customSlug,
  setCustomSlug,
  setSlugError,
  setSlugSuccess,
  handleUpdateSlug,
  isUpdatingSlug,
  slugError,
  slugSuccess,
  embedCopied,
  handleCopyEmbed,
  publishError,
  setPublishError,
}) {
  const { t } = useI18n();

  return (
    <>
      {publishLink && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("canvas.publish.modalLabel")}
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
                title={t("common.action.close")}
                aria-label={t("common.action.close")}
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
              {t("canvas.publish.shareIntro")}
              <b style={{ color: "var(--text-primary)" }}>
                {title.slice(0, 60)}
              </b>
              {t("canvas.publish.shareEnd")}
            </p>

            {publishShowsBadge && (
              <p
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted, #8a8a90)",
                  margin: "6px 0 0",
                  lineHeight: 1.5,
                }}
              >
                {publishBadgeMessage}{" "}
                <a
                  href="/pricing"
                  style={{ color: "var(--text-primary)", fontWeight: 600 }}
                >
                  {t("canvas.publish.upgrade")}
                </a>
              </p>
            )}

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
                <span>{t("canvas.publish.tabLink")}</span>
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
                <span>{t("canvas.publish.tabQr")}</span>
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
                <span>{t("canvas.publish.tabEmbed")}</span>
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
                    id="publish-share-link"
                    name="share-link"
                    value={publishLink}
                    onFocus={(e) => e.target.select()}
                    aria-label={t("canvas.publish.shareLinkLabel")}
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
                    title={t("canvas.publish.copyLinkTitle")}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span>
                      {copied
                        ? t("common.action.copied")
                        : t("common.action.copy")}
                    </span>
                  </button>
                  <a
                    className="code-btn"
                    href={publishLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t("canvas.publish.openNewTab")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      textDecoration: "none",
                    }}
                  >
                    <ExternalLink size={14} />
                    <span>{t("common.action.open")}</span>
                  </a>
                </div>

                {/* Slug Customization / 1-Time Change (Standard & Premium only) */}
                {customSlugRequiresUpgrade ? (
                  <p
                    style={{
                      fontSize: "0.74rem",
                      color: "var(--text-secondary)",
                      margin: "2px 0 0",
                    }}
                  >
                    {t("canvas.publish.slugLockedIntro")}
                    <a
                      href="/pricing"
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: 600,
                      }}
                    >
                      {t("canvas.publish.slugLockedCta")}
                    </a>
                    {t("canvas.publish.slugLockedEnd")}
                  </p>
                ) : publishResult.customized ||
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
                        {t("canvas.publish.slugLocked")}
                      </p>
                      <p
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-secondary)",
                          margin: "1px 0 0",
                        }}
                      >
                        {t("canvas.publish.slugLockedDetail")}
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
                        {t("canvas.publish.slugLabel")}
                      </label>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {t("canvas.publish.slugOneTime")}
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
                          aria-label={t("canvas.publish.slugAriaLabel")}
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
                          t("canvas.publish.saveSlug")
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
                          color: "var(--market-positive)",
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
                >
                  <img
                    src={generateQrCodeDataUrl(publishLink, {
                      size: 140,
                      fgColor: "#090a0f",
                      bgColor: "#ffffff",
                    })}
                    alt={t("canvas.publish.qrAlt", { url: publishLink })}
                    width="140"
                    height="140"
                    style={{ display: "block" }}
                  />
                </div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary, #9ca3af)",
                    margin: 0,
                    textAlign: "center",
                  }}
                >
                  {t("canvas.publish.qrScan")}
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
                  id="publish-embed-html"
                  name="embed-html"
                  value={generateEmbedSnippet(publishLink, { title })}
                  onFocus={(e) => e.target.select()}
                  aria-label={t("canvas.publish.embedLabel")}
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
                    {embedCopied
                      ? t("canvas.publish.embedCopied")
                      : t("canvas.publish.embedCopy")}
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
              {t("canvas.publish.privacy")}
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
            title={t("common.action.dismiss")}
            aria-label={t("common.action.dismiss")}
            style={{ marginLeft: "8px", verticalAlign: "middle" }}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </>
  );
}
