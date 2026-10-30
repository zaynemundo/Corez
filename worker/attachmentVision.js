/**
 * Attachment → chat-message conversion.
 *
 * Vision capability (verified live, 2026-10-13): DeepSeek V4.1 Flash
 * DOES accept image input on the OpenCode Go gateway's Responses API. A
 * randomized striped-color probe (colors drawn per round) named the stripes
 * correctly (2/3 exact plus a synonym — cyan for teal), which a blind model
 * cannot do; the same model rejects the chat-completions protocol with
 * HTTP 400 "Model does not support this protocol", which is why the
 * Responses endpoint stays the only transport.
 *
 * With `{ vision: true }` and image attachments on a user turn, the real
 * pixels travel as `input_image` parts: the inline thumbnail data URL when
 * present (the frontend caps these for the gateway), otherwise the
 * authoritative R2 URL. Assistant turns never carry image parts.
 *
 * Video and audio stay metadata-only in every mode: no model on this gateway
 * consumes those streams, so their bytes are never sent. Documents reach the
 * model as metadata (name, type, size, R2 URL) plus their extracted text,
 * supplied elsewhere in the conversation.
 *
 * Kept out of worker/index.js so this rule is directly testable.
 */

export function attachmentKind(attachment) {
  const mime = String(attachment?.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

/** Absolute R2 URL for an attachment, or null when it has none. */
function absoluteAssetUrl(attachment) {
  const asset = typeof attachment?.assetUrl === "string" ? attachment.assetUrl : "";
  if (!asset.includes("/api/assets/")) return null;
  return asset.startsWith("http")
    ? asset
    : `https://corez.pro${asset.startsWith("/") ? "" : "/"}${asset}`;
}

/**
 * Image URL for a vision part: the inline thumb data URL first (self-contained,
 * no external fetch), then the absolute R2 URL.
 */
function imageUrlFor(attachment) {
  const thumb = typeof attachment?.thumb === "string" ? attachment.thumb : "";
  if (/^data:image\//i.test(thumb)) return thumb;
  return absoluteAssetUrl(attachment);
}

/**
 * Converts one stored message into the shape sent to the model.
 *
 * Default (no options): plain-text content — the message text plus one
 * metadata hint per attachment. Array content is flattened to its text parts,
 * so a stored multimodal message can never smuggle image input to a
 * non-vision transport.
 *
 * `{ vision: true }`: a user message carrying images becomes a Responses-API
 * content array — `input_text` (text plus the same metadata hints, so markup
 * URLs stay authoritative) followed by one `input_image` per image.
 *
 * @param {{role?: string, content?: unknown, attachments?: unknown[]}} message
 * @param {{vision?: boolean}} [options]
 * @returns {{role?: string, content: string | Array<object>}}
 */
export function toMultimodalMessage(message, options = {}) {
  if (!message || typeof message !== "object") return message;

  const base =
    typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content
            .map((c) => c?.text || "")
            .filter((text) => text !== "")
            .join("\n")
        : String(message.content || "");

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];

  // Image pixels only for user turns, and only when the caller opts in.
  const visionImages =
    options.vision === true && message.role !== "assistant"
      ? attachments
          .filter((a) => attachmentKind(a) === "image")
          .map((a) => {
            const url = imageUrlFor(a);
            return url ? { attachment: a, part: { type: "input_image", image_url: url } } : null;
          })
          .filter(Boolean)
      : [];
  const visionSupplied = new Set(visionImages.map((v) => v.attachment));

  const hints = attachments
    .map((a) => {
      const name = a?.name || "file";
      const kind = attachmentKind(a);
      const absUrl = absoluteAssetUrl(a);
      if (absUrl) {
        return `\n[Attached ${kind} "${name}" available at: ${absUrl} - USE THIS URL (must start with https://corez.pro/api/assets/) for <img>/<video>/<audio> src if needed]`;
      }
      // The pixels are already in the message as an input_image part: never
      // tell the model they are missing (it then answers "unknown" about an
      // image it can actually see — observed live).
      if (visionSupplied.has(a)) {
        return `\n[Attached image "${name}" - supplied to you as image input]`;
      }
      if (a?.thumb && String(a.thumb).startsWith("data:")) {
        return `\n[Attached ${kind} "${name}" - metadata only; its pixels are not provided]`;
      }
      if (typeof a?.content === "string" && a.content.trim()) {
        return `\n[Attached file "${name}" has extracted text content supplied separately]`;
      }
      return "";
    })
    .join("");

  if (visionImages.length > 0) {
    const text = `${base}${hints}`;
    return {
      role: message.role,
      content: [
        ...(text ? [{ type: "input_text", text }] : []),
        ...visionImages.map((v) => v.part),
      ],
    };
  }

  return { role: message.role, content: hints ? `${base}${hints}` : base };
}
