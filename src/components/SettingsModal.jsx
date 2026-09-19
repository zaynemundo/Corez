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
import { openConsentPreferences } from "../services/consentService";
import { listPublishedPages, unpublishPage } from "../services/appStorageService";

// Settings is grouped rather than one long scroll: everything about the account
// in General, money in Billing, what is public in Publishing, and the choices
// that are about data in Privacy.
const SETTINGS_CATEGORIES = [
  { id: "general", label: "General" },
  { id: "billing", label: "Billing" },
  { id: "publishing", label: "Publishing" },
  { id: "privacy", label: "Privacy" },
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
  const [sub, setSub] = useState(null);
  const [subLoading, setSubLoading] = useState(false);
  const [published, setPublished] = useState([]);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const [publishedError, setPublishedError] = useState("");
  const [publishedTruncated, setPublishedTruncated] = useState(false);
  const [removingSlug, setRemovingSlug] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [category, setCategory] = useState(SETTINGS_CATEGORIES[0].id);
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
    refreshPublished();
  }, [isOpen]);

  const handleUnpublish = async (page) => {
    const label = page.title || page.slug;
    if (
      !confirm(
        `Remove the published page “${label}”?\n\nThe public link corez.pro${page.url} stops working immediately. The creation itself stays in its chat.`,
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
    setRemoveError(result.error || "Could not remove that page.");
  };

  const currentPlan = sub?.plan || userPlan || "free";
  const isExpired = sub?.status === "expired" || sub?.isExpired;
  const periodEnd = sub?.period_end
    ? new Date(sub.period_end).toLocaleDateString()
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
            <span className="modal-title" id={titleId}>Settings</span>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close settings"
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
              aria-label="Settings categories"
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
                  {entry.label}
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
          <div className="settings-section-label">Account</div>
          <div className="settings-profile-card">
            <div className="settings-avatar" aria-hidden="true">
              <User size={16} strokeWidth={1.5} />
            </div>
            <div className="settings-profile-meta">
              <span className="settings-profile-email" title={email}>
                {email || "Guest"}
              </span>
              <span className="settings-profile-sub">Signed in to Corez</span>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Appearance</div>
          <button
            type="button"
            className="settings-row-btn"
            onClick={onToggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span className="settings-row-left">
              {isDark ? (
                <Sun size={16} strokeWidth={1.5} />
              ) : (
                <Moon size={16} strokeWidth={1.5} />
              )}
              <span>{isDark ? "Light mode" : "Dark mode"}</span>
            </span>
            <span className="settings-row-hint">
              {isDark ? "Switch to light" : "Switch to dark"}
            </span>
          </button>
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
          <div className="settings-section-label">Plan &amp; Billing</div>
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
                  {currentPlan} {isExpired ? "(expired)" : sub?.isScheduledDowngrade ? "(scheduled)" : ""}
                </div>
                <div className="pricing-status-desc">
                  {subLoading
                    ? "Loading…"
                    : sub?.isScheduledDowngrade && sub?.downgrade_plan
                      ? `Scheduled to downgrade to ${sub.downgrade_plan} on ${periodEnd} — you keep ${currentPlan} until then`
                      : currentPlan === "free"
                        ? "Free forever — upgrade anytime"
                        : periodEnd
                          ? isExpired
                            ? `Expired on ${periodEnd} — renew to continue`
                            : `Renews on ${periodEnd} • Monthly via Ziina`
                          : "Monthly via Ziina • Cancel anytime"}
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
                ? "Expired"
                : sub?.isScheduledDowngrade
                  ? "Scheduled"
                  : sub?.status === "active"
                    ? "Active"
                    : currentPlan === "free"
                      ? "Active"
                      : sub?.status || "Active"}
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
                Will downgrade to <strong style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>{sub.downgrade_plan}</strong> on {periodEnd}
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Keep current plan? Cancel scheduled downgrade.")) return;
                  try {
                    const r = await fetch("/api/subscriptions/cancel", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ undo: true }),
                    });
                    const d = await r.json().catch(() => ({}));
                    if (r.ok) {
                      alert("Scheduled downgrade canceled — keeping " + currentPlan);
                      const mr = await fetch("/api/subscriptions/me", { credentials: "include" });
                      const md = await mr.json().catch(() => ({}));
                      if (mr.ok) setSub(md);
                      try { await auth?.refresh?.(); } catch {}
                    } else alert(d.error || "Failed");
                  } catch (e) {
                    alert(e.message || "Failed");
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
                Keep {currentPlan}
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
            aria-label="Manage plan — go to pricing page"
          >
            <span className="pricing-manage-left">
              <span className="pricing-manage-title">Manage plan</span>
              <span className="pricing-manage-sub">
                View pricing • Upgrade or downgrade • Monthly via Ziina
              </span>
            </span>
            <span className="pricing-manage-cta">
              View pricing <ArrowRight size={14} strokeWidth={1.75} />
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
          <div className="settings-section-label">Published pages</div>
          <p className="settings-published-lede">
            Everything you have published to a public link. Removing a page takes
            the link offline immediately — the creation stays in its chat.
          </p>

          {publishedLoading && (
            <p className="settings-published-state" role="status">
              <Loader2 size={14} strokeWidth={1.75} className="spin" aria-hidden="true" />
              Checking your published pages…
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
                Try again
              </button>
            </div>
          )}

          {!publishedLoading && !publishedError && published.length === 0 && (
            <p className="settings-published-state">
              Nothing published yet. Publish from the preview pane and the link
              will appear here.
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
                      title={`Open corez.pro${page.url}`}
                    >
                      <Globe size={13} strokeWidth={1.75} aria-hidden="true" />
                      <span>{page.title || page.slug}</span>
                      <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
                    </a>
                    <span className="settings-published-sub">
                      corez.pro{page.url}
                      {page.pages > 0 ? ` · ${page.pages + 1} pages` : ""}
                      {page.createdAt
                        ? ` · ${new Date(page.createdAt).toLocaleDateString()}`
                        : ""}
                      {page.badge ? " · shows the Made with Corez badge" : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="settings-published-remove"
                    onClick={() => handleUnpublish(page)}
                    disabled={removingSlug === page.slug}
                    aria-label={`Remove published page ${page.title || page.slug}`}
                  >
                    {removingSlug === page.slug ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {publishedTruncated && !publishedLoading && (
            <p className="settings-published-state">
              You have more published pages than can be listed at once — the
              oldest are not shown here.
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
          <div className="settings-section-label">Privacy &amp; Cookies</div>
          <button
            type="button"
            className="settings-row-btn"
            onClick={openConsentPreferences}
            aria-label="Open cookie preferences"
          >
            <span className="settings-row-left">
              <ShieldCheck size={16} strokeWidth={1.5} />
              <span>Cookie settings</span>
            </span>
            <span className="settings-row-hint">Change what is allowed</span>
          </button>
          <div className="settings-legal-links">
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate("/privacy");
              }}
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate("/terms");
              }}
            >
              Terms
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate("/cookies");
              }}
            >
              Cookies
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate("/refunds");
              }}
            >
              Refunds
            </button>
          </div>
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="settings-danger-btn"
            onClick={onClearAllHistory}
          >
            <Trash2 size={15} strokeWidth={1.5} />
            <span>Clear Conversation History</span>
          </button>
          {auth?.user && (
            <button
              type="button"
              className="settings-row-btn"
              onClick={() => {
                onClose();
                auth.logout();
              }}
            >
              <span className="settings-row-left">
                <LogOut size={16} strokeWidth={1.5} />
                <span>Log out</span>
              </span>
            </button>
          )}
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}
