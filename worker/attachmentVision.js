/**
 * Attachment → chat-message conversion for a text-only model.
 *
 * Muse Spark 1.3 Contributor — the configured OpenCode Go model — has no
 * vision input on the gateway, so no pixel data is ever sent. Every attachment
 * reaches the model as metadata only: kind, name, size, the authoritative R2
 * URL, and extracted text when a document carries it. worker/index.js states
 * that plainly in the system prompt so the model never invents a description
 * of something it cannot see. Video and audio work the same way: metadata and
 * URL, never the stream.
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
 * Converts one stored message into the shape sent to the model.
 *
 * The result is always plain-text content: the message text plus one metadata
 * hint per attachment. Array content is flattened to its text parts, so a
 * stored multimodal message can never smuggle image input to a text-only
 * model.
 *
 * @param {{role?: string, content?: unknown, attachments?: unknown[]}} message
 * @returns {{role?: string, content: string}}
 */
export function toMultimodalMessage(message) {
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
  const hints = attachments
    .map((a) => {
      const name = a?.name || "file";
      const kind = attachmentKind(a);
      const absUrl = absoluteAssetUrl(a);
      if (absUrl) {
        return `\n[Attached ${kind} "${name}" available at: ${absUrl} - USE THIS URL (must start with https://corez.pro/api/assets/) for <img>/<video>/<audio> src if needed]`;
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

  return { role: message.role, content: hints ? `${base}${hints}` : base };
}
