import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  Globe,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "../i18n/index.jsx";
import { formatDate } from "../i18n/format.js";
import {
  fetchPublishedPageForEdit,
  listPublishedPages,
  savePublishedPage,
  unpublishPage,
} from "../services/appStorageService";

const EMPTY_DOC = "";

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
 * copy of the raw documents (`GET /api/publish/<slug>`) and saves through the
 * same publish route, under the same slug, so the public URL never changes.
 */
export default function Sites({ onOpenChat }) {
  const { t, language } = useI18n();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);

  // The page being edited, plus its working copy.
  const [editing, setEditing] = useState(null);
  const [editLoadingSlug, setEditLoadingSlug] = useState("");
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSlug, setSavedSlug] = useState("");

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

  const stopEditing = useCallback(() => {
    setEditing(null);
    setEditError("");
    setSavedSlug("");
  }, []);

  const startEditing = useCallback(
    async (page) => {
      setEditError("");
      setSavedSlug("");
      setConfirmingSlug("");
      setEditLoadingSlug(page.slug);
      const result = await fetchPublishedPageForEdit(page.slug);
      setEditLoadingSlug("");
      if (!result.success) {
        setEditError(result.error);
        setEditing(null);
        return;
      }
      const loaded = result.page;
      setEditing({
        slug: loaded.slug,
        url: loaded.url,
        title: loaded.title,
        html: loaded.html,
        pages: loaded.pages || {},
        // null means the home document; any other value is a sub-page name.
        activePage: null,
      });
    },
    [],
  );

  const pageNames = useMemo(
    () => (editing ? Object.keys(editing.pages || {}).sort() : []),
    [editing],
  );
  const activeDocument = editing
    ? editing.activePage === null
      ? editing.html
      : editing.pages[editing.activePage] || EMPTY_DOC
    : EMPTY_DOC;

  const setDocument = (value) => {
    setEditing((prev) => {
      if (!prev) return prev;
      if (prev.activePage === null) return { ...prev, html: value };
      return {
        ...prev,
        pages: { ...prev.pages, [prev.activePage]: value },
      };
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setEditError("");
    const result = await savePublishedPage({
      slug: editing.slug,
      title: editing.title,
      html: editing.html,
      pages: editing.pages,
    });
    setSaving(false);
    if (!result?.success) {
      setEditError(result?.error || t("common.sites.saveError"));
      return;
    }
    setSavedSlug(editing.slug);
    // The list carries the title and size, both of which just changed.
    refresh();
  };

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
    if (editing?.slug === page.slug) stopEditing();
    setPages((prev) => prev.filter((entry) => entry.slug !== page.slug));
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

      {removeError && (
        <p className="sites-error" role="alert">
          {removeError}
        </p>
      )}

      {!loading && pages.length > 0 && (
        <ul className="sites-list">
          {pages.map((page) => {
            const isEditing = editing?.slug === page.slug;
            const size = formatBytes(page.bytes);
            return (
              <li
                key={page.slug}
                className={`site-card${isEditing ? " editing" : ""}`}
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
                  {savedSlug === page.slug && (
                    <p className="site-card-saved" role="status">
                      <Check size={13} strokeWidth={2} aria-hidden="true" />
                      {t("common.sites.saved")}
                    </p>
                  )}
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
                    className="sites-button"
                    onClick={() => (isEditing ? stopEditing() : startEditing(page))}
                    disabled={editLoadingSlug === page.slug}
                    aria-expanded={isEditing}
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
                    {isEditing ? t("common.sites.closeEditor") : t("common.sites.edit")}
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

                {isEditing && (
                  <div className="site-editor">
                    <div className="site-editor-row">
                      <label className="site-editor-label" htmlFor="site-editor-title">
                        {t("common.sites.titleLabel")}
                      </label>
                      <input
                        id="site-editor-title"
                        className="site-editor-input"
                        value={editing.title}
                        onChange={(event) =>
                          setEditing((prev) =>
                            prev ? { ...prev, title: event.target.value } : prev,
                          )
                        }
                        maxLength={120}
                      />
                    </div>

                    {pageNames.length > 0 && (
                      <div className="site-editor-row">
                        <span className="site-editor-label">
                          {t("common.sites.pageLabel")}
                        </span>
                        <div className="site-editor-tabs" role="tablist">
                          <button
                            type="button"
                            role="tab"
                            aria-selected={editing.activePage === null}
                            className={`site-editor-tab${
                              editing.activePage === null ? " active" : ""
                            }`}
                            onClick={() =>
                              setEditing((prev) =>
                                prev ? { ...prev, activePage: null } : prev,
                              )
                            }
                          >
                            {t("common.sites.homePage")}
                          </button>
                          {pageNames.map((name) => (
                            <button
                              key={name}
                              type="button"
                              role="tab"
                              aria-selected={editing.activePage === name}
                              className={`site-editor-tab${
                                editing.activePage === name ? " active" : ""
                              }`}
                              onClick={() =>
                                setEditing((prev) =>
                                  prev ? { ...prev, activePage: name } : prev,
                                )
                              }
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <label className="site-editor-label" htmlFor="site-editor-doc">
                      {t("common.sites.documentLabel", {
                        page:
                          editing.activePage === null
                            ? t("common.sites.homePage")
                            : editing.activePage,
                      })}
                    </label>
                    <textarea
                      id="site-editor-doc"
                      className="site-editor-code"
                      value={activeDocument}
                      onChange={(event) => setDocument(event.target.value)}
                      spellCheck="false"
                      rows={14}
                    />

                    <p className="site-editor-hint">
                      {t("common.sites.editorHint")}
                    </p>

                    {editError && (
                      <p className="site-editor-error" role="alert">
                        {editError}
                      </p>
                    )}

                    <div className="site-editor-actions">
                      <button
                        type="button"
                        className="sites-button primary"
                        onClick={save}
                        disabled={saving}
                      >
                        {saving ? (
                          <Loader2
                            size={14}
                            strokeWidth={1.75}
                            className="spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Check size={14} strokeWidth={2} aria-hidden="true" />
                        )}
                        {saving ? t("common.sites.saving") : t("common.sites.save")}
                      </button>
                      <button
                        type="button"
                        className="sites-button quiet"
                        onClick={stopEditing}
                      >
                        <X size={14} strokeWidth={1.75} aria-hidden="true" />
                        {t("common.sites.cancel")}
                      </button>
                    </div>
                  </div>
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
