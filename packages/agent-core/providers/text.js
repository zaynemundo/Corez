// Shared text helpers for provider responses.
//
// Reasoning models can emit internal thought inline wrapped in
// <think>/<thinking> blocks (or, on the gateway, separately as
// reasoning_content). These helpers keep thought text out of every surface:
// the worker chain, the package adapters, and the frontend sanitizer all use
// the same implementation.

/**
 * Extracts plain text from a content value that may be a string or a
 * multimodal array of { type, text } parts.
 */
export function extractContentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === 'object' && typeof part.text === 'string'
          ? part.text
          : '',
      )
      .join('');
  }
  return '';
}

/**
 * Removes inline reasoning blocks. An unclosed block (output truncated
 * mid-thought) is reasoning too: everything from the marker onward is
 * dropped, since any real answer would only ever follow a closed block.
 */
export function stripThinkingBlocks(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<(?:think|thinking)\b[^>]*>[\s\S]*$/gi, '')
    .trim();
}

const OPEN_TAG_PREFIXES = ['<think', '<thinking'];
const CLOSE_TAG_PREFIXES = ['</think', '</thinking'];
const OPEN_TAG_PATTERN = /<(?:think|thinking)\b[^>]*>/i;
const CLOSE_TAG_PATTERN = /<\/(?:think|thinking)\s*>/i;

// Longest suffix of `text` that is still an incomplete prefix of any target
// (e.g. "<thi" while waiting for the rest of "<thinking"). The suffix is held
// back from output until the next chunk decides whether it is a tag.
function pendingTagSuffix(text, targets) {
  const maxLength = Math.min(
    text.length,
    Math.max(...targets.map((target) => target.length)),
  );
  for (let length = maxLength; length > 0; length -= 1) {
    const suffix = text.slice(-length).toLowerCase();
    if (targets.some((target) => target.startsWith(suffix))) {
      return text.slice(-length);
    }
  }
  return '';
}

/**
 * Stateful filter that strips inline <think>/<thinking> blocks from a stream
 * of content deltas, including blocks whose tags are split across deltas.
 *
 * Usage: push() every content delta and emit the returned string (may be
 * empty when the delta is entirely inside a thinking block). flush() at the
 * end releases a held-back partial tag; an unclosed thinking block swallows
 * its remainder (truncated mid-thought).
 */
export function createThinkingStreamFilter() {
  let pending = '';
  let inThinking = false;

  return {
    push(chunk) {
      if (typeof chunk !== 'string' || chunk.length === 0) return '';
      pending += chunk;
      let output = '';
      for (;;) {
        if (inThinking) {
          const close = CLOSE_TAG_PATTERN.exec(pending);
          if (close) {
            pending = pending.slice(close.index + close[0].length);
            inThinking = false;
            continue;
          }
          pending = pendingTagSuffix(pending, CLOSE_TAG_PREFIXES);
          return output;
        }
        const open = OPEN_TAG_PATTERN.exec(pending);
        if (open) {
          output += pending.slice(0, open.index);
          pending = pending.slice(open.index + open[0].length);
          inThinking = true;
          continue;
        }
        const tail = pendingTagSuffix(pending, OPEN_TAG_PREFIXES);
        if (tail) {
          output += pending.slice(0, pending.length - tail.length);
          pending = tail;
        } else {
          output += pending;
          pending = '';
        }
        return output;
      }
    },
    flush() {
      if (inThinking) {
        pending = '';
        inThinking = false;
        return '';
      }
      const tail = pending;
      pending = '';
      return tail;
    },
  };
}
