import {
  ApiError,
  NetworkError,
  apiUrl,
  onUnauthorized,
  requestJson,
  rawRequest,
} from "../client";
import { clearToken, setCachedToken } from "../tokenStore";

const fetchMock = jest.fn();

beforeEach(async () => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  await clearToken();
  setCachedToken(null);
});

function jsonResponse(body: unknown, status = 200, headers = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("apiUrl", () => {
  it("joins paths against the production API by default", () => {
    expect(apiUrl("/api/ai")).toBe("https://corez.pro/api/ai");
    expect(apiUrl("api/ai")).toBe("https://corez.pro/api/ai");
  });

  it("leaves absolute URLs untouched", () => {
    expect(apiUrl("https://example.test/api")).toBe("https://example.test/api");
  });
});

describe("rawRequest", () => {
  it("sends the stored bearer token", async () => {
    setCachedToken("session-token");
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await rawRequest("/api/chats");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer session-token");
  });

  it("marks native auth requests with the client header", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await rawRequest("/api/auth/login", {
      method: "POST",
      body: { email: "a@b.c", password: "secret" },
      nativeClient: true,
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-Corez-Client"]).toBe("native");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ email: "a@b.c", password: "secret" }));
  });

  it("turns a transport failure into a NetworkError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    await expect(rawRequest("/api/ai")).rejects.toBeInstanceOf(NetworkError);
  });

  it("keeps a caller abort as an abort, not a network error", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init.signal?.aborted) {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
            return;
          }
          init.signal?.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );

    await expect(
      rawRequest("/api/ai", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("requestJson", () => {
  it("parses a JSON body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ chats: [{ id: "c1" }] }));
    await expect(requestJson("/api/chats")).resolves.toEqual({
      chats: [{ id: "c1" }],
    });
  });

  it("raises ApiError with the server code and Retry-After", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: "Too many AI requests.", code: "rate_limited" },
        429,
        { "Retry-After": "7" },
      ),
    );

    await expect(requestJson("/api/ai", { method: "POST" })).rejects.toMatchObject({
      name: "ApiError",
      status: 429,
      code: "rate_limited",
      retryAfterSeconds: 7,
    });
  });

  it("emits the signed-out event on 401 unless suppressed", async () => {
    const listener = jest.fn();
    const unsubscribe = onUnauthorized(listener);
    try {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Not authenticated" }, 401));
      await expect(requestJson("/api/chats")).rejects.toBeInstanceOf(ApiError);
      expect(listener).toHaveBeenCalledTimes(1);

      fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Not authenticated" }, 401));
      await expect(
        requestJson("/api/auth/me", { suppressUnauthorizedEvent: true }),
      ).rejects.toBeInstanceOf(ApiError);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });
});
