/**
 * Published-site API for the native client.
 *
 * `POST /api/publish` stores the HTML in R2 under the signed-in account and
 * answers with a slug; `GET /api/publish` lists the account's pages;
 * `DELETE /api/publish/<slug>` removes one. The bearer token identifies the
 * owner exactly like the web's session cookie.
 */
import { API_BASE_URL, requestJson } from "./client";

export interface PublishedPage {
  slug: string;
  url: string;
  title: string;
  createdAt: string | null;
  badge?: boolean;
  customized?: boolean;
  pages?: number;
  bytes?: number;
}

export interface PublishResult {
  slug: string;
  url: string;
  customized?: boolean;
}

export interface PublishedPageDetail {
  slug: string;
  url: string;
  title: string;
  html: string;
  pages: Record<string, string>;
  badge?: boolean;
  customized?: boolean;
  createdAt: string | null;
}

const BASE = "/api/publish";

export function publishedPageUrl(slug: string): string {
  return `${API_BASE_URL}/${encodeURIComponent(slug)}`;
}

/** Owner-only editable copy, used to rename a page without losing its HTML. */
export async function getPublishedPage(
  slug: string,
): Promise<PublishedPageDetail> {
  const safe = String(slug || "").trim();
  if (!safe) throw new Error("A page slug is required.");
  return requestJson<PublishedPageDetail>(
    `${BASE}/${encodeURIComponent(safe)}`,
    { method: "GET" },
  );
}

/** Validate a custom URL slug the same way the Worker does. */
export function isValidPublishSlug(slug: string): boolean {
  const value = String(slug || "").trim().toLowerCase();
  if (value.includes("--")) return false;
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(value);
}

export async function listPublishedPages(): Promise<{
  pages: PublishedPage[];
  truncated: boolean;
}> {
  const data = await requestJson<{
    pages?: PublishedPage[];
    truncated?: boolean;
  }>(BASE, { method: "GET" });
  return {
    pages: Array.isArray(data.pages) ? data.pages : [],
    truncated: data.truncated === true,
  };
}

export async function publishHtml(input: {
  html: string;
  title?: string;
  slug?: string | null;
  previousSlug?: string | null;
  sessionId?: string | null;
  pages?: Record<string, string> | null;
}): Promise<PublishResult> {
  const html = String(input.html || "").trim();
  if (!html) throw new Error("There is nothing to publish.");
  const body: Record<string, unknown> = {
    html,
    title: (input.title || "Untitled Application").slice(0, 120),
  };
  if (input.slug) body.slug = input.slug;
  if (input.previousSlug) body.previousSlug = input.previousSlug;
  if (input.sessionId) body.sessionId = input.sessionId;
  if (input.pages && Object.keys(input.pages).length > 0) {
    body.pages = input.pages;
  }
  const data = await requestJson<{ slug?: string; customized?: boolean }>(
    BASE,
    {
      method: "POST",
      body,
      timeoutMs: 60_000,
    },
  );
  if (!data.slug) throw new Error("The publish request did not return a link.");
  return {
    slug: data.slug,
    url: publishedPageUrl(data.slug),
    customized: Boolean(data.customized),
  };
}

export async function unpublishPage(slug: string): Promise<void> {
  const safe = String(slug || "").trim();
  if (!safe) throw new Error("A page slug is required.");
  await requestJson<{ success?: boolean }>(
    `${BASE}/${encodeURIComponent(safe)}`,
    { method: "DELETE" },
  );
}
