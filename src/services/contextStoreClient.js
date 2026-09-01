/**
 * Durable context-record client.
 *
 * The browser is never the only durable store for compacted context records.
 * This module exposes one shared interface with two paths:
 *
 *   - Production: records are POSTed/GET via the worker's R2-backed
 *     /api/context/records endpoints. The browser keeps only lightweight
 *     metadata ({ recordId, createdAt, summaryKeys }) in localStorage, so a
 *     refreshed page can re-find and re-fetch records by id.
 *   - Test / memory: an in-memory Map (exported as memoryContextStore) that
 *     survives for the session. Each client instance can opt into its own
 *     Map (e.g. to simulate a fresh page after a refresh).
 *
 * Honesty contract: when durable storage is unavailable (network error, 404,
 * no backend, localStorage quota) saveRecord returns { ok: false } and
 * callers (persistAndSummarize) report persisted:false — a summary must never
 * claim exact records are retrievable when they were not durably persisted.
 * A record is never silently deleted: the in-session copy is always kept and
 * never claimed as durable.
 */

const META_KEY = "corez_context_metadata";

// Shared in-session store: every client that does not opt into its own Map
// writes here, so exact records are immediately retrievable within the
// session even before (or without) any server round-trip.
export const memoryContextStore = new Map();

function makeRecordId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `ctx-${crypto.randomUUID()}`;
  }
  return `ctx-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function detectStorage() {
  if (typeof window !== "undefined" && window.localStorage)
    return window.localStorage;
  if (typeof globalThis !== "undefined" && globalThis.localStorage)
    return globalThis.localStorage;
  return null;
}

function readMetadata(storage) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeMetadata(storage, meta) {
  if (!storage) return false;
  try {
    storage.setItem(META_KEY, JSON.stringify(meta));
    return true;
  } catch {
    // Quota exceeded or storage unavailable: never break the request and
    // never claim persistence.
    return false;
  }
}

function removeMetadataKey(storage, recordId) {
  if (!storage) return;
  try {
    const meta = readMetadata(storage);
    delete meta[recordId];
    writeMetadata(storage, meta);
  } catch {
    // Best effort only.
  }
}

/**
 * Create a context-record client instance.
 *
 * options:
 *   backend   'server' (default, R2-backed worker endpoint), 'memory'
 *             (in-session only), or 'none' (explicitly no durable storage).
 *   endpoint  base URL of the worker record endpoints (default
 *             '/api/context/records').
 *   storage   Storage-like object for the lightweight metadata index
 *             (default: window/globalThis localStorage).
 *   store     in-memory Map for the session copy (default:
 *             memoryContextStore, the shared module store).
 *   fetchImpl fetch implementation (default: globalThis.fetch). Tests use
 *             this to route requests to the worker handlers.
 */
export function createContextClient(options = {}) {
  const backend =
    options.backend === "memory" || options.backend === "none"
      ? options.backend
      : "server";
  const endpoint =
    typeof options.endpoint === "string"
      ? options.endpoint
      : "/api/context/records";
  const storage =
    options.storage !== undefined ? options.storage : detectStorage();
  const store = options.store || memoryContextStore;
  const fetchImpl =
    typeof options.fetchImpl === "function"
      ? options.fetchImpl
      : (input, init) => globalThis.fetch(input, init);

  // Records are always normalised to the stored shape { id, createdAt,
  // messages }; summaryKeys is an indexing hint carried only in the metadata.
  // The messages array is copied so a caller mutating it later can never
  // silently alter the stored record.
  function normalizeRecord(record) {
    const recordId =
      typeof record?.id === "string" && record.id ? record.id : makeRecordId();
    return {
      recordId,
      createdAt: Number(record?.createdAt) || Date.now(),
      messages: Array.isArray(record?.messages) ? [...record.messages] : [],
      summaryKeys: Array.isArray(record?.summaryKeys)
        ? [...record.summaryKeys]
        : [],
    };
  }

  function saveRecordSync(record) {
    if (!record || typeof record !== "object") {
      return { ok: false, recordId: null, backend, reason: "invalid record" };
    }
    const { recordId, createdAt, messages, summaryKeys } =
      normalizeRecord(record);
    store.set(recordId, { id: recordId, createdAt, messages });

    if (backend === "none") {
      return { ok: false, recordId, backend, reason: "no durable backend" };
    }
    const metadataOk = persistMetadataSync(recordId, createdAt, summaryKeys);
    return { ok: metadataOk, recordId, backend };
  }

  function persistMetadataSync(recordId, createdAt, summaryKeys) {
    const meta = readMetadata(storage);
    meta[recordId] = {
      recordId,
      createdAt,
      summaryKeys,
    };
    return writeMetadata(storage, meta);
  }

  async function saveRecord(record) {
    const syncResult = saveRecordSync(record);
    if (backend !== "server") return syncResult;

    // The server copy is the durable half of the claim. Even when the local
    // index failed (quota), the server push is still attempted so the record
    // is not silently lost — but persistence is only ever claimed when BOTH
    // the server accepted the record AND the local index was written.
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: syncResult.recordId,
          createdAt: record?.createdAt ? Number(record.createdAt) : Date.now(),
          messages: Array.isArray(record?.messages) ? record.messages : [],
        }),
      });
      if (!response.ok) {
        return {
          ok: false,
          recordId: syncResult.recordId,
          backend,
          reason: `server rejected the record (HTTP ${response.status})`,
        };
      }
      return { ...syncResult, ok: syncResult.ok };
    } catch (err) {
      return {
        ok: false,
        recordId: syncResult.recordId,
        backend,
        reason: String(err?.message || err),
      };
    }
  }

  async function getRecord(recordId) {
    if (typeof recordId !== "string" || !recordId) return null;
    if (store.has(recordId)) return store.get(recordId);
    if (backend !== "server") return null;
    // Only fetch records this browser has ever indexed — unknown ids are
    // never probed blindly.
    if (!readMetadata(storage)[recordId]) return null;
    try {
      const response = await fetchImpl(
        `${endpoint}/${encodeURIComponent(recordId)}`,
      );
      if (!response.ok) return null;
      const record = await response.json();
      if (
        record &&
        typeof record === "object" &&
        typeof record.id === "string"
      ) {
        store.set(record.id, record);
        return record;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function getRecords(recordIds) {
    const list = Array.isArray(recordIds) ? recordIds : [];
    const results = [];
    for (const recordId of list) {
      results.push(await getRecord(recordId));
    }
    return results;
  }

  async function deleteRecord(recordId) {
    if (typeof recordId !== "string" || !recordId) {
      return { ok: false, recordId, backend, reason: "invalid record id" };
    }
    store.delete(recordId);
    removeMetadataKey(storage, recordId);
    if (backend === "server") {
      try {
        await fetchImpl(`${endpoint}/${encodeURIComponent(recordId)}`, {
          method: "DELETE",
        });
      } catch {
        // Best effort: the local index is gone either way.
      }
    }
    return { ok: true, recordId, backend };
  }

  return {
    backend,
    store,
    saveRecordSync,
    saveRecord,
    getRecord,
    getRecords,
    deleteRecord,
    available() {
      return backend !== "none" && storage !== null;
    },
  };
}

// Default client used by persistAndSummarize. Tests can swap it via
// setContextClient (e.g. to simulate "no durable backend") and restore it.
let defaultClient = createContextClient();

export function getContextClient() {
  return defaultClient;
}

export function setContextClient(client) {
  defaultClient = client || createContextClient();
}
