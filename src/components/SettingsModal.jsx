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
          <div className="pricing-footnote">
            Connected to <strong>/pricing</strong> • Standard 18.36 AED /
            Premium 27.54 AED • Billed monthly • <ExternalLink size={10} />{" "}
            Secure Ziina checkout
            <br />
            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
              Cancel or downgrade takes effect after current period ends — you keep current plan until {periodEnd || "period end"}.
            </span>
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
