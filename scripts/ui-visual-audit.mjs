#!/usr/bin/env node
/**
 * ui-visual-audit.mjs — Part 16 (game-visual-review) palette & contrast auditor.
 *
 * Reads captured UI screenshots from `artifacts/ui/` and checks them against the
 * declared design contract in `src/index.css` (the CoreZ Dynamic Monochrome
 * Design System). This is the "COMPARE" step of the Part 16 workflow made
 * mechanical: instead of eyeballing swatches, every pixel is classified against
 * the declared palette and every text/background pair is contrast-checked.
 *
 * Usage:
 *   node scripts/ui-visual-audit.mjs            # human-readable report
 *   node scripts/ui-visual-audit.mjs --json     # machine-readable JSON
 *
 * Exit code: 0 when zero `error`-severity findings, 1 otherwise.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import sharp from "sharp";

const UI_DIR = "artifacts/ui";
const CSS_PATH = "src/index.css";

/* ------------------------------------------------------------------ *
 * Declared contract — parsed from src/index.css, not hand-copied.
 * ------------------------------------------------------------------ */

const REQUIRED_TOKENS = [
  "bg-primary",
  "bg-secondary",
  "bg-tertiary",
  "bg-card",
  "border-color",
  "border-hover",
  "text-primary",
  "text-secondary",
  "text-muted",
  "market-positive",
  "market-negative",
  "market-caution",
  "code-bg",
  "code-header-bg",
  "inline-code-color",
];

/**
 * Extract `--token: value;` declarations for one CSS theme block.
 * Matches the selector as a regex so CRLF line endings and incidental
 * whitespace in src/index.css never break the parse.
 */
function parseThemeTokens(css, themeSelector) {
  const start = css.search(themeSelector);
  if (start === -1) throw new Error(`Theme block not found: ${themeSelector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const block = css.slice(open + 1, close);
  const tokens = {};
  // Only literal color values are collected; font stacks, lengths and
  // var() aliases are not part of the palette contract.
  const isColor = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i;
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(block)) !== null) {
    const value = m[2].replace(/\s+/g, " ").trim();
    if (isColor.test(value)) tokens[m[1].trim()] = value;
  }
  return tokens;
}

/** Parse `#rgb`, `#rrggbb`, `rgba(r,g,b,a)` or `rgb(r,g,b)`. */
function parseColor(value) {
  const v = value.trim();
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
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }
  throw new Error(`Unparseable color: ${value}`);
}

/* ------------------------------------------------------------------ *
 * Color maths (WCAG 2.x relative luminance)
 * ------------------------------------------------------------------ */

const toHex = ({ r, g, b }) =>
  "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");

function channelToLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }) {
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

function contrastRatio(fg, bg) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** #rgb over #rgb source-over compositing, both opaque-ish. */
function composite(fg, bg) {
  const a = fg.a ?? 1;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

/** Perceptual distance in RGB space (cheap, adequate for palette gating). */
function distance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** A pixel is chroma-neutral when R/G/B differ by at most this much. */
const CHROMA_TOLERANCE = 3;

/**
 * Anti-aliasing renders declared colors as ramps of intermediate values, so an
 * observed color only counts as "outside the palette" once it is clearly
 * separable from every declared token.
 */
const PALETTE_DISTANCE_TOLERANCE = 24;

/** Minimum share of painted area before an undeclared color is reportable. */
const MIN_UNDECLARED_SHARE = 0.0002;

/**
 * Spatial coherence of a color: how much of its own bounding box it fills.
 * A genuine out-of-palette fill is a compact solid blob (density near 1);
 * anti-aliasing remnants are scattered singletons across the frame (density
 * near 0). This is the discriminator that separates real design colors from
 * rendering artifacts.
 */
function clusterDensity(data, w, h, rgb, tol = 16) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (data[o + 3] < 8) continue;
      if (
        Math.abs(data[o] - rgb.r) <= tol &&
        Math.abs(data[o + 1] - rgb.g) <= tol &&
        Math.abs(data[o + 2] - rgb.b) <= tol
      ) {
        n++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (n === 0) return { count: 0, density: 0, box: null };
  const area = (x1 - x0 + 1) * (y1 - y0 + 1);
  return { count: n, density: +(n / area).toFixed(4), box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

/** Minimum bbox fill ratio before a color is treated as a painted element. */
const MIN_CLUSTER_DENSITY = 0.25;

/** Minimum solid (erosion-surviving) pixels before a chromatic color is reportable. */
const MIN_SOLID_CHROMATIC_PX = 25;

/* ------------------------------------------------------------------ *
 * Audit
 * ------------------------------------------------------------------ */

function buildPalette(css) {
  const dark = parseThemeTokens(css, /:root,\s*\[data-theme="dark"\]\s*\{/);
  const light = parseThemeTokens(css, /\[data-theme="light"\]\s*\{/);

  const missing = REQUIRED_TOKENS.filter((t) => !dark[t] || !light[t]);
  if (missing.length) {
    throw new Error(`src/index.css is missing required tokens: ${missing.join(", ")}`);
  }

  const allowances = [];
  for (const [theme, tokens] of [
    ["dark", dark],
    ["light", light],
  ]) {
    const base = parseColor(tokens["bg-primary"]);
    for (const [token, raw] of Object.entries(tokens)) {
      const color = parseColor(raw);
      const opaque = color.a < 1 ? composite(color, base) : color;
      allowances.push({
        theme,
        token,
        declared: raw,
        hex: toHex(opaque),
        rgb: opaque,
        // Market + inline-code + selection tokens are the only non-neutral
        // colors the monochrome system permits.
        neutral: Math.max(opaque.r, opaque.g, opaque.b) - Math.min(opaque.r, opaque.g, opaque.b) <= CHROMA_TOLERANCE,
      });
    }
    // Composite pairs the design system uses as state surfaces.
    for (const alpha of [0.05, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2, 0.34, 0.42, 0.85]) {
      const c = composite({ r: 255, g: 255, b: 255, a: alpha }, base);
      allowances.push({
        theme,
        token: `white@${alpha}`,
        declared: `rgba(255,255,255,${alpha})`,
        hex: toHex(c),
        rgb: c,
        neutral: true,
      });
    }
  }
  return { dark, light, allowances };
}

/**
 * Subpixel (LCD) text anti-aliasing paints 1px chromatic fringes on glyph
 * edges. Those pixels are not design colors, so palette classification runs on
 * a box-downsampled copy where opposing fringes average back to neutral. A
 * genuine out-of-palette fill survives the reduction; a 1px fringe does not.
 */
const AA_DOWNSAMPLE = 3;

async function auditImage(file, allowances) {
  const buf = readFileSync(file);
  const meta = await sharp(buf).metadata();

  // Pass 1 — raw pixels, used for the reference histogram only.
  const { data } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let totalPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 8) totalPixels++;
  }

  // Pass 2 — box-downsampled, used for all palette gating decisions.
  // Averaging is done here in JS so the reduction is an exact, predictable
  // box filter rather than a resampling kernel.
  const dw = Math.max(1, Math.floor(meta.width / AA_DOWNSAMPLE));
  const dh = Math.max(1, Math.floor(meta.height / AA_DOWNSAMPLE));
  const sampled = Buffer.alloc(dw * dh * 4);

  for (let by = 0; by < dh; by++) {
    for (let bx = 0; bx < dw; bx++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = by * AA_DOWNSAMPLE; y < (by + 1) * AA_DOWNSAMPLE && y < meta.height; y++) {
        for (let x = bx * AA_DOWNSAMPLE; x < (bx + 1) * AA_DOWNSAMPLE && x < meta.width; x++) {
          const i = (y * meta.width + x) * 4;
          if (data[i + 3] < 8) continue;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
      }
      const o = (by * dw + bx) * 4;
      if (n === 0) {
        sampled[o + 3] = 0;
        continue;
      }
      sampled[o] = Math.round(r / n);
      sampled[o + 1] = Math.round(g / n);
      sampled[o + 2] = Math.round(b / n);
      sampled[o + 3] = 255;
    }
  }

  const data2 = sampled;
  const info2 = { width: dw, height: dh };

  /* --- chroma mask over the downsampled image ------------------------- */
  const chroma = new Int16Array(dw * dh);
  for (let p = 0; p < dw * dh; p++) {
    const o = p * 4;
    if (data2[o + 3] < 8) { chroma[p] = -1; continue; }
    chroma[p] = Math.max(data2[o], data2[o + 1], data2[o + 2]) - Math.min(data2[o], data2[o + 1], data2[o + 2]);
  }

  /* --- erosion: a chromatic pixel is real only if it is part of a solid
     region. Subpixel AA fringes are ~1px lines and vanish here, while a
     genuine out-of-palette fill survives. ------------------------------ */
  const solid = new Uint8Array(dw * dh);
  for (let y = 1; y < dh - 1; y++) {
    for (let x = 1; x < dw - 1; x++) {
      const p = y * dw + x;
      if (chroma[p] <= CHROMA_TOLERANCE) continue;
      let all = true;
      for (let ny = -1; ny <= 1 && all; ny++) {
        for (let nx = -1; nx <= 1; nx++) {
          if (chroma[(y + ny) * dw + (x + nx)] <= CHROMA_TOLERANCE) { all = false; break; }
        }
      }
      if (all) solid[p] = 1;
    }
  }

  const counts = new Map();
  let neutralPixels = 0;
  let sampledPixels = 0;
  const chromatic = new Map();

  for (let p = 0; p < dw * dh; p++) {
    const o = p * 4;
    if (data2[o + 3] < 8) continue; // transparent — nothing painted
    const r = data2[o];
    const g = data2[o + 1];
    const b = data2[o + 2];
    sampledPixels++;
    const key = (r << 16) | (g << 8) | b;
    counts.set(key, (counts.get(key) || 0) + 1);

    if (chroma[p] <= CHROMA_TOLERANCE) {
      neutralPixels++;
    } else if (solid[p]) {
      // Only eroded (solid-region) chromatic pixels are candidate design
      // colors; the rest are anti-aliasing artifacts.
      const hex = "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
      chromatic.set(hex, (chromatic.get(hex) || 0) + 1);
    }
  }

  const topColors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([key, count]) => {
      const rgb = { r: (key >> 16) & 255, g: (key >> 8) & 255, b: key & 255, a: 1 };
      // Nearest declared allowance for this observed color.
      let best = null;
      for (const allow of allowances) {
        const d = distance(rgb, allow.rgb);
        if (!best || d < best.distance) best = { distance: d, allow };
      }
      return {
        hex: toHex(rgb),
        rgb,
        count,
        // Share is expressed against RAW painted pixels so the number stays
        // meaningful to a human looking at the full-resolution screenshot.
        share: +((count * AA_DOWNSAMPLE * AA_DOWNSAMPLE) / totalPixels).toFixed(5),
        nearest: best.allow.token,
        nearestHex: best.allow.hex,
        distance: +best.distance.toFixed(2),
        declared: best.distance <= PALETTE_DISTANCE_TOLERANCE,
      };
    });

  const undeclaredRaw = topColors.filter((c) => !c.declared && c.share >= MIN_UNDECLARED_SHARE);

  /* Keep only colors that render as a spatially coherent element — this is
     what separates a real out-of-palette fill from anti-aliasing residue. */
  const undeclared = [];
  for (const c of undeclaredRaw) {
    const cluster = clusterDensity(data2, dw, dh, c.rgb);
    if (cluster.density >= MIN_CLUSTER_DENSITY) undeclared.push({ ...c, cluster });
  }

  const chromaticTotal = [...chromatic.values()].reduce((a, b) => a + b, 0);

  const chromaticTop = [];
  for (const [hex, count] of [...chromatic.entries()].sort((a, b) => b[1] - a[1])) {
    const rgb = {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
    const cluster = clusterDensity(data2, dw, dh, rgb);
    chromaticTop.push({ hex, count, cluster });
    if (chromaticTop.length >= 12) break;
  }

  return {
    file,
    width: meta.width,
    height: meta.height,
    totalPixels,
    sampledPixels,
    downsample: AA_DOWNSAMPLE,
    downsampleSize: `${info2.width}x${info2.height}`,
    neutralShare: +(neutralPixels / sampledPixels).toFixed(5),
    chromaticTotal,
    topColors,
    undeclared,
    chromaticTop,
  };
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

async function main() {
  const asJson = process.argv.includes("--json");

  if (!existsSync(CSS_PATH)) throw new Error(`Missing ${CSS_PATH}`);
  if (!existsSync(UI_DIR)) throw new Error(`Missing ${UI_DIR}`);

  const css = readFileSync(CSS_PATH, "utf8");
  const { dark, light, allowances } = buildPalette(css);

  const files = readdirSync(UI_DIR)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort()
    .map((f) => join(UI_DIR, f));

  if (!files.length) throw new Error(`No screenshots found in ${UI_DIR}`);

  const images = [];
  for (const file of files) images.push(await auditImage(file, allowances));

  /* Contrast gate: every text token against every surface token it can sit on,
     in both themes — the declared contract must be internally compliant. */
  const contrastChecks = [];
  const TEXT_TOKENS = ["text-primary", "text-secondary", "text-muted", "inline-code-color"];
  const SURFACE_TOKENS = ["bg-primary", "bg-secondary", "bg-tertiary", "bg-card", "code-bg", "code-header-bg"];
  for (const [themeName, tokens] of [["dark", dark], ["light", light]]) {
    for (const t of TEXT_TOKENS) {
      for (const s of SURFACE_TOKENS) {
        const fg = parseColor(tokens[t]);
        const fgOpaque = fg.a < 1 ? composite(fg, parseColor(tokens["bg-primary"])) : fg;
        const bg = parseColor(tokens[s]);
        const bgOpaque = bg.a < 1 ? composite(bg, parseColor(tokens["bg-primary"])) : bg;
        const ratio = +contrastRatio(fgOpaque, bgOpaque).toFixed(2);
        contrastChecks.push({
          theme: themeName,
          fg: t,
          bg: s,
          ratio,
          aa: ratio >= 4.5,
        });
      }
    }
  }

  const findings = [];

  /* Contract-level contrast failures are reported once, not per screenshot. */
  for (const c of contrastChecks) {
    if (!c.aa) {
      findings.push({
        severity: "error",
        category: "contrast",
        file: CSS_PATH,
        line: null,
        description: `Declared token pair fails WCAG AA: --${c.fg} on --${c.bg} in ${c.theme} theme = ${c.ratio}:1 (needs 4.5:1).`,
      });
    }
  }

  for (const img of images) {
    for (const c of img.undeclared) {
      const severe = c.distance > 40 || c.cluster.density > 0.6;
      findings.push({
        severity: severe ? "error" : "warning",
        category: "palette",
        file: img.file,
        hex: c.hex,
        nearest: c.nearest,
        nearestHex: c.nearestHex,
        distance: c.distance,
        share: c.share,
        cluster: c.cluster,
        description:
          `Observed ${c.hex} (${(c.share * 100).toFixed(2)}% of painted pixels, solid cluster ` +
          `${c.cluster.box.w}x${c.cluster.box.h} at ${c.cluster.box.x},${c.cluster.box.y}, fill ${(c.cluster.density * 100).toFixed(0)}%) ` +
          `is outside the declared palette; nearest declared token is --${c.nearest} ${c.nearestHex} (distance ${c.distance}).`,
      });
    }
    for (const c of img.chromaticTop) {
      if (c.count < MIN_SOLID_CHROMATIC_PX || c.cluster.density < MIN_CLUSTER_DENSITY) continue;
      const channels = c.hex
        .slice(1)
        .match(/../g)
        .map((h) => parseInt(h, 16));
      const chroma = Math.max(...channels) - Math.min(...channels);
      findings.push({
        severity: chroma > 24 ? "error" : "warning",
        category: "palette",
        file: img.file,
        hex: c.hex,
        solidPixels: c.count,
        cluster: c.cluster,
        description:
          `Non-neutral color ${c.hex} (chroma ${chroma}, ${c.count} solid px, fill ${(c.cluster.density * 100).toFixed(0)}%) in a monochrome design system. ` +
          `Only --market-positive/-negative/-caution, --inline-code-color and --selection-bg may carry chroma.`,
      });
    }
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;

  const report = {
    review: {
      tool: "scripts/ui-visual-audit.mjs",
      art_direction_ref: "src/index.css (declared design contract; game-project/design/art-direction.json absent)",
      ui_dir: UI_DIR,
      screenshots: images.map((i) => ({ file: i.file, width: i.width, height: i.height, neutralShare: i.neutralShare, chromaticPixels: i.chromaticTotal })),
      contested: {
        images: images.length,
        contrast_pairs_checked: contrastChecks.length,
        contrast_failures: contrastChecks.filter((c) => !c.aa).length,
      },
      result: errors > 0 || warnings > 3 ? "FAIL" : "PASS",
      findings,
      summary: { total: findings.length, errors, warnings, passes: contrastChecks.filter((c) => c.aa).length },
      top_colors: Object.fromEntries(images.map((i) => [basename(i.file), i.topColors.slice(0, 12)])),
    },
  };

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    console.log(`Part 16 visual audit — ${images.length} screenshot(s)\n`);
    for (const i of images) {
      console.log(`  ${basename(i.file)}  ${i.width}x${i.height}  neutral ${(i.neutralShare * 100).toFixed(2)}%  chromatic ${i.chromaticTotal}px`);
    }
    console.log("");
    if (!findings.length) {
      console.log("No palette or contrast findings.\n");
    } else {
      for (const f of findings) {
        console.log(`[${f.severity.toUpperCase()}] ${f.category} ${f.file}`);
        console.log(`    ${f.description}`);
      }
      console.log("");
    }
    console.log(`Result: ${report.review.result}  (${errors} errors, ${warnings} warnings)`);
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`ui-visual-audit failed: ${err.message}`);
  process.exit(2);
});
