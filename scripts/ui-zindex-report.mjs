#!/usr/bin/env node
/**
 * Lists every `z-index` declaration in src/index.css together with the selector
 * that owns it, so the ad-hoc values can be mapped onto a declared layer scale.
 */
import { readFileSync } from "node:fs";

const css = readFileSync("src/index.css", "utf8");

// Walk the stylesheet tracking the most recent selector prelude for each rule.
const re = /([^{}]*)\{([^{}]*)\}/g;
const rows = [];
let m;
while ((m = re.exec(css)) !== null) {
  const selector = m[1]
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .replace(/\s+/g, " ")
    .split("}").pop()
    .trim();
  const body = m[2];
  const zi = /z-index\s*:\s*(-?\d+)/.exec(body);
  if (!zi) continue;
  // Approximate line number of the z-index declaration.
  const upTo = css.slice(0, m.index + m[0].indexOf(body) + zi.index);
  const line = upTo.split("\n").length;
  rows.push({ line, selector: selector || "(root)", value: Number(zi[1]) });
}

rows.sort((a, b) => a.value - b.value || a.line - b.line);
const byValue = new Map();
for (const r of rows) {
  if (!byValue.has(r.value)) byValue.set(r.value, []);
  byValue.get(r.value).push(`L${r.line} ${r.selector}`);
}
for (const [value, owners] of byValue) {
  console.log(`z-index ${value}  (${owners.length} declaration${owners.length > 1 ? "s" : ""})`);
  for (const o of owners) console.log(`    ${o}`);
}
console.log(`\nTotal declarations: ${rows.length}, distinct values: ${byValue.size}`);
