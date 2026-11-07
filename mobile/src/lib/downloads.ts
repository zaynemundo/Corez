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
