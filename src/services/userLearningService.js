/**
 * User Learning Service — durable user memory wrapper.
 * Uses R2-backed /api/memory endpoints (see r2-mem0-memory skill).
 * userId is the only access credential: require an unguessable per-user id,
 * never default_user, never store secrets or sensitive PII.
 */

const BASE = "/api/memory";

const SENSITIVE_PATTERNS =
  /\b(password|passwd|api[_-]?key|secret|token|ssn|credit\s*card|bank\s*account)\b/i;

export function assertSafeUserId(userId) {
  if (typeof userId !== "string" || userId.trim().length < 8) {
    throw new Error("userId must be an unguessable identifier (>= 8 chars).");
  }
  if (userId.trim() === "default_user") {
    throw new Error("default_user must never be used for durable memory.");
  }
  return userId.trim();
}

export function assertSafeText(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("text is required.");
  }
  if (SENSITIVE_PATTERNS.test(text)) {
    throw new Error("Refusing to store a likely secret or credential.");
  }
  return text.trim();
}

async function requestJson(url, opts = {}) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error || `memory request failed: ${r.status}`);
  }
  return data;
}

export async function rememberUserFact({
  userId,
  key,
  category = "fact",
  text,
  tags = [],
  metadata = {},
} = {}) {
  const safeId = assertSafeUserId(userId);
  const safeText = assertSafeText(text);
  const data = await requestJson(`${BASE}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: safeId,
      ...(key ? { key } : {}),
      category,
      text: safeText,
      tags,
      metadata,
    }),
  });
  if (!data.success || !data.key) {
    throw new Error("Memory store did not confirm success.");
  }
  return data;
}

export async function recallUserFacts({ userId, query, category } = {}) {
  const safeId = assertSafeUserId(userId);
  return requestJson(`${BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: safeId,
      ...(query ? { query } : {}),
      ...(category ? { category } : {}),
    }),
  });
}

export async function listUserFacts({ userId } = {}) {
  const safeId = assertSafeUserId(userId);
  const r = await fetch(`${BASE}/${encodeURIComponent(safeId)}`, {
    method: "GET",
    credentials: "include",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error || `memory list failed: ${r.status}`);
  }
  return data;
}

export async function forgetUserFact({ userId, key } = {}) {
  const safeId = assertSafeUserId(userId);
  if (typeof key !== "string" || !key.trim()) {
    throw new Error("key is required to forget a memory.");
  }
  const r = await fetch(
    `${BASE}/${encodeURIComponent(safeId)}/${encodeURIComponent(key.trim())}`,
    { method: "DELETE", credentials: "include" },
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.success !== true) {
    throw new Error(data.error || `memory delete failed: ${r.status}`);
  }
  return data;
}
