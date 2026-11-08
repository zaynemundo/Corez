// Colour maths and the theme contract shared by the Worker (theme generation /
// validation) and the web client (applying a saved theme as CSS variables).
//
// Pure module: no DOM, no React, no provider imports. The Worker imports it by
// relative path (the existing pattern for packages/agent-core) and the client
// imports it through the @corez_ai/shared/theme export.

export const THEME_NAME_MAX_LENGTH = 40;
export const THEME_IMAGE_PROMPT_MAX_LENGTH = 240;
export const MAX_CUSTOM_THEMES = 2;
export const THEME_PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const PALETTE_KEYS = ["background", "surface", "text", "muted", "border"];

export class ThemeSpecError extends Error {
  constructor(message, code = "invalid_theme") {
    super(message);
    this.name = "ThemeSpecError";
    this.code = code;
  }
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Parse #rgb/#rrggbb into channels, or null when it is not a strict hex colour. */
export function parseHexColor(value) {
  const match = HEX_PATTERN.exec(String(value ?? "").trim());
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((channel) => channel + channel)
      .join("");
  }
  const number = Number.parseInt(hex, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

export function toHexColor({ r, g, b }) {
  return `#${[r, g, b]
    .map((channel) => clampByte(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Mix colour a toward colour b by ratio (0 = all a, 1 = all b). */
export function mixHex(a, b, ratio) {
  const from = parseHexColor(a);
  const to = parseHexColor(b);
  if (!from || !to) return a;
  const t = Math.max(0, Math.min(1, Number(ratio) || 0));
  return toHexColor({
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  });
}

export function withAlpha(value, alpha) {
  const color = parseHexColor(value);
  if (!color) return value;
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.round(a * 1000) / 1000})`;
}

function channelLuminance(channel) {
  const value = channel / 255;
  return value <= 0.03928
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance for a hex colour. */
export function relativeLuminance(value) {
  const color = parseHexColor(value);
  if (!color) return 0;
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

/** WCAG 2.1 contrast ratio between two hex colours. */
export function contrastRatio(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isDarkPalette(background) {
  return relativeLuminance(background) < 0.4;
}

function extremeFor(background) {
  return isDarkPalette(background) ? "#ffffff" : "#000000";
}

/**
 * Move a foreground colour toward the palette's most readable extreme until it
 * reaches `target` against every background in `backgrounds`.
 */
function ensureAgainst(foreground, backgrounds, target) {
  const extreme = extremeFor(backgrounds[0]);
  let candidate = foreground;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const failing = backgrounds.some(
      (background) => contrastRatio(candidate, background) < target,
    );
    if (!failing) return candidate;
    candidate = mixHex(candidate, extreme, 0.12);
  }
  if (
    backgrounds.every((background) => contrastRatio(extreme, background) >= target)
  ) {
    return extreme;
  }
  throw new ThemeSpecError(
    "The generated palette cannot meet the contrast requirements.",
    "theme_not_readable",
  );
}

/** A quieter foreground that still clears `target` against every background. */
function mutedFrom(primary, backgrounds, towardBackground, target) {
  let candidate = mixHex(primary, backgrounds[0], towardBackground);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const failing = backgrounds.some(
      (background) => contrastRatio(candidate, background) < target,
    );
    if (!failing) return candidate;
    candidate = mixHex(candidate, primary, 0.22);
  }
  return ensureAgainst(primary, backgrounds, target);
}

/** Replace control characters with spaces without a control-char regex. */
export function stripControlCharacters(value) {
  return Array.from(String(value ?? ""))
    .map((character) => {
      const code = character.codePointAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("");
}

function normalizeColor(value, key) {
  const color = String(value ?? "").trim();
  if (!parseHexColor(color)) {
    throw new ThemeSpecError(`palette.${key} must be a #rgb or #rrggbb colour.`, "invalid_color");
  }
  return color.toLowerCase();
}

export function normalizeThemeName(value) {
  const clean = stripControlCharacters(value)
    .replace(/[`*_#[\]<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, THEME_NAME_MAX_LENGTH)
    .trim();
  if (clean.length < 2) {
    throw new ThemeSpecError("The theme needs a short name.", "invalid_name");
  }
  return clean;
}

export function normalizeImagePrompt(value) {
  const clean = stripControlCharacters(value)
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, THEME_IMAGE_PROMPT_MAX_LENGTH)
    .trim();
  if (clean.length < 8) {
    throw new ThemeSpecError(
      "Background image descriptions are too short.",
      "invalid_image_prompt",
    );
  }
  return clean;
}

/**
 * Validate the model's JSON response into the only shape the rest of the
 * feature trusts. Anything outside strict hex colours / plain prompt strings is
 * rejected instead of being sanitised into a half-valid theme.
 */
export function normalizeThemeSpec(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ThemeSpecError("The theme designer returned no object.", "invalid_theme");
  }
  const paletteRaw = raw.palette;
  if (!paletteRaw || typeof paletteRaw !== "object" || Array.isArray(paletteRaw)) {
    throw new ThemeSpecError("The theme designer returned no palette.", "invalid_palette");
  }
  const palette = {};
  for (const key of PALETTE_KEYS) {
    palette[key] = normalizeColor(paletteRaw[key], key);
  }
  const imagePromptsRaw = raw.imagePrompts;
  if (!imagePromptsRaw || typeof imagePromptsRaw !== "object") {
    throw new ThemeSpecError(
      "The theme designer returned no background descriptions.",
      "invalid_image_prompts",
    );
  }
  return {
    name: normalizeThemeName(raw.name),
    palette,
    imagePrompts: {
      desktop: normalizeImagePrompt(imagePromptsRaw.desktop),
      mobile: normalizeImagePrompt(imagePromptsRaw.mobile),
    },
  };
}

/** Ensure the two surfaces are distinguishable; a flat palette is unreadable as a UI. */
function separateSurface(background, surface, text) {
  if (contrastRatio(background, surface) >= 1.08) return surface;
  return mixHex(background, text, 0.07);
}

/**
 * Build the complete CSS-variable contract for a validated palette.
 *
 * Returns `{ tone, solid, image, scrim }`:
 * - solid: tokens applied for every custom theme.
 * - image: additional tokens applied only when the theme has background images
 *   (translucent shell/panel surfaces and the scrim painted over the picture).
 * - scrim: rgba() background scrim, also present as image["--theme-scrim"].
 */
export function buildThemeDesign(palette) {
  const { background, text, muted, border } = palette;
  const tone = isDarkPalette(background) ? "dark" : "light";
  const surface = separateSurface(background, palette.surface, text);
  const card = mixHex(background, surface, 0.45);
  const tertiary = mixHex(surface, text, 0.07);

  // Aim for AAA body text; a mid-tone palette that cannot reach 7:1 still gets
  // the best readable extreme rather than being rejected outright.
  let textPrimary;
  try {
    textPrimary = ensureAgainst(text, [background, surface, card], 7);
  } catch {
    textPrimary = ensureAgainst(text, [background, surface, card], 4.5);
  }
  const textSecondary = mutedFrom(textPrimary, [background, surface, card], 0.3, 4.5);
  const textMuted = (() => {
    const fromModel = normalizeColor(muted, "muted");
    const candidate = mutedFrom(fromModel, [background, surface, card], 0.2, 4.5);
    return ensureAgainst(candidate, [background, surface, card], 4.5);
  })();

  const borderColor = contrastRatio(border, background) >= 1.15
    ? border
    : mixHex(background, textPrimary, 0.16);

  const codeBg = mixHex(background, textPrimary, 0.05);
  const codeHeaderBg = mixHex(background, textPrimary, 0.09);
  const inlineBase = tone === "dark" ? "#f1fa8c" : "#7c5e10";
  const inlineCodeColor = ensureAgainst(
    inlineBase,
    [codeBg, codeHeaderBg],
    4.5,
  );

  const solid = {
    "--bg-primary": background,
    "--bg-secondary": surface,
    "--bg-tertiary": tertiary,
    "--bg-card": card,
    "--bg-glass": withAlpha(background, 0.85),
    "--border-color": borderColor,
    "--border-hover": withAlpha(textPrimary, 0.32),
    "--text-primary": textPrimary,
    "--text-secondary": textSecondary,
    "--text-muted": textMuted,
    "--code-bg": codeBg,
    "--code-header-bg": codeHeaderBg,
    "--selection-bg": withAlpha(textPrimary, 0.22),
    "--selection-color": textPrimary,
    "--inline-code-color": inlineCodeColor,
    "--action-strong": textPrimary,
    "--action-strong-hover": textPrimary,
    "--action-strong-contrast": background,
    "--sidebar-bg": withAlpha(background, 0.94),
    "--sidebar-bg-opaque": background,
    "--sidebar-border": withAlpha(textPrimary, 0.1),
    "--sidebar-item-hover-bg": withAlpha(textPrimary, 0.07),
    "--sidebar-item-active-bg": withAlpha(textPrimary, 0.12),
    "--scrollbar-thumb": withAlpha(textPrimary, tone === "dark" ? 0.18 : 0.24),
  };

  const image = buildImageModeTokens({
    background,
    surface,
    textPrimary,
    textSecondary,
    textMuted,
    tone,
  });

  return { tone, solid, image: { ...image.tokens, "--theme-scrim": image.scrim }, scrim: image.scrim };
}

/**
 * Translucent shell tokens for image-backed themes. The scrim is raised until
 * the worst-case picture behind it (pure white for a dark palette, pure black
 * for a light one) still keeps the theme's text readable.
 */
function buildImageModeTokens({ background, surface, textPrimary, textSecondary, textMuted, tone }) {
  const extreme = tone === "dark" ? "#ffffff" : "#000000";
  // The picture must keep its brightness: the veil below only unifies it with
  // the palette. Readability comes from the theme-coloured surfaces layered on
  // top (reading column, sidebar, composer, bubbles), whose opacity is solved
  // against the worst-case picture behind the veil.
  const scrimAlpha = 0.22;
  const scrimmed = mixHex(background, extreme, 1 - scrimAlpha);

  const readable = (on) =>
    contrastRatio(textPrimary, on) >= 4.5 &&
    contrastRatio(textSecondary, on) >= 4.5 &&
    contrastRatio(textMuted, on) >= 4.5;

  const alphaFor = (baseColor, startAlpha) => {
    let alpha = startAlpha;
    let composite = mixHex(scrimmed, baseColor, alpha);
    while (alpha < 0.985 && !readable(composite)) {
      alpha = Math.round((alpha + 0.015) * 1000) / 1000;
      composite = mixHex(scrimmed, baseColor, alpha);
    }
    return alpha;
  };

  // The reading column carries the transcript and the new-chat hero: it is the
  // main high-opacity surface. Sidebar/composer/bubbles sit above it.
  const columnAlpha = alphaFor(surface, 0.52);
  const sidebarAlpha = alphaFor(background, 0.58);
  const bubbleAlpha = alphaFor(surface, 0.68);
  const panelAlpha = alphaFor(surface, 0.76);
  const strongAlpha = alphaFor(background, 0.9);

  return {
    scrim: withAlpha(background, scrimAlpha),
    tokens: {
      "--theme-column-bg": withAlpha(surface, columnAlpha),
      "--theme-sidebar-bg": withAlpha(background, sidebarAlpha),
      "--theme-message-bg": withAlpha(surface, bubbleAlpha),
      "--theme-panel-bg": withAlpha(surface, panelAlpha),
      "--theme-panel-strong-bg": withAlpha(background, strongAlpha),
    },
  };
}

/** Parse the stored selection; anything unrecognised falls back to dark. */
export function parseThemeSelection(value) {
  const raw = String(value ?? "").trim();
  if (raw === "light" || raw === "dark") {
    return { mode: raw, themeId: null };
  }
  const match = /^custom:([A-Za-z0-9_-]{1,80})$/.exec(raw);
  if (match) return { mode: "custom", themeId: match[1] };
  return { mode: "dark", themeId: null };
}

export function themeSelectionValue(selection) {
  if (selection?.mode === "custom" && selection.themeId) {
    return `custom:${selection.themeId}`;
  }
  return selection?.mode === "light" ? "light" : "dark";
}

export function isThemeSelectionValue(value) {
  const parsed = parseThemeSelection(value);
  return parsed.mode !== "dark" || String(value ?? "").trim() === "dark";
}

/** Keep a theme row's JSON fields honest before they reach the client. */
export function normalizeStoredTheme(row) {
  if (!row || typeof row !== "object") return null;
  const palette = row.palette && typeof row.palette === "object" ? row.palette : null;
  const tokens = row.tokens && typeof row.tokens === "object" ? row.tokens : null;
  if (!palette || !tokens || !tokens.solid) return null;
  return {
    id: String(row.id || ""),
    name: String(row.name || "Custom theme"),
    tone: row.tone === "light" ? "light" : "dark",
    palette,
    tokens,
    images: row.images && row.images.desktop ? row.images : null,
    proposalId: row.proposalId || row.proposal_id || null,
    createdAt: Number(row.createdAt || row.created_at || 0),
  };
}