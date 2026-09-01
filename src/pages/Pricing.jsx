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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/subscriptions/me", {
          credentials: "include",
        });
        const d = await r.json().catch(() => ({}));
        if (!cancelled && r.ok && d?.plan) setCurrentPlan(d.plan);
        else if (!cancelled && user?.plan) setCurrentPlan(user.plan);
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
    if (planId === "free") {
      if (
        !confirm(
          "Downgrade to Free? You will lose paid features at period end.",
        )
      )
        return;
      setPayBusy(planId);
      try {
        const r = await fetch("/api/subscriptions/cancel", {
          method: "POST",
          credentials: "include",
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          alert("Downgraded to Free");
          setCurrentPlan("free");
        } else alert(d.error || "Failed");
      } finally {
        setPayBusy("");
      }
      return;
    }
    if (planId === currentPlan) return;
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
      } else {
        alert(d.error || "Checkout failed");
      }
    } catch (e) {
      alert(e.message || "Checkout failed");
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
                  disabled={busy || isCurrent}
                  onClick={() => handleCheckout(p.id)}
                  className={`pricing-cta-page ${p.premium ? "premium" : p.id === "standard" ? "standard" : "free"} ${isCurrent ? "current" : ""}`}
                >
                  {busy
                    ? "Processing…"
                    : isCurrent
                      ? "Current plan"
                      : p.id === "free"
                        ? "Downgrade"
                        : p.cta}
                  {!isCurrent && p.id !== "free" && (
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
