import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Settings,
  Trash2,
  Sun,
  Moon,
  LogOut,
  User,
  Crown,
  Zap,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ExternalLink,
  Globe,
  Loader2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n/index.jsx";
import { formatDate } from "../i18n/format.js";
import { openConsentPreferences } from "../services/consentService";
import { listPublishedPages, unpublishPage } from "../services/appStorageService";
import {
  USAGE_METRIC_LABELS,
  fetchUsage,
  formatUsageValue,
  usageRatio,
} from "../services/usageService";
import {
  balanceLabel,
  buyAddon,
  fetchAddons,
  formatAed,
} from "../services/addonService";

// Settings is grouped rather than one long scroll: everything about the account
// in General, money in Billing, what is public in Publishing, and the choices
// that are about data in Privacy.
const SETTINGS_CATEGORIES = [
  { id: "general", labelKey: "settings.tabs.general" },
  { id: "billing", labelKey: "settings.tabs.billing" },
  { id: "publishing", labelKey: "settings.tabs.publishing" },
  { id: "privacy", labelKey: "settings.tabs.privacy" },
];

export default function SettingsModal({
  isOpen,
  onClose,
  onClearAllHistory,
  theme,
  onToggleTheme,
}) {
  let auth;
  try {
    auth = useAuth();
  } catch {
    auth = null;
  }
  const email = auth?.user?.email || "";
  const userPlan = auth?.user?.plan || "free";
  const isDark = theme === "dark";
  const { t, language, setLanguage, languages } = useI18n();
  const [sub, setSub] = useState(null);
  const [subLoading, setSubLoading] = useState(false);
  const [published, setPublished] = useState([]);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const [publishedError, setPublishedError] = useState("");
  const [publishedTruncated, setPublishedTruncated] = useState(false);
  const [removingSlug, setRemovingSlug] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [category, setCategory] = useState(SETTINGS_CATEGORIES[0].id);
  const [usage, setUsage] = useState(null);
  const [addons, setAddons] = useState(null);
  const [buyingSku, setBuyingSku] = useState("");
  const [addonError, setAddonError] = useState("");
  const tabRefs = useRef({});
  const wasOpenRef = useRef(false);
  const titleId = "settings-modal-title";

  const refreshPublished = async () => {
    setPublishedLoading(true);
    setPublishedError("");
    const result = await listPublishedPages();
    setPublished(result.pages);
    setPublishedTruncated(result.truncated);
    setPublishedError(result.error || "");
    setPublishedLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const load = async () => {
      setSubLoading(true);
      try {
        const r = await fetch("/api/subscriptions/me", {
          credentials: "include",
        });
        const d = await r.json().catch(() => ({}));
        if (!cancelled && r.ok) setSub(d);
      } catch {}
      if (!cancelled) setSubLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Published pages are owner data on the server, so they are fetched when the
  // panel opens rather than read from this browser's local publish registry.
  // The modal stays mounted while closed, so there is no unmount race here.
  useEffect(() => {
    if (!isOpen) return;
    setRemoveError("");
    setAddonError("");
    refreshPublished();
    fetchUsage().then((summary) => setUsage(summary));
    fetchAddons().then((catalog) => setAddons(catalog));
  }, [isOpen]);

  const handleBuyAddon = async (sku) => {
    setAddonError("");
    setBuyingSku(sku.id);
    const result = await buyAddon(sku.id);
    setBuyingSku("");
    if (!result.success) {
      setAddonError(result.error || t("settings.billing.purchaseStartFailed"));
      return;
    }
    if (result.redirectUrl) {
      // The payment page takes over; credits appear when the server reconciles
      // the completed payment against the ledger.
      window.location.href = result.redirectUrl;
      return;
    }
    setAddonError(t("settings.billing.checkoutLinkMissing"));
  };

  const handleUnpublish = async (page) => {
    const label = page.title || page.slug;
    if (
      !confirm(
        t("settings.publishing.confirmRemove", { title: label, url: page.url }),
      )
    ) {
      return;
    }
    setRemoveError("");
    setRemovingSlug(page.slug);
    const result = await unpublishPage(page.slug);
    setRemovingSlug("");
    if (result.success) {
      setPublished((prev) => prev.filter((entry) => entry.slug !== page.slug));
      return;
    }
    setRemoveError(result.error || t("settings.publishing.removeFailed"));
  };

  const currentPlan = sub?.plan || userPlan || "free";
  const isExpired = sub?.status === "expired" || sub?.isExpired;
  // Plan ids ("free", "standard", "premium") are API values, not copy: show the
  // translated plan name whenever the id is one we know, and fall back to the id
  // itself so an unknown plan from the server still renders something honest.
  const planName = (id) => {
    if (!id) return "";
    const key = `pricing.plans.${String(id).toLowerCase()}.name`;
    const label = t(key);
    return label === key ? String(id) : label;
  };
  const periodEnd = sub?.period_end
    ? formatDate(sub.period_end, language)
    : null;
  const navigate = useNavigate();

  // Opening the dialog starts on the first category and puts focus on its tab,
  // so keyboard users land inside the dialog instead of behind it.
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    setCategory(SETTINGS_CATEGORIES[0].id);
    const firstTab = tabRefs.current[SETTINGS_CATEGORIES[0].id];
    if (firstTab && typeof firstTab.focus === "function") firstTab.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // Standard tab-list keyboard model: arrows move and select, Home/End jump.
  const onTabsKeyDown = (event) => {
    const ids = SETTINGS_CATEGORIES.map((entry) => entry.id);
    const index = ids.indexOf(category);
    let nextIndex = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % ids.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + ids.length) % ids.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = ids.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextId = ids[nextIndex];
    setCategory(nextId);
    const node = tabRefs.current[nextId];
    if (node && typeof node.focus === "function") node.focus();
  };

  // Hooks above must run on every render (isOpen false included): the modal is
  // always mounted by App and only its visibility changes. An early return
  // before the hooks made the first open throw "Rendered more hooks than
  // during the previous render" and dropped the app into the ErrorBoundary.
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card settings-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Settings size={18} strokeWidth={1.5} />
            <span className="modal-title" id={titleId}>{t("common.sidebar.settings")}</span>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label={t("settings.dialog.close")}
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        {/* The card keeps a fixed height and only this body scrolls, so the
            title, the categories and the close button stay reachable however
            much there is to show. */}
        <div className="settings-modal-body">
          <div className="settings-tabs-scroll">
            <div
              className="settings-tabs"
              role="tablist"
              aria-label={t("settings.tabs.label")}
              onKeyDown={onTabsKeyDown}
            >
              {SETTINGS_CATEGORIES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  id={`settings-tab-${entry.id}`}
                  aria-selected={category === entry.id}
                  aria-controls={`settings-panel-${entry.id}`}
                  tabIndex={category === entry.id ? 0 : -1}
                  className="settings-tab"
                  ref={(node) => {
                    if (node) tabRefs.current[entry.id] = node;
                    else delete tabRefs.current[entry.id];
                  }}
                  onClick={() => setCategory(entry.id)}
                >
                  {t(entry.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div
            className="settings-panel"
            role="tabpanel"
            id="settings-panel-general"
            aria-labelledby="settings-tab-general"
            hidden={category !== "general"}
          >
        <div className="settings-section">
          <div className="settings-section-label">{t("settings.general.account")}</div>
          <div className="settings-profile-card">
            <div className="settings-avatar" aria-hidden="true">
              <User size={16} strokeWidth={1.5} />
            </div>
            <div className="settings-profile-meta">
              <span className="settings-profile-email" title={email}>
                {email || t("common.sidebar.guest")}
              </span>
              <span className="settings-profile-sub">{t("settings.general.signedIn")}</span>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">{t("settings.general.appearance")}</div>
          <button
            type="button"
            className="settings-row-btn"
            onClick={onToggleTheme}
            aria-label={isDark ? t("settings.general.switchToLightMode") : t("settings.general.switchToDarkMode")}
          >
            <span className="settings-row-left">
              {isDark ? (
                <Sun size={16} strokeWidth={1.5} />
              ) : (
                <Moon size={16} strokeWidth={1.5} />
              )}
              <span>{isDark ? t("settings.general.lightMode") : t("settings.general.darkMode")}</span>
            </span>
            <span className="settings-row-hint">
              {isDark ? t("settings.general.switchToLight") : t("settings.general.switchToDark")}
            </span>
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">{t("settings.languageSection")}</div>
          <div className="settings-row settings-language-row">
            <span className="settings-row-left">
              <Globe size={16} strokeWidth={1.5} />
              <span id="settings-language-label">{t("settings.language")}</span>
            </span>
            <select
              id="settings-language"
              className="settings-language-select"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              aria-labelledby="settings-language-label"
              aria-describedby="settings-language-hint"
            >
              {languages.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.nativeLabel}
                </option>
              ))}
            </select>
          </div>
          <p className="settings-language-hint" id="settings-language-hint">
            {t("settings.languageHint")}
          </p>
        </div>

          </div>

          <div
            className="settings-panel"
            role="tabpanel"
            id="settings-panel-billing"
            aria-labelledby="settings-tab-billing"
            hidden={category !== "billing"}
          >
        <div className="settings-section pricing-section">
          <div className="settings-section-label">{t("settings.billing.title")}</div>

          {addons && (addons.skus.length > 0 || addons.error) && (
            <div className="settings-addons" aria-label={t("settings.billing.addons")}>
              <div className="settings-usage-head">
                <span className="settings-usage-title">{t("settings.billing.addons")}</span>
                <span className="settings-usage-reset">{t("settings.billing.addonsOneOff")}</span>
              </div>
              <p className="settings-addons-lede">
                {t("settings.billing.addonsLede")}
              </p>
              {addons.error && (
                <p className="settings-usage-error" role="alert">
                  {addons.error}
                </p>
              )}
              {!addons.error && !addons.paymentsConfigured && (
                <p className="settings-usage-note">
                  {t("settings.billing.paymentsNotConfigured")}
                </p>
              )}
              <ul className="settings-addons-list">
                {addons.skus.map((sku) => {
                  const balance = addons.balances?.[sku.id];
                  const buyable =
                    sku.available && !addons.error && addons.paymentsConfigured;
                  return (
                    <li key={sku.id} className="settings-addon">
                      <div className="settings-addon-head">
                        <span className="settings-addon-name">{sku.label}</span>
                        <span className="settings-addon-price">{formatAed(sku)}</span>
                      </div>
                      <p className="settings-addon-blurb">{sku.blurb}</p>
                      <div className="settings-addon-foot">
                        <span className="settings-addon-meta">
                          {sku.credits} {sku.unitLabel} ·{" "}
                          <strong>{balanceLabel(balance)}</strong>
                        </span>
                        <button
                          type="button"
                          className="settings-addon-buy"
                          onClick={() => handleBuyAddon(sku)}
                          disabled={!buyable || buyingSku === sku.id}
                          title={
                            sku.available
                              ? t("settings.billing.buyTitle", {
                                  credits: sku.credits,
                                  unit: sku.unitLabel,
                                  price: formatAed(sku),
                                })
                              : t("settings.billing.notAvailableYet")
                          }
                        >
                          {buyingSku === sku.id
                            ? t("settings.billing.opening")
                            : sku.available
                              ? t("settings.billing.buy")
                              : t("settings.billing.soon")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {addonError && (
                <p className="settings-usage-error" role="alert">
                  {addonError}
                </p>
              )}
              {addons.settledNow?.length > 0 && (
                <p className="settings-addons-settled" role="status">
                  {addons.settledNow.length === 1
                    ? t("settings.billing.purchaseSettledOne", {
                        count: addons.settledNow.length,
                      })
                    : t("settings.billing.purchaseSettledOther", {
                        count: addons.settledNow.length,
                      })}
                </p>
              )}
            </div>
          )}

          {usage && (
            <div className="settings-usage" aria-label={t("settings.billing.usageTitle")}>
              <div className="settings-usage-head">
                <span className="settings-usage-title">{t("settings.billing.usageTitle")}</span>
                <span className="settings-usage-reset">
                  {usage.resetsAt
                    ? t("settings.billing.resets", {
                        date: formatDate(usage.resetsAt, language),
                      })
                    : ""}
                </span>
              </div>
              {usage.error && (
                <p className="settings-usage-error" role="alert">
                  {usage.error}
                </p>
              )}
              {!usage.error && usage.meteringEnabled === false && (
                <p className="settings-usage-note">
                  {t("settings.billing.notMetered")}
                </p>
              )}
              {!usage.error &&
                USAGE_METRIC_LABELS.filter((entry) =>
                  Object.prototype.hasOwnProperty.call(usage.metrics, entry.id),
                ).map((entry) => {
                  const metric = usage.metrics[entry.id];
                  const ratio = usageRatio(metric);
                  const spent = metric.limit !== null && metric.used >= metric.limit;
                  return (
                    <div
                      key={entry.id}
                      className={`settings-usage-row${spent ? " is-spent" : ""}`}
                      title={entry.hint}
                    >
                      <span className="settings-usage-label">{entry.label}</span>
                      <span className="settings-usage-value">
                        {formatUsageValue(metric.used)}
                        <span className="settings-usage-limit">
                          {metric.limit === null
                            ? t("settings.billing.unlimited")
                            : t("settings.billing.limitSuffix", {
                                limit: formatUsageValue(metric.limit),
                              })}
                        </span>
                      </span>
                      <span
                        className="settings-usage-bar"
                        role="progressbar"
                        aria-label={t("settings.billing.metricUsed", { metric: entry.label })}
                        aria-valuenow={Math.round(ratio * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <span
                          className="settings-usage-bar-fill"
                          style={{ width: `${Math.round(ratio * 100)}%` }}
                        />
                      </span>
                    </div>
                  );
                })}
              {(usage.exceeded.length > 0 || usage.nearLimit.length > 0) && (
                <div className="settings-usage-cta">
                  <span>
                    {usage.exceeded.length > 0
                      ? t("settings.billing.limitUsed")
                      : t("settings.billing.limitNear")}
                  </span>
                  <span className="settings-usage-cta-actions">
                    {(() => {
                      const spentWithPack = usage.exceeded
                        .map((metric) =>
                          addons?.skus?.find(
                            (sku) => sku.metric === metric && sku.available,
                          ),
                        )
                        .find(Boolean);
                      if (!spentWithPack) return null;
                      return (
                        <button
                          type="button"
                          className="settings-usage-pack"
                          onClick={() => handleBuyAddon(spentWithPack)}
                          disabled={buyingSku === spentWithPack.id}
                        >
                          {buyingSku === spentWithPack.id
                            ? t("settings.billing.opening")
                            : t("settings.billing.buyPack", {
                                credits: spentWithPack.credits,
                                unit: spentWithPack.unitLabel,
                              })}
                        </button>
                      );
                    })()}
                    <button
                      type="button"
                      className="settings-usage-upgrade"
                      onClick={() => {
                        onClose();
                        navigate("/pricing");
                      }}
                    >
                      {t("settings.billing.comparePlans")} <ArrowRight size={13} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </span>
                </div>
              )}
            </div>
          )}
          <div
            className={`pricing-status ${isExpired ? "expired" : sub?.isScheduledDowngrade ? "scheduled" : currentPlan}`}
          >
            <div className="pricing-status-left">
              <span className={`pricing-status-icon ${currentPlan}`}>
                {currentPlan === "premium" ? (
                  <Crown size={14} strokeWidth={1.75} />
                ) : currentPlan === "standard" ? (
                  <Zap size={14} strokeWidth={1.75} />
                ) : (
                  <Sparkles size={14} strokeWidth={1.75} />
                )}
              </span>
              <div>
                <div className="pricing-status-plan">
                  {isExpired
                    ? t("settings.billing.planExpired", { plan: planName(currentPlan) })
                    : sub?.isScheduledDowngrade
                      ? t("settings.billing.planScheduled", { plan: planName(currentPlan) })
                      : planName(currentPlan)}
                </div>
                <div className="pricing-status-desc">
                  {subLoading
                    ? t("common.status.loading")
                    : sub?.isScheduledDowngrade && sub?.downgrade_plan
                      ? t("settings.billing.downgradeScheduled", {
                          plan: planName(sub.downgrade_plan),
                          date: periodEnd,
                          current: planName(currentPlan),
                        })
                      : currentPlan === "free"
                        ? t("settings.billing.freeForever")
                        : periodEnd
                          ? isExpired
                            ? t("settings.billing.expiredOn", { date: periodEnd })
                            : t("settings.billing.renewsOn", { date: periodEnd })
                          : t("settings.billing.monthlyCancel")}
                </div>
              </div>
            </div>
            <span
              className={`pricing-status-badge ${isExpired ? "expired" : sub?.isScheduledDowngrade ? "scheduled" : "active"}`}
              style={
                sub?.isScheduledDowngrade
                  ? { background: "rgba(251,191,36,0.12)", color: "#fde68a", borderColor: "rgba(251,191,36,0.28)" }
                  : undefined
              }
            >
              {isExpired
                ? t("settings.billing.badgeExpired")
                : sub?.isScheduledDowngrade
                  ? t("settings.billing.badgeScheduled")
                  : sub?.status === "active"
                    ? t("settings.billing.badgeActive")
                    : currentPlan === "free"
                      ? t("settings.billing.badgeActive")
                      : sub?.status || t("settings.billing.badgeActive")}
            </span>
          </div>

          {sub?.isScheduledDowngrade && sub?.downgrade_plan && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                padding: "10px 12px",
                borderRadius: "10px",
                background: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.18)",
                fontSize: "12px",
              }}
            >
              <span style={{ color: "var(--text-secondary)", lineHeight: 1.4 }}>
                {t("settings.billing.downgradeIntro")}
                <strong style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>{sub.downgrade_plan}</strong>
                {t("settings.billing.downgradeOn", { date: periodEnd })}
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(t("settings.billing.confirmKeep"))) return;
                  try {
                    const r = await fetch("/api/subscriptions/cancel", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ undo: true }),
                    });
                    const d = await r.json().catch(() => ({}));
                    if (r.ok) {
                      alert(
                        t("settings.billing.downgradeCanceled", {
                          plan: planName(currentPlan),
                        }),
                      );
                      const mr = await fetch("/api/subscriptions/me", { credentials: "include" });
                      const md = await mr.json().catch(() => ({}));
                      if (mr.ok) setSub(md);
                      try { await auth?.refresh?.(); } catch {}
                    } else alert(d.error || t("settings.billing.failed"));
                  } catch (e) {
                    alert(e.message || t("settings.billing.failed"));
                  }
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: "999px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  fontWeight: 600,
                  fontSize: "11px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t("settings.billing.keepPlan", { plan: planName(currentPlan) })}
              </button>
            </div>
          )}

          <button
            type="button"
            className="pricing-manage-btn"
            onClick={() => {
              onClose();
              navigate("/pricing");
            }}
            aria-label={t("settings.billing.managePlanLabel")}
          >
            <span className="pricing-manage-left">
              <span className="pricing-manage-title">{t("settings.billing.managePlan")}</span>
              <span className="pricing-manage-sub">
                {t("settings.billing.manageSub")}
              </span>
            </span>
            <span className="pricing-manage-cta">
              {t("settings.billing.viewPricing")} <ArrowRight size={14} strokeWidth={1.75} />
            </span>
          </button>
        </div>

          </div>

          <div
            className="settings-panel"
            role="tabpanel"
            id="settings-panel-publishing"
            aria-labelledby="settings-tab-publishing"
            hidden={category !== "publishing"}
          >
        <div className="settings-section">
          <div className="settings-section-label">{t("settings.publishing.title")}</div>
          <p className="settings-published-lede">
            {t("settings.publishing.lede")}
          </p>

          {publishedLoading && (
            <p className="settings-published-state" role="status">
              <Loader2 size={14} strokeWidth={1.75} className="spin" aria-hidden="true" />
              {t("settings.publishing.checking")}
            </p>
          )}

          {!publishedLoading && publishedError && (
            <div className="settings-published-error" role="alert">
              <span>{publishedError}</span>
              <button
                type="button"
                className="settings-published-retry"
                onClick={refreshPublished}
              >
                {t("settings.publishing.tryAgain")}
              </button>
            </div>
          )}

          {!publishedLoading && !publishedError && published.length === 0 && (
            <p className="settings-published-empty">
              <Globe size={18} strokeWidth={1.5} aria-hidden="true" />
              {t("settings.publishing.empty")}
            </p>
          )}

          {!publishedLoading && published.length > 0 && (
            <ul className="settings-published-list">
              {published.map((page) => (
                <li key={page.slug} className="settings-published-item">
                  <div className="settings-published-meta">
                    <a
                      className="settings-published-title"
                      href={page.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t("settings.publishing.openTitle", { url: page.url })}
                    >
                      <Globe size={13} strokeWidth={1.75} aria-hidden="true" />
                      <span>{page.title || page.slug}</span>
                      <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
                    </a>
                    <span className="settings-published-sub">
                      corez.pro{page.url}
                      {page.pages > 0
                        ? t("settings.publishing.pagesSuffix", {
                            count: page.pages + 1,
                          })
                        : ""}
                      {page.createdAt
                        ? t("settings.publishing.dateSuffix", {
                            date: formatDate(page.createdAt, language),
                          })
                        : ""}
                      {page.badge ? t("settings.publishing.badgeSuffix") : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="settings-published-remove"
                    onClick={() => handleUnpublish(page)}
                    disabled={removingSlug === page.slug}
                    aria-label={t("settings.publishing.removeLabel", {
                      title: page.title || page.slug,
                    })}
                  >
                    {removingSlug === page.slug
                      ? t("settings.publishing.removing")
                      : t("settings.publishing.remove")}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {publishedTruncated && !publishedLoading && (
            <p className="settings-published-state">
              {t("settings.publishing.truncated")}
            </p>
          )}

          {removeError && (
            <p className="settings-published-error" role="alert">
              {removeError}
            </p>
          )}
        </div>

          </div>

          <div
            className="settings-panel"
            role="tabpanel"
            id="settings-panel-privacy"
            aria-labelledby="settings-tab-privacy"
            hidden={category !== "privacy"}
          >
        <div className="settings-section">
          <div className="settings-section-label">{t("settings.privacy.title")}</div>
          <button
            type="button"
            className="settings-row-btn"
            onClick={openConsentPreferences}
            aria-label={t("settings.privacy.openPreferences")}
          >
            <span className="settings-row-left">
              <ShieldCheck size={16} strokeWidth={1.5} />
              <span>{t("settings.privacy.cookieSettings")}</span>
            </span>
            <span className="settings-row-hint">{t("settings.privacy.changeAllowed")}</span>
          </button>
          <div className="settings-legal-links">
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate("/privacy");
              }}
            >
              {t("settings.privacy.privacyPolicy")}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate("/terms");
              }}
            >
              {t("settings.privacy.terms")}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate("/cookies");
              }}
            >
              {t("settings.privacy.cookies")}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate("/refunds");
              }}
            >
              {t("settings.privacy.refunds")}
            </button>
          </div>
        </div>

        </div>
        </div>

        {/* Fixed footer: the session actions are the same whatever category is
            open, so they live here instead of inside one of them. It also gives
            every category the same bottom edge, which is what makes a
            fixed-height dialog look composed rather than half-empty. */}
        <div className="settings-footer">
          <button
            type="button"
            className="settings-danger-btn"
            onClick={onClearAllHistory}
          >
            <Trash2 size={15} strokeWidth={1.5} />
            <span>{t("settings.footer.clearHistory")}</span>
          </button>
          {auth?.user && (
            <button
              type="button"
              className="settings-logout-btn"
              onClick={() => {
                onClose();
                auth.logout();
              }}
            >
              <LogOut size={15} strokeWidth={1.5} />
              <span>{t("settings.footer.logOut")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
