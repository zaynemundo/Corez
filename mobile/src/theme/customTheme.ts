/**
 * Turn a saved Worker theme into the native token shape.
 *
 * The Worker expands a five-colour palette into the full WCAG-checked CSS
 * variable contract (`tokens.solid`). React Native has no cascade, so this maps
 * those variables onto `ThemeColors`; anything missing falls back to the base
 * dark/light token set for the theme's tone.
 */
import type { CustomTheme } from "@/api/themes";
import {
  darkTheme,
  lightTheme,
  radii,
  spacing,
  typography,
  type Theme,
  type ThemeColors,
} from "./tokens";

function withAlpha(value: string, alpha: number): string {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return value;
  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((part) => part + part)
          .join("")
      : match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function hasThemeArtwork(custom: CustomTheme | null): boolean {
  return Boolean(custom?.images?.mobile || custom?.images?.desktop);
}

/**
 * Opaque colour painted under the wallpaper (and used as the whole background
 * when the theme has no artwork). Keeping it separate from the mapped
 * `bgPrimary` matters because image themes make the normal surfaces translucent.
 */
export function themeWallpaperBase(
  custom: CustomTheme | null,
  fallback: string,
): string {
  const value = custom?.tokens?.solid?.["--bg-primary"];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function themeFromCustomTheme(custom: CustomTheme): Theme {
  const base = custom.tone === "light" ? lightTheme : darkTheme;
  const tokens = custom.tokens?.solid || {};
  const pick = (key: string, fallback: string): string => {
    const value = tokens[key];
    return typeof value === "string" && value.trim() ? value : fallback;
  };

  const textPrimary = pick("--text-primary", base.colors.textPrimary);
  const imageMode = hasThemeArtwork(custom);
  const imageTokens = custom.tokens?.image || {};
  const pickImage = (key: string, fallback: string): string => {
    const value = imageTokens[key];
    return typeof value === "string" && value.trim() ? value : fallback;
  };
  const colors: ThemeColors = {
    ...base.colors,
    bgPrimary: pick("--bg-primary", base.colors.bgPrimary),
    bgSecondary: pick("--bg-secondary", base.colors.bgSecondary),
    bgTertiary: pick("--bg-tertiary", base.colors.bgTertiary),
    bgCard: pick("--bg-card", base.colors.bgCard),
    bgGlass: pick("--bg-glass", base.colors.bgGlass),
    border: pick("--border-color", base.colors.border),
    borderHover: pick("--border-hover", base.colors.borderHover),
    textPrimary,
    textSecondary: pick("--text-secondary", base.colors.textSecondary),
    textMuted: pick("--text-muted", base.colors.textMuted),
    codeBg: pick("--code-bg", base.colors.codeBg),
    codeHeaderBg: pick("--code-header-bg", base.colors.codeHeaderBg),
    inlineCode: pick("--inline-code-color", base.colors.inlineCode),
    selectionBg: pick("--selection-bg", base.colors.selectionBg),
    selectionText: pick("--selection-color", base.colors.selectionText),
    actionStrong: pick("--action-strong", base.colors.actionStrong),
    actionStrongHover: pick(
      "--action-strong-hover",
      base.colors.actionStrongHover,
    ),
    actionStrongContrast: pick(
      "--action-strong-contrast",
      base.colors.actionStrongContrast,
    ),
    overlay: custom.tone === "light" ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.62)",
    userBubble: withAlpha(textPrimary, 0.12),
    userBubbleBorder: withAlpha(textPrimary, 0.2),
  };

  if (imageMode) {
    // The Worker solves translucent reading surfaces against the wallpaper's
    // worst-case brightness; use them so text stays readable over the picture.
    const panel = pickImage("--theme-panel-bg", colors.bgSecondary);
    const strong = pickImage("--theme-panel-strong-bg", colors.bgPrimary);
    const message = pickImage("--theme-message-bg", colors.bgCard);
    colors.bgPrimary = strong;
    colors.bgSecondary = panel;
    colors.bgCard = panel;
    colors.bgTertiary = message;
    colors.bgGlass = panel;
    colors.userBubble = message;
    colors.userBubbleBorder = withAlpha(textPrimary, 0.2);
  }

  return {
    mode: custom.tone,
    colors,
    radii,
    spacing,
    typography,
  };
}

export function isCustomTheme(value: unknown): value is CustomTheme {
  if (!value || typeof value !== "object") return false;
  const theme = value as Partial<CustomTheme>;
  return (
    typeof theme.id === "string" &&
    typeof theme.name === "string" &&
    (theme.tone === "dark" || theme.tone === "light") &&
    Boolean(theme.tokens && typeof theme.tokens === "object")
  );
}
