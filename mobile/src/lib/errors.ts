import { ApiError, NetworkError } from "@/api/client";

/** Human-readable message for an auth or API failure; never a raw stack. */
export function friendlyError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
