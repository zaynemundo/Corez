import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink,
  Globe,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useI18n } from "../i18n/index.jsx";
import { formatDate } from "../i18n/format.js";
import SiteAnalyticsPanel from "../components/SiteAnalyticsPanel.jsx";
import {
  fetchPublishedPageForEdit,
  listPublishedPages,
  unpublishPage,
} from "../services/appStorageService";

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The Sites screen: everything this account has published, in one place, with
 * the two things a live page needs — edit it, or take it down.
 *
 * The list comes from the server (`GET /api/publish`), so it reflects pages
 * published from any device, not just this browser. Editing loads the owner's
 * copy of the raw documents (`GET /api/publish/<slug>`) and hands them to the
 * shell, which opens a new conversation with the site as the model's revision
 * context. The public URL is never changed here.
 */
export default function Sites({ onOpenChat, onEditSite }) {
  const { t, language } = useI18n();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);

  // The site whose traffic panel is open. One panel at a time keeps the list
  // readable and each report loaded only when the owner asks for it.
  const [analyticsSlug, setAnalyticsSlug] = useState("");

  // The page whose owner copy is being loaded on its way into a chat.
  const [editLoadingSlug, setEditLoadingSlug] = useState("");
  const [editError, setEditError] = useState("");

  const [removingSlug, setRemovingSlug] = useState("");
  const [confirmingSlug, setConfirmingSlug] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [copiedSlug, setCopiedSlug] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await listPublishedPages();
    setPages(result.pages);
    setError(result.error || "");
    setTruncated(result.truncated);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startEditing = useCallback(
    async (page) => {
      if (typeof onEditSite !== "function") {
        setEditError(t("common.sites.editChatError"));
        return;
      }
      setEditError("");
      setConfirmingSlug("");
      setAnalyticsSlug("");
      setEditLoadingSlug(page.slug);
      try {
        const result = await fetchPublishedPageForEdit(page.slug);
        if (!result.success) {
          setEditError(result.error || t("common.sites.editChatError"));
          return;
        }
        await onEditSite(result.page);
      } catch (err) {
        setEditError(err?.message || t("common.sites.editChatError"));
      } finally {
        setEditLoadingSlug("");
      }
    },
    [onEditSite, t],
  );

  const copyLink = async (page) => {
    const url = `${window.location.origin}${page.url}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(page.slug);
      window.setTimeout(
        () => setCopiedSlug((current) => (current === page.slug ? "" : current)),
        1600,
      );
    } catch {
      // Clipboard access can be refused; the link is still openable beside it.
      setCopiedSlug("");
    }
  };

  const remove = async (page) => {
    if (confirmingSlug !== page.slug) {
      setConfirmingSlug(page.slug);
      setRemoveError("");
      return;
    }
    setConfirmingSlug("");
    setRemovingSlug(page.slug);
    setRemoveError("");
    const result = await unpublishPage(page.slug);
    setRemovingSlug("");
    if (!result?.success) {
      setRemoveError(result?.error || t("common.sites.removeError"));
      return;
    }
    if (analyticsSlug === page.slug) setAnalyticsSlug("");
    setPages((prev) => prev.filter((entry) => entry.slug !== page.slug));
  };

  const toggleAnalytics = (page) => {
    setConfirmingSlug("");
    setAnalyticsSlug((current) => (current === page.slug ? "" : page.slug));
  };

  return (
    <section className="sites-page" aria-labelledby="sites-title">
      <header className="sites-header">
        <div className="sites-heading">
          <h1 id="sites-title">{t("common.sites.title")}</h1>
          <p>{t("common.sites.subtitle")}</p>
        </div>
        <div className="sites-header-actions">
          {typeof onOpenChat === "function" && (
            <button
              type="button"
              className="sites-button quiet"
              onClick={() => onOpenChat()}
            >
              {t("common.sites.backToChat")}
            </button>
          )}
          <button
            type="button"
            className="sites-button"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
            {t("common.sites.refresh")}
          </button>
        </div>
      </header>

      {loading && (
        <p className="sites-state" role="status">
          <Loader2 size={14} strokeWidth={1.75} className="spin" aria-hidden="true" />
          {t("common.sites.loading")}
        </p>
      )}

      {!loading && error && (
        <div className="sites-error" role="alert">
          <span>{error}</span>
          <button type="button" className="sites-button" onClick={refresh}>
            {t("common.sites.retry")}
          </button>
        </div>
      )}

      {!loading && !error && pages.length === 0 && (
        <div className="sites-empty">
          <Globe size={22} strokeWidth={1.5} aria-hidden="true" />
          <p className="sites-empty-title">{t("common.sites.empty")}</p>
          <p className="sites-empty-hint">{t("common.sites.emptyHint")}</p>
        </div>
      )}

      {!loading && editError && (
        <p className="sites-error" role="alert">
          {editError}
        </p>
      )}

      {removeError && (
        <p className="sites-error" role="alert">
          {removeError}
        </p>
      )}

      {!loading && pages.length > 0 && (
        <ul className="sites-list">
          {pages.map((page) => {
            const size = formatBytes(page.bytes);
            return (
              <li
                key={page.slug}
                className={`site-card${
                  analyticsSlug === page.slug ? " analytics-open" : ""
                }`}
              >
                <div className="site-card-main">
                  <a
                    className="site-card-title"
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t("common.sites.openTitle", { url: page.url })}
                  >
                    <Globe size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>{page.title || page.slug}</span>
                    <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
                  </a>
                  <p className="site-card-meta">
                    <code>corez.pro{page.url}</code>
                    {page.pages > 0 && (
                      <span>
                        {t("common.sites.pagesCount", { count: page.pages + 1 })}
                      </span>
                    )}
                    {page.createdAt && (
                      <span>{formatDate(page.createdAt, language)}</span>
                    )}
                    {size && <span>{size}</span>}
                  </p>
                </div>

                <div className="site-card-actions">
                  <button
                    type="button"
                    className="sites-button"
                    onClick={() => copyLink(page)}
                  >
                    {copiedSlug === page.slug
                      ? t("common.sites.copied")
                      : t("common.sites.copy")}
                  </button>
                  <button
                    type="button"
                    className={`sites-button${
                      analyticsSlug === page.slug ? " primary" : ""
                    }`}
                    onClick={() => toggleAnalytics(page)}
                    aria-expanded={analyticsSlug === page.slug}
                    aria-controls={`site-analytics-${page.slug}`}
                  >
                    <TrendingUp size={14} strokeWidth={1.75} aria-hidden="true" />
                    {t("common.sites.analytics.open")}
                  </button>
                  <button
                    type="button"
                    className="sites-button"
                    onClick={() => startEditing(page)}
                    disabled={Boolean(editLoadingSlug)}
                  >
                    {editLoadingSlug === page.slug ? (
                      <Loader2
                        size={14}
                        strokeWidth={1.75}
                        className="spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
                    )}
                    {t("common.sites.edit")}
                  </button>
                  <button
                    type="button"
                    className={`sites-button danger${
                      confirmingSlug === page.slug ? " confirming" : ""
                    }`}
                    onClick={() => remove(page)}
                    disabled={removingSlug === page.slug}
                  >
                    <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                    {removingSlug === page.slug
                      ? t("common.sites.removing")
                      : confirmingSlug === page.slug
                        ? t("common.sites.confirmUnpublish")
                        : t("common.sites.unpublish")}
                  </button>
                  {confirmingSlug === page.slug && (
                    <button
                      type="button"
                      className="sites-button quiet"
                      onClick={() => setConfirmingSlug("")}
                    >
                      {t("common.sites.cancel")}
                    </button>
                  )}
                </div>

                {analyticsSlug === page.slug && (
                  <SiteAnalyticsPanel
                    slug={page.slug}
                    title={page.title}
                    onClose={() => setAnalyticsSlug("")}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {truncated && !loading && (
        <p className="sites-state">{t("common.sites.truncated")}</p>
      )}
    </section>
  );
}
