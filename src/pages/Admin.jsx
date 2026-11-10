// Operator console at /admin. It is a standalone public page: an admin can
// unlock it with the ADMIN_SECRET key, or it opens automatically for a
// signed-in account listed in ADMIN_EMAILS. The console never shows reset
// tokens; an operator has to receive one from the account owner, then finish
// the reset here instead of walking them through the email link.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./Admin.css";

const ADMIN_KEY_STORAGE = "corez_admin_key";

function readStoredKey() {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

function storeKey(value) {
  try {
    if (value) sessionStorage.setItem(ADMIN_KEY_STORAGE, value);
    else sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    /* private mode: the key lives in memory for this page only */
  }
}

async function adminFetch(path, { method = "GET", body, adminKey = "" } = {}) {
  const headers = {};
  if (adminKey) headers["X-Admin-Key"] = adminKey;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

function formatDate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  try {
    return new Date(n).toLocaleString();
  } catch {
    return "—";
  }
}

function resetStatus(row) {
  if (row.used) return "Used";
  if (Number(row.expiresAt) && Date.now() > Number(row.expiresAt)) return "Expired";
  return "Open";
}

export default function Admin() {
  const [adminKey, setAdminKey] = useState(readStoredKey);
  const [keyDraft, setKeyDraft] = useState(readStoredKey);
  const [status, setStatus] = useState("loading");
  const [me, setMe] = useState(null);
  const [authError, setAuthError] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [dashboardError, setDashboardError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [targetEmail, setTargetEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookup, setLookup] = useState(null);

  const loadDashboard = useCallback(async (key) => {
    setRefreshing(true);
    setDashboardError("");
    try {
      const data = await adminFetch("/api/admin/dashboard", { adminKey: key });
      setDashboard(data);
    } catch (error) {
      setDashboardError(error.message || "Could not load the dashboard.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const authenticate = useCallback(async (key) => {
    setStatus("loading");
    setAuthError("");
    try {
      const data = await adminFetch("/api/admin/me", { adminKey: key });
      setMe(data.admin);
      setStatus("ready");
      await loadDashboard(key);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        setStatus("locked");
        setAuthError(error.status === 403 ? error.message : "");
      } else {
        setStatus("error");
        setAuthError(error.message || "Could not check admin access.");
      }
    }
  }, [loadDashboard]);

  useEffect(() => {
    document.title = "Admin · CoreZ";
    authenticate(adminKey);
  }, [adminKey, authenticate]);

  const unlock = (event) => {
    event.preventDefault();
    const value = keyDraft.trim();
    storeKey(value);
    setAdminKey(value);
    if (value === adminKey) authenticate(value);
  };

  const clearKey = () => {
    storeKey("");
    setKeyDraft("");
    setAdminKey("");
    setMe(null);
  };

  const submitReset = async (event) => {
    event.preventDefault();
    setResetError("");
    setResetSuccess("");
    if (!token.trim()) {
      setResetError("Paste the reset token the user received.");
      return;
    }
    if (newPassword.length < 8) {
      setResetError("The new password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("The two passwords do not match.");
      return;
    }
    setResetBusy(true);
    try {
      const data = await adminFetch("/api/admin/reset-password", {
        method: "POST",
        adminKey,
        body: {
          email: targetEmail.trim() || undefined,
          token: token.trim(),
          password: newPassword,
        },
      });
      setResetSuccess(data.message || "Password updated.");
      setToken("");
      setNewPassword("");
      setConfirmPassword("");
      await loadDashboard(adminKey);
    } catch (error) {
      setResetError(error.message || "The reset failed.");
    } finally {
      setResetBusy(false);
    }
  };

  const submitLookup = async (event) => {
    event.preventDefault();
    setLookupError("");
    setLookup(null);
    const email = lookupEmail.trim();
    if (!email) {
      setLookupError("Enter an account email.");
      return;
    }
    setLookupBusy(true);
    try {
      const data = await adminFetch(
        "/api/admin/users?email=" + encodeURIComponent(email),
        { adminKey },
      );
      setLookup(data);
    } catch (error) {
      setLookupError(error.message || "Could not look up that account.");
    } finally {
      setLookupBusy(false);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-brand">
          <span className="admin-brand-word">COREZ</span>
          <span className="admin-brand-badge">ADMIN</span>
        </div>
        <div className="admin-header-actions">
          {me && (
            <span className="admin-identity">
              {me.email}
              <span className="admin-identity-via">{me.via}</span>
            </span>
          )}
          <button
            type="button"
            className="admin-button admin-button-quiet"
            onClick={() => loadDashboard(adminKey)}
            disabled={status !== "ready" || refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          {adminKey && (
            <button
              type="button"
              className="admin-button admin-button-quiet"
              onClick={clearKey}
            >
              Clear key
            </button>
          )}
          <Link className="admin-button admin-button-quiet" to="/">
            Back to CoreZ
          </Link>
        </div>
      </header>

      {status === "loading" && (
        <div className="admin-state" role="status">
          Checking admin access…
        </div>
      )}

      {status === "locked" && (
        <section className="admin-locked" aria-labelledby="admin-locked-title">
          <h1 id="admin-locked-title">Admin access required</h1>
          <p>
            Sign in with an allowlisted admin account, or paste the deployed
            <code> ADMIN_SECRET</code> key.
          </p>
          {authError && (
            <p className="admin-alert" role="alert">
              {authError}
            </p>
          )}
          <form className="admin-key-form" onSubmit={unlock}>
            <label>
              <span>Admin key</span>
              <input
                type="password"
                name="admin-key"
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
                placeholder="ADMIN_SECRET"
                autoComplete="current-password"
                autoFocus
              />
            </label>
            <button type="submit" className="admin-button admin-button-primary">
              Unlock
            </button>
          </form>
          <p className="admin-muted">
            Not signed in? <Link to="/login">Go to sign in</Link> — an admin
            account reaches this page without the key.
          </p>
        </section>
      )}

      {status === "error" && (
        <section className="admin-locked" role="alert">
          <h1>Admin console unavailable</h1>
          <p>{authError}</p>
          <button type="button" className="admin-button" onClick={() => authenticate(adminKey)}>
            Try again
          </button>
        </section>
      )}

      {status === "ready" && (
        <main className="admin-main">
          {dashboardError && (
            <p className="admin-alert" role="alert">
              {dashboardError}
            </p>
          )}

          <section className="admin-stats" aria-label="Service totals">
            {[
              ["Users", dashboard?.stats?.users],
              ["Chats", dashboard?.stats?.chats],
              ["Custom themes", dashboard?.stats?.themes],
              ["Open reset links", dashboard?.stats?.pendingResets],
            ].map(([label, value]) => (
              <article className="admin-stat" key={label}>
                <span className="admin-stat-value">
                  {Number.isFinite(Number(value)) ? Number(value) : "—"}
                </span>
                <span className="admin-stat-label">{label}</span>
              </article>
            ))}
          </section>

          <div className="admin-columns">
            <section className="admin-card" aria-labelledby="reset-title">
              <div className="admin-card-head">
                <h2 id="reset-title">Finish a password reset</h2>
                <p>
                  Ask the user for the token from their reset email. The token
                  is single-use and expires one hour after it was sent.
                </p>
              </div>
              <form className="admin-form" onSubmit={submitReset}>
                <label>
                  <span>Account email <em>(optional check)</em></span>
                  <input
                    type="email"
                    value={targetEmail}
                    onChange={(event) => setTargetEmail(event.target.value)}
                    placeholder="user@example.com"
                    autoComplete="off"
                  />
                </label>
                <label>
                  <span>Reset token from the user</span>
                  <textarea
                    rows={3}
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Paste the token the user received"
                    required
                    spellCheck={false}
                  />
                </label>
                <div className="admin-form-row">
                  <label>
                    <span>New password</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="At least 8 characters"
                      minLength={8}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                  <label>
                    <span>Confirm password</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Repeat it"
                      autoComplete="new-password"
                      required
                    />
                  </label>
                </div>
                {resetError && (
                  <p className="admin-alert" role="alert">
                    {resetError}
                  </p>
                )}
                {resetSuccess && (
                  <p className="admin-success" role="status">
                    {resetSuccess}
                  </p>
                )}
                <button
                  type="submit"
                  className="admin-button admin-button-primary"
                  disabled={resetBusy}
                >
                  {resetBusy ? "Updating…" : "Change password"}
                </button>
              </form>
            </section>

            <section className="admin-card" aria-labelledby="lookup-title">
              <div className="admin-card-head">
                <h2 id="lookup-title">Find an account</h2>
                <p>Confirm whose token you are holding before changing it.</p>
              </div>
              <form className="admin-form" onSubmit={submitLookup}>
                <label>
                  <span>Account email</span>
                  <div className="admin-inline">
                    <input
                      type="email"
                      value={lookupEmail}
                      onChange={(event) => setLookupEmail(event.target.value)}
                      placeholder="user@example.com"
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      className="admin-button"
                      disabled={lookupBusy}
                    >
                      {lookupBusy ? "Looking…" : "Look up"}
                    </button>
                  </div>
                </label>
              </form>
              {lookupError && (
                <p className="admin-alert" role="alert">
                  {lookupError}
                </p>
              )}
              {lookup?.user && (
                <dl className="admin-account">
                  <div><dt>Email</dt><dd>{lookup.user.email}</dd></div>
                  <div><dt>Plan</dt><dd>{lookup.user.plan}</dd></div>
                  <div><dt>Provider</dt><dd>{lookup.user.provider}</dd></div>
                  <div><dt>Joined</dt><dd>{formatDate(lookup.user.createdAt)}</dd></div>
                  <div><dt>Last password change</dt><dd>{formatDate(lookup.user.passwordChangedAt)}</dd></div>
                  <div><dt>Chats</dt><dd>{lookup.counts?.chats ?? 0}</dd></div>
                  <div><dt>Custom themes</dt><dd>{lookup.counts?.themes ?? 0}</dd></div>
                </dl>
              )}
              {lookup?.user && (
                <button
                  type="button"
                  className="admin-button admin-button-quiet"
                  onClick={() => setTargetEmail(lookup.user.email)}
                >
                  Use this email in the reset form
                </button>
              )}
            </section>
          </div>

          <section className="admin-card" aria-labelledby="plans-title">
            <div className="admin-card-head">
              <h2 id="plans-title">Plans</h2>
            </div>
            <div className="admin-plan-row">
              {dashboard?.plans && Object.keys(dashboard.plans).length > 0 ? (
                Object.entries(dashboard.plans).map(([plan, count]) => (
                  <span className="admin-plan" key={plan}>
                    <strong>{count}</strong> {plan}
                  </span>
                ))
              ) : (
                <span className="admin-muted">No plan data yet.</span>
              )}
            </div>
          </section>

          <section className="admin-card" aria-labelledby="resets-title">
            <div className="admin-card-head">
              <h2 id="resets-title">Recent reset links</h2>
              <p>Tokens are never shown here. Status is enough to triage.</p>
            </div>
            {dashboard?.recentResets?.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr><th>Email</th><th>Requested</th><th>Expires</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {dashboard.recentResets.map((row, index) => (
                      <tr key={(row.email || "reset") + "-" + index}>
                        <td>{row.email}</td>
                        <td>{formatDate(row.createdAt)}</td>
                        <td>{formatDate(row.expiresAt)}</td>
                        <td><span className={"admin-pill admin-pill-" + resetStatus(row).toLowerCase()}>{resetStatus(row)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-muted">No reset links requested yet.</p>
            )}
          </section>

          <section className="admin-card" aria-labelledby="users-title">
            <div className="admin-card-head">
              <h2 id="users-title">Newest accounts</h2>
            </div>
            {dashboard?.recentUsers?.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr><th>Email</th><th>Plan</th><th>Provider</th><th>Joined</th></tr>
                  </thead>
                  <tbody>
                    {dashboard.recentUsers.map((row, index) => (
                      <tr key={(row.email || "user") + "-" + index}>
                        <td>{row.email}</td>
                        <td>{row.plan}</td>
                        <td>{row.provider}</td>
                        <td>{formatDate(row.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-muted">No accounts yet.</p>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
