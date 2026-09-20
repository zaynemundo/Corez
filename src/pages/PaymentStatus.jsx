import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export function PaymentSuccess() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("verifying"); // verifying | success | expired | error
  const [detail, setDetail] = useState("");
  const plan = search.get("plan") || "standard";
  const urlInterval = (search.get("interval") || "").toLowerCase();
  // Add-on packs settle through their own ledger: the URL carries the SKU, and
  // the payment id is matched back to the recorded purchase server-side.
  const addonSku = search.get("addon");

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      try {
        const paymentId =
          search.get("payment_id") ||
          search.get("id") ||
          search.get("paymentId");

        if (addonSku) {
          const body = {};
          if (paymentId) body.payment_id = paymentId;
          if (search.get("purchaseId")) body.purchaseId = search.get("purchaseId");
          const res = await fetch("/api/addons/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
          });
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (res.ok && data.granted) {
            setStatus("success");
            const label = data.purchase?.label || "Add-on";
            const credits = data.purchase?.credits || 0;
            const unit = data.purchase?.unitLabel || "credits";
            setDetail(`Verified — ${credits} ${unit} added to your ${label} balance.`);
          } else if (res.ok && data.alreadySettled) {
            setStatus("success");
            setDetail(data.message || "These credits were already added.");
          } else if (res.ok) {
            setStatus("verifying");
            setDetail(data.message || "Payment is not completed yet.");
            setTimeout(() => {
              if (!cancelled) window.location.reload();
            }, 3000);
          } else {
            setStatus("error");
            setDetail(data.error || "Verification failed. Please contact support.");
          }
          return;
        }

        let body = {};
        if (paymentId) body.payment_id = paymentId;
        if (plan) body.plan = plan;
        if (urlInterval) body.interval = urlInterval;

        const res = await fetch("/api/subscriptions/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          if (res.ok && data.verified) {
            setStatus("success");
            const interval = String(
              data.interval || urlInterval || "month",
            ).toLowerCase();
            const isYearly =
              interval === "year" ||
              interval === "yearly" ||
              interval === "annual";
            const aed =
              data.aed ||
              (plan === "premium"
                ? isYearly
                  ? "264.36"
                  : "27.54"
                : isYearly
                  ? "176.28"
                  : "18.36");
            const end = data.period_end
              ? new Date(data.period_end).toLocaleDateString()
              : isYearly
                ? "365 days from now"
                : "30 days from now";
            setDetail(
              isYearly
                ? `Verified — ${data.plan || plan} active. ${aed} AED / year. Valid until ${end}.`
                : `Verified — ${data.plan || plan} active. ${aed} AED / month. Renews on ${end}.`,
            );
          } else if (data.verified === false) {
            setStatus("verifying");
            setDetail(
              data.message ||
                `Payment status: ${data.status}. Please complete payment on Ziina and try again.`,
            );
            // Poll once more after 2s
            setTimeout(() => {
              if (!cancelled) window.location.reload();
            }, 3000);
          } else {
            setStatus("error");
            setDetail(
              data.error || "Verification failed. Please contact support.",
            );
          }
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setDetail(e.message || "Verification failed");
        }
      }
    };
    verify();
    return () => {
      cancelled = true;
    };
  }, [search, plan, addonSku]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        /* flex-start + `margin: auto` on the card: centres while there is room
           and never clips the top when the card overflows a short viewport
           (plain `align-items: center` does clip). */
        alignItems: "flex-start",
        justifyContent: "center",
        background: "var(--bg-primary)",
        padding:
          "max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))",
        /* Scrolls instead of clipping: body/#root are fixed to 100dvh with
           overflow hidden, so a tall card used to be unreachable. */
        overflowY: "auto",
      }}
    >
      <div
        style={{
          maxWidth: "520px",
          width: "100%",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: "16px",
          padding: "32px",
          textAlign: "center",
          /* auto margins keep the card centred but let it align to the start
             (and stay reachable) once it overflows a short viewport. */
          margin: "auto",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            fontWeight: 600,
          }}
        >
          Corez — Payment
        </div>
        <h1 style={{ margin: "12px 0 8px", fontSize: "24px", fontWeight: 800 }}>
          {status === "verifying"
            ? "Verifying payment…"
            : status === "success"
              ? "Payment successful ✓"
              : "Payment issue"}
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "14px",
            lineHeight: 1.6,
          }}
        >
          {detail || "Checking your subscription…"}
        </p>
        {status === "verifying" && (
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              gap: "8px",
              justifyContent: "center",
            }}
          >
            <span
              className="thinking-dot"
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--text-muted)",
                display: "inline-block",
                animation: "thinkingDotPulse 1.4s infinite ease-in-out both",
              }}
            />
            <span
              className="thinking-dot"
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--text-muted)",
                display: "inline-block",
                animation: "thinkingDotPulse 1.4s 0.2s infinite ease-in-out both",
              }}
            />
            <span
              className="thinking-dot"
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--text-muted)",
                display: "inline-block",
                animation: "thinkingDotPulse 1.4s 0.4s infinite ease-in-out both",
              }}
            />
          </div>
        )}
        <div
          style={{
            marginTop: "24px",
            display: "flex",
            gap: "12px",
            justifyContent: "center",
          }}
        >
          <button
            onClick={() => navigate("/")}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "var(--text-primary)",
              color: "var(--bg-primary)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Go to Corez
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "transparent",
              color: "var(--text-primary)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
        <p
          style={{
            marginTop: "16px",
            fontSize: "11px",
            color: "var(--text-muted)",
          }}
        >
          Standard 18.36 AED / month • Premium 27.54 AED / month • Billed
          monthly via Ziina • Cancel anytime
        </p>
      </div>
    </div>
  );
}
