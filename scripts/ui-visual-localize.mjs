#!/usr/bin/env node
/**
 * Localizes chromatic (non-neutral) pixel clusters in a screenshot and writes
 * cropped PNGs so each cluster can be identified visually.
 *
 * Usage: node --experimental-default-type=module localize.mjs <png> <outdir>
 */
import { readFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";

const CHROMA_TOLERANCE = 3;
const [input, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const image = sharp(readFileSync(input));
const meta = await image.metadata();
const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

const W = meta.width;
const H = meta.height;

// Bucket chromatic pixels into a coarse grid so adjacent pixels group into
// one identifiable region rather than thousands of 1px clusters.
const CELL = 8;
const cells = new Map();
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (data[i + 3] < 8) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma <= CHROMA_TOLERANCE) continue;
    const key = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
    let c = cells.get(key);
    if (!c) {
      c = { x0: x, x1: x, y0: y, y1: y, n: 0, colors: new Map() };
      cells.set(key, c);
    }
    c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x);
    c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
    c.n++;
    const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    c.colors.set(hex, (c.colors.get(hex) || 0) + 1);
  }
}

if (!cells.size) {
  console.log("No chromatic pixels found.");
  process.exit(0);
}

// Merge 8px cells into connected regions (4-neighbour flood over the grid).
const keys = new Set(cells.keys());
const seen = new Set();
const regions = [];
for (const key of keys) {
  if (seen.has(key)) continue;
  const stack = [key];
  seen.add(key);
  const group = [];
  while (stack.length) {
    const k = stack.pop();
    group.push(cells.get(k));
    const [cx, cy] = k.split(",").map(Number);
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      const nk = `${nx},${ny}`;
      if (keys.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
    }
  }
  const merged = group.reduce(
    (a, c) => ({
      x0: Math.min(a.x0, c.x0), x1: Math.max(a.x1, c.x1),
      y0: Math.min(a.y0, c.y0), y1: Math.max(a.y1, c.y1),
      n: a.n + c.n,
    }),
    { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, n: 0 }
  );
  const colors = new Map();
  for (const c of group) for (const [hex, count] of c.colors) colors.set(hex, (colors.get(hex) || 0) + count);
  merged.colors = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  regions.push(merged);
}

regions.sort((a, b) => b.n - a.n);
const base = basename(input, ".png");
const summary = [];
for (const [idx, r] of regions.entries()) {
  const pad = 12;
  const left = Math.max(0, r.x0 - pad);
  const top = Math.max(0, r.y0 - pad);
  const width = Math.min(W - left, r.x1 - r.x0 + 1 + pad * 2);
  const height = Math.min(H - top, r.y1 - r.y0 + 1 + pad * 2);
  const out = join(outDir, `${base}-r${idx}-${left}_${top}_${width}x${height}.png`);
  await sharp(readFileSync(input)).extract({ left, top, width, height }).png().toFile(out);
  summary.push({
    region: idx,
    box: { x: r.x0, y: r.y0, w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1 },
    chromaticPixels: r.n,
    topColors: r.colors.map(([hex, count]) => `${hex}x${count}`),
    crop: out,
  });
}
console.log(JSON.stringify(summary, null, 2));
