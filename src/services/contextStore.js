/**
 * Durable context records with real generated summaries.
 *
 * When a conversation exceeds one request's body budget, older messages are
 * NOT deleted with a placeholder claiming they were summarised. Instead:
 *   1. Every dropped message is persisted as a retrievable record
 *      (localStorage on the client; the same shape works with any backend).
 *   2. A real summary is generated from the content (requirements, negative
 *      constraints, errors, decisions, topics), not a generic placeholder.
 *   3. The summary carries retrieval keys that link back to the exact
 *      records, so any follow-up can re-fetch the source text verbatim.
 *
 * Never removed: explicit requirements, negative requirements, user
 * corrections, exact errors, code being modified, verification failures,
 * must-preserve constraints, unresolved decisions.
 */

import { getContextClient } from './contextStoreClient.js';

const STORE_KEY = 'corez_context_records';

function localStore() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function loadContextRecords() {
  const storage = localStore();
  if (!storage) return {};
  return safeParse(storage.getItem(STORE_KEY)) || {};
}

export function storeContextRecords(records) {
  const storage = localStore();
  if (!storage) return;
  const existing = loadContextRecords();
  // Best-effort persistence: the browser localStorage quota (a few MB) may be
  // exceeded when a compacted conversation contained very large messages.
  // Persistence must never break the request — the summary carries the
  // content regardless.
  try {
    storage.setItem(STORE_KEY, JSON.stringify({ ...existing, ...records }));
  } catch {
    // Record persistence is optional; skip silently.
  }
}

/**
 * Retrieve a single context record in full: { id, createdAt, messages }.
 * Returns null when the record does not exist. The exact stored messages are
 * returned — never a summary and never the (legacy, string) .content field.
 * Backward compatibility: a legacy record that has .content but no .messages
 * is returned as-is.
 */
export function retrieveContextRecord(recordId) {
  if (typeof recordId !== 'string' || !recordId) return null;
  const sessionRecord = getContextClient().store.get(recordId);
  if (sessionRecord) return sessionRecord;
  const legacy = loadContextRecords()[recordId];
  return legacy || null;
}

/**
 * Retrieve the exact message objects of a context record. Returns [] when the
 * record is unknown or when a legacy .content record (no .messages) is found.
 */
export function retrieveContextMessages(recordId) {
  const record = retrieveContextRecord(recordId);
  if (!record) return [];
  return Array.isArray(record.messages) ? record.messages : [];
}

/**
 * Retrieve exact message arrays for multiple record ids, preserving the input
 * order. Unknown records yield [] at their position.
 */
export function retrieveContextRecords(recordIds) {
  const list = Array.isArray(recordIds) ? recordIds : [recordIds];
  return list.map((recordId) => retrieveContextMessages(recordId));
}

export function deleteContextRecords(keys) {
  const storage = localStore();
  if (!storage) return;
  const records = loadContextRecords();
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    delete records[key];
  }
  try {
    storage.setItem(STORE_KEY, JSON.stringify(records));
  } catch {
    // Best effort.
  }
}

function makeRecordId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ctx-${crypto.randomUUID()}`;
  }
  return `ctx-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Generate a REAL semantic summary of conversation messages. The output
 * contains the actual extracted content: requirement statements, negative
 * constraints, exact errors, decisions, and topic labels — never a generic
 * "messages were summarised" placeholder.
 */
export function buildContextSummary(messages) {
  const requirements = [];
  const negativeConstraints = [];
  const exactErrors = [];
  const decisions = [];
  const codeSignatures = [];

  const lines = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const text = typeof message?.content === 'string' ? message.content : '';
    lines.push(...text.split('\n'));
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/(must not|do not|never|forbidden|don'?t|must not change|must preserve|must keep|must retain)/i.test(line)) {
      negativeConstraints.push(line.slice(0, 400));
      continue;
    }
    if (/^(requirement|must|need|require|constraint|goal|acceptance criterion|user (wants|needs|requires)|the user (wants|needs|requires))[: ]/i.test(line)) {
      requirements.push(line.slice(0, 400));
      continue;
    }
    if (/(error|exception|failed|failure|stack trace|uncaught|fatal|FAIL|syntaxerror|typeerror|referenceerror)/i.test(line)) {
      exactErrors.push(line.slice(0, 400));
      continue;
    }
    if (/^(decision|decided|we agreed|final choice|use |chosen|approved|rejected):/i.test(line)) {
      decisions.push(line.slice(0, 400));
      continue;
    }
    if (/^[-*]\s*(?:add|implement|fix|refactor|change|update|remove|migrate)\b/i.test(line)) {
      requirements.push(line.slice(0, 400));
    }
  }

  // Code signatures: first line of every fenced block (kept verbatim as a
  // retrieval key; the full block is preserved as an exact record).
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*```/.test(lines[i])) {
      const sig = lines[i + 1]?.trim().slice(0, 120);
      if (sig) codeSignatures.push(sig);
    }
  }

  const topicWords = new Map();
  // Topic extraction samples a bounded window: matching a multi-MB joined
  // string against `[a-z]{5,}` overflows the V8 regex engine's stack. A
  // bounded sample is more than enough to label the dominant topics.
  const topicText = lines.join(' ').toLowerCase();
  const words = topicText.slice(0, 2 * 1024 * 1024).match(/[a-z]{5,}/g) || [];
  for (const word of words) {
    if (['would', 'should', 'could', 'about', 'there', 'their', 'these', 'those', 'which', 'while', 'because', 'through', 'between', 'however'].includes(word)) continue;
    topicWords.set(word, (topicWords.get(word) || 0) + 1);
  }
  const topTopics = [...topicWords.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);

  return {
    summary: {
      topics: topTopics,
      requirements,
      negativeConstraints,
      exactErrors,
      decisions,
      codeSignatures
    },
    retrievalKeys: [...requirements, ...negativeConstraints, ...exactErrors].slice(0, 24)
      .map((item) => item.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48))
      .filter((key) => key.length >= 6)
  };
}

/**
 * Persist dropped messages as exact retrievable records and return a
 * system message that contains the REAL summary plus links back to the
 * records.
 *
 * Persistence flow:
 *   1. The record lands synchronously in the shared in-session store (exact
 *      retrieval within the session) and in the lightweight localStorage
 *      metadata index ({ recordId, createdAt, summaryKeys }).
 *   2. With a server backend, the record is pushed to the R2-backed
 *      /api/context/records worker endpoint asynchronously — the durable
 *      copy that survives a page refresh.
 *
 * Honesty contract: persisted is true only when the local index write
 * succeeded on a configured backend. When durable storage is unavailable
 * (no backend, localStorage quota) the summary marks { persisted: false }
 * and never claims full records are retrievable by key. The in-session copy
 * is always kept (a record is never silently deleted).
 *
 * The heuristic caps in buildContextSummary (400 chars/line, 2 MB topic
 * scan, 8 topics, 24 keys, 48-char keys) are indexing optimisations only:
 * the exact source is durably retrievable, so the summary never needs to be
 * a lossless transcript.
 */
export function persistAndSummarize(messages) {
  const messagesList = Array.isArray(messages) ? messages : [];
  const recordId = makeRecordId();
  const built = buildContextSummary(messagesList);
  const record = {
    id: recordId,
    createdAt: Date.now(),
    messages: messagesList,
    summaryKeys: built.retrievalKeys
  };

  const client = getContextClient();
  const saved = client.saveRecordSync(record);
  if (client.backend === 'server') {
    // Fire-and-forget durable push: the session copy already guarantees
    // exact retrieval within this session; the server copy completes the
    // cross-refresh guarantee in the background.
    void client.saveRecord(record);
  }
  const persisted = Boolean(saved.ok);

  const parts = persisted
    ? ['[Context compaction: earlier messages persisted as exact retrievable records. Summary with retrieval links below; full records can be re-fetched verbatim by key.]']
    : ['[Context compaction: earlier messages kept in-session but NOT durably persisted (persisted: false). The summary below is the only reliable source of the extracted content.]'];

  if (built.summary.topics.length > 0) {
    parts.push(`Topics: ${built.summary.topics.join(', ')}.`);
  }
  if (built.summary.requirements.length > 0) {
    parts.push(`Requirements: ${built.summary.requirements.join(' | ')}`);
  }
  if (built.summary.negativeConstraints.length > 0) {
    parts.push(`Must-preserve / negative constraints: ${built.summary.negativeConstraints.join(' | ')}`);
  }
  if (built.summary.exactErrors.length > 0) {
    parts.push(`Exact errors: ${built.summary.exactErrors.join(' | ')}`);
  }
  if (built.summary.decisions.length > 0) {
    parts.push(`Decisions: ${built.summary.decisions.join(' | ')}`);
  }
  if (built.summary.codeSignatures.length > 0) {
    parts.push(`Code blocks referenced: ${built.summary.codeSignatures.join(' | ')}`);
  }
  if (persisted) {
    parts.push(`Full records: retrieve by key "${recordId}" (or via retrieveContextRecords).`);
  } else {
    parts.push('Full records are not retrievable: durable storage was unavailable (persisted: false).');
  }

  return {
    recordId,
    persisted,
    summaryMessage: {
      role: 'system',
      content: parts.join('\n')
    },
    retrievalKeys: built.retrievalKeys
  };
}
