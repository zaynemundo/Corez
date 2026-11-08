/**
 * Which single action the composer's right-hand button shows.
 *
 * Mirrors the web composer: one button that is Stop while a response streams,
 * the microphone while the input is empty (or dictation is running), and Send
 * as soon as there is text or an attachment. Keeping this pure makes the
 * switching rule testable without rendering the native input.
 */
export type ComposerDictationStatus = "idle" | "recording" | "transcribing";
export type ComposerActionKind = "stop" | "mic" | "send";

export interface ComposerActionInput {
  streaming: boolean;
  hasContent: boolean;
  dictationStatus?: ComposerDictationStatus;
  canDictate?: boolean;
}

export function resolveComposerAction({
  streaming,
  hasContent,
  dictationStatus = "idle",
  canDictate = false,
}: ComposerActionInput): ComposerActionKind {
  if (streaming) return "stop";
  if (
    canDictate &&
    (dictationStatus !== "idle" || !hasContent)
  ) {
    return "mic";
  }
  return "send";
}
