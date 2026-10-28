import { persistAndSummarize } from "../contextStore.js";

// The only hard ceiling on a request is the platform's own body limit
// (the worker allows 24 MB). Below that, the full conversation travels with
// the request so earlier requirements and constraints are never discarded.
const MAX_COMPACTED_BYTES = 16 * 1024 * 1024;
const EXACT_EVIDENCE_PATTERN =
  /```[\s\S]*?```|(?:error|exception|failed|fix|bug|require|must|constraint|dependenc|version|@|\/\/|--)[^\n]{0,200}/i;

/**
 * Compact conversation history before sending it to the hosted AI.
 *
 * The full conversation is sent unchanged unless it approaches the platform
 * request-body limit. Only then are redundant older prose turns removed from
 * the request — but never deleted: every dropped message is persisted as an
 * exact retrievable record, and the request carries a REAL generated summary
 * (requirements, negative constraints, exact errors, decisions) with
 * retrieval keys linking back to the records. The latest user request, code
 * blocks, errors, and explicit requirements are preserved verbatim.
 */
export function compactConversationForRequest(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  const serialized = JSON.stringify(messages);
  if (serialized.length <= MAX_COMPACTED_BYTES) return messages;

  let compacted = [...messages];
  const dropped = [];
  let i = 0;
  while (
    compacted.length > 1 &&
    JSON.stringify(compacted).length > MAX_COMPACTED_BYTES &&
    i < compacted.length
  ) {
    const candidate = compacted[i];
    const isLatestUserTurn =
      candidate?.role === "user" && i === compacted.length - 1;
    const content =
      typeof candidate?.content === "string" ? candidate.content : "";
    const carriesEvidence = EXACT_EVIDENCE_PATTERN.test(content);
    if (!isLatestUserTurn && !carriesEvidence) {
      dropped.push(candidate);
      compacted.splice(i, 1);
      continue;
    }
    i += 1;
  }

  if (dropped.length > 0) {
    const { summaryMessage } = persistAndSummarize(dropped);
    compacted.splice(1, 0, summaryMessage);
  }

  // Final guard: if even the evidence-only payload exceeds the platform
  // limit, keep the latest user turn and every code block exactly; fold the
  // remaining prose into a persisted record with a real summary.
  const finalSerialized = JSON.stringify(compacted);
  if (finalSerialized.length > MAX_COMPACTED_BYTES) {
    const last = compacted[compacted.length - 1];
    const prefix = [];
    const overflow = [];
    for (const message of compacted.slice(0, -1)) {
      const content =
        typeof message?.content === "string" ? message.content : "";
      if (
        /```/.test(content) ||
        /(?:error|exception|failed|bug|must|require|constraint)/i.test(content)
      ) {
        prefix.push(message);
      } else {
        overflow.push(message);
      }
    }
    const { summaryMessage } = persistAndSummarize(overflow);
    compacted = [...prefix, summaryMessage, last];
  }

  return compacted;
}
