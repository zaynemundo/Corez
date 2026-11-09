/**
 * Custom-theme background artwork.
 *
 * Themes saved with the "colours + artwork" option carry generated desktop and
 * phone wallpapers. The mobile app paints the phone image behind the screens
 * (with the Worker's WCAG scrim) instead of only applying the palette.
 *
 * Artwork lives behind `/api/assets/<owner>/...`, which requires the bearer
 * token, so it is downloaded once into the cache and reused from the local
 * file afterwards.
 */
import { File, Paths } from "expo-file-system";
import type { CustomTheme } from "@/api/themes";
import { getCachedToken } from "@/api/tokenStore";
import { resolveAssetUrl } from "@/lib/urls";

export interface ThemeArtwork {
  /** Local `file://` URI ready for ImageBackground. */
  uri: string;
  /** RGBA veil painted between the picture and the app surfaces. */
  scrim: string;
  /** Absolute remote URL, used as the cache key. */
  remote: string;
}

const DEFAULT_SCRIM = "rgba(0, 0, 0, 0.22)";

export function themeArtworkRemote(custom: CustomTheme | null): string | null {
  if (!custom) return null;
  const source = custom.images?.mobile || custom.images?.desktop;
  if (!source) return null;
  return resolveAssetUrl(source);
}

export function themeArtworkScrim(custom: CustomTheme | null): string {
  if (!custom) return DEFAULT_SCRIM;
  const imageTokens = custom.tokens?.image || {};
  const fromTokens =
    imageTokens["--theme-scrim"] || custom.tokens?.scrim || "";
  return fromTokens || DEFAULT_SCRIM;
}

function cacheName(themeId: string, remote: string): string {
  let hash = 0;
  for (let index = 0; index < remote.length; index += 1) {
    hash = (hash * 31 + remote.charCodeAt(index)) | 0;
  }
  const safeId = String(themeId || "theme").replace(/[^A-Za-z0-9_-]/g, "");
  return `corez-theme-${safeId}-${Math.abs(hash).toString(36)}.img`;
}

export async function resolveThemeArtwork(
  custom: CustomTheme | null,
): Promise<ThemeArtwork | null> {
  const remote = themeArtworkRemote(custom);
  if (!remote) return null;
  const scrim = themeArtworkScrim(custom);
  try {
    const file = new File(Paths.cache, cacheName(custom?.id || "theme", remote));
    if (file.exists && (file.size || 0) > 0) {
      return { uri: file.uri, scrim, remote };
    }
    const token = getCachedToken();
    const downloaded = await File.downloadFileAsync(remote, file, {
      idempotent: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { uri: downloaded.uri, scrim, remote };
  } catch {
    return null;
  }
}
