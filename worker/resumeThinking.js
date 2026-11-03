// Continuation context for an interrupted reasoning stream.
//
// This is not a provider-level token resume (no gateway exposes that): it is
// the visible reasoning text the model already produced, fed back as internal
// notes so the next attempt continues instead of repeating the work. The
// client owns the 12h browser cache; this module only validates and bounds the
// optional request field.

export const MAX_RESUME_THINKING_CHARS = 60_000;

export function normalizeResumeThinking(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  return text.slice(0, MAX_RESUME_THINKING_CHARS);
}

export function buildResumeThinkingMessage(value) {
  const thinking = normalizeResumeThinking(value);
  if (!thinking) return "";
  return [
    "[Continuation checkpoint — internal reasoning]",
    "A previous attempt was interrupted after the reasoning below. Continue from this checkpoint instead of restarting the analysis. Do not quote or mention this internal note to the user.",
    "",
    thinking,
    "",
    "[End continuation checkpoint]",
  ].join("\n");
}
