import * as SecureStore from "expo-secure-store";
import {
  clearToken,
  getCachedToken,
  loadToken,
  saveToken,
  setCachedToken,
  tokenExpiresWithin,
} from "../tokenStore";

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function jwt(payload: Record<string, unknown>): string {
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(payload)}.signature`;
}

beforeEach(async () => {
  store.clear();
  setCachedToken(null);
  await clearToken();
});

describe("token store", () => {
  it("saves, reloads and clears the token", async () => {
    await saveToken("tok_123");
    expect(getCachedToken()).toBe("tok_123");
    expect(store.get("corez_session_token")).toBe("tok_123");

    setCachedToken(null); // simulate a fresh process
    await expect(loadToken()).resolves.toBe("tok_123");

    await clearToken();
    expect(getCachedToken()).toBeNull();
    expect(store.has("corez_session_token")).toBe(false);
  });

  it("treats a missing token as signed out", async () => {
    await expect(loadToken()).resolves.toBeNull();
    expect(getCachedToken()).toBeNull();
  });
});

describe("tokenExpiresWithin", () => {
  it("is false while the token has more than the window left", () => {
    const token = jwt({ uid: "u1", exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(tokenExpiresWithin(token, 60_000)).toBe(false);
  });

  it("is true when the token is inside the refresh window", () => {
    const token = jwt({ uid: "u1", exp: Math.floor(Date.now() / 1000) + 60 });
    expect(tokenExpiresWithin(token, 2 * 60 * 60 * 1000)).toBe(true);
  });

  it("is true for expired or malformed tokens", () => {
    expect(
      tokenExpiresWithin(
        jwt({ uid: "u1", exp: Math.floor(Date.now() / 1000) - 10 }),
        1000,
      ),
    ).toBe(true);
    expect(tokenExpiresWithin("not-a-jwt", 1000)).toBe(true);
    expect(tokenExpiresWithin("a.b.c", 1000)).toBe(true);
  });

  it("accepts base64url payloads without padding", () => {
    const token = jwt({ uid: "longer-user-id", exp: Math.floor(Date.now() / 1000) + 7200 });
    expect(token.split(".")[1]).not.toContain("=");
    expect(tokenExpiresWithin(token, 60_000)).toBe(false);
  });
});
