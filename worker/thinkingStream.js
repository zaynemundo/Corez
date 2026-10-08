/**
 * User-visible reasoning stream.
 *
 * A first-party chat app shows the model's thinking while it works, so the
 * user watches progress instead of a spinner. CoreZ does the same — with one
 * hard rule: the model's raw chain of thought can name the infrastructure
 * that serves it, and CoreZ's identity contract is that the assistant is
 * "Corez 1.0 built by Corez" whatever powers it. Every reasoning delta is
 * therefore redacted here before it can reach a client.
 *
 * Redaction is applied to complete words only. A provider name split across
 * two SSE deltas ("deep" + "seek") would survive a naive per-delta replace, so
 * text is held back until a whitespace boundary proves the current word is
 * complete. The carry window is bounded so a single long unbroken token (a
 * URL, a base64 blob) can never stall the stream.
 */

/** Hold-back window: text shorter than this is never emitted yet. */
export const THINKING_GUARD_CHARS = 24;

/**
 * Hard cap on the hold-back buffer. Past this, the token is emitted without
 * waiting for whitespace so a pathological unbroken run cannot buffer forever.
 */
export const THINKING_MAX_CARRY_CHARS = 512;

/**
 * Names that would reveal CoreZ's own stack. Generic model names (GPT,
 * Claude, Gemini, …) are deliberately NOT redacted: when a user asks about
 * them, naming them in the reasoning is correct rather than a leak.
 */
const REDACTIONS = Object.freeze([
  [/\bmuse[-\s]?spark(?:[-\s]?(?:v?\d[\w.-]*)?(?:[-\s]?contributor)?)?/gi, "Corez"],
  [/\bdeep\s?seek(?:[-\s]?v?\d[\w.-]*)?/gi, "Corez"],
  [/\bopen\s?code(?:\s?go)?\b/gi, "Corez"],
  [/\bopen\s?router\b/gi, "Corez"],
]);

/**
 * Complete trailing words that can still grow into a redacted name. They are
 * held back one boundary so a brand split across deltas ("muse" + " spark")
 * cannot leak its first word.
 */
const REDACTION_PREFIX = /\b(?:deep|muse|open)$/i;

/** Redact infrastructure names from one chunk of reasoning text. */
export function scrubThinkingText(text) {
  let out = String(text || "");
  if (!out) return "";
  for (const [pattern, replacement] of REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function lastBreakIndex(text) {
  return Math.max(
    text.lastIndexOf(" "),
    text.lastIndexOf("\n"),
    text.lastIndexOf("\t"),
  );
}

/**
 * Incremental redacting buffer. `push` returns the text that is now safe to
 * emit (possibly ""), `flush` returns whatever is still held back at the end
 * of the stream.
 */
export function createThinkingStream() {
  let carry = "";
  return {
    push(chunk) {
      carry += String(chunk || "");
      if (carry.length <= THINKING_GUARD_CHARS) return "";

      // Emit only up to the last whitespace so a word is never split across
      // two emissions; a word that never arrives still drains at the cap.
      const lastBreak = lastBreakIndex(carry);
      let emitUpTo = 0;
      let forcedDrain = false;
      if (lastBreak > 0) emitUpTo = lastBreak + 1;
      else if (carry.length > THINKING_MAX_CARRY_CHARS) {
        emitUpTo = carry.length;
        forcedDrain = true;
      }
      if (emitUpTo <= 0) return "";

      // A trailing complete word may still be the start of a redacted name
      // ("muse" + " spark"): hold it back until the next boundary proves the
      // name cannot form, unless the buffer is being force-drained.
      if (!forcedDrain) {
        const edge = carry.slice(0, emitUpTo).trimEnd();
        const prefix = REDACTION_PREFIX.exec(edge);
        if (prefix) emitUpTo = prefix.index;
      }
      if (emitUpTo <= 0) return "";

      const head = carry.slice(0, emitUpTo);
      carry = carry.slice(emitUpTo);
      return scrubThinkingText(head);
    },
    flush() {
      const tail = scrubThinkingText(carry);
      carry = "";
      return tail;
    },
  };
}
