import { useState, useEffect } from "react";
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
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function SettingsModal({
  isOpen,
  onClose,
  onClearAllHistory,
  theme,
  onToggleTheme,
}) {
  if (!isOpen) return null;
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

  const currentPlan = sub?.plan || userPlan || "free";
  const isExpired = sub?.status === "expired" || sub?.isExpired;
  const periodEnd = sub?.period_end
    ? new Date(sub.period_end).toLocaleDateString()
    : null;
  const navigate = useNavigate();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card settings-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Settings size={18} strokeWidth={1.5} />
            <span className="modal-title">Settings</span>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

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

        <div className="settings-section pricing-section">
          <div className="settings-section-label">Plan &amp; Billing</div>
          <div
            className={`pricing-status ${isExpired ? "expired" : currentPlan}`}
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
                  {currentPlan} {isExpired ? "(expired)" : ""}
                </div>
                <div className="pricing-status-desc">
                  {subLoading
                    ? "Loading…"
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
              className={`pricing-status-badge ${isExpired ? "expired" : "active"}`}
            >
              {isExpired
                ? "Expired"
                : sub?.status === "active"
                  ? "Active"
                  : currentPlan === "free"
                    ? "Active"
                    : sub?.status || "Active"}
            </span>
          </div>

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
          <div className="pricing-footnote">
            Connected to <strong>/pricing</strong> • Standard 18.36 AED /
            Premium 27.54 AED • Billed monthly • <ExternalLink size={10} />{" "}
            Secure Ziina checkout
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Support</div>
          <div
            style={{
              fontSize: "0.825rem",
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}
          >
            Corez automatically routes text, code and visual requests through
            configured hosted AI services with resilient fallbacks. Model
            selection is managed server-side.
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
  );
}
