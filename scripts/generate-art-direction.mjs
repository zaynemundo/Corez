#!/usr/bin/env node
/**
 * Generates `game-project/design/art-direction.json` from the repo's real design
 * tokens, so the review tooling (game-development Part 16, docs/review) has a
 * citable, schema-shaped artifact instead of an absent file.
 *
 * This is a DERIVED artifact, not an authored product spec: every value is read
 * from `src/index.css` (the declared "Corez Dynamic Monochrome Design System")
 * and a hash of that source is recorded, so the file cannot silently drift. It
 * deliberately does not invent anything the app does not have — where a game
 * schema field has no counterpart (pixel sprites), the value is marked
 * not_applicable with the reason.
 *
 * Usage:
 *   node scripts/generate-art-direction.mjs           # write the file
 *   node scripts/generate-art-direction.mjs --check    # fail if out of date
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const CSS_PATH = "src/index.css";
const OUT_PATH = "game-project/design/art-direction.json";

/** Extract `--token: value;` colour declarations for one theme block. */
function parseThemeTokens(css, selectorRe) {
  const start = css.search(selectorRe);
  if (start === -1) throw new Error("theme block not found in src/index.css");
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const block = css.slice(open + 1, close);
  const tokens = {};
  const isColor = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i;
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const value = m[2].replace(/\s+/g, " ").trim();
    if (isColor.test(value)) tokens[m[1]] = value;
  }
  return tokens;
}

/** Parse `#rgb`, `#rrggbb` or `rgba(r,g,b,a)` into components. */
function parseColor(value) {
  const v = String(value).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  }
  throw new Error(`unparseable colour: ${value}`);
}

/**
 * Flatten a translucent colour onto a background and return hex. The emphasis
 * token is `rgba(255,255,255,0.34)`, and reporting it as pure `#ffffff` would
 * mislead a visual review into expecting a colour the UI never paints.
 */
function compositeHex(fg, bg) {
  const f = parseColor(fg);
  const b = parseColor(bg);
  const to = (c) => Math.round(c).toString(16).padStart(2, "0");
  return (
    "#" +
    to(f.r * f.a + b.r * (1 - f.a)) +
    to(f.g * f.a + b.g * (1 - f.a)) +
    to(f.b * f.a + b.b * (1 - f.a))
  );
}

/** Extract numeric custom properties such as the --z-* layer scale. */
function parseNumericTokens(css, selectorRe) {
  const start = css.search(selectorRe);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const block = css.slice(open + 1, close);
  const tokens = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(-?\d+(?:\.\d+)?);/gi)) {
    tokens[m[1]] = Number(m[2]);
  }
  return tokens;
}

function build() {
  const css = readFileSync(CSS_PATH, "utf8");
  const dark = parseThemeTokens(css, /:root,\s*\[data-theme="dark"\]\s*\{/);
  const light = parseThemeTokens(css, /\[data-theme="light"\]\s*\{/);
  const darkNumeric = parseNumericTokens(css, /:root,\s*\[data-theme="dark"\]\s*\{/);
  const lightNumeric = parseNumericTokens(css, /\[data-theme="light"\]\s*\{/);

  for (const [name, set] of [["dark", dark], ["light", light]]) {
    for (const required of [
      "bg-primary", "bg-secondary", "bg-tertiary", "bg-card",
      "text-primary", "text-secondary", "text-muted",
    ]) {
      if (!set[required]) throw new Error(`${name} theme is missing --${required}`);
    }
  }

  const z = { ...darkNumeric, ...lightNumeric };
  const radius = darkNumeric["radius-md"] ?? lightNumeric["radius-md"] ?? 12;

  const sourceHash =
    "sha256:" + createHash("sha256").update(css).digest("hex").slice(0, 32);

  return {
    $comment:
      "DERIVED from src/index.css by scripts/generate-art-direction.mjs. Do not edit by hand: " +
      "change the design tokens and regenerate. Run `npm run art:check` to detect drift. " +
      "This is the Corez application's design contract, not an authored game art brief.",
    provenance: {
      derived: true,
      generated_by: "scripts/generate-art-direction.mjs",
      source: CSS_PATH,
      source_sha256: sourceHash,
      note:
        "The app has no game-project/ directory and no authored art-direction.json. " +
        "This file exists so Part 16 visual review and docs/review have a citable contract; " +
        "every value is read from the declared design system rather than invented.",
    },
    project: "CoreZ",
    theme: "minimalist",
    palette: {
      source: "CUSTOM",
      // Strictly monochrome by design: the only chromatic tokens are the
      // market/status colours and inline code, listed separately below.
      colors: [
        dark["bg-primary"], dark["bg-secondary"], dark["bg-tertiary"], dark["bg-card"],
        dark["text-primary"], dark["text-secondary"], dark["text-muted"],
        dark["market-positive"], dark["market-negative"], dark["market-caution"],
        dark["inline-code-color"],
      ],
      background: dark["bg-primary"],
      primary: dark["text-primary"],
      secondary: dark["text-secondary"],
      // No glow/accent exists in this strictly monochrome system: the emphasis
      // token is the strongest interactive border, composited onto the page
      // background so the value is the colour the UI actually paints.
      highlight: compositeHex(dark["border-hover"] ?? dark["text-primary"], dark["bg-primary"]),
      ui_text: dark["text-primary"],
      monochrome: true,
      themes: {
        dark: {
          bg_primary: dark["bg-primary"],
          bg_secondary: dark["bg-secondary"],
          bg_tertiary: dark["bg-tertiary"],
          bg_card: dark["bg-card"],
          text_primary: dark["text-primary"],
          text_secondary: dark["text-secondary"],
          text_muted: dark["text-muted"],
          market_positive: dark["market-positive"],
          market_negative: dark["market-negative"],
          market_caution: dark["market-caution"],
          inline_code: dark["inline-code-color"],
        },
        light: {
          bg_primary: light["bg-primary"],
          bg_secondary: light["bg-secondary"],
          bg_tertiary: light["bg-tertiary"],
          bg_card: light["bg-card"],
          text_primary: light["text-primary"],
          text_secondary: light["text-secondary"],
          text_muted: light["text-muted"],
          market_positive: light["market-positive"],
          market_negative: light["market-negative"],
          market_caution: light["market-caution"],
          inline_code: light["inline-code-color"],
        },
      },
    },
    sprites: {
      // The app draws no pixel sprites; brand and UI marks are inline SVG.
      not_applicable: true,
      reason: "CoreZ is an application, not a pixel-art game: icons and marks are inline SVG.",
      default_size: 0,
      grid_snap: false,
      crisp_edges: false,
      max_colors: 0,
    },
    ui: {
      font_family:
        '-apple-system-body, ui-sans-serif, -apple-system, "system-ui", "Segoe UI", Helvetica, Arial, sans-serif',
      font_branding_family: '"Outfit" (display), "JetBrains Mono" (code)',
      font_size_base: 17,
      button_style: "flat",
      panel_style: "bordered",
      border_radius: radius,
      elevation: "flat-by-design (box-shadow and text-shadow are globally suppressed)",
      z_index_layers: {
        background: z["z-background"] ?? 0,
        content: z["z-content"] ?? 10,
        content_raised: z["z-content-raised"] ?? 20,
        hud: z["z-hud"] ?? 30,
        hud_raised: z["z-hud-raised"] ?? 40,
        controls: z["z-controls"] ?? 50,
        dropdown: z["z-dropdown"] ?? 60,
        pane_fullscreen: z["z-pane-fullscreen"] ?? 70,
        overlay: z["z-overlay"] ?? 80,
        overlay_raised: z["z-overlay-raised"] ?? 90,
        sidebar_mobile: z["z-sidebar-mobile"] ?? 95,
        modal: z["z-modal"] ?? 100,
        modal_raised: z["z-modal-raised"] ?? 110,
        modal_toolbar: z["z-modal-toolbar"] ?? 120,
        lightbox: z["z-lightbox"] ?? 200,
      },
    },
    svg: {
      shape_rendering: "geometricPrecision",
      image_rendering: "auto",
      viewbox_strategy: "responsive",
    },
  };
}

const serialized = JSON.stringify(build(), null, 2) + "\n";

if (process.argv.includes("--check")) {
  if (!existsSync(OUT_PATH)) {
    console.error(`art-direction is out of date: ${OUT_PATH} does not exist`);
    console.error("run: npm run art:generate");
    process.exitCode = 1;
  } else {
    const current = readFileSync(OUT_PATH, "utf8");
    if (current !== serialized) {
      console.error(`art-direction is out of date: ${OUT_PATH} does not match ${CSS_PATH}`);
      console.error("run: npm run art:generate");
      process.exitCode = 1;
    } else {
      console.log(`art-direction is up to date with ${CSS_PATH}`);
    }
  }
} else {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, serialized);
  console.log(`wrote ${OUT_PATH} (${serialized.length} bytes) from ${CSS_PATH}`);
}
