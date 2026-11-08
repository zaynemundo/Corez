import type { CustomTheme } from "@/api/themes";
import { isCustomTheme, themeFromCustomTheme } from "../customTheme";
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

  it("recognises cached theme objects", () => {
    expect(isCustomTheme(theme)).toBe(true);
    expect(isCustomTheme(null)).toBe(false);
    expect(isCustomTheme({ id: "x" })).toBe(false);
  });
});
