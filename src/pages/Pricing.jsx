import { useState, useEffect, useRef } from "react";
import {
  Check,
  Sparkles,
  Zap,
  Crown,
  ArrowRight,
  Shield,
  Clock,
  X,
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { openConsentPreferences } from "../services/consentService";
import { useI18n } from "../i18n/index.jsx";
import { formatDate } from "../i18n/format.js";

const PLANS = [
  {
    id: "free",
    name: "pricing.plans.free.name",
    price: "0",
    currency: "AED",
    interval: "pricing.plans.intervalForever",
    desc: "pricing.plans.free.desc",
    icon: Sparkles,
    features: [
      "pricing.plans.free.generations",
      "pricing.plans.free.projects",
      "pricing.plans.free.badge",
      "pricing.plans.free.support",
    ],
    cta: "pricing.plans.free.cta",
    popular: false,
  },
  {
    id: "standard",
    name: "pricing.plans.standard.name",
    price: "18.36",
    currency: "AED",
    interval: "pricing.plans.intervalMonth",
    desc: "pricing.plans.standard.desc",
    icon: Zap,
    features: [
      "pricing.plans.standard.generations",
      "pricing.plans.standard.projects",
      "pricing.plans.features.badgeFree",
      "pricing.plans.features.customSlug",
      "pricing.plans.standard.priorityQueue",
      "pricing.plans.standard.support",
    ],
    cta: "pricing.plans.standard.cta",
    popular: true,
    highlight: true,
  },
  {
    id: "premium",
    name: "pricing.plans.premium.name",
    price: "27.54",
    currency: "AED",
    interval: "pricing.plans.intervalMonth",
    desc: "pricing.plans.premium.desc",
    icon: Crown,
    features: [
      "pricing.plans.premium.generations",
      "pricing.plans.premium.projects",
      "pricing.plans.features.badgeFree",
      "pricing.plans.features.customSlug",
      "pricing.plans.premium.prioritySupport",
      "pricing.plans.premium.earlyAccess",
      "pricing.plans.premium.customDomains",
    ],
    cta: "pricing.plans.premium.cta",
    premium: true,
  },
];

export default function Pricing() {
  const { t, language } = useI18n();
  const { user } = useAuth() || {};
  const navigate = useNavigate();
  const [billing, setBilling] = useState("monthly"); // monthly | yearly (yearly shows save)
  const [payBusy, setPayBusy] = useState("");
  const [currentPlan, setCurrentPlan] = useState(user?.plan || "free");
  const [sub, setSub] = useState(null);
  const pageRef = useRef(null);
  const tierRank = { free: 0, standard: 1, premium: 2 };

  // The pricing page scrolls inside its own container, so keyboard scrolling
  // needs focus inside it (the document itself is not the scroller).
  useEffect(() => {
    const node = pageRef.current;
    if (node && typeof node.focus === "function") node.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/subscriptions/me", {
          credentials: "include",
        });
        const d = await r.json().catch(() => ({}));
        if (!cancelled && r.ok) {
          if (d?.plan) setCurrentPlan(d.plan);
          setSub(d);
        } else if (!cancelled && user?.plan) setCurrentPlan(user.plan);
      } catch {}
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.plan]);

  const handleCheckout = async (planId) => {
    if (!user) {
      // A visitor choosing Free goes straight to sign-in: the plan is free, so
      // there is no checkout to resume and nothing to remember.
      if (planId === "free") {
        navigate("/login");
        return;
      }
      try {
        localStorage.setItem("corez_pending_plan", planId);
        localStorage.setItem("corez_next", "/pricing");
      } catch {}
      navigate("/login");
      return;
    }
    // Handle same plan but different billing interval (monthly -> yearly is an upgrade)
    const isSamePlanYearlyUpgrade = planId === currentPlan && billing === "yearly" && sub?.interval !== "year";
    if (planId === currentPlan && !isSamePlanYearlyUpgrade) return;

    const currentRank = tierRank[currentPlan] ?? 0;
    const targetRank = tierRank[planId] ?? 0;
    const isDowngrade = targetRank < currentRank && !isSamePlanYearlyUpgrade;

    // Downgrade or cancel — schedule after period_end (but not for yearly upgrade)
    if ((isDowngrade || planId === "free") && !isSamePlanYearlyUpgrade) {
      const targetLabel = planId === "free" ? t("pricing.plans.free.name") : planId;
      const confirmMsg =
        planId === "free"
          ? t("pricing.dialogs.downgradeFree")
          : t("pricing.dialogs.downgrade", {
              target: targetLabel,
              current: currentPlan,
            });
      if (!confirm(confirmMsg)) return;
      setPayBusy(planId);
      try {
        const r = await fetch("/api/subscriptions/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ plan: planId }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          alert(
            d.message ||
              t("pricing.dialogs.downgradeScheduled", { target: targetLabel }),
          );
          // Refresh current plan — backend keeps current until period_end, but show scheduled
          try {
            const mr = await fetch("/api/subscriptions/me", { credentials: "include" });
            const md = await mr.json().catch(() => ({}));
            if (mr.ok) {
              setSub(md);
              if (md?.plan) setCurrentPlan(md.plan);
            }
          } catch {}
        } else alert(d.error || t("pricing.dialogs.downgradeFailed"));
      } finally {
        setPayBusy("");
      }
      return;
    }

    // Upgrade — immediate checkout via Ziina (handle yearly billing)
    setPayBusy(planId);
    try {
      const origin = window.location.origin;
      const interval = billing === "yearly" && planId !== "free" ? "yearly" : "monthly";
      const r = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan: planId,
          interval,
          success_url: origin + "/payment/success?plan=" + planId + "&interval=" + interval,
          cancel_url: origin + "/pricing",
          test: false,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.redirect_url) {
        window.location.href = d.redirect_url;
      } else if (r.ok && d.verified) {
        // The earlier checkout was actually paid — the server activated it.
        try {
          const mr = await fetch("/api/subscriptions/me", { credentials: "include" });
          const md = await mr.json().catch(() => ({}));
          if (mr.ok) {
            setSub(md);
            if (md?.plan) setCurrentPlan(md.plan);
          }
        } catch {}
        alert(
          d.message || t("pricing.dialogs.paymentFound", { plan: planId }),
        );
      } else {
        alert(d.error || t("pricing.dialogs.checkoutFailed"));
      }
    } catch (e) {
      alert(e.message || t("pricing.dialogs.checkoutFailed"));
    } finally {
      setPayBusy("");
    }
  };

  const resumePendingCheckout = async () => {
    setPayBusy(sub?.pending_plan || "pending");
    try {
      const r = await fetch("/api/subscriptions/pending", { credentials: "include" });
      const d = await r.json().catch(() => ({}));
      const pendingInfo = d?.pending;
      if (!pendingInfo) {
        const mr = await fetch("/api/subscriptions/me", { credentials: "include" });
        const md = await mr.json().catch(() => ({}));
        setSub(md);
        if (md?.plan) setCurrentPlan(md.plan);
        return;
      }
      if (String(pendingInfo.status || "").toLowerCase() === "completed") {
        const vr = await fetch("/api/subscriptions/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ payment_id: pendingInfo.payment_id, plan: pendingInfo.plan }),
        });
        const vd = await vr.json().catch(() => ({}));
        if (vr.ok && vd?.verified) {
          const mr = await fetch("/api/subscriptions/me", { credentials: "include" });
          const md = await mr.json().catch(() => ({}));
          setSub(md);
          if (md?.plan) setCurrentPlan(md.plan);
          alert(vd.message || t("pricing.dialogs.paymentVerified"));
          return;
        }
      }
      if (pendingInfo.redirect_url) window.location.href = pendingInfo.redirect_url;
      else alert(t("pricing.dialogs.checkoutUnavailable"));
    } catch (e) {
      alert(e.message || t("pricing.dialogs.resumeFailed"));
    } finally {
      setPayBusy("");
    }
  };

  const abandonPendingCheckout = async () => {
    if (!confirm(t("pricing.dialogs.cancelPending"))) return;
    setPayBusy(sub?.pending_plan || "pending");
    try {
      const r = await fetch("/api/subscriptions/abandon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan: sub?.pending_plan || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        const mr = await fetch("/api/subscriptions/me", { credentials: "include" });
        const md = await mr.json().catch(() => ({}));
        setSub(md);
        if (md?.plan) setCurrentPlan(md.plan);
        if (d?.activated) alert(t("pricing.dialogs.paymentCompleted"));
      } else alert(d.error || t("pricing.dialogs.cancelPendingFailed"));
    } catch (e) {
      alert(e.message || t("pricing.dialogs.failed"));
    } finally {
      setPayBusy("");
    }
  };

  // If user just logged in with a pending plan from pricing, auto-resume checkout
  useEffect(() => {
    if (!user) return;
    let pending = null;
    try {
      pending = localStorage.getItem("corez_pending_plan");
    } catch {}
    if (pending && (pending === "standard" || pending === "premium")) {
      try {
        localStorage.removeItem("corez_pending_plan");
        localStorage.removeItem("corez_next");
      } catch {}
      setTimeout(() => handleCheckout(pending), 400);
    }
  }, [user]);

  return (
    <div className="pricing-page" ref={pageRef} tabIndex={-1}>
      <div className="pricing-bg" aria-hidden="true" />
      <div className="pricing-nav">
        <button onClick={() => navigate("/")} className="pricing-logo">
          COREZ
        </button>
        <div className="pricing-nav-actions">
          {user ? (
            <>
              <button
                onClick={() => navigate("/")}
                className="pricing-nav-close"
                aria-label={t("pricing.page.backToCorez")}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate("/login")}
                className="pricing-nav-login"
              >
                {t("pricing.page.signIn")}
              </button>
            </>
          )}
        </div>
      </div>
      <header className="pricing-header">
        <div className="pricing-hero">
          <h1 className="pricing-title">{t("pricing.page.title")}</h1>
          <p className="pricing-subtitle">{t("pricing.page.subtitle")}</p>
          <div
            className="pricing-toggle"
            role="radiogroup"
            aria-label={t("pricing.page.billingInterval")}
          >
            <button
              type="button"
              role="radio"
              aria-checked={billing === "monthly"}
              className={billing === "monthly" ? "active" : ""}
              onClick={() => setBilling("monthly")}
            >
              {t("pricing.page.monthly")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={billing === "yearly"}
              className={billing === "yearly" ? "active" : ""}
              onClick={() => setBilling("yearly")}
            >
              {t("pricing.page.yearly")}
              {" "}
              <span className="pricing-save">{t("pricing.page.saveYearly")}</span>
            </button>
          </div>
        </div>
      </header>

      {user && sub?.pending_plan && sub.pending_plan !== currentPlan && (
        <div className="pricing-banner-wrap" style={{ maxWidth: "1120px", margin: "0 auto", padding: "0 24px 12px", width: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              padding: "12px 14px",
              borderRadius: "12px",
              background: "rgba(251,191,36,0.08)",
              border: "1px solid rgba(251,191,36,0.18)",
              fontSize: "13px",
            }}
          >
            <span style={{ color: "var(--text-secondary)", lineHeight: 1.4 }}>
              {t("pricing.pending.intro")}
              <strong style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>{sub.pending_plan}</strong>
              {t("pricing.pending.middle")}
              <strong style={{ textTransform: "capitalize" }}>{currentPlan}</strong>
              {t("pricing.pending.end")}
            </span>
            <span style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
              <button
                type="button"
                onClick={resumePendingCheckout}
                disabled={payBusy === sub.pending_plan}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border: "1px solid var(--text-primary)",
                  background: "var(--text-primary)",
                  color: "var(--bg-primary)",
                  fontWeight: 600,
                  fontSize: "12px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {payBusy === sub.pending_plan
                  ? t("common.status.loading")
                  : t("pricing.page.continuePayment")}
              </button>
              <button
                type="button"
                onClick={abandonPendingCheckout}
                disabled={payBusy === sub.pending_plan}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  fontWeight: 600,
                  fontSize: "12px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t("common.action.cancel")}
              </button>
            </span>
          </div>
        </div>
      )}

      {sub?.isScheduledDowngrade && sub?.downgrade_plan && (
        <div className="pricing-banner-wrap" style={{ maxWidth: "1120px", margin: "0 auto", padding: "0 24px 12px", width: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "12px 14px",
              borderRadius: "12px",
              background: "rgba(251,191,36,0.08)",
              border: "1px solid rgba(251,191,36,0.18)",
              fontSize: "13px",
            }}
          >
            <span style={{ color: "var(--text-secondary)", lineHeight: 1.4 }}>
              {t("pricing.scheduled.intro")}
              <strong style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>{sub.downgrade_plan}</strong>
              {t("pricing.scheduled.on")}
              {sub.period_end ? formatDate(sub.period_end, language) : t("pricing.page.periodEnd")}
              {t("pricing.scheduled.end")}
              <strong style={{ textTransform: "capitalize" }}>{currentPlan}</strong>
              {t("pricing.scheduled.until")}
            </span>
            <button
              type="button"
              onClick={async () => {
                if (!confirm(t("pricing.dialogs.keepPlan"))) return;
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
                      t("pricing.dialogs.downgradeCanceled", {
                        plan: currentPlan,
                      }),
                    );
                    const mr = await fetch("/api/subscriptions/me", { credentials: "include" });
                    const md = await mr.json().catch(() => ({}));
                    if (mr.ok) {
                      setSub(md);
                      if (md?.plan) setCurrentPlan(md.plan);
                    }
                  } else alert(d.error || t("pricing.dialogs.failed"));
                } catch (e) {
                  alert(e.message || t("pricing.dialogs.failed"));
                }
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "999px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                fontWeight: 600,
                fontSize: "12px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t("pricing.page.keepPlan", { plan: currentPlan })}
            </button>
          </div>
        </div>
      )}

      <main className="pricing-main">
        <div className="pricing-grid-page">
          {PLANS.map((p) => {
            const isYearlySelected = billing === "yearly" && p.id !== "free";
            // "Current plan" only means something for a signed-in account: a
            // visitor was shown Free as their current plan with the button
            // disabled, so the free plan could not be started at all.
            const isCurrent = Boolean(user) && currentPlan === p.id && !isYearlySelected;
            const Icon = p.icon;
            const busy = payBusy === p.id;
            const yearlyPrice =
              p.id === "free" ? "0" : p.id === "standard" ? "14.69" : "22.03"; // 20% off
            const displayPrice = isYearlySelected ? yearlyPrice : p.price;
            return (
              <div
                key={p.id}
                className={`pricing-card-page ${p.premium ? "pricing-card-page--premium" : ""} ${p.highlight ? "pricing-card-page--highlight" : ""} ${isCurrent ? "pricing-card-page--current" : ""}`}
              >
                {p.popular && (
                  <span className="pricing-popular-page">
                    {t("pricing.page.mostPopular")}
                  </span>
                )}
                {isCurrent && (
                  <span className="pricing-current-page">
                    <Check size={11} /> {t("pricing.page.current")}
                  </span>
                )}
                <div className="pricing-card-page-icon">
                  <Icon size={18} strokeWidth={1.75} />
                </div>
                <div className="pricing-card-page-name">{t(p.name)}</div>
                <div className="pricing-card-page-desc">{t(p.desc)}</div>
                <div className="pricing-card-page-price">
                  <span className="pricing-amount">{displayPrice}</span>
                  <span className="pricing-currency">{p.currency}</span>
                  <span className="pricing-interval">{t(p.interval)}</span>
                </div>
                {billing === "yearly" && p.id !== "free" && (
                  <div className="pricing-billed-yearly">
                    {t("pricing.page.billedYearly", {
                      amount: p.id === "standard" ? "176.28" : "264.36",
                    })}
                  </div>
                )}
                <button
                  type="button"
                  disabled={busy || isCurrent || sub?.downgrade_plan === p.id}
                  onClick={() => handleCheckout(p.id)}
                  className={`pricing-cta-page ${p.premium ? "premium" : p.id === "standard" ? "standard" : "free"} ${isCurrent || sub?.downgrade_plan === p.id ? "current" : ""}`}
                >
                  {busy
                    ? t("pricing.page.processing")
                    : isCurrent
                      ? t("pricing.page.currentPlan")
                      : sub?.downgrade_plan === p.id
                        ? t("pricing.page.scheduled")
                        : tierRank[p.id] < tierRank[currentPlan]
                          ? t("pricing.page.downgrade")
                          : t(p.cta)}
                  {!isCurrent && sub?.downgrade_plan !== p.id && tierRank[p.id] >= tierRank[currentPlan] && p.id !== "free" && (
                    <ArrowRight size={14} strokeWidth={1.75} />
                  )}
                </button>
                <ul className="pricing-features-page">
                  {p.features.map((f) => (
                    <li key={f}>
                      <span className="pricing-check">
                        <Check size={12} strokeWidth={2} />
                      </span>
                      {t(f)}
                    </li>
                  ))}
                </ul>
                {p.id !== "free" && (
                  <div className="pricing-secure">
                    <Shield size={12} /> {t("pricing.page.secureCheckout")}{" "}
                    <Clock size={12} /> {t("pricing.page.monthlyCancel")}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </main>

      <footer className="pricing-footer">
        <Link to="/privacy">{t("pricing.page.privacyPolicy")}</Link>
        <Link to="/terms">{t("pricing.page.terms")}</Link>
        <Link to="/cookies">{t("pricing.page.cookiePolicy")}</Link>
        <Link to="/refunds">{t("pricing.page.refundPolicy")}</Link>
        <button
          type="button"
          className="pricing-footer-plain"
          onClick={openConsentPreferences}
        >
          {t("pricing.page.cookieSettings")}
        </button>
      </footer>
    </div>
  );
}
