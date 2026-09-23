import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ConsentCheckbox from "../components/ConsentCheckbox";
import { LEGAL_DOCUMENT_VERSION } from "../data/legalDocuments";
import { openConsentPreferences, recordPolicyAcceptance } from "../services/consentService";
import { track } from "../services/analytics";
import { useI18n } from "../i18n/index.jsx";
import mercuryBg from "../../assets/Mercury_5.jpeg";

export default function Login() {
  const { login, signup, forgot, reset } = useAuth();
  const [mode, setMode] = useState(() => {
    // If URL has ?token=... prefill reset mode (from email link)
    try {
      const t = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      ).get("token");
      return t ? "reset" : "login";
    } catch {
      return "login";
    }
  }); // 'login' | 'signup' | 'forgot' | 'reset'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState("");
  const [resetToken, setResetToken] = useState(() => {
    try {
      return (
        new URLSearchParams(
          typeof window !== "undefined" ? window.location.search : "",
        ).get("token") || ""
      );
    } catch {
      return "";
    }
  });
  const [newPassword, setNewPassword] = useState("");
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [consentError, setConsentError] = useState("");
  const navigate = useNavigate();
  const { t } = useI18n();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    // Consent is checked before anything is sent: an account cannot be created
    // without the Terms and Privacy Policy having been actively accepted.
    if (mode === "signup" && !acceptedPolicies) {
      setConsentError(t("auth.signup.consentError"));
      return;
    }
    setConsentError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
        track("sign_in_completed", { surface: "login_form" });
        // If user came from pricing with pending plan, go back to pricing
        try {
          const pending = localStorage.getItem("corez_pending_plan");
          const next = new URLSearchParams(window.location.search).get("next") || localStorage.getItem("corez_next");
          if (pending && (pending === "standard" || pending === "premium")) {
            navigate("/pricing");
          } else if (next === "/pricing") {
            localStorage.removeItem("corez_next");
            navigate("/pricing");
          }
        } catch {}
      } else if (mode === "signup") {
        const acceptedAt = Date.now();
        track("sign_up_started", { surface: "login_form" });
        await signup(email, password, "free", {
          termsVersion: LEGAL_DOCUMENT_VERSION,
          acceptedAt,
        });
        // Local copy of the acceptance, kept with the cookie-consent record so
        // the visitor can see what they agreed to without asking us. Signing up
        // no longer answers the marketing question: that lives in the consent
        // dialog, and this receipt must not overwrite an answer given there.
        recordPolicyAcceptance({ source: "signup" });
        track("sign_up_completed", { plan: "free" });
        try {
          const pending = localStorage.getItem("corez_pending_plan");
          if (pending) {
            localStorage.removeItem("corez_pending_plan");
            localStorage.removeItem("corez_next");
            navigate("/pricing");
          }
        } catch {}
      } else if (mode === "forgot") {
        const res = await forgot(email);
        setForgotSent(res.message || t("auth.forgot.sent"));
        // In dev without RESEND, token is returned - prefill for testing
        if (res.token) setResetToken(res.token);
      } else if (mode === "reset") {
        await reset(resetToken, newPassword);
        setError("");
        setForgotSent(t("auth.reset.success"));
        setMode("login");
        setNewPassword("");
        setResetToken("");
        // clear token from URL
        try {
          window.history.replaceState({}, "", window.location.pathname);
        } catch {}
      }
    } catch (err) {
      setError(err.message || t("common.error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div
        className="auth-bg"
        style={{ backgroundImage: `url(${mercuryBg})` }}
        aria-hidden="true"
      />
      <div className="auth-bg-overlay" aria-hidden="true" />
      <div className="auth-center">
        <div className="auth-card">
          <div className="auth-logo">
            <h1 className="auth-logo-word">COREZ</h1>
            <span className="auth-logo-sub">
              {mode === "login"
                ? t("auth.login.subtitle")
                : mode === "signup"
                  ? t("auth.signup.subtitle")
                  : mode === "forgot"
                    ? t("auth.forgot.subtitle")
                    : t("auth.reset.subtitle")}
            </span>
          </div>

          {(mode === "login" || mode === "signup") && (
            <div
              className="auth-tabs"
              role="tablist"
              aria-label={t("auth.common.authenticationModes")}
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={mode === "login" ? "active" : ""}
                onClick={() => {
                  setMode("login");
                  setError("");
                  setForgotSent("");
                }}
              >
                {t("auth.common.login")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signup"}
                className={mode === "signup" ? "active" : ""}
                onClick={() => {
                  setMode("signup");
                  setError("");
                  setForgotSent("");
                }}
              >
                {t("auth.common.signUpTab")}
              </button>
            </div>
          )}

          <form className="auth-form" onSubmit={submit}>
            {(mode === "login" || mode === "signup" || mode === "forgot") && (
              <label>
                <span>{t("auth.common.emailLabel")}</span>
                <input
                  id="corez-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.common.emailPlaceholder")}
                  required
                  autoComplete="email"
                  autoFocus={mode !== "reset"}
                />
              </label>
            )}

            {(mode === "login" || mode === "signup") && (
              <label>
                <span>{t("auth.common.passwordLabel")}</span>
                <div className="auth-password-wrapper">
                  <input
                    id="corez-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("auth.common.passwordPlaceholder")}
                    required
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword
                        ? t("auth.common.hidePassword")
                        : t("auth.common.showPassword")
                    }
                    title={
                      showPassword
                        ? t("auth.common.hidePassword")
                        : t("auth.common.showPassword")
                    }
                  >
                    {showPassword ? (
                      <EyeOff size={16} strokeWidth={1.5} />
                    ) : (
                      <Eye size={16} strokeWidth={1.5} />
                    )}
                  </button>
                </div>
              </label>
            )}

            {mode === "login" && (
              <div style={{ textAlign: "right", marginTop: "-6px" }}>
                <button
                  type="button"
                  className="auth-link"
                  style={{ fontSize: "12px" }}
                  onClick={() => {
                    setMode("forgot");
                    setError("");
                    setForgotSent("");
                  }}
                >
                  {t("auth.login.forgotPassword")}
                </button>
              </div>
            )}

            {mode === "reset" && (
              <>
                <label>
                  <span>{t("auth.common.newPasswordLabel")}</span>
                  <div className="auth-password-wrapper">
                    <input
                      id="corez-new-password"
                      name="new-password"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t("auth.common.passwordPlaceholder")}
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={
                        showPassword
                          ? t("auth.common.hidePassword")
                          : t("auth.common.showPassword")
                      }
                    >
                      {showPassword ? (
                        <EyeOff size={16} strokeWidth={1.5} />
                      ) : (
                        <Eye size={16} strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                </label>
              </>
            )}

            {forgotSent && (
              <div
                className="auth-error"
                role="status"
                style={{
                  background: "rgba(74,222,128,0.12)",
                  borderColor: "rgba(74,222,128,0.3)",
                  color: "var(--market-positive)",
                }}
              >
                {forgotSent}
              </div>
            )}
            {error && (
              <div className="auth-error" role="alert" aria-live="polite">
                {error}
              </div>
            )}

            {mode === "signup" && (
              <div className="auth-consent">
                <ConsentCheckbox
                  id="corez-accept-terms"
                  checked={acceptedPolicies}
                  onChange={(value) => {
                    setAcceptedPolicies(value);
                    if (value) setConsentError("");
                  }}
                  required
                  error={consentError}
                  testId="signup-accept-terms"
                >
                  {t("auth.signup.consentIntro")}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer">
                    {t("auth.signup.consentTerms")}
                  </Link>
                  {t("auth.signup.consentAnd")}
                  <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                    {t("auth.signup.consentPrivacy")}
                  </Link>
                  {t("auth.signup.consentEnd")}
                </ConsentCheckbox>
              </div>
            )}

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy
                ? t("auth.common.pleaseWait")
                : mode === "login"
                  ? t("auth.common.login")
                  : mode === "signup"
                    ? t("auth.signup.submit")
                    : mode === "forgot"
                      ? t("auth.forgot.submit")
                      : t("auth.reset.submit")}
            </button>
          </form>

          <p className="auth-legal-note">
            {mode === "signup"
              ? t("auth.signup.legalNote")
              : t("auth.login.legalNote")}
          </p>
          <nav
            className="auth-legal-links"
            aria-label={t("auth.common.policiesNav")}
          >
            <Link to="/privacy">{t("auth.common.privacyPolicy")}</Link>
            <Link to="/terms">{t("auth.common.terms")}</Link>
            <Link to="/cookies">{t("auth.common.cookies")}</Link>
            <Link to="/refunds">{t("auth.common.refunds")}</Link>
            <button type="button" onClick={openConsentPreferences}>
              {t("auth.common.cookieSettings")}
            </button>
          </nav>

          <p className="auth-foot">
            {mode === "forgot" ? (
              <>
                {t("auth.forgot.remembered")}{" "}
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => {
                    setMode("login");
                    setError("");
                    setForgotSent("");
                  }}
                >
                  {t("auth.common.backToLogin")}
                </button>
              </>
            ) : mode === "reset" ? (
              <>
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => {
                    setMode("login");
                    setError("");
                    setForgotSent("");
                  }}
                >
                  {t("auth.common.backToLogin")}
                </button>
                <span style={{ margin: "0 8px", color: "var(--text-muted)" }}>
                  ·
                </span>
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => {
                    setMode("forgot");
                    setError("");
                  }}
                >
                  {t("auth.forgot.resend")}
                </button>
              </>
            ) : mode === "login" ? (
              t("auth.login.noAccount")
            ) : (
              t("auth.signup.alreadyHaveAccount")
            )}
            {(mode === "login" || mode === "signup") && (
              <button
                type="button"
                className="auth-link"
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError("");
                  setForgotSent("");
                }}
              >
                {mode === "login"
                  ? t("auth.login.signUpLink")
                  : t("auth.common.login")}
              </button>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
