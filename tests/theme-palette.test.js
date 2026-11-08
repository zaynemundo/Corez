// @vitest-environment node
//
// The shared theme engine is the only place colour maths and the theme contract
// live; the Worker validates with it and the client applies its output as CSS
// variables. These tests pin the readability guarantees and the strict input
// validation that keeps model output out of the CSS.
import { describe, it, expect } from "vitest";
import {
  MAX_CUSTOM_THEMES,
  ThemeSpecError,
  buildThemeDesign,
  contrastRatio,
  isDarkPalette,
  mixHex,
  normalizeImagePrompt,
  normalizeThemeName,
  normalizeThemeSpec,
  parseHexColor,
  parseThemeSelection,
  stripControlCharacters,
  themeSelectionValue,
  toHexColor,
  withAlpha,
} from "../packages/corez-shared/src/theme/palette.js";

const palette = {
  background: "#120607",
  surface: "#1e0b0d",
  text: "#f7ecec",
  muted: "#c9a8ab",
  border: "#5a2a30",
};

const imagePrompts = {
  desktop: "a red Porsche 911 on a wet road at night",
  mobile: "a portrait red Porsche 911 close up",
};

function rgbString(color) {
  const match = /^rgba?\((\d+), (\d+), (\d+)(?:, (\d*\.?\d+))?\)$/.exec(color);
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

/** The worst-case picture behind the veil for a palette tone. */
function worstCaseImage(tone) {
  return tone === "dark" ? "#ffffff" : "#000000";
}

/** Effective colour of an rgba token over the scrimmed worst-case picture. */
function compositeOverImage(design, token) {
  const layer = rgbString(token);
  expect(layer).toBeTruthy();
  const scrim = rgbString(design.scrim);
  const scrimmed = mixHex(
    design.solid["--bg-primary"],
    worstCaseImage(design.tone),
    1 - scrim.a,
  );
  return mixHex(
    scrimmed,
    toHexColor({ r: layer.r, g: layer.g, b: layer.b }),
    layer.a,
  );
}

describe("colour maths", () => {
  it("parses the two hex forms and rejects anything else", () => {
    expect(parseHexColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor("#120607")).toEqual({ r: 18, g: 6, b: 7 });
    expect(parseHexColor("red")).toBeNull();
    expect(parseHexColor("#12345")).toBeNull();
    expect(parseHexColor("rgba(0,0,0,.5)")).toBeNull();
  });

  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 2);
  });

  it("mixes colours and adds alpha", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(withAlpha("#120607", 0.5)).toBe("rgba(18, 6, 7, 0.5)");
  });

  it("detects dark versus light backgrounds", () => {
    expect(isDarkPalette("#000000")).toBe(true);
    expect(isDarkPalette("#ffffff")).toBe(false);
  });
});

describe("theme input normalisation", () => {
  it("accepts a strict theme spec", () => {
    const spec = normalizeThemeSpec({
      name: "Porsche Red",
      palette,
      imagePrompts,
    });
    expect(spec.name).toBe("Porsche Red");
    expect(spec.palette).toEqual(palette);
    expect(spec.imagePrompts.desktop).toContain("Porsche");
  });

  it("strips markdown and control characters from the name", () => {
    expect(normalizeThemeName("  **Night\nDrive**  ")).toBe("Night Drive");
    expect(stripControlCharacters("a\u0000b\u001fc")).toBe("a b c");
  });

  it("rejects non-hex palette values (no CSS injection path)", () => {
    for (const value of ["red", "#12345", "url(https://evil)", "rgba(0,0,0,1)"]) {
      expect(() =>
        normalizeThemeSpec({
          name: "Bad",
          palette: { ...palette, background: value },
          imagePrompts,
        }),
      ).toThrowError(ThemeSpecError);
    }
  });

  it("rejects missing or unusable names and prompts", () => {
    expect(() => normalizeThemeName("")).toThrowError(ThemeSpecError);
    expect(() => normalizeThemeName("   ")).toThrowError(ThemeSpecError);
    expect(normalizeThemeName("<b>Night</b>")).not.toMatch(/[<>]/);
    expect(() => normalizeImagePrompt("x")).toThrowError(ThemeSpecError);
    const cleaned = normalizeImagePrompt("a red car https://example.com");
    expect(cleaned).toBe("a red car");
    expect(cleaned).not.toContain("http");
    expect(normalizeImagePrompt("a red car at night")).toBe("a red car at night");
  });
});

describe("buildThemeDesign", () => {
  it("builds a full readable token contract for a dark palette", () => {
    const design = buildThemeDesign(palette);
    expect(design.tone).toBe("dark");
    const { solid } = design;
    for (const key of [
      "--bg-primary",
      "--bg-secondary",
      "--bg-tertiary",
      "--bg-card",
      "--bg-glass",
      "--border-color",
      "--border-hover",
      "--text-primary",
      "--text-secondary",
      "--text-muted",
      "--code-bg",
      "--code-header-bg",
      "--selection-bg",
      "--selection-color",
      "--inline-code-color",
      "--action-strong",
      "--action-strong-hover",
      "--action-strong-contrast",
      "--sidebar-bg",
      "--sidebar-bg-opaque",
      "--sidebar-border",
      "--sidebar-item-hover-bg",
      "--sidebar-item-active-bg",
      "--scrollbar-thumb",
    ]) {
      expect(solid[key], key).toEqual(expect.any(String));
    }
    expect(
      contrastRatio(solid["--text-primary"], solid["--bg-primary"]),
    ).toBeGreaterThanOrEqual(7);
    expect(
      contrastRatio(solid["--text-primary"], solid["--bg-secondary"]),
    ).toBeGreaterThanOrEqual(7);
    expect(
      contrastRatio(solid["--text-secondary"], solid["--bg-secondary"]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(solid["--text-muted"], solid["--bg-secondary"]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(design.image["--theme-scrim"]).toBe(design.scrim);
    for (const key of [
      "--theme-column-bg",
      "--theme-sidebar-bg",
      "--theme-message-bg",
      "--theme-panel-bg",
      "--theme-panel-strong-bg",
      "--theme-scrim",
    ]) {
      expect(design.image[key], key).toMatch(/^rgba\(/);
    }
  });

  it("keeps the picture bright and puts AA text on the reading surfaces", () => {
    const design = buildThemeDesign(palette);
    const scrim = rgbString(design.scrim);
    expect(scrim).toBeTruthy();
    // The veil is deliberately light so the artwork keeps its brightness.
    expect(scrim.a).toBeLessThanOrEqual(0.3);
    // Every text-bearing surface resolves to AA against the worst-case picture.
    for (const token of [
      design.image["--theme-column-bg"],
      design.image["--theme-sidebar-bg"],
      design.image["--theme-message-bg"],
      design.image["--theme-panel-bg"],
      design.image["--theme-panel-strong-bg"],
    ]) {
      const composite = compositeOverImage(design, token);
      expect(contrastRatio(design.solid["--text-primary"], composite)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(design.solid["--text-secondary"], composite)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(design.solid["--text-muted"], composite)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("supports light palettes and derives a readable light tone", () => {
    const light = {
      background: "#f6f1ea",
      surface: "#fffaf2",
      text: "#241b16",
      muted: "#6f6258",
      border: "#d8cbbd",
    };
    const design = buildThemeDesign(light);
    expect(design.tone).toBe("light");
    expect(
      contrastRatio(design.solid["--text-primary"], design.solid["--bg-primary"]),
    ).toBeGreaterThanOrEqual(7);
    const scrim = rgbString(design.scrim);
    expect(scrim.a).toBeLessThanOrEqual(0.3);
    const column = compositeOverImage(design, design.image["--theme-column-bg"]);
    expect(
      contrastRatio(design.solid["--text-primary"], column),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(design.solid["--text-secondary"], column),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(design.solid["--text-muted"], column),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("refuses a palette that cannot be made readable", () => {
    expect(() =>
      buildThemeDesign({
        background: "#808080",
        surface: "#8a8a8a",
        text: "#404040",
        muted: "#555555",
        border: "#999999",
      }),
    ).toThrowError(/contrast/i);
  });

  it("caps custom themes at two", () => {
    expect(MAX_CUSTOM_THEMES).toBe(2);
  });
});

describe("theme selection storage", () => {
  it("round-trips light, dark and custom ids", () => {
    expect(parseThemeSelection("light")).toEqual({ mode: "light", themeId: null });
    expect(parseThemeSelection("dark")).toEqual({ mode: "dark", themeId: null });
    expect(parseThemeSelection("custom:abc-1")).toEqual({
      mode: "custom",
      themeId: "abc-1",
    });
    expect(themeSelectionValue({ mode: "custom", themeId: "abc-1" })).toBe(
      "custom:abc-1",
    );
    expect(themeSelectionValue({ mode: "light" })).toBe("light");
  });

  it("falls back to dark for unknown or malicious values", () => {
    for (const value of ["", null, undefined, "blue", "custom:../../etc", "custom:"]) {
      expect(parseThemeSelection(value)).toEqual({ mode: "dark", themeId: null });
    }
  });
});