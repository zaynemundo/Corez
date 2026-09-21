#!/usr/bin/env node
/**
 * Skill-library audit — guards the .agents/skills tree against rot.
 *
 * Why this exists: the model id `deepseek-flash` was duplicated across the
 * worker, the agent core, the CLI and every skill/agent binding, and nothing
 * failed loudly when it stopped existing. Skills also reference real repo files,
 * so deleting or renaming a file silently invalidates the documentation that
 * points at it.
 *
 * Checks:
 *   1. Frontmatter: `name` present and matching the directory, `description`
 *      present with a trigger ("use when") and a boundary ("not for").
 *   2. Stale content: retired model ids and deleted files.
 *   3. References: path-qualified file references must exist somewhere in the
 *      repo, unless they are a gitignored runtime path or explicitly documented
 *      as not implemented yet.
 *
 * Two false-positive classes are handled deliberately (a naive first version
 * reported 114 issues that were almost entirely noise):
 *   - CRLF: the frontmatter regex must not rely on `$` matching past a trailing
 *     \r, or every skill looks like it has no name/description.
 *   - Repo-relative references: skill docs point at `worker/...`, `tests/...`
 *     and `src/...`, not only at files inside the skill directory.
 *
 * Usage: node scripts/audit-skills.mjs      (exit 1 when real issues are found)
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT = ".agents/skills";
const REPO = process.cwd();

const issues = [];
const add = (skill, kind, detail) => issues.push({ skill, kind, detail });

/** Lines that already state the referenced thing does not exist yet. */
const DOCUMENTED_ABSENT = /\b(?:not implemented|unimplemented|planned|todo|does not exist|not yet|yet\b)/i;

/** Retired identifiers that must not reappear anywhere in the skill tree. */
const STALE = [
  [/deepseek-flash(?!-)/, "stale model id `deepseek-flash` (now deepseek-v4.1-flash)"],
  [/xiaomi\/mimo-v2[.]5/, "removed MiMo model id"],
  [/worker\/mimo\.js/, "deleted file `worker/mimo.js`"],
  [/deepseek-v4-flash(?!-vision)/, "old DeepSeek V4 Flash id"],
  [/kimi-k3/, "`kimi-k3` removed from the model catalog"],
];

function readFrontmatter(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = text.slice(3, end).replace(/\r\n/g, "\n");
  const keys = {};
  let current = null;
  for (const line of block.split("\n")) {
    const m = /^([a-zA-Z_][\w-]*):\s*(.*)$/.exec(line);
    if (m) {
      current = m[1];
      keys[current] = m[2].trim();
    } else if (current && line.trim()) {
      keys[current] += " " + line.trim();
    }
  }
  return { keys };
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** One git call for every candidate, so we do not spawn a process per path. */
function ignoredPaths(paths) {
  if (!paths.length) return new Set();
  try {
    const out = execFileSync("git", ["check-ignore", "--stdin"], {
      input: paths.join("\n"),
      encoding: "utf8",
    });
    return new Set(out.split("\n").map((l) => l.trim()).filter(Boolean));
  } catch {
    return new Set(); // exit 1 means "none ignored"
  }
}

const skills = readdirSync(ROOT).filter((d) => statSync(join(ROOT, d)).isDirectory());
const refCandidates = new Map(); // ref -> [skill]

for (const skill of skills) {
  const dir = join(ROOT, skill);
  const skillMd = join(dir, "SKILL.md");

  if (!existsSync(skillMd)) {
    add(skill, "missing", "no SKILL.md at the skill root");
    continue;
  }

  const text = readFileSync(skillMd, "utf8").replace(/\r\n/g, "\n");
  const fm = readFrontmatter(text);

  if (!fm) {
    add(skill, "frontmatter", "SKILL.md does not start with a --- frontmatter block");
  } else {
    if (!fm.keys.name) add(skill, "frontmatter", "frontmatter has no `name`");
    else if (fm.keys.name !== skill)
      add(skill, "frontmatter", `frontmatter name "${fm.keys.name}" != directory "${skill}"`);

    const description = fm.keys.description;
    if (!description) add(skill, "frontmatter", "frontmatter has no `description`");
    else {
      if (description.length < 40) add(skill, "description", `very short (${description.length} chars)`);
      if (!/\bwhen\b/i.test(description))
        add(skill, "description", "no trigger wording ('use when ...')");
      if (!/\bnot for\b/i.test(description))
        add(skill, "description", "no boundary ('not for ...') to disambiguate");
    }
  }

  for (const file of walk(dir)) {
    if (extname(file) !== ".md") continue;
    const body = readFileSync(file, "utf8");
    const rel = file.replace(/\\/g, "/");
    for (const [re, label] of STALE) {
      if (re.test(body)) add(skill, "stale", `${label} in ${rel}`);
    }
  }

  // Path-qualified references only: a bare filename is an artifact the skill
  // produces, not something that must already exist.
  for (const line of text.split("\n")) {
    for (const m of line.matchAll(/`([\w./-]+\.(?:md|js|mjs|json|sh|py|css|html))`/g)) {
      const ref = m[1];
      if (ref.startsWith("http") || !ref.includes("/")) continue;
      if (DOCUMENTED_ABSENT.test(line)) continue;
      if (!refCandidates.has(ref)) refCandidates.set(ref, []);
      refCandidates.get(ref).push(skill);
    }
  }
}

const refs = [...refCandidates.keys()];
const ignored = ignoredPaths(refs);
for (const ref of refs) {
  if (ignored.has(ref)) continue; // runtime path, e.g. .jspace/
  const found =
    existsSync(join(REPO, ref)) ||
    existsSync(join(ROOT, ref)) ||
    skills.some((s) => existsSync(join(ROOT, s, ref)));
  if (!found) {
    for (const skill of refCandidates.get(ref)) {
      add(skill, "reference", `references \`${ref}\` which does not exist in the repo`);
    }
  }
}

const byKind = {};
for (const i of issues) (byKind[i.kind] ??= []).push(i);

console.log(`audited ${skills.length} skills -> ${issues.length} issue(s)\n`);
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`### ${kind} (${list.length})`);
  for (const i of list) console.log(`  ${i.skill}: ${i.detail}`);
  console.log("");
}
process.exitCode = issues.length ? 1 : 0;
