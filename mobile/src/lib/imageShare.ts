/**
 * Download and share a generated image.
 *
 * Android WebView-style blob downloads are not available to React Native, so
 * images are downloaded to the cache with expo-file-system and handed to the
 * native share sheet (which also covers "save to Photos/Files").
 */
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { resolveAssetUrl } from "./urls";

/** Safe, unique cache filename for a remote image URL. */
export function imageFileName(uri: string): string {
  const clean = String(uri || "").split(/[?#]/)[0];
  const base = clean.split("/").pop() || "corez-image";
  const safe = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  if (!safe) return "corez-image.png";
  return /\.[A-Za-z0-9]{2,5}$/.test(safe) ? safe : `${safe}.png`;
}

export function imageShareTitle(url: string): string {
  return `Share ${imageFileName(url)}`;
}

/**
 * Download the image, then open the native share sheet.
 * Returns false when sharing is unavailable or the download failed.
 */
export async function shareImage(uri: string): Promise<boolean> {
  const url = resolveAssetUrl(uri);
  if (!url) return false;
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    const destination = new File(
      Paths.cache,
      `${Date.now()}-${imageFileName(url)}`,
    );
    const file = await File.downloadFileAsync(url, destination, {
      idempotent: true,
    });
    await Sharing.shareAsync(file.uri, {
      mimeType: "image/png",
      dialogTitle: imageShareTitle(url),
    });
    return true;
  } catch {
    return false;
  }
}

/** Copy the absolute image URL to the clipboard. */
export async function copyImageLink(uri: string): Promise<boolean> {
  const url = resolveAssetUrl(uri);
  if (!url) return false;
  try {
    await Clipboard.setStringAsync(url);
    return true;
  } catch {
    return false;
  }
}
