/**
 * Save/share generated text artifacts (HTML pages, source files).
 *
 * Android WebView-style blob downloads do not exist in React Native, so files
 * are written to the cache and handed to the native share sheet (which also
 * covers "save to Files/Drive").
 */
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";

export function safeFileName(name: string, fallback = "corez-file"): string {
  const value = String(name || "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return value || fallback;
}

export interface ShareFileOptions {
  content: string;
  fileName: string;
  mimeType: string;
  dialogTitle?: string;
}

/** Write `content` to the cache, then open the share sheet. */
export async function shareTextFile({
  content,
  fileName,
  mimeType,
  dialogTitle,
}: ShareFileOptions): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    const file = new File(
      Paths.cache,
      `${Date.now()}-${safeFileName(fileName)}`,
    );
    if (file.exists) file.delete();
    await file.write(content);
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
    return true;
  } catch {
    return false;
  }
}

export async function copyText(content: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(content);
    return true;
  } catch {
    return false;
  }
}

export interface DownloadableFile {
  url: string;
  fileName: string;
}

/**
 * Download a generated PDF/ZIP/office artifact into the cache and open the
 * native share sheet (which includes "Save to Files/Drive"). The URL is the
 * already-resolved absolute asset URL.
 */
export async function downloadAndShareFile({
  url,
  fileName,
}: DownloadableFile): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    const target = new File(
      Paths.cache,
      `${Date.now()}-${safeFileName(fileName, "corez-download")}`,
    );
    if (target.exists) target.delete();
    const file = await File.downloadFileAsync(url, target);
    await Sharing.shareAsync(file.uri);
    return true;
  } catch {
    return false;
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of clean) {
    if (character === "=") break;
    const value = alphabet.indexOf(character);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Share a generated image whether the provider returned an R2 URL or an inline
 * `data:` URL. Returns false when sharing is unavailable or the payload is
 * unusable.
 */
export async function shareImage(
  image: string,
  fileName = "corez-image.png",
): Promise<boolean> {
  const value = String(image || "").trim();
  if (!value) return false;
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    const target = new File(
      Paths.cache,
      `${Date.now()}-${safeFileName(fileName, "corez-image.png")}`,
    );
    if (target.exists) target.delete();
    if (value.startsWith("data:")) {
      const comma = value.indexOf(",");
      if (comma < 0) return false;
      const meta = value.slice(5, comma);
      if (!/base64/i.test(meta)) return false;
      const bytes = base64ToBytes(value.slice(comma + 1));
      if (bytes.length === 0) return false;
      await target.write(bytes);
      await Sharing.shareAsync(target.uri);
      return true;
    }
    if (!/^https?:/i.test(value)) return false;
    const file = await File.downloadFileAsync(value, target);
    await Sharing.shareAsync(file.uri);
    return true;
  } catch {
    return false;
  }
}
