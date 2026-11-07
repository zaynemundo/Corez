/**
 * Typed access to the CoreZ Worker API.
 *
 * Everything the native app calls lives under the same `/api` surface as the
 * web app; the only transport difference is `Authorization: Bearer` instead of
 * the session cookie. Requests are identical in shape to the web's, so server
 * handlers do not need a mobile-specific branch beyond token issuance.
 */
import { getCachedToken } from "./tokenStore";

declare const process: {
  env: Record<string, string | undefined>;
};

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || "https://corez.pro"
).replace(/\/+$/, "");

const DEFAULT_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  status: number;
  code: string | null;
  retryAfterSeconds: number | null;

  constructor(
    message: string,
    status: number,
    code: string | null = null,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Network/transport failure: distinct from an HTTP error so screens can say "offline". */
export class NetworkError extends Error {
  constructor(message = "Could not reach Corez.") {
    super(message);
    this.name = "NetworkError";
  }
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function emitUnauthorized(): void {
  for (const listener of unauthorizedListeners) {
    try {
      listener();
    } catch {
      // A listener must never break the request path.
    }
  }
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Set for auth endpoints that issue a token; native clients opt in. */
  nativeClient?: boolean;
  /** Do not emit the global signed-out event (used by the session check itself). */
  suppressUnauthorizedEvent?: boolean;
}

function currentToken(): string | null {
  return getCachedToken();
}

function mergeSignals(
  timeoutMs: number,
  signal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  // timeoutMs <= 0 means "no transport timeout": streaming turns can run for
  // minutes and are bounded by the caller's own AbortSignal instead.
  const timer =
    timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

export async function rawRequest(
  path: string,
  options: ApiRequestOptions = {},
): Promise<Response> {
  const {
    method = "GET",
    body,
    headers = {},
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    nativeClient = false,
  } = options;

  const token = currentToken();
  const mergedHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };
  if (body !== undefined) mergedHeaders["Content-Type"] = "application/json";
  if (token) mergedHeaders.Authorization = `Bearer ${token}`;
  if (nativeClient) mergedHeaders["X-Corez-Client"] = "native";

  const { signal: requestSignal, cleanup } = mergeSignals(timeoutMs, signal);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: mergedHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: requestSignal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new NetworkError(
      error instanceof Error && error.name === "AbortError"
        ? "Corez took too long to answer."
        : "Could not reach Corez. Check your connection.",
    );
  } finally {
    cleanup();
  }

  if (response.status === 401 && !options.suppressUnauthorizedEvent) {
    emitUnauthorized();
  }
  return response;
}

function parseRetryAfter(response: Response): number | null {
  const value = Number(response.headers.get("Retry-After"));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function requestJson<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const response = await rawRequest(path, options);
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const record = (data ?? {}) as Record<string, unknown>;
    const message =
      typeof record.error === "string" && record.error
        ? record.error
        : `Corez answered ${response.status}.`;
    throw new ApiError(
      message,
      response.status,
      typeof record.code === "string" ? record.code : null,
      parseRetryAfter(response),
    );
  }
  return (data ?? {}) as T;
}
