/**
 * CoreZ design tokens for React Native.
 *
 * These mirror the web design system in `src/index.css` exactly: the same
 * monochrome surfaces, borders-as-depth (no shadows), 8pt spacing family and
 * radii. Keeping the values in one place means the native app and the web app
 * cannot drift apart on colour or shape.
 *
 * The web keeps its tokens in CSS custom properties; React Native has no
 * cascade, so each theme is a plain object and components read `useTheme()`.
 */

export type ThemeMode = "dark" | "light" | "system";

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgCard: string;
  bgGlass: string;
  border: string;
  borderHover: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  positive: string;
  negative: string;
  caution: string;
  codeBg: string;
  codeHeaderBg: string;
  inlineCode: string;
  selectionBg: string;
  selectionText: string;
  actionStrong: string;
  actionStrongHover: string;
  actionStrongContrast: string;
  overlay: string;
  userBubble: string;
  userBubbleBorder: string;
}

export interface Theme {
  mode: "dark" | "light";
  colors: ThemeColors;
  radii: typeof radii;
  spacing: typeof spacing;
  typography: typeof typography;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 9999,
  composer: 28,
} as const;

export const typography = {
  // Mirrors --font-sans / --font-heading / --font-mono. On Android the system
  // font is Roboto; Outfit (display) and JetBrains Mono (code) are loaded from
  // @expo-google-fonts so headings and code match the web.
  fontSans: undefined as string | undefined,
  fontHeading: "Outfit_700Bold",
  fontMono: "JetBrainsMono_400Regular",
  sizes: {
    caption: 11,
    small: 12,
    body: 14,
    bodyLarge: 16,
    title: 18,
    heading: 22,
    hero: 30,
  },
  lineHeights: {
    small: 16,
    body: 21,
    bodyLarge: 24,
    title: 26,
    heading: 28,
    hero: 36,
  },
} as const;

export const darkColors: ThemeColors = {
  bgPrimary: "#000000",
  bgSecondary: "#1a1a1a",
  bgTertiary: "#262626",
  bgCard: "#121212",
  bgGlass: "rgba(0, 0, 0, 0.85)",
  border: "rgba(255, 255, 255, 0.10)",
  borderHover: "rgba(255, 255, 255, 0.32)",
  textPrimary: "#f0f0f0",
  textSecondary: "#b4b4b4",
  textMuted: "#a2a2a2",
  positive: "#4ade80",
  negative: "#f87171",
  caution: "#fbbf24",
  codeBg: "#0a0a0a",
  codeHeaderBg: "#000000",
  inlineCode: "#f1fa8c",
  selectionBg: "rgba(255, 255, 255, 0.20)",
  selectionText: "#f0f0f0",
  actionStrong: "#f0f0f0",
  actionStrongHover: "#f0f0f0",
  actionStrongContrast: "#000000",
  overlay: "rgba(0, 0, 0, 0.62)",
  userBubble: "#1a1a1a",
  userBubbleBorder: "rgba(255, 255, 255, 0.10)",
};

export const lightColors: ThemeColors = {
  bgPrimary: "#f7f7f7",
  bgSecondary: "#ffffff",
  bgTertiary: "#ebebeb",
  bgCard: "#ffffff",
  bgGlass: "rgba(247, 247, 247, 0.85)",
  border: "rgba(0, 0, 0, 0.28)",
  borderHover: "rgba(0, 0, 0, 0.42)",
  textPrimary: "#1a1a1a",
  textSecondary: "#5f5f66",
  textMuted: "#646469",
  positive: "#15803d",
  negative: "#b91c1c",
  caution: "#92400e",
  codeBg: "#efefef",
  codeHeaderBg: "#e5e5e5",
  inlineCode: "#7c5e10",
  selectionBg: "rgba(0, 100, 220, 0.25)",
  selectionText: "#000000",
  actionStrong: "#1a1a1a",
  actionStrongHover: "#000000",
  actionStrongContrast: "#ffffff",
  overlay: "rgba(0, 0, 0, 0.45)",
  userBubble: "#ffffff",
  userBubbleBorder: "rgba(0, 0, 0, 0.28)",
};

export const darkTheme: Theme = {
  mode: "dark",
  colors: darkColors,
  radii,
  spacing,
  typography,
};

export const lightTheme: Theme = {
  mode: "light",
  colors: lightColors,
  radii,
  spacing,
  typography,
};
