/**
 * Attachment → chat-message conversion, including real vision input.
 *
 * CoreZ sends attached images to DeepSeek V4.1 Flash as native image input.
 * The OpenCode Go gateway has one hard constraint that shapes this whole module:
 * it only reads SELF-CONTAINED data URLs. A remote URL is rejected with
 * HTTP 400 ("Upstream request failed ... Failed to download image from ..."),
 * which fails the ENTIRE chat request — not just the image. So an R2 asset URL
 * must never be used as a vision part; it stays a text hint for markup.
 *
 * Kept out of worker/index.js so this rule is directly testable.
 */

// Largest single image accepted from a data-URL thumb, and how many images may
// ride on one request. base64 inflates by ~33% and the Worker bounds the request
// body, so these caps keep a screenshot-heavy turn inside the limit.
export const MAX_VISION_IMAGES = 4;
export const MAX_VISION_DATA_URL_CHARS = 4 * 1024 * 1024; // ~3 MB decoded

export function attachmentKind(attachment) {
  const mime = String(attachment?.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

/**
 * Real vision input for one attachment, or null when it cannot be sent.
 *
 * Only a data-URL thumb qualifies — see the module note about remote URLs.
 */
export function toVisionImagePart(attachment) {
  const thumb = typeof attachment?.thumb === "string" ? attachment.thumb : "";
  if (!thumb.startsWith("data:image/")) return null;
  if (thumb.length > MAX_VISION_DATA_URL_CHARS) return null;
  return { type: "image_url", image_url: { url: thumb } };
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
 * Text-only messages are returned unchanged. When attachments are present the
 * text gains URL hints for markup, and any image carrying a usable data-URL
 * thumb is appended as a real image part (capped by MAX_VISION_IMAGES).
 *
 * @param {{role?: string, content?: unknown, attachments?: unknown[]}} message
 * @returns {{role?: string, content: unknown}}
 */
export function toMultimodalMessage(message) {
  if (!message || typeof message !== "object") return message;
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const hasMedia = attachments.some(
    (a) =>
      absoluteAssetUrl(a) !== null ||
      (a?.thumb && String(a.thumb).startsWith("data:")) ||
      (typeof a?.content === "string" && a.content.trim()),
  );
  if (!hasMedia) {
    return { role: message.role, content: message.content };
  }

  const base =
    typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content.map((c) => c?.text || "").join("\n")
        : String(message.content || "");

  const urlHints = attachments
    .map((a) => {
      const name = a?.name || "file";
      const kind = attachmentKind(a);
      const absUrl = absoluteAssetUrl(a);
      if (absUrl) {
        return `\n[Attached ${kind} "${name}" available at: ${absUrl} - USE THIS URL (must start with https://corez.pro/api/assets/) for <img>/<video>/<audio> src if needed]`;
      }
      if (a?.thumb && String(a.thumb).startsWith("data:")) {
        return `\n[Attached ${kind} "${name}" available as data URL - use this for src if needed]`;
      }
      if (typeof a?.content === "string" && a.content.trim()) {
        return `\n[Attached file "${name}" has extracted text content supplied separately]`;
      }
      return "";
    })
    .join("");

  const hinted = urlHints ? `${base}${urlHints}` : base;

  // Attach the images themselves (capped) so the model sees pixels, not a URL.
  const imageParts = [];
  for (const a of attachments) {
    if (imageParts.length >= MAX_VISION_IMAGES) break;
    const part = toVisionImagePart(a);
    if (part) imageParts.push(part);
  }

  if (imageParts.length > 0) {
    return {
      role: message.role,
      content: [{ type: "text", text: hinted }, ...imageParts],
    };
  }
  return { role: message.role, content: hinted };
}
