/**
 * URL helpers shared by markdown rendering and image download/share.
 */
import { apiUrl } from "@/api/client";

/** Resolve relative asset paths against the API origin; leave real URLs alone. */
export function resolveAssetUrl(href: string): string {
  const value = String(href || "").trim();
  if (!value) return value;
  if (/^(https?:|mailto:|tel:|data:|blob:)/i.test(value)) return value;
  return apiUrl(value);
}
