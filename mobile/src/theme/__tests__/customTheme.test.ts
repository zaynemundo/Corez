import type { CustomTheme } from "@/api/themes";
import {
  hasThemeArtwork,
  isCustomTheme,
  themeFromCustomTheme,
  themeWallpaperBase,
} from "../customTheme";
import { darkTheme } from "../tokens";

const theme: CustomTheme = {
  id: "thm_1",
  name: "Racing Red",
  tone: "dark",
  palette: {
    background: "#101010",
    surface: "#1a1a1a",
    text: "#f5f5f5",
    muted: "#a0a0a0",
    border: "#333333",
  },
  tokens: {
    solid: {
      "--bg-primary": "#101010",
      "--bg-secondary": "#1a1a1a",
      "--text-primary": "#f5f5f5",
      "--text-muted": "#a0a0a0",
      "--border-color": "#333333",
      "--code-bg": "#151515",
    },
  },
};

describe("custom theme mapping", () => {
  it("maps Worker CSS variables onto native colours", () => {
    const mapped = themeFromCustomTheme(theme);
    expect(mapped.mode).toBe("dark");
    expect(mapped.colors.bgPrimary).toBe("#101010");
    expect(mapped.colors.bgSecondary).toBe("#1a1a1a");
    expect(mapped.colors.textPrimary).toBe("#f5f5f5");
    expect(mapped.colors.border).toBe("#333333");
    expect(mapped.colors.codeBg).toBe("#151515");
    // user bubble is derived from the theme's text colour
    expect(mapped.colors.userBubble).toBe("rgba(245, 245, 245, 0.12)");
  });

  it("falls back to the base token set for missing variables", () => {
    const mapped = themeFromCustomTheme({
      ...theme,
      tokens: { solid: {} },
    });
    expect(mapped.colors.bgPrimary).toBe(darkTheme.colors.bgPrimary);
    expect(mapped.colors.textPrimary).toBe(darkTheme.colors.textPrimary);
  });

  it("uses light semantics for a light custom theme", () => {
    const mapped = themeFromCustomTheme({
      ...theme,
      tone: "light",
      tokens: { solid: { "--bg-primary": "#fafafa", "--text-primary": "#101010" } },
    });
    expect(mapped.mode).toBe("light");
    expect(mapped.colors.bgPrimary).toBe("#fafafa");
  });

  it("uses the Worker's translucent image-mode surfaces when artwork exists", () => {
    const imageTheme: CustomTheme = {
      ...theme,
      images: {
        mobile: "/api/assets/uid/phone.png",
        desktop: "/api/assets/uid/desktop.png",
      },
      tokens: {
        solid: { ...theme.tokens.solid },
        image: {
          "--theme-scrim": "rgba(16, 16, 16, 0.22)",
          "--theme-panel-bg": "rgba(26, 26, 26, 0.76)",
          "--theme-panel-strong-bg": "rgba(16, 16, 16, 0.9)",
          "--theme-message-bg": "rgba(26, 26, 26, 0.68)",
        },
      },
    };
    const mapped = themeFromCustomTheme(imageTheme);
    expect(hasThemeArtwork(imageTheme)).toBe(true);
    expect(mapped.colors.bgPrimary).toBe("rgba(16, 16, 16, 0.9)");
    expect(mapped.colors.bgCard).toBe("rgba(26, 26, 26, 0.76)");
    expect(mapped.colors.userBubble).toBe("rgba(26, 26, 26, 0.68)");
    expect(themeWallpaperBase(imageTheme, "#000")).toBe("#101010");
    expect(hasThemeArtwork(theme)).toBe(false);
    expect(themeWallpaperBase(null, "#000")).toBe("#000");
  });

  it("recognises cached theme objects", () => {
    expect(isCustomTheme(theme)).toBe(true);
    expect(isCustomTheme(null)).toBe(false);
    expect(isCustomTheme({ id: "x" })).toBe(false);
  });
});
