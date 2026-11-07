/**
 * Attachment picking and upload.
 *
 * Mirrors the web's attachment shape so `/api/ai` and `/api/chats` receive the
 * same fields: images carry a `thumb` data URL (vision + preview) and an R2
 * `assetUrl`/`assetKey` after upload; text-like documents carry their content
 * inline; other files carry metadata only.
 */
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { requestJson } from "@/api/client";

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size?: number;
  thumb?: string;
  assetUrl?: string;
  assetKey?: string;
  content?: string;
}

export type AttachmentSource = "camera" | "library" | "file";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_BYTES = 200 * 1024;
const MAX_TEXT_CHARS = 200_000;

export function formatBytes(bytes?: number): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "unknown size";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildAttachmentPrompt(attachments: Attachment[]): string {
  if (!Array.isArray(attachments) || attachments.length === 0) return "";
  const sections = attachments.map((attachment) => {
    const meta = `- ${attachment.name} (${attachment.type || "unknown type"}, ${formatBytes(attachment.size)})`;
    if (typeof attachment.content === "string" && attachment.content.trim()) {
      return `${meta}\n  --- file content ---\n${attachment.content}\n  --- end of file ---`;
    }
    return meta;
  });
  return `\n\n[Attached files]\n${sections.join("\n")}\n`;
}

/** Only the fields the API needs; display-only ids are dropped. */
export function toApiAttachments(attachments: Attachment[]) {
  return attachments.map(
    ({ name, type, size, thumb, content, assetUrl, assetKey }) => ({
      name,
      type,
      size,
      thumb,
      content,
      assetUrl,
      assetKey,
    }),
  );
}

function safeFileName(name: string, fallback: string): string {
  return (
    String(name || "")
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .slice(0, 80) || fallback
  );
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function uploadDataUrl(
  dataUrl: string,
  mimeType: string,
  name: string,
): Promise<{ assetUrl?: string; assetKey?: string }> {
  const key = `user-upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeFileName(name, "image.jpg")}`;
  try {
    const data = await requestJson<{ url?: string; key?: string }>(
      "/api/assets/upload",
      {
        method: "POST",
        body: { key, dataUrl, mimeType },
      },
    );
    return {
      assetUrl: typeof data.url === "string" ? data.url : undefined,
      assetKey: typeof data.key === "string" ? data.key : key,
    };
  } catch {
    // The attachment is still usable for this turn (thumb/content travel with
    // the request); only the persistent public URL is missing.
    return {};
  }
}

async function pickImage(
  source: "camera" | "library",
): Promise<Attachment | null> {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Camera permission is required to take a photo.");
    }
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Photo access is required to choose an image.");
    }
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.7,
    base64: true,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
    throw new Error("That image is larger than 10 MB. Choose a smaller one.");
  }
  if (!asset.base64) {
    throw new Error("Could not read the selected image.");
  }

  const mimeType = asset.mimeType || "image/jpeg";
  const name =
    asset.fileName ||
    `${source === "camera" ? "photo" : "image"}-${Date.now()}.jpg`;
  const dataUrl = `data:${mimeType};base64,${asset.base64}`;
  const uploaded = await uploadDataUrl(dataUrl, mimeType, name);

  return {
    id: newId(),
    name,
    type: mimeType,
    size: asset.fileSize,
    thumb: dataUrl,
    ...uploaded,
  };
}

async function pickDocument(): Promise<Attachment | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const type = asset.mimeType || "application/octet-stream";
  const name = asset.name || `file-${Date.now()}`;

  let content: string | undefined;
  const textLike =
    type.startsWith("text/") ||
    type === "application/json" ||
    /\.(md|txt|csv|json|js|ts|jsx|tsx|css|html)$/i.test(name);
  if (textLike && (asset.size ?? 0) <= MAX_TEXT_BYTES) {
    try {
      content = (await new File(asset.uri).text()).slice(0, MAX_TEXT_CHARS);
    } catch {
      content = undefined;
    }
  }

  return {
    id: newId(),
    name,
    type,
    size: asset.size,
    content,
  };
}

/** Pick one attachment. Returns null when the user cancels. */
export async function pickAttachment(
  source: AttachmentSource,
): Promise<Attachment | null> {
  if (source === "file") return pickDocument();
  return pickImage(source);
}
