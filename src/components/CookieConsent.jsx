import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie, Settings2, ShieldCheck } from "lucide-react";
import {
  CONSENT_CATEGORIES,
  CONSENT_VERSION,
  browserBlocksAnalytics,
  clearConsent,
  defaultConsentCategories,
  hasConsentDecision,
  isConsentStale,
  onOpenConsentPreferences,
  readConsent,
  saveConsent,
} from "../services/consentService";
import { track } from "../services/analytics";
import { useI18n } from "../i18n/index.jsx";

// One banner, one preferences dialog, mounted once at the App level so every
// surface (policies, pricing, login and the signed-in app) is covered. The
// decision is stored by consentService; this component only renders it.

function CategoryToggle({ category, checked, onChange }) {
  const { t } = useI18n();
  const descriptionId = `consent-desc-${category.id}`;
  return (
    <div className="consent-category">
      <div className="consent-category-head">
        <span className="consent-category-label" id={`consent-label-${category.id}`}>
          {category.label}
        </span>
        {category.required ? (
          <span className="consent-category-required">{t("consent.preferences.alwaysOn")}</span>
        ) : (
          <label className="consent-switch">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => onChange(category.id, event.target.checked)}
              aria-labelledby={`consent-label-${category.id}`}
              aria-describedby={descriptionId}
            />
            <span className="consent-switch-track" aria-hidden="true" />
            <span className="consent-switch-text">
              {checked ? t("consent.preferences.allowed") : t("consent.preferences.blocked")}
            </span>
          </label>
        )}
      </div>
      <p className="consent-category-desc" id={descriptionId}>
        {category.description}
      </p>
    </div>
  );
}

export default function CookieConsent() {
  const { t } = useI18n();
  const [bannerVisible, setBannerVisible] = useState(
    () => !hasConsentDecision() || isConsentStale(),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(
    () => readConsent()?.categories || defaultConsentCategories(),
  );
  const [saved, setSaved] = useState(false);
  const dialogRef = useRef(null);
  const bannerRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const restoreFocusRef = useRef(false);
  const blockedByBrowser = useMemo(() => browserBlocksAnalytics(), []);

  useEffect(() => {
    if (bannerVisible) track("consent_banner_shown", { surface: "banner" });
  }, [bannerVisible]);

  // The page underneath reserves space for the fixed banner (see index.css) so
  // it never covers a footer, a legal link or the submit button of a form. The
  // space is measured from the rendered banner — its height changes with the
  // viewport width and with how the buttons wrap — instead of a guessed number.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const body = document.body;
    if (!bannerVisible) {
      body.classList.remove("corez-consent-visible");
      body.style.removeProperty("--corez-consent-space");
      return undefined;
    }
    body.classList.add("corez-consent-visible");

    const measure = () => {
      const height = bannerRef.current?.getBoundingClientRect().height || 0;
      if (height > 0) {
        body.style.setProperty("--corez-consent-space", `${Math.ceil(height + 40)}px`);
      }
    };
    measure();

    let observer;
    if (typeof ResizeObserver === "function" && bannerRef.current) {
      observer = new ResizeObserver(measure);
      observer.observe(bannerRef.current);
    }
    window.addEventListener("resize", measure);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener("resize", measure);
      body.classList.remove("corez-consent-visible");
      body.style.removeProperty("--corez-consent-space");
    };
  }, [bannerVisible]);

  const openDialog = useCallback(() => {
    lastFocusedRef.current =
      typeof document !== "undefined" ? document.activeElement : null;
    setDraft(readConsent()?.categories || defaultConsentCategories());
    setSaved(false);
    setDialogOpen(true);
  }, []);

  // Focus restoration runs after the render that hides the dialog, because the
  // element to restore to may only exist again at that point.
  useEffect(() => {
    if (dialogOpen || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    const previous = lastFocusedRef.current;
    if (previous && typeof previous.focus === "function" && document.contains(previous)) {
      previous.focus();
      return;
    }
    const fallback = document.querySelector(".consent-banner .consent-btn");
    if (fallback && typeof fallback.focus === "function") fallback.focus();
  }, [dialogOpen]);

  const closeDialog = useCallback(() => {
    restoreFocusRef.current = true;
    setDialogOpen(false);
  }, []);

  useEffect(() => onOpenConsentPreferences(openDialog), [openDialog]);

  useEffect(() => {
    if (!dialogOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeDialog();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    // Move focus into the dialog so keyboard users are not left behind it.
    const firstField = dialogRef.current?.querySelector("input, button");
    if (firstField) firstField.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, closeDialog]);

  const persist = useCallback(
    (categories, source) => {
      saveConsent(categories, { source });
      setBannerVisible(false);
      setSaved(true);
      track("consent_updated", { status: source });
      if (dialogOpen) {
        // Give the confirmation a beat to be read before closing the dialog.
        setTimeout(() => closeDialog(), 450);
      }
    },
    [dialogOpen, closeDialog],
  );

  const acceptAll = useCallback(() => {
    const categories = {};
    for (const category of CONSENT_CATEGORIES) categories[category.id] = true;
    persist(categories, "accept_all");
  }, [persist]);

  const rejectOptional = useCallback(() => {
    persist(defaultConsentCategories(), "reject_non_essential");
  }, [persist]);

  const saveChoices = useCallback(() => {
    persist(draft, "preferences");
  }, [persist, draft]);

  const withdrawAll = useCallback(() => {
    clearConsent();
    setDraft(defaultConsentCategories());
    // Withdrawing removes the recorded decision, so the banner must return:
    // with nothing stored there is no consent to rely on.
    setBannerVisible(true);
    setSaved(false);
    track("consent_updated", { status: "withdrawn" });
  }, []);

  const updateCategory = useCallback((id, value) => {
    setDraft((prev) => ({ ...prev, [id]: value }));
    setSaved(false);
  }, []);

  if (!bannerVisible && !dialogOpen) return null;

  const optionalCategories = CONSENT_CATEGORIES.filter((c) => !c.required);
  const allowedCount = optionalCategories.filter((c) => draft[c.id]).length;

  return (
    <>
      {bannerVisible && (
        <div
          className="consent-banner"
          ref={bannerRef}
          role="region"
          aria-label={t("consent.banner.regionLabel")}
          // While the dialog is open the banner is behind a modal: it stays
          // mounted (so focus can return to the exact control that opened the
          // dialog) but is removed from the accessibility tree.
          aria-hidden={dialogOpen ? "true" : undefined}
        >
          <div className="consent-banner-body">
            <span className="consent-banner-icon" aria-hidden="true">
              <Cookie size={18} strokeWidth={1.5} />
            </span>
            <div className="consent-banner-text">
              <p className="consent-banner-title">{t("consent.banner.title")}</p>
              <p>
                {t("consent.banner.bodyIntro")}
                <Link to="/cookies">{t("consent.banner.cookiePolicy")}</Link>
                {t("consent.banner.bodyOr")}
                <Link to="/privacy">{t("consent.banner.privacyPolicy")}</Link>
                {t("consent.banner.bodyEnd")}
              </p>
            </div>
          </div>
          <div className="consent-banner-actions">
            <button
              type="button"
              className="consent-btn consent-btn-ghost"
              onClick={openDialog}
            >
              <Settings2 size={14} strokeWidth={1.75} aria-hidden="true" />
              {t("consent.banner.preferences")}
            </button>
            <button
              type="button"
              className="consent-btn consent-btn-ghost"
              onClick={rejectOptional}
            >
              {t("consent.actions.rejectNonEssential")}
            </button>
            <button
              type="button"
              className="consent-btn consent-btn-solid"
              onClick={acceptAll}
            >
              {t("consent.banner.acceptAll")}
            </button>
          </div>
        </div>
      )}

      {dialogOpen && (
        <div className="consent-overlay" role="presentation" onClick={closeDialog}>
          <div
            className="consent-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-dialog-title"
            ref={dialogRef}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="consent-dialog-head">
              <div>
                <h2 id="consent-dialog-title">{t("consent.dialog.title")}</h2>
                <p className="consent-dialog-sub">
                  {t("consent.dialog.version", { version: CONSENT_VERSION })}
                </p>
              </div>
              <button
                type="button"
                className="consent-btn consent-btn-ghost"
                onClick={closeDialog}
              >
                {t("common.action.close")}
              </button>
            </div>

            {blockedByBrowser && (
              <p className="consent-note" role="status">
                <ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />
                {t("consent.dialog.gpc")}
              </p>
            )}

            <div className="consent-categories">
              {CONSENT_CATEGORIES.map((category) => (
                <CategoryToggle
                  key={category.id}
                  category={category}
                  checked={Boolean(draft[category.id])}
                  onChange={updateCategory}
                />
              ))}
            </div>

            <p className="consent-dialog-foot">
              {allowedCount === 0
                ? t("consent.dialog.footNone")
                : allowedCount === 1
                  ? t("consent.dialog.footOne", { count: allowedCount })
                  : t("consent.dialog.footOther", { count: allowedCount })}
              {t("consent.dialog.footPolicyIntro")}
              <Link to="/cookies">{t("consent.dialog.footPolicyLink")}</Link>
              {t("consent.dialog.footPolicyEnd")}
            </p>

            {saved && (
              <p className="consent-saved" role="status">
                {t("consent.dialog.saved")}
              </p>
            )}

            <div className="consent-dialog-actions">
              <button
                type="button"
                className="consent-btn consent-btn-ghost"
                onClick={withdrawAll}
              >
                {t("consent.dialog.withdraw")}
              </button>
              <span className="consent-dialog-actions-right">
                <button
                  type="button"
                  className="consent-btn consent-btn-ghost"
                  onClick={rejectOptional}
                >
                  {t("consent.actions.rejectNonEssential")}
                </button>
                <button
                  type="button"
                  className="consent-btn consent-btn-solid"
                  onClick={saveChoices}
                >
                  {t("consent.dialog.save")}
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
