/**
 * Smart Compacting Chat — client + server shared logic
 *
 * Keep the conversation fast by loading only recent messages full
 * and summarizing older ones into a single retrievable system banner.
 *
 * Reuses the durable context-store pipeline (persistAndSummarize) so
 * the full history is never lost — the summary carries retrieval keys.
 */

import {
  buildContextSummary,
  persistAndSummarize,
  retrieveContextMessages,
} from "./contextStore.js";

export const SMART_COMPACT_DEFAULTS = {
  keepRecent: 30,
  maxFullMessages: 50,
  maxBytes: 120 * 1024, // 120KB
  minToCompact: 35, // only compact when total > this
};

export function estimateBytes(messages) {
  try {
    return JSON.stringify(messages).length;
  } catch {
    return messages.reduce((n, m) => n + (m.content?.length || 0), 0);
  }
}

export function shouldCompact(messages, opts = {}) {
  const { minToCompact, maxBytes } = { ...SMART_COMPACT_DEFAULTS, ...opts };
  if (!Array.isArray(messages) || messages.length === 0) return false;
  if (messages.length >= minToCompact) return true;
  if (estimateBytes(messages) >= maxBytes) return true;
  // single huge canvas payload
  if (messages.some((m) => (m.content?.length || 0) > 60_000)) return true;
  return false;
}

/**
 * Compact an array of chat messages for display.
 * Returns the display list (summary banner + recent) and metadata for expansion.
 *
 * Older messages are persisted via persistAndSummarize so they remain
 * retrievable by recordId even after compaction.
 */
export function compactChatMessages(messages, opts = {}) {
  const { keepRecent } = { ...SMART_COMPACT_DEFAULTS, ...opts };
  if (!Array.isArray(messages) || messages.length <= keepRecent) {
    return {
      compacted: false,
      displayMessages: messages,
      meta: null,
      originalMessages: messages,
    };
  }
  if (!shouldCompact(messages, opts)) {
    return {
      compacted: false,
      displayMessages: messages,
      meta: null,
      originalMessages: messages,
    };
  }

  const older = messages.slice(0, messages.length - keepRecent);
  const recent = messages.slice(messages.length - keepRecent);
  if (older.length === 0) {
    return {
      compacted: false,
      displayMessages: messages,
      meta: null,
      originalMessages: messages,
    };
  }

  const built = buildContextSummary(older);
  const { recordId, persisted, summaryMessage } = persistAndSummarize(older);

  const topics = built.summary.topics || [];
  const compactedCount = older.length;

  // Human-readable one-liner for the banner (topics + key signals)
  const summaryParts = [];
  if (topics.length)
    summaryParts.push(`Topics: ${topics.slice(0, 6).join(", ")}`);
  if (built.summary.requirements.length)
    summaryParts.push(`${built.summary.requirements.length} requirements`);
  if (built.summary.negativeConstraints.length)
    summaryParts.push(
      `${built.summary.negativeConstraints.length} constraints`,
    );
  if (built.summary.exactErrors.length)
    summaryParts.push(`${built.summary.exactErrors.length} errors`);
  if (built.summary.codeSignatures.length)
    summaryParts.push(`${built.summary.codeSignatures.length} code blocks`);

  const summaryLine = summaryParts.length
    ? summaryParts.join(" • ")
    : "Earlier conversation summarized";

  const banner = {
    role: "system",
    content: summaryMessage.content,
    // Render hint for the UI
    _compactMeta: {
      isCompactSummary: true,
      recordId,
      persisted,
      compactedCount,
      topics,
      summaryLine,
      createdAt: Date.now(),
      // Full retrieval keys for debugging / future fetch
      retrievalKeys: built.retrievalKeys,
    },
  };

  return {
    compacted: true,
    displayMessages: [banner, ...recent],
    meta: banner._compactMeta,
    originalMessages: messages,
    summaryMessage: banner,
  };
}

/**
 * Expand a previously compacted view back to the full history.
 * Prefers the in-session persisted record; falls back to the
 * original snapshot kept at compact time.
 */
export function expandCompactedChat(compactResult) {
  if (!compactResult || !compactResult.compacted) {
    return (
      compactResult?.displayMessages || compactResult?.originalMessages || []
    );
  }
  const { meta, originalMessages } = compactResult;
  if (meta?.recordId) {
    const retrieved = retrieveContextMessages(meta.recordId);
    if (Array.isArray(retrieved) && retrieved.length > 0) {
      const recent = compactResult.displayMessages.filter(
        (m) => !m._compactMeta,
      );
      return [...retrieved, ...recent];
    }
  }
  return (
    originalMessages ||
    compactResult.displayMessages.filter((m) => !m._compactMeta)
  );
}

/**
 * Server-side lightweight summary builder for the worker.
 * Mirrors buildContextSummary without the persistence side effects
 * (worker persists separately via ContextStore R2).
 */
export function buildServerCompactSummary(messages) {
  return buildContextSummary(messages);
}
