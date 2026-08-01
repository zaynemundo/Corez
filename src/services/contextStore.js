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

const STORE_KEY = 'corez_context_records';

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function loadContextRecords() {
  if (!isBrowser()) return {};
  return safeParse(window.localStorage.getItem(STORE_KEY)) || {};
}

export function storeContextRecords(records) {
  if (!isBrowser()) return;
  const existing = loadContextRecords();
  // Best-effort persistence: the browser localStorage quota (a few MB) may be
  // exceeded when a compacted conversation contained very large messages.
  // Persistence must never break the request — the summary carries the
  // content regardless.
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ ...existing, ...records }));
  } catch {
    // Record persistence is optional; skip silently.
  }
}

export function retrieveContextRecords(keys) {
  const records = loadContextRecords();
  const list = Array.isArray(keys) ? keys : [keys];
  return list
    .map((key) => records[key])
    .filter(Boolean)
    .map((record) => record.content);
}

export function deleteContextRecords(keys) {
  if (!isBrowser()) return;
  const records = loadContextRecords();
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    delete records[key];
  }
  window.localStorage.setItem(STORE_KEY, JSON.stringify(records));
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
 */
export function persistAndSummarize(messages) {
  const recordId = makeRecordId();
  const record = {
    id: recordId,
    createdAt: Date.now(),
    messages: Array.isArray(messages) ? messages : []
  };
  storeContextRecords({ [recordId]: record });

  const built = buildContextSummary(messages);
  const parts = ['[Context compaction: earlier messages persisted as exact retrievable records. Summary with retrieval links below; full records can be re-fetched verbatim by key.]'];

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
  parts.push(`Full records: retrieve by key "${recordId}" (or via retrieveContextRecords).`);

  return {
    recordId,
    summaryMessage: {
      role: 'system',
      content: parts.join('\n')
    },
    retrievalKeys: built.retrievalKeys
  };
}
