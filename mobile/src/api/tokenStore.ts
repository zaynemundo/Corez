/**
 * Bearer session token storage.
 *
 * The web app authenticates with an HttpOnly `corez_session` cookie. The native
 * app has no shared cookie jar, so it stores the signed session JWT in Android
 * Keystore-backed storage via expo-secure-store.
 *
 * This module owns the in-memory token as well so the API client can read it
 * synchronously on every request; the secure store is only touched on boot,
 * login, refresh and logout.
 */
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "corez_session_token";
const REFRESHED_AT_KEY = "corez_session_refreshed_at";

let cachedToken: string | null = null;

export function getCachedToken(): string | null {
  return cachedToken;
}

export function setCachedToken(token: string | null): void {
  cachedToken = token;
}

export async function loadToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    cachedToken = token || null;
    return cachedToken;
  } catch {
    // A corrupt or unavailable keystore is treated as "signed out" rather than
    // crashing the app; the user can sign in again.
    cachedToken = null;
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  cachedToken = token;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(REFRESHED_AT_KEY, String(Date.now()));
  } catch {
    // SecureStore failures do not erase the in-memory session; the token still
    // works for this launch and the user is asked to sign in again next time.
  }
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESHED_AT_KEY);
  } catch {
    // Nothing actionable; the in-memory token is already gone.
  }
}

/**
 * True when the stored session should be renewed on launch. The token itself
 * encodes its expiry, so this reads the `exp` claim rather than trusting a
 * separate timestamp that could drift.
 */
export function tokenExpiresWithin(token: string, windowMs: number): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = JSON.parse(globalThis.atob(padded));
    const exp = Number(json?.exp);
    if (!Number.isFinite(exp)) return true;
    return exp * 1000 - Date.now() <= windowMs;
  } catch {
    return true;
  }
}
