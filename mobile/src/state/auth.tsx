/**
 * Session state for the native app.
 *
 * Boot: read the stored bearer token, renew it when it is close to expiring,
 * then verify it with `/api/auth/me`. A rejected token signs the device out; a
 * network failure is surfaced as "unverified" with a retry, never as a silent
 * sign-out (the web's session check makes the same distinction).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  NetworkError,
  onUnauthorized,
} from "@/api/client";
import {
  fetchMe,
  login as apiLogin,
  logoutRequest,
  refreshSession,
  signup as apiSignup,
  type AuthUser,
  type SignupConsent,
} from "@/api/auth";
import {
  clearToken,
  loadToken,
  saveToken,
  tokenExpiresWithin,
} from "@/api/tokenStore";

/** Renew the session on launch when it has less than two days left. */
const REFRESH_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export type AuthStatus =
  | "booting"
  | "signedIn"
  | "signedOut"
  | "unverified";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  busy: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    consent?: SignupConsent,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  retrySessionCheck: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("booting");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const applySignedOut = useCallback(async () => {
    await clearToken();
    if (!mountedRef.current) return;
    setUser(null);
    setStatus("signedOut");
  }, []);

  // A 401 from any request that did not opt out means the session is dead.
  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      void applySignedOut();
    });
    return unsubscribe;
  }, [applySignedOut]);

  const bootstrap = useCallback(async () => {
    const token = await loadToken();
    if (!mountedRef.current) return;
    setError(null);
    if (!token) {
      setStatus("signedOut");
      return;
    }

    try {
      if (tokenExpiresWithin(token, REFRESH_WINDOW_MS)) {
        const refreshed = await refreshSession();
        await saveToken(refreshed.token);
        if (!mountedRef.current) return;
        setUser(refreshed.user);
        setStatus("signedIn");
        return;
      }
      const me = await fetchMe();
      if (!mountedRef.current) return;
      setUser(me);
      setStatus("signedIn");
    } catch (caught) {
      if (caught instanceof ApiError && [401, 403].includes(caught.status)) {
        await applySignedOut();
        return;
      }
      // The token may still be good; the network is not. Offer a retry.
      if (!mountedRef.current) return;
      setStatus("unverified");
      setError(
        caught instanceof NetworkError
          ? "Could not reach Corez. Check your connection."
          : "Could not check your session. Try again.",
      );
    }
  }, [applySignedOut]);

  useEffect(() => {
    mountedRef.current = true;
    // The session bootstrap is a mount-time read of external state (the
    // keystore and the network). Every setState it performs happens after an
    // await, but the compiler rule cannot see across the callback boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void bootstrap();
    return () => {
      mountedRef.current = false;
    };
  }, [bootstrap]);

  const signIn = useCallback(async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      const { user: nextUser, token } = await apiLogin(email.trim(), password);
      await saveToken(token);
      setUser(nextUser);
      setStatus("signedIn");
    } finally {
      setBusy(false);
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, consent?: SignupConsent) => {
      setBusy(true);
      setError(null);
      try {
        const { user: nextUser, token } = await apiSignup(
          email.trim(),
          password,
          consent,
        );
        await saveToken(token);
        setUser(nextUser);
        setStatus("signedIn");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await logoutRequest();
      await applySignedOut();
    } finally {
      setBusy(false);
    }
  }, [applySignedOut]);

  const retrySessionCheck = useCallback(async () => {
    setStatus("booting");
    setError(null);
    await bootstrap();
  }, [bootstrap]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      busy,
      error,
      signIn,
      signUp,
      signOut,
      retrySessionCheck,
    }),
    [status, user, busy, error, signIn, signUp, signOut, retrySessionCheck],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return value;
}
