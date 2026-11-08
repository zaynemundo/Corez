/**
 * Auth endpoints for the native app.
 *
 * The native client opts into bearer-token issuance with `X-Corez-Client:
 * native`; a browser request never receives a token, so the web flow is
 * unchanged. Tokens are the same signed session JWT the cookie carries.
 */
import { ApiError, requestJson } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  plan: string;
}

interface SessionResponse {
  ok?: boolean;
  user: AuthUser;
  token?: string;
}

export interface SignupConsent {
  termsVersion?: string;
  acceptedAt?: number;
  marketingConsent?: boolean;
}

export async function login(email: string, password: string): Promise<{
  user: AuthUser;
  token: string;
}> {
  const data = await requestJson<SessionResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
    nativeClient: true,
    suppressUnauthorizedEvent: true,
  });
  if (!data.token) {
    throw new ApiError(
      "The server did not issue a mobile session token.",
      500,
      "token_missing",
    );
  }
  return { user: data.user, token: data.token };
}

export async function signup(
  email: string,
  password: string,
  consent?: SignupConsent,
): Promise<{ user: AuthUser; token: string }> {
  const body: Record<string, unknown> = { email, password, plan: "free" };
  if (consent?.termsVersion) body.terms_version = consent.termsVersion;
  if (Number.isFinite(consent?.acceptedAt)) body.terms_accepted_at = consent?.acceptedAt;
  if (consent?.marketingConsent !== undefined) {
    body.marketing_consent = consent.marketingConsent === true;
  }
  const data = await requestJson<SessionResponse>("/api/auth/signup", {
    method: "POST",
    body,
    nativeClient: true,
    suppressUnauthorizedEvent: true,
  });
  if (!data.token) {
    throw new ApiError(
      "The server did not issue a mobile session token.",
      500,
      "token_missing",
    );
  }
  return { user: data.user, token: data.token };
}

export async function refreshSession(): Promise<{
  user: AuthUser;
  token: string;
}> {
  const data = await requestJson<{ token: string; user: AuthUser }>(
    "/api/auth/refresh",
    {
      method: "POST",
      nativeClient: true,
      suppressUnauthorizedEvent: true,
    },
  );
  return { user: data.user, token: data.token };
}

export async function fetchMe(): Promise<AuthUser> {
  const data = await requestJson<{ user: AuthUser }>("/api/auth/me", {
    suppressUnauthorizedEvent: true,
  });
  return data.user;
}

/** Request a reset link; the server answers identically for unknown emails. */
export async function forgotPassword(email: string): Promise<{
  message: string;
}> {
  const data = await requestJson<{ ok?: boolean; message?: string }>(
    "/api/auth/forgot",
    {
      method: "POST",
      body: { email: email.trim().toLowerCase() },
      nativeClient: true,
      suppressUnauthorizedEvent: true,
    },
  );
  return { message: data.message || "" };
}

/**
 * Best-effort cookie clearing for the web deployment. The native session is a
 * bearer token with no server-side store, so "logout" here means dropping the
 * token from this device.
 */
export async function logoutRequest(): Promise<void> {
  try {
    await requestJson<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
      suppressUnauthorizedEvent: true,
    });
  } catch {
    // The device will forget its token regardless.
  }
}
