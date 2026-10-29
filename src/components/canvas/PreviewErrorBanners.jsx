import { useI18n } from "../../i18n/index.jsx";

export const PREVIEW_ERROR_DEFAULT = "Preview error";

export function MultiPageValidationBanner({ multiPageValidation }) {
  const { t } = useI18n();
  if (!multiPageValidation || multiPageValidation.valid) return null;

  return (
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
        {t("canvas.validation.incomplete")}
      </span>
      <span>
        {multiPageValidation.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => issue.message)
          .join(" · ")}{" "}
        {t("canvas.validation.publishingBlocked")}
      </span>
    </div>
  );
}

export function PreviewRuntimeBanners({
  runtimeError,
  setRuntimeError,
  errorCopied,
  copyRuntimeError,
  missingDownload,
  setMissingDownload,
  fixCopied,
  copyDownloadFix,
}) {
  const { t } = useI18n();

  return (
    <>
      {runtimeError && (
        <div className="preview-error-banner" role="alert">
          <div className="preview-error-text">
            <strong>
              {runtimeError.kind === "csp"
                ? t("canvas.error.kindCsp")
                : runtimeError.kind === "resource"
                  ? t("canvas.error.kindResource")
                  : runtimeError.kind === "unhandledrejection"
                    ? t("canvas.error.kindUnhandledRejection")
                    : t("canvas.error.kindRuntime")}
            </strong>
            <span>
              {runtimeError.message === PREVIEW_ERROR_DEFAULT
                ? t("canvas.error.messageFallback")
                : runtimeError.message}
            </span>
            {runtimeError.source ? (
              <span className="preview-error-source">
                {runtimeError.source}
                {runtimeError.line ? `:${runtimeError.line}` : ""}
              </span>
            ) : null}
          </div>
          <div className="preview-error-actions">
            <button
              type="button"
              className="preview-error-btn"
              onClick={copyRuntimeError}
            >
              {errorCopied
                ? t("canvas.error.copied")
                : t("common.action.copy")}
            </button>
            <button
              type="button"
              className="preview-error-btn"
              onClick={() => setRuntimeError(null)}
              aria-label={t("canvas.error.dismiss")}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {missingDownload && (
        <div className="preview-error-banner" role="alert">
          <div className="preview-error-text">
            <strong>{t("canvas.download.missingTitle")}</strong>
            <span>
              {t("canvas.download.missingBody", {
                name: missingDownload,
              })}
            </span>
            <span>{t("canvas.download.missingHint")}</span>
          </div>
          <div className="preview-error-actions">
            <button
              type="button"
              className="preview-error-btn"
              onClick={copyDownloadFix}
            >
              {fixCopied
                ? t("canvas.error.copied")
                : t("canvas.download.copyFix")}
            </button>
            <button
              type="button"
              className="preview-error-btn"
              onClick={() => setMissingDownload(null)}
              aria-label={t("canvas.download.dismiss")}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
