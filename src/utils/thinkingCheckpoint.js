// Short-lived, browser-local thinking checkpoints.
//
// A stream can be interrupted after the model has spent time reasoning but
// before it produces an answer. The checkpoint keeps that reasoning for 12h so
// a retry can continue from it instead of starting over. It is deliberately
// local-only: no reasoning is uploaded to storage beyond the request that
// already carries it for continuation.

export const THINKING_CHECKPOINT_TTL_MS = 12 * 60 * 60 * 1000;
export const THINKING_CHECKPOINT_MAX_CHARS = 120_000;

const STORAGE_PREFIX = "corez_thinking_checkpoint:";

function browserStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createPromptFingerprint(prompt) {
  const text = String(prompt || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(36)}-${text.length}`;
}

function storageKey(sessionId) {
  return `${STORAGE_PREFIX}${String(sessionId || "")}`;
}

function parseCheckpoint(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    if (typeof value.thinking !== "string" || !value.thinking.trim()) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function pruneThinkingCheckpoints({
  now = Date.now(),
  storage = browserStorage(),
} = {}) {
  if (!storage) return;
  const stale = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      const value = parseCheckpoint(storage.getItem(key));
      if (
        !value ||
        !Number.isFinite(Number(value.updatedAt)) ||
        now - Number(value.updatedAt) > THINKING_CHECKPOINT_TTL_MS
      ) {
        stale.push(key);
      }
    }
    stale.forEach((key) => storage.removeItem(key));
  } catch {
    // Storage is an optimization; never break chat over it.
  }
}

export function readThinkingCheckpoint(
  sessionId,
  fingerprint,
  { now = Date.now(), storage = browserStorage() } = {},
) {
  if (!sessionId || !storage) return null;
  pruneThinkingCheckpoints({ now, storage });
  try {
    const value = parseCheckpoint(storage.getItem(storageKey(sessionId)));
    if (!value) return null;
    if (fingerprint && value.fingerprint !== fingerprint) return null;
    if (
      !Number.isFinite(Number(value.updatedAt)) ||
      now - Number(value.updatedAt) > THINKING_CHECKPOINT_TTL_MS
    ) {
      storage.removeItem(storageKey(sessionId));
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writeThinkingCheckpoint(
  sessionId,
  { fingerprint, thinking, now = Date.now(), storage = browserStorage() } = {},
) {
  if (!sessionId || !storage) return false;
  const text = String(thinking || "").slice(0, THINKING_CHECKPOINT_MAX_CHARS);
  if (!text.trim()) return false;
  try {
    storage.setItem(
      storageKey(sessionId),
      JSON.stringify({
        sessionId,
        fingerprint: fingerprint || "",
        thinking: text,
        updatedAt: now,
      }),
    );
    pruneThinkingCheckpoints({ now, storage });
    return true;
  } catch {
    return false;
  }
}

export function clearThinkingCheckpoint(
  sessionId,
  { storage = browserStorage() } = {},
) {
  if (!sessionId || !storage) return;
  try {
    storage.removeItem(storageKey(sessionId));
  } catch {
    // Ignore storage errors.
  }
}
