import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

const AuthContext = createContext(null);

// The session check is a network round-trip on every cold load. It must never
// pin the interface: after this long without an answer the app stops waiting and
// says it could not check, with a retry. Eight seconds is long enough for a cold
// Worker plus a slow mobile connection and short enough to feel like a decision.
const SESSION_CHECK_TIMEOUT_MS = 8000;

/**
 * fetch() with a hard time limit. The AbortController cancels the request, and
 * the race makes the helper deterministic even when a transport ignores the
 * signal (or a test stands in for the network) instead of hanging forever.
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  let timer = null;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve({ timedOut: true });
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      fetch(url, { ...options, signal: controller?.signal }).then(
        (response) => ({ response }),
        (error) => ({ error }),
      ),
      timedOut,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // A failed check is NOT the same as "signed out": the app does not know, so it
  // says so and offers a retry instead of silently showing the sign-in form.
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);

  const fetchMe = useCallback(async () => {
    setLoading(true);
    setSessionCheckFailed(false);
    const result = await fetchWithTimeout(
      "/api/auth/me",
      { credentials: "include" },
      SESSION_CHECK_TIMEOUT_MS,
    );

    if (result?.response) {
      const { response } = result;
      if (response.ok) {
        const d = await response.json().catch(() => ({}));
        setUser(d?.user || null);
      } else if (
        // An answer that means "not signed in" — not a failure.
        response.status === 401 ||
        response.status === 403
      ) {
        setUser(null);
      } else {
        setSessionCheckFailed(true);
      }
    } else {
      // Timeout, abort or a transport error: the answer is unknown.
      setSessionCheckFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (email, password) => {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Login failed");
    setUser(d.user);
    return d.user;
  };

  const signup = async (email, password, plan = "free", consent = null) => {
    const body = { email, password, plan };
    // Consent evidence travels with the account creation: which policy version
    // was accepted, when, and whether product email was opted into. It is
    // optional so older callers keep working; the UI always sends it.
    if (consent && typeof consent === "object") {
      if (consent.termsVersion) body.terms_version = String(consent.termsVersion);
      if (Number.isFinite(consent.acceptedAt)) body.terms_accepted_at = consent.acceptedAt;
      body.marketing_consent = consent.marketingConsent === true;
    }
    const r = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Signup failed");
    setUser(d.user);
    return d.user;
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  };

  const forgot = async (email) => {
    const r = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Failed to send reset email");
    return d;
  };

  const reset = async (token, password) => {
    const r = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, password }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Failed to reset password");
    return d;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        sessionCheckFailed,
        login,
        signup,
        logout,
        forgot,
        reset,
        refresh: fetchMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
}
