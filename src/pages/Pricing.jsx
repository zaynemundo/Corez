import { useState, useEffect } from "react";
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
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "0",
    currency: "AED",
    interval: "forever",
    desc: "Perfect to explore Corez",
    icon: Sparkles,
    features: [
      "20 generations / month",
      "1 project",
      "Community support",
      "Publish to corez.pro/*",
    ],
    cta: "Start for free",
    popular: false,
  },
  {
    id: "standard",
    name: "Standard",
    price: "18.36",
    currency: "AED",
    interval: "/ month",
    desc: "Most popular for creators",
    icon: Zap,
    features: [
      "200 generations / month",
      "10 projects",
      "Publish & share",
      "Priority queue",
      "Standard support",
    ],
    cta: "Upgrade to Standard",
    popular: true,
    highlight: true,
  },
  {
    id: "premium",
    name: "Premium",
    price: "27.54",
    currency: "AED",
    interval: "/ month",
    desc: "Full power for pros",
    icon: Crown,
    features: [
      "Unlimited generations",
      "Unlimited projects",
      "Priority support",
      "Early access to new models",
      "Custom domains (soon)",
    ],
    cta: "Go Premium",
    premium: true,
  },
];

export default function Pricing() {
  const { user } = useAuth() || {};
  const navigate = useNavigate();
  const [billing, setBilling] = useState("monthly"); // monthly | yearly (yearly shows save)
  const [payBusy, setPayBusy] = useState("");
  const [currentPlan, setCurrentPlan] = useState(user?.plan || "free");
  const [sub, setSub] = useState(null);
  const tierRank = { free: 0, standard: 1, premium: 2 };

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
      try {
        localStorage.setItem("corez_pending_plan", planId);
        localStorage.setItem("corez_next", "/pricing");
      } catch {}
      navigate("/?next=/pricing");
      return;
    }
    if (planId === currentPlan) return;

    const currentRank = tierRank[currentPlan] ?? 0;
    const targetRank = tierRank[planId] ?? 0;
    const isDowngrade = targetRank < currentRank;

    // Downgrade or cancel — schedule after period_end
    if (isDowngrade || planId === "free") {
      const targetLabel = planId === "free" ? "Free" : planId;
      const confirmMsg =
        planId === "free"
          ? "Downgrade to Free? You will keep current plan until period end, then switch to Free."
          : `Downgrade to ${targetLabel}? You will keep ${currentPlan} until period end, then switch to ${targetLabel}.`;
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
          alert(d.message || `Scheduled to downgrade to ${targetLabel} after current period`);
          // Refresh current plan — backend keeps current until period_end, but show scheduled
          try {
            const mr = await fetch("/api/subscriptions/me", { credentials: "include" });
            const md = await mr.json().catch(() => ({}));
            if (mr.ok) {
              setSub(md);
              if (md?.plan) setCurrentPlan(md.plan);
            }
          } catch {}
        } else alert(d.error || "Failed to schedule downgrade");
      } finally {
        setPayBusy("");
      }
      return;
    }

    // Upgrade — immediate checkout via Ziina
    setPayBusy(planId);
    try {
      const origin = window.location.origin;
      const r = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan: planId,
          success_url: origin + "/payment/success?plan=" + planId,
          cancel_url: origin + "/payment/cancel?plan=" + planId,
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
        alert(d.message || `Payment found completed — ${planId} activated`);
      } else {
        alert(d.error || "Checkout failed");
      }
    } catch (e) {
      alert(e.message || "Checkout failed");
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
          alert(vd.message || "Payment verified — plan activated");
          return;
        }
      }
      if (pendingInfo.redirect_url) window.location.href = pendingInfo.redirect_url;
      else alert("This checkout is no longer available — please try again.");
    } catch (e) {
      alert(e.message || "Could not resume payment");
    } finally {
      setPayBusy("");
    }
  };

  const abandonPendingCheckout = async () => {
    if (!confirm("Cancel this pending payment? Your current plan stays unchanged.")) return;
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
        if (d?.activated) alert("Payment had completed on Ziina — plan activated.");
      } else alert(d.error || "Failed to cancel pending payment");
    } catch (e) {
      alert(e.message || "Failed");
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
    <div className="pricing-page">
      <div className="pricing-bg" aria-hidden="true" />
      <header className="pricing-header">
        <div className="pricing-nav">
          <button onClick={() => navigate("/")} className="pricing-logo">
            COREZ
          </button>
          <div className="pricing-nav-actions">
            {user ? (
              <>
                <span className="pricing-nav-hint" style={{ textTransform: "capitalize" }}>
                  {currentPlan} • {user.email}
                </span>
                <button
                  onClick={() => navigate("/")}
                  className="pricing-nav-login"
                >
                  Back to Corez
                </button>
              </>
            ) : (
              <>
                <span className="pricing-nav-hint">Already have an account?</span>
                <button
                  onClick={() => navigate("/")}
                  className="pricing-nav-login"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
        <div className="pricing-hero">
          <div className="pricing-kicker">
            Pricing • Billed monthly via Ziina • Secure checkout
          </div>
          <h1 className="pricing-title">Plans that grow with you</h1>
          <p className="pricing-subtitle">
            Start free, upgrade when you need more. All plans include live
            preview, one-click publish and monthly billing via Ziina. Cancel
            anytime.
          </p>
          <div
            className="pricing-toggle"
            role="radiogroup"
            aria-label="Billing interval"
          >
            <button
              type="button"
              role="radio"
              aria-checked={billing === "monthly"}
              className={billing === "monthly" ? "active" : ""}
              onClick={() => setBilling("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={billing === "yearly"}
              className={billing === "yearly" ? "active" : ""}
              onClick={() => setBilling("yearly")}
            >
              Yearly <span className="pricing-save">Save 20%</span>
            </button>
          </div>
          {billing === "yearly" && (
            <div className="pricing-yearly-note">
              Yearly billing coming soon — stay on monthly and save 20% when it
              launches.
            </div>
          )}
        </div>
      </header>

      {user && sub?.pending_plan && sub.pending_plan !== currentPlan && (
        <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "0 24px 12px", width: "100%" }}>
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
              An unfinished <strong style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>{sub.pending_plan}</strong> checkout is waiting — you still have <strong style={{ textTransform: "capitalize" }}>{currentPlan}</strong> until you complete or cancel it.
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
                {payBusy === sub.pending_plan ? "Loading…" : "Continue payment"}
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
                Cancel
              </button>
            </span>
          </div>
        </div>
      )}

      {sub?.isScheduledDowngrade && sub?.downgrade_plan && (
        <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "0 24px 12px", width: "100%" }}>
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
              Scheduled to downgrade to <strong style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>{sub.downgrade_plan}</strong> on{" "}
              {sub.period_end ? new Date(sub.period_end).toLocaleDateString() : "period end"} — you keep <strong style={{ textTransform: "capitalize" }}>{currentPlan}</strong> until then.
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
                    if (mr.ok) {
                      setSub(md);
                      if (md?.plan) setCurrentPlan(md.plan);
                    }
                  } else alert(d.error || "Failed");
                } catch (e) {
                  alert(e.message || "Failed");
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
              Keep {currentPlan}
            </button>
          </div>
        </div>
      )}

      <main className="pricing-main">
        <div className="pricing-grid-page">
          {PLANS.map((p) => {
            const isCurrent = currentPlan === p.id;
            const Icon = p.icon;
            const busy = payBusy === p.id;
            const yearlyPrice =
              p.id === "free" ? "0" : p.id === "standard" ? "14.69" : "22.03"; // 20% off
            const displayPrice =
              billing === "yearly" && p.id !== "free" ? yearlyPrice : p.price;
            return (
              <div
                key={p.id}
                className={`pricing-card-page ${p.premium ? "pricing-card-page--premium" : ""} ${p.highlight ? "pricing-card-page--highlight" : ""} ${isCurrent ? "pricing-card-page--current" : ""}`}
              >
                {p.popular && (
                  <span className="pricing-popular-page">Most popular</span>
                )}
                {isCurrent && (
                  <span className="pricing-current-page">
                    <Check size={11} /> Current
                  </span>
                )}
                <div className="pricing-card-page-icon">
                  <Icon size={18} strokeWidth={1.75} />
                </div>
                <div className="pricing-card-page-name">{p.name}</div>
                <div className="pricing-card-page-desc">{p.desc}</div>
                <div className="pricing-card-page-price">
                  <span className="pricing-amount">{displayPrice}</span>
                  <span className="pricing-currency">{p.currency}</span>
                  <span className="pricing-interval">{p.interval}</span>
                </div>
                {billing === "yearly" && p.id !== "free" && (
                  <div className="pricing-billed-yearly">
                    Billed yearly •{" "}
                    {p.id === "standard"
                      ? "176.28 AED / year"
                      : "264.36 AED / year"}
                  </div>
                )}
                <button
                  type="button"
                  disabled={busy || isCurrent || sub?.downgrade_plan === p.id}
                  onClick={() => handleCheckout(p.id)}
                  className={`pricing-cta-page ${p.premium ? "premium" : p.id === "standard" ? "standard" : "free"} ${isCurrent || sub?.downgrade_plan === p.id ? "current" : ""}`}
                >
                  {busy
                    ? "Processing…"
                    : isCurrent
                      ? "Current plan"
                      : sub?.downgrade_plan === p.id
                        ? "Scheduled"
                        : tierRank[p.id] < tierRank[currentPlan]
                          ? "Downgrade"
                          : p.cta}
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
                      {f}
                    </li>
                  ))}
                </ul>
                {p.id !== "free" && (
                  <div className="pricing-secure">
                    <Shield size={12} /> Secure checkout via Ziina •{" "}
                    <Clock size={12} /> Monthly • Cancel anytime
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pricing-compare">
          <h2 className="pricing-compare-title">Compare plans</h2>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Free</th>
                  <th>Standard</th>
                  <th>Premium</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Generations / month</td>
                  <td>20</td>
                  <td>200</td>
                  <td>Unlimited</td>
                </tr>
                <tr>
                  <td>Projects</td>
                  <td>1</td>
                  <td>10</td>
                  <td>Unlimited</td>
                </tr>
                <tr>
                  <td>Publish to corez.pro</td>
                  <td>
                    <Check size={14} className="pricing-tick" />
                  </td>
                  <td>
                    <Check size={14} className="pricing-tick" />
                  </td>
                  <td>
                    <Check size={14} className="pricing-tick" />
                  </td>
                </tr>
                <tr>
                  <td>Priority queue</td>
                  <td>
                    <X size={14} className="pricing-cross" />
                  </td>
                  <td>
                    <Check size={14} className="pricing-tick" />
                  </td>
                  <td>
                    <Check size={14} className="pricing-tick" />
                  </td>
                </tr>
                <tr>
                  <td>Priority support</td>
                  <td>
                    <X size={14} className="pricing-cross" />
                  </td>
                  <td>
                    <X size={14} className="pricing-cross" />
                  </td>
                  <td>
                    <Check size={14} className="pricing-tick" />
                  </td>
                </tr>
                <tr>
                  <td>Early access</td>
                  <td>
                    <X size={14} className="pricing-cross" />
                  </td>
                  <td>
                    <X size={14} className="pricing-cross" />
                  </td>
                  <td>
                    <Check size={14} className="pricing-tick" />
                  </td>
                </tr>
                <tr>
                  <td>Price</td>
                  <td>0 AED</td>
                  <td>18.36 AED / mo</td>
                  <td>27.54 AED / mo</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="pricing-faq">
          <h2>FAQs</h2>
          <div className="pricing-faq-grid">
            <div>
              <h3>Can I cancel anytime?</h3>
              <p>
                Yes. Downgrade to Free in Settings → Plan & Billing or on this
                page. You keep paid features until the period ends.
              </p>
            </div>
            <div>
              <h3>How does monthly billing work?</h3>
              <p>
                Billed monthly via Ziina (UAE). Standard 1836 fils, Premium 2754
                fils. We create a 30-day subscription on successful payment —
                renew manually when it expires.
              </p>
            </div>
            <div>
              <h3>What payment methods?</h3>
              <p>
                Ziina hosted checkout: cards, Apple Pay & Google Pay where
                supported. Test mode uses any card.
              </p>
            </div>
            <div>
              <h3>Need help?</h3>
              <p>
                Contact us via the app. Free forever — upgrade when you need
                more.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="pricing-footer">
        <span>
          © {new Date().getFullYear()} Corez • Secure checkout via Ziina • AED •
          Monthly
        </span>
        <button onClick={() => navigate("/")} className="pricing-footer-link">
          Back to Corez →
        </button>
      </footer>
    </div>
  );
}
